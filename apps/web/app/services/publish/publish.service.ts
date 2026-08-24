import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import type {
  AdminActionPayload,
  AdminBlockPayload,
  AdminDiscountUiPayload,
  AdminLinkPayload,
  AdminPrintPayload,
  AdminSegmentTemplatePayload,
  CheckoutUpsellPayload,
  CustomerAccountBlockPayload,
  ThemeModulePayload,
} from '~/services/recipes/compiler/types';
import { MetafieldService } from '~/services/shopify/metafield.service';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import { WebPixelService } from '~/services/shopify/web-pixel.service';
import { computeRepublishDiff, type ModulePublishPreflightResult } from '@superapp/platform-contracts';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { deployedFunctionExtensions } from '~/services/publish/deployed-extensions.server';
import { ActivationService, FUNCTION_KEY_ACTIVATION, moduleTypeForFunctionKey } from '~/services/publish/activation.service';
import {
  BundleProductService,
  resolveBundleWithPricing,
  bundleIdFromTitle,
  bundleParentSku,
  type ResolvedBundle,
} from '~/services/bundles/bundle-product.service';
import { activateBundleCartTransformForPlan } from '~/services/bundles/bundle-activation.server';
import { getPrisma } from '~/db.server';
import { ThemeFilesService } from '~/services/publish/theme-files.server';
import { checkCompiledLiquid, ThemeCheckFailedError } from '~/services/publish/theme-check.server';
import { isThemeNativeSectionEnabled, isThemeCheckGateBlocking } from '~/env.server';

// Exported (unpublish.service.ts, WS-E Task 9) so publish and unpublish share
// ONE source of truth for every namespace/key — teardown can never drift from
// what publish actually wrote.
export const THEME_MODULES_NAMESPACE = 'superapp.theme';
export const THEME_MODULE_REFS_KEY = 'module_refs';

export const ADMIN_BLOCKS_NAMESPACE = 'superapp.admin';
export const ADMIN_BLOCK_REFS_KEY = 'block_refs';

export const ADMIN_ACTIONS_NAMESPACE = 'superapp.admin';
export const ADMIN_ACTION_REFS_KEY = 'action_refs';

export const ADMIN_DISCOUNT_UI_NAMESPACE = 'superapp.admin';
export const ADMIN_DISCOUNT_UI_REFS_KEY = 'discount_ui_refs';

export const ADMIN_LINK_NAMESPACE = 'superapp.admin';
export const ADMIN_LINK_REFS_KEY = 'link_refs';

export const ADMIN_PRINT_NAMESPACE = 'superapp.admin';
export const ADMIN_PRINT_REFS_KEY = 'print_refs';

export const ADMIN_SEGMENT_TEMPLATE_NAMESPACE = 'superapp.admin';
export const ADMIN_SEGMENT_TEMPLATE_REFS_KEY = 'segment_template_refs';

export const FUNCTIONS_NAMESPACE = 'superapp.functions';

export const CHECKOUT_NAMESPACE = 'superapp.checkout';
export const CHECKOUT_UPSELL_REFS_KEY = 'upsell_refs';

export const CUSTOMER_ACCOUNT_NAMESPACE = 'superapp.customer_account';
export const CUSTOMER_ACCOUNT_BLOCK_REFS_KEY = 'block_refs';

/**
 * Thrown when a module is not publishable (WS5/026): `gated` (no publish wiring
 * yet — "not publishable yet") or `blocked` (a Function type whose wasm extension
 * isn't deployed). Carries the preflight so callers can surface the reasons and
 * never report "published" when nothing deploys.
 */
export class ModuleNotPublishableError extends Error {
  readonly code = 'MODULE_NOT_PUBLISHABLE';
  constructor(readonly preflight: ModulePublishPreflightResult) {
    super(preflight.reasons[0] ?? `${preflight.moduleType} is not publishable (${preflight.status}).`);
    this.name = 'ModuleNotPublishableError';
  }
}

/** One completed (Shopify-writing) step of a publish, in the order it ran. */
export type PublishOpLedgerEntry = { op: string; detail?: string };

/**
 * Thrown when `publish()` fails partway through (WS-E finding 4 — per-op publish
 * ledger). Every write PublishService makes is idempotent (handle-keyed
 * metaobject upserts, MetafieldsSet, activation ensure-calls) — so a caller never
 * needs to hand-diagnose which step failed and clean up: republishing from
 * scratch converges to the same end state without duplicating anything. Carries
 * `completed` (the ops that already succeeded) and `failedOp` (the one that
 * didn't) so the merchant/ops UI can surface exactly what happened instead of
 * a single opaque error.
 */
export class PublishPartialFailureError extends Error {
  readonly code = 'PUBLISH_PARTIAL_FAILURE';
  constructor(
    readonly failedOp: string,
    readonly completed: PublishOpLedgerEntry[],
    override readonly cause: unknown,
  ) {
    super(
      `Publish failed at "${failedOp}" after ${completed.length} completed step(s): ` +
        `${cause instanceof Error ? cause.message : String(cause)}. ` +
        `Republishing is safe — every completed step is idempotent and a republish converges.`,
    );
    this.name = 'PublishPartialFailureError';
  }
}

/**
 * Thrown when publishing a `functions.*` module would clobber a DIFFERENT
 * module's shop-level activation (WS-E final-review fix 1b). `FunctionActivation`
 * is `@@unique([shopId, functionKey])` — ONE row per shop, and the wasm reads
 * ONE config per shop — so a second module of the same function type publishing
 * would silently overwrite the first's config/activation with no error. Refusing
 * loudly is strictly better than a second publish silently clobbering the first.
 * Republishing the SAME module (moduleId match) is unaffected — see the
 * `id: { not: target.moduleId }` exclusion at the call site.
 */
export class FunctionKeyAlreadyPublishedError extends Error {
  readonly code = 'FUNCTION_KEY_ALREADY_PUBLISHED';
  constructor(
    readonly moduleType: string,
    readonly otherModuleName: string,
  ) {
    super(
      `A "${moduleType}" module is already published on this store ("${otherModuleName}"). ` +
        `Unpublish it first — each store can run one module of this function type at a time.`,
    );
    this.name = 'FunctionKeyAlreadyPublishedError';
  }
}

/**
 * Thrown when a native-section theme push is requested but the feature is not
 * enabled (flag off) — the app-block path remains the shipping default. Distinct
 * from the old blanket "theme file writes are not used" throw: the seam is
 * re-enabled (033), just flag-gated. Also fires for a delete of a native section
 * while the flag is off, so a stale op can never silently write to a theme.
 */
export class ThemeNativeSectionDisabledError extends Error {
  readonly code = 'THEME_NATIVE_SECTION_DISABLED';
  constructor() {
    super(
      'Native theme-section push is disabled. Set THEME_NATIVE_SECTION_ENABLED to enable it ' +
        '(requires write_themes + a Shopify page-builder exemption). Theme modules deploy via the app-block path by default.',
    );
    this.name = 'ThemeNativeSectionDisabledError';
  }
}

export class PublishService {
  /** Ops completed so far in the CURRENT publish() call, in order. Reset at the
   *  top of every publish() so instance reuse across calls can't leak a stale
   *  ledger into a later PublishPartialFailureError. */
  private ledger: PublishOpLedgerEntry[] = [];

  /** Run one Shopify-writing step, recording it on success or wrapping the
   *  failure in PublishPartialFailureError (carrying every step completed so
   *  far) so a caller can surface "republish is safe" instead of guessing.
   *  Optional `detail` derives the ledger entry's `detail` field from the
   *  step's own result — e.g. so a step whose idempotent-diff decided there
   *  was nothing to write can record itself as a no-op rather than looking
   *  identical to a step that made a real write. */
  private async step<T>(op: string, fn: () => Promise<T>, detail?: (result: T) => string | undefined): Promise<T> {
    try {
      const out = await fn();
      this.ledger.push({ op, detail: detail?.(out) });
      return out;
    } catch (cause) {
      throw new PublishPartialFailureError(op, [...this.ledger], cause);
    }
  }

  constructor(
    private readonly admin: AdminApiContext['admin'],
    /**
     * Shop domain + offline token, needed only for the native-section REST Asset
     * fallback (033). `shopId` (WS-E) is required to activate a mapped
     * `functions.*` type — publishing one without it throws rather than
     * silently skipping activation (see `ensureFunctionActivation`).
     */
    private readonly session?: { shop?: string; accessToken?: string; shopId?: string },
  ) {}

  async publish(
    spec: RecipeSpec,
    target: DeployTarget,
    opts?: {
      activationHandledByCoDeploy?: boolean;
      /**
       * Blueprint co-deploy override (WS-E Task 8 fix round 1): the blueprint
       * resolves its bundle triangle BEFORE members publish (from the member
       * config, or from a composite record's entityMap — a source this spec's
       * own config may not carry) and hands the resolved bundles here so
       * `publishCartTransform` activates with them instead of re-resolving from
       * the spec. Present-but-empty means "the blueprint resolved no bundle for
       * this member" → activation is skipped entirely, preserving the blueprint
       * path's pre-dedup semantics (it only ever activated with a resolved
       * bundle). Absent (single-module path) → resolve from the spec config.
       */
      cartTransformBundles?: ResolvedBundle[];
    },
  ): Promise<{ compiledJson?: string; preflight: ModulePublishPreflightResult; ledger: PublishOpLedgerEntry[] }> {
    // Fresh ledger for this call (WS-E finding 4) — see the `ledger` field doc.
    this.ledger = [];

    // WS5/026: never silently no-op. Gate before any deploy work so a caller
    // cannot report "published" for a type that deploys nothing.
    const preflight = classifyModulePublishability(spec, {
      deployedExtensions: deployedFunctionExtensions(),
      activationHandledByCoDeploy: opts?.activationHandledByCoDeploy === true,
    });
    if (!preflight.willDeploy) {
      throw new ModuleNotPublishableError(preflight);
    }

    // WS-E final-review fix 1b: refuse a second PUBLISHED module of the SAME
    // functions.* type on this shop — FunctionActivation is one row per
    // (shopId, functionKey), and the wasm reads ONE shop-level config, so a
    // second publish would silently clobber the first's activation/config.
    // Republishing the SAME module (moduleId match) is always allowed. Keyed
    // off FUNCTION_KEY_ACTIVATION — the same functionKey→activation map
    // `ensureFunctionActivation` consults below — via `moduleTypeForFunctionKey`,
    // so this never drifts into a second hand-maintained type↔functionKey map.
    if (spec.type.startsWith('functions.') && this.session?.shopId && target.moduleId) {
      const functionKey = spec.type.slice('functions.'.length);
      if (FUNCTION_KEY_ACTIVATION[functionKey]) {
        const other = await getPrisma().module.findFirst({
          where: {
            shopId: this.session.shopId,
            type: moduleTypeForFunctionKey(functionKey),
            status: 'PUBLISHED',
            id: { not: target.moduleId },
          },
          select: { name: true },
        });
        if (other) {
          throw new FunctionKeyAlreadyPublishedError(spec.type, other.name);
        }
      }
    }

    const result = compileRecipe(spec, target);
    const {
      ops,
      compiledJson,
      themeModulePayload,
      adminBlockPayload,
      adminActionPayload,
      adminDiscountUiPayload,
      adminLinkPayload,
      adminPrintPayload,
      adminSegmentTemplatePayload,
      checkoutUpsellPayload,
      customerAccountBlockPayload,
      proxyWidgetPayload,
    } = result;

    // WS-E (E5): functions.cartTransform deploys through the SAME end-to-end path the
    // blueprint co-deploy proved out — resolve SKUs → parent bundle product → cart
    // transform activation carrying $app:bundle_config (the ONLY config the wasm reads).
    if (spec.type === 'functions.cartTransform') {
      await this.publishCartTransform(spec, opts?.cartTransformBundles);
    }

    // ── Pre-publish Theme Check gate (035) ──────────────────────────────────
    // Validate compiled native-section Liquid (the only ops that carry Liquid
    // written verbatim into a merchant theme) BEFORE any store write. Only runs
    // when native-section push is actually enabled — otherwise the THEME_ASSET_*
    // branch below throws ThemeNativeSectionDisabledError and nothing deploys, so
    // there is nothing to validate. `error`-severity offenses block the publish
    // (when the gate is blocking); warnings/infos and any theme-check runtime
    // failure are logged non-blocking so the gate protects without ever bricking.
    if (isThemeNativeSectionEnabled()) {
      const liquidFiles = ops
        .filter((op): op is Extract<typeof op, { kind: 'THEME_ASSET_UPSERT' }> => op.kind === 'THEME_ASSET_UPSERT')
        .map((op) => ({ path: op.key, content: op.value }));
      if (liquidFiles.length > 0) {
        const tc = await checkCompiledLiquid(liquidFiles);
        const scope = target.moduleId ? ` [module ${target.moduleId}]` : '';
        if (tc.degraded) {
          console.warn(`[publish][theme-check]${scope} unable to validate (${tc.degradedReason}) — proceeding without gate.`);
        } else {
          for (const w of tc.warnings) {
            console.warn(`[publish][theme-check][warn]${scope} ${w.file}:${w.line ?? '?'} ${w.check}: ${w.message}`);
          }
          if (tc.errors.length > 0) {
            if (isThemeCheckGateBlocking()) {
              throw new ThemeCheckFailedError(tc.errors);
            }
            for (const e of tc.errors) {
              console.warn(`[publish][theme-check][error:warn-only]${scope} ${e.file}:${e.line ?? '?'} ${e.check}: ${e.message}`);
            }
          }
        }
      }
    }

    const mf = new MetafieldService(this.admin);
    const mo = new MetaobjectService(this.admin);

    // ── Theme module → metaobject + list.metaobject_reference ───────────────
    if (themeModulePayload && target.kind === 'THEME' && target.moduleId) {
      await this.writeThemeModule(mo, target.moduleId, themeModulePayload);
    }

    // ── Admin block → metaobject + list.metaobject_reference ────────────────
    if (adminBlockPayload && target.moduleId) {
      await this.writeAdminBlock(mo, target.moduleId, adminBlockPayload);
    }

    // ── Admin action → metaobject + list.metaobject_reference ───────────────
    if (adminActionPayload && target.moduleId) {
      await this.writeAdminAction(mo, target.moduleId, adminActionPayload);
    }

    // ── Admin discount UI → metaobject + list.metaobject_reference ───────────
    if (adminDiscountUiPayload && target.moduleId) {
      await this.writeAdminDiscountUi(mo, target.moduleId, adminDiscountUiPayload);
    }

    // ── Admin link → metaobject + list.metaobject_reference ─────────────────
    if (adminLinkPayload && target.moduleId) {
      await this.writeAdminLink(mo, target.moduleId, adminLinkPayload);
    }

    // ── Admin print → metaobject + list.metaobject_reference ────────────────
    if (adminPrintPayload && target.moduleId) {
      await this.writeAdminPrint(mo, target.moduleId, adminPrintPayload);
    }

    // ── Admin segment template → metaobject + list.metaobject_reference ──────
    if (adminSegmentTemplatePayload && target.moduleId) {
      await this.writeAdminSegmentTemplate(mo, target.moduleId, adminSegmentTemplatePayload);
    }

    // ── Checkout upsell → metaobject + list.metaobject_reference ────────────
    if (checkoutUpsellPayload && target.moduleId) {
      await this.writeCheckoutUpsell(mo, target.moduleId, checkoutUpsellPayload);
    }

    // ── Customer account block → metaobject + list.metaobject_reference ─────
    if (customerAccountBlockPayload && target.moduleId) {
      await this.writeCustomerAccountBlock(mo, target.moduleId, customerAccountBlockPayload);
    }

    // ── Proxy widget → metaobject (looked up by handle at runtime) ───────────
    if (proxyWidgetPayload) {
      await this.step(`upsertMetaobject:superapp-proxy-${proxyWidgetPayload.widgetId}`, () =>
        mo.upsertProxyWidgetObject(proxyWidgetPayload));
    }

    // ── Compiler ops ────────────────────────────────────────────────────────
    for (const op of ops) {
      switch (op.kind) {
        // Native-section theme push (033). Re-enabled seam, flag-gated. Every write
        // goes through ThemeFilesService's allow-list (sections/superapp-*.liquid only)
        // + {% schema %} JSON validation + async-job poll (GraphQL) with a REST Asset
        // fallback. The default app-block path never produces these ops, so this
        // branch is unreachable for existing modules.
        case 'THEME_ASSET_UPSERT': {
          if (!isThemeNativeSectionEnabled()) throw new ThemeNativeSectionDisabledError();
          const themeFiles = new ThemeFilesService(this.admin, this.session?.shop, this.session?.accessToken);
          await this.step(`themeAsset:upsert:${op.key}`, () => themeFiles.upsertSection(op.themeId, op.key, op.value));
          break;
        }

        case 'THEME_ASSET_DELETE': {
          if (!isThemeNativeSectionEnabled()) throw new ThemeNativeSectionDisabledError();
          const themeFiles = new ThemeFilesService(this.admin, this.session?.shop, this.session?.accessToken);
          await this.step(`themeAsset:delete:${op.key}`, () => themeFiles.deleteFiles(op.themeId, [op.key]));
          break;
        }

        case 'SHOP_METAFIELD_SET':
          await this.step(`SHOP_METAFIELD_SET:${op.namespace}/${op.key}`, () =>
            mf.setShopMetafield(op.namespace, op.key, op.type, op.value));
          break;

        case 'SHOP_METAFIELD_DELETE':
          await this.step(`SHOP_METAFIELD_DELETE:${op.namespace}/${op.key}`, () =>
            mf.deleteShopMetafield(op.namespace, op.key));
          break;

        case 'FUNCTION_CONFIG_UPSERT':
          await this.step(
            `FUNCTION_CONFIG_UPSERT:${op.functionKey}`,
            () => this.writeFunctionConfig(mo, op.functionKey, op.config),
            (outcome) => (outcome === 'noop' ? 'noop' : undefined),
          );
          // WS-E: the config metaobject alone deploys NOTHING — ensure the Shopify
          // activation object that makes the function execute. Runs even when the
          // config diff is a no-op (a prior partial failure may have written config
          // without activation). Throws without shopId: fail loudly, never publish a
          // function silently inert.
          await this.step(`functionActivation:${op.functionKey}`, () => this.ensureFunctionActivation(op.functionKey));
          break;

        case 'METAOBJECT_ENSURE_DEF':
          await this.step(`ensureMetafieldDefinition:${op.namespace}/${op.key}`, () =>
            mo.ensureMetafieldDefinition(op.namespace, op.key, op.metaobjectType, op.isList));
          break;

        case 'WEB_PIXEL_UPSERT':
          // Idempotent: WebPixelService reads the app's current pixel and
          // webPixelUpdate-s it when present, else webPixelCreate-s (settings
          // must match extensions/superapp-web-pixel's [settings] schema).
          await this.step('WEB_PIXEL_UPSERT', () => new WebPixelService(this.admin).upsert(op.settings));
          break;

        case 'AUDIT':
          break;

        default: {
          const _exhaustive: never = op;
          return _exhaustive;
        }
      }
    }

    return { compiledJson, preflight, ledger: this.ledger };
  }

  // ─── Write helpers ─────────────────────────────────────────────────────────

  private async writeThemeModule(
    mo: MetaobjectService,
    moduleId: string,
    payload: ThemeModulePayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${THEME_MODULES_NAMESPACE}/${THEME_MODULE_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, '$app:superapp_module', true));
    const gid = await this.step(`upsertMetaobject:superapp-module-${moduleId}`, () =>
      mo.upsertModuleObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${THEME_MODULES_NAMESPACE}/${THEME_MODULE_REFS_KEY}`, () =>
      mo.setModuleGidList(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, updatedGids));
  }

  private async writeAdminBlock(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminBlockPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_BLOCKS_NAMESPACE}/${ADMIN_BLOCK_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY, '$app:superapp_admin_block', true));
    const gid = await this.step(`upsertMetaobject:superapp-block-${moduleId}`, () =>
      mo.upsertAdminBlockObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_BLOCKS_NAMESPACE}/${ADMIN_BLOCK_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY, updatedGids));
  }

  private async writeAdminAction(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminActionPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_ACTIONS_NAMESPACE}/${ADMIN_ACTION_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY, '$app:superapp_admin_action', true));
    const gid = await this.step(`upsertMetaobject:superapp-action-${moduleId}`, () =>
      mo.upsertAdminActionObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_ACTIONS_NAMESPACE}/${ADMIN_ACTION_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY, updatedGids));
  }

  private async writeAdminDiscountUi(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminDiscountUiPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_DISCOUNT_UI_NAMESPACE}/${ADMIN_DISCOUNT_UI_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_DISCOUNT_UI_NAMESPACE, ADMIN_DISCOUNT_UI_REFS_KEY, '$app:superapp_admin_discount_ui', true));
    const gid = await this.step(`upsertMetaobject:superapp-discount-ui-${moduleId}`, () =>
      mo.upsertAdminDiscountUiObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_DISCOUNT_UI_NAMESPACE, ADMIN_DISCOUNT_UI_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_DISCOUNT_UI_NAMESPACE}/${ADMIN_DISCOUNT_UI_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_DISCOUNT_UI_NAMESPACE, ADMIN_DISCOUNT_UI_REFS_KEY, updatedGids));
  }

  private async writeAdminLink(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminLinkPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_LINK_NAMESPACE}/${ADMIN_LINK_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_LINK_NAMESPACE, ADMIN_LINK_REFS_KEY, '$app:superapp_admin_link', true));
    const gid = await this.step(`upsertMetaobject:superapp-link-${moduleId}`, () =>
      mo.upsertAdminLinkObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_LINK_NAMESPACE, ADMIN_LINK_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_LINK_NAMESPACE}/${ADMIN_LINK_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_LINK_NAMESPACE, ADMIN_LINK_REFS_KEY, updatedGids));
  }

  private async writeAdminPrint(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminPrintPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_PRINT_NAMESPACE}/${ADMIN_PRINT_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_PRINT_NAMESPACE, ADMIN_PRINT_REFS_KEY, '$app:superapp_admin_print', true));
    const gid = await this.step(`upsertMetaobject:superapp-print-${moduleId}`, () =>
      mo.upsertAdminPrintObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_PRINT_NAMESPACE, ADMIN_PRINT_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_PRINT_NAMESPACE}/${ADMIN_PRINT_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_PRINT_NAMESPACE, ADMIN_PRINT_REFS_KEY, updatedGids));
  }

  private async writeAdminSegmentTemplate(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminSegmentTemplatePayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${ADMIN_SEGMENT_TEMPLATE_NAMESPACE}/${ADMIN_SEGMENT_TEMPLATE_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(ADMIN_SEGMENT_TEMPLATE_NAMESPACE, ADMIN_SEGMENT_TEMPLATE_REFS_KEY, '$app:superapp_admin_segment_template', true));
    const gid = await this.step(`upsertMetaobject:superapp-segment-template-${moduleId}`, () =>
      mo.upsertAdminSegmentTemplateObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(ADMIN_SEGMENT_TEMPLATE_NAMESPACE, ADMIN_SEGMENT_TEMPLATE_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${ADMIN_SEGMENT_TEMPLATE_NAMESPACE}/${ADMIN_SEGMENT_TEMPLATE_REFS_KEY}`, () =>
      mo.setModuleGidList(ADMIN_SEGMENT_TEMPLATE_NAMESPACE, ADMIN_SEGMENT_TEMPLATE_REFS_KEY, updatedGids));
  }

  /** Returns 'noop' when the idempotent-diff found nothing to write (so the
   *  ledger step wrapping this call can record it truthfully as skipped
   *  rather than indistinguishable from a real write), else 'written'. */
  private async writeFunctionConfig(
    mo: MetaobjectService,
    functionKey: string,
    config: unknown,
  ): Promise<'written' | 'noop'> {
    // WS5/026: idempotent republish — skip the write when nothing changed so a
    // republish is a true no-op (the metaobject is already handle-keyed, so this
    // also guarantees no duplicates).
    const next = (config && typeof config === 'object' ? (config as Record<string, unknown>) : {}) as Record<string, unknown>;
    const existing = await mo.getFunctionConfigByKey(functionKey);

    // Preserve managed bundle-pricing rules (id: "bundle:*") that
    // BundleProductService.writeBundlePricingRules merged into the SAME
    // `discountRules` function-config metaobject. Republishing the discount module
    // upserts its compiled config wholesale, which would otherwise silently drop
    // those managed rules and break bundle pricing on non-Plus stores. Re-append
    // them (module rules first, managed rules last — same ordering the writer
    // produces) BEFORE the diff so a genuine no-op still stays a no-op.
    if (functionKey === 'discountRules') {
      const existingConfig = existing?.config;
      const prevRules =
        existingConfig && typeof existingConfig === 'object' && Array.isArray((existingConfig as Record<string, unknown>).rules)
          ? ((existingConfig as Record<string, unknown>).rules as Array<Record<string, unknown>>)
          : [];
      const managed = prevRules.filter(
        (r) => typeof r?.id === 'string' && (r.id as string).startsWith('bundle:'),
      );
      if (managed.length > 0) {
        const moduleRules = Array.isArray(next.rules) ? (next.rules as unknown[]) : [];
        next.rules = [...moduleRules, ...managed];
      }
    }

    const diff = computeRepublishDiff({
      moduleType: `functions.${functionKey}`,
      metaobjectType: '$app:superapp_function_config',
      existing,
      next,
    });
    if (diff.action === 'noop') return 'noop';

    const refKey = `fn_${functionKey}`;
    await mo.ensureMetafieldDefinition(
      FUNCTIONS_NAMESPACE, refKey, '$app:superapp_function_config', false,
    );
    const gid = await mo.upsertFunctionConfigObject(functionKey, next);
    await mo.setModuleRef(FUNCTIONS_NAMESPACE, refKey, gid);
    return 'written';
  }

  private async publishCartTransform(spec: RecipeSpec, override?: ResolvedBundle[]): Promise<void> {
    const shopId = this.session?.shopId;
    if (!shopId) {
      throw new Error('Publishing functions.cartTransform requires session.shopId (WS-E).');
    }
    // Blueprint co-deploy override: present-but-empty = the blueprint resolved no
    // bundle for this member → no activation (pre-dedup blueprint semantics).
    if (override && override.length === 0) return;

    let resolved: ResolvedBundle[];
    if (override) {
      resolved = override;
    } else {
      const config = (spec as { config?: { bundles?: Array<Record<string, unknown>>; pricing?: unknown } }).config;
      const bundleInputs = config?.bundles ?? [];
      const svc = new BundleProductService(this.admin);
      resolved = [];
      for (const b of bundleInputs) {
        const componentSkus = (b.componentSkus as string[] | undefined) ?? [];
        const title = String(b.title ?? 'Bundle');
        const components = await this.step('cartTransform:resolve', () => svc.resolveComponents(componentSkus));
        if (components.length < 2) {
          throw new Error(
            `Bundle "${title}": only ${components.length}/${componentSkus.length} component SKUs resolved to store variants — fix the SKUs and republish.`,
          );
        }
        const bundleId = bundleIdFromTitle(title);
        const parentVariantId = await this.step('cartTransform:parentProduct', () =>
          svc.ensureParentBundleProduct({ bundleId, title, components }));
        const base: ResolvedBundle = {
          bundleId, title, parentVariantId,
          bundleSku: bundleParentSku(bundleId),
          discountPercentage: Number(b.discountPercentage ?? 0),
          components,
        };
        resolved.push(resolveBundleWithPricing(base, (b.pricing ?? config?.pricing) as never));
      }
    }

    // Plan-aware activation — the ONE shared implementation (also the blueprint
    // co-deploy path's): split Plus-only fixed pricing, activate with the
    // plan-correct config, run the managed-discount fallback leg.
    const shopDomain = await this.resolveShopDomain(shopId);
    const cartTransformGid = await this.step('cartTransform:activate', () =>
      activateBundleCartTransformForPlan(this.admin, {
        shopId,
        shopDomain,
        bundles: resolved,
      }));
    // Record for unpublish (Task 10) — kind cartTransform, one per shop.
    await new ActivationService(this.admin, shopId).recordCartTransform(cartTransformGid);
  }

  /**
   * The plan lookup (`CapabilityService.getPlanTier`) keys off the shop DOMAIN.
   * Most call sites pass `session.shop`; the worker adapter and blueprint paths
   * construct PublishService with only `shopId`, so fall back to resolving the
   * domain from the Shop row. Throws when neither resolves — a cartTransform
   * publish must never silently guess a plan.
   */
  private async resolveShopDomain(shopId: string): Promise<string> {
    if (this.session?.shop) return this.session.shop;
    const row = await getPrisma().shop.findUnique({ where: { id: shopId } });
    const shopDomain = (row as { shopDomain?: string } | null)?.shopDomain;
    if (!shopDomain) {
      throw new Error(
        `Publishing functions.cartTransform: cannot resolve the shop domain for shop "${shopId}" — ` +
          `required for plan-aware bundle pricing (WS-E).`,
      );
    }
    return shopDomain;
  }

  private async ensureFunctionActivation(functionKey: string): Promise<void> {
    if (!FUNCTION_KEY_ACTIVATION[functionKey]) return;
    const shopId = this.session?.shopId;
    if (!shopId) {
      throw new Error(
        `Publishing functions.${functionKey} requires session.shopId for activation wiring — ` +
          `pass { shopId } to PublishService (WS-E).`,
      );
    }
    await new ActivationService(this.admin, shopId).ensureForFunctionKey(functionKey);
  }

  private async writeCheckoutUpsell(
    mo: MetaobjectService,
    moduleId: string,
    payload: CheckoutUpsellPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${CHECKOUT_NAMESPACE}/${CHECKOUT_UPSELL_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY, '$app:superapp_checkout_upsell', true));
    const gid = await this.step(`upsertMetaobject:superapp-checkout-upsell-${moduleId}`, () =>
      mo.upsertCheckoutUpsellObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${CHECKOUT_NAMESPACE}/${CHECKOUT_UPSELL_REFS_KEY}`, () =>
      mo.setModuleGidList(CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY, updatedGids));
  }

  private async writeCustomerAccountBlock(
    mo: MetaobjectService,
    moduleId: string,
    payload: CustomerAccountBlockPayload,
  ): Promise<void> {
    await this.step(`ensureMetafieldDefinition:${CUSTOMER_ACCOUNT_NAMESPACE}/${CUSTOMER_ACCOUNT_BLOCK_REFS_KEY}`, () =>
      mo.ensureMetafieldDefinition(CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, '$app:superapp_customer_account_block', true));
    const gid = await this.step(`upsertMetaobject:superapp-ca-block-${moduleId}`, () =>
      mo.upsertCustomerAccountBlockObject(moduleId, payload));
    const currentGids = await mo.getModuleGidList(CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await this.step(`setModuleGidList:${CUSTOMER_ACCOUNT_NAMESPACE}/${CUSTOMER_ACCOUNT_BLOCK_REFS_KEY}`, () =>
      mo.setModuleGidList(CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, updatedGids));
  }
}
