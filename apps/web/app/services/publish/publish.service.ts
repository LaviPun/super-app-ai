import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import type {
  AdminActionPayload,
  AdminBlockPayload,
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

const THEME_MODULES_NAMESPACE = 'superapp.theme';
const THEME_MODULE_REFS_KEY = 'module_refs';

const ADMIN_BLOCKS_NAMESPACE = 'superapp.admin';
const ADMIN_BLOCK_REFS_KEY = 'block_refs';

const ADMIN_ACTIONS_NAMESPACE = 'superapp.admin';
const ADMIN_ACTION_REFS_KEY = 'action_refs';

const FUNCTIONS_NAMESPACE = 'superapp.functions';

const CHECKOUT_NAMESPACE = 'superapp.checkout';
const CHECKOUT_UPSELL_REFS_KEY = 'upsell_refs';

const CUSTOMER_ACCOUNT_NAMESPACE = 'superapp.customer_account';
const CUSTOMER_ACCOUNT_BLOCK_REFS_KEY = 'block_refs';

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

export class PublishService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async publish(spec: RecipeSpec, target: DeployTarget): Promise<{ compiledJson?: string; preflight: ModulePublishPreflightResult }> {
    // WS5/026: never silently no-op. Gate before any deploy work so a caller
    // cannot report "published" for a type that deploys nothing.
    const preflight = classifyModulePublishability(spec, { deployedExtensions: deployedFunctionExtensions() });
    if (!preflight.willDeploy) {
      throw new ModuleNotPublishableError(preflight);
    }

    const result = compileRecipe(spec, target);
    const {
      ops,
      compiledJson,
      themeModulePayload,
      adminBlockPayload,
      adminActionPayload,
      checkoutUpsellPayload,
      customerAccountBlockPayload,
      proxyWidgetPayload,
    } = result;
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
      await mo.upsertProxyWidgetObject(proxyWidgetPayload);
    }

    // ── Compiler ops ────────────────────────────────────────────────────────
    for (const op of ops) {
      switch (op.kind) {
        case 'THEME_ASSET_UPSERT':
        case 'THEME_ASSET_DELETE':
          throw new Error('Theme file writes are not used. Theme modules deploy via app extension (metaobjects).');

        case 'SHOP_METAFIELD_SET':
          await mf.setShopMetafield(op.namespace, op.key, op.type, op.value);
          break;

        case 'SHOP_METAFIELD_DELETE':
          await mf.deleteShopMetafield(op.namespace, op.key);
          break;

        case 'FUNCTION_CONFIG_UPSERT':
          await this.writeFunctionConfig(mo, op.functionKey, op.config);
          break;

        case 'METAOBJECT_ENSURE_DEF':
          await mo.ensureMetafieldDefinition(op.namespace, op.key, op.metaobjectType, op.isList);
          break;

        case 'WEB_PIXEL_UPSERT':
          // Idempotent: WebPixelService reads the app's current pixel and
          // webPixelUpdate-s it when present, else webPixelCreate-s (settings
          // must match extensions/superapp-web-pixel's [settings] schema).
          await new WebPixelService(this.admin).upsert(op.settings);
          break;

        case 'AUDIT':
          break;

        default: {
          const _exhaustive: never = op;
          return _exhaustive;
        }
      }
    }

    return { compiledJson, preflight };
  }

  // ─── Write helpers ─────────────────────────────────────────────────────────

  private async writeThemeModule(
    mo: MetaobjectService,
    moduleId: string,
    payload: ThemeModulePayload,
  ): Promise<void> {
    await mo.ensureMetafieldDefinition(
      THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, '$app:superapp_module', true,
    );
    const gid = await mo.upsertModuleObject(moduleId, payload);
    const currentGids = await mo.getModuleGidList(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await mo.setModuleGidList(THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY, updatedGids);
  }

  private async writeAdminBlock(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminBlockPayload,
  ): Promise<void> {
    await mo.ensureMetafieldDefinition(
      ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY, '$app:superapp_admin_block', true,
    );
    const gid = await mo.upsertAdminBlockObject(moduleId, payload);
    const currentGids = await mo.getModuleGidList(ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await mo.setModuleGidList(ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY, updatedGids);
  }

  private async writeAdminAction(
    mo: MetaobjectService,
    moduleId: string,
    payload: AdminActionPayload,
  ): Promise<void> {
    await mo.ensureMetafieldDefinition(
      ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY, '$app:superapp_admin_action', true,
    );
    const gid = await mo.upsertAdminActionObject(moduleId, payload);
    const currentGids = await mo.getModuleGidList(ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await mo.setModuleGidList(ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY, updatedGids);
  }

  private async writeFunctionConfig(
    mo: MetaobjectService,
    functionKey: string,
    config: unknown,
  ): Promise<void> {
    // WS5/026: idempotent republish — skip the write when nothing changed so a
    // republish is a true no-op (the metaobject is already handle-keyed, so this
    // also guarantees no duplicates).
    const next = (config && typeof config === 'object' ? (config as Record<string, unknown>) : {}) as Record<string, unknown>;
    const existing = await mo.getFunctionConfigByKey(functionKey);
    const diff = computeRepublishDiff({
      moduleType: `functions.${functionKey}`,
      metaobjectType: '$app:superapp_function_config',
      existing,
      next,
    });
    if (diff.action === 'noop') return;

    const refKey = `fn_${functionKey}`;
    await mo.ensureMetafieldDefinition(
      FUNCTIONS_NAMESPACE, refKey, '$app:superapp_function_config', false,
    );
    const gid = await mo.upsertFunctionConfigObject(functionKey, next);
    await mo.setModuleRef(FUNCTIONS_NAMESPACE, refKey, gid);
  }

  private async writeCheckoutUpsell(
    mo: MetaobjectService,
    moduleId: string,
    payload: CheckoutUpsellPayload,
  ): Promise<void> {
    await mo.ensureMetafieldDefinition(
      CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY, '$app:superapp_checkout_upsell', true,
    );
    const gid = await mo.upsertCheckoutUpsellObject(moduleId, payload);
    const currentGids = await mo.getModuleGidList(CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await mo.setModuleGidList(CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY, updatedGids);
  }

  private async writeCustomerAccountBlock(
    mo: MetaobjectService,
    moduleId: string,
    payload: CustomerAccountBlockPayload,
  ): Promise<void> {
    await mo.ensureMetafieldDefinition(
      CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, '$app:superapp_customer_account_block', true,
    );
    const gid = await mo.upsertCustomerAccountBlockObject(moduleId, payload);
    const currentGids = await mo.getModuleGidList(CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY);
    const updatedGids = Array.from(new Set([...currentGids, gid]));
    await mo.setModuleGidList(CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, updatedGids);
  }
}
