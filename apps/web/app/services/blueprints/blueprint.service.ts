/**
 * BlueprintService — persistence + co-deploy for multi-module blueprints.
 *
 * A blueprint reuses the existing `Recipe` row as the group (Recipe.modules),
 * so each member is a normal Module/ModuleVersion and all existing
 * compile/preview/publish paths apply unchanged. See docs/blueprints.md.
 */
import { getPrisma } from '~/db.server';
import type {
  CompositeRecord,
  DeployTarget,
  MemberBinding,
  ModuleType,
  PricingPack,
  RecipeBlueprint,
  RecipeSpec,
} from '@superapp/core';
import { RecipeSpecSchema } from '@superapp/core';
import { ModuleService } from '~/services/modules/module.service';
import { PublishService } from '~/services/publish/publish.service';
import {
  BundleProductService,
  bundleIdFromTitle,
  buildBundleRuntimeConfig,
  resolveBundleWithPricing,
  type ResolvedBundle,
} from '~/services/bundles/bundle-product.service';
import {
  resolveCompositeRecord,
  type ResolvedCompositeRecord,
} from '~/services/composites/resolve-record.server';

type AdminClient = ConstructorParameters<typeof PublishService>[0];

/**
 * Wire a resolved bundle (real parent/component variant GIDs from
 * BundleProductService) into a blueprint member's config so it deploys against
 * live store data instead of the placeholder GIDs the AI generated:
 *  - theme.section (kind: product-bundle) → bundleId + component variants for the widget
 *  - checkout.upsell → offer the bundle's parent variant
 *  - checkout.block  → offer the bundle's parent variant (the bundle catalog's
 *    checkout member is `checkout.block`; the `checkout.upsell` branch stays for a
 *    future catalog that uses it)
 * Unrelated members are returned unchanged (same reference).
 *
 * R3.1: this is now a back-compat SHIM over the binding-driven
 * `injectResolvedRecord`. R3.2's flat co-deploy path (no `bindings` table) calls
 * this; the shim synthesizes a `display` binding so both paths run through ONE
 * injection code path (C3). New composite blueprints call `injectResolvedRecord`
 * with the real per-member binding.
 */
export function injectResolvedBundle(spec: RecipeSpec, bundle: ResolvedBundle): RecipeSpec {
  const resolved: ResolvedCompositeRecord = {
    ref: bundle.bundleId,
    kind: 'product-bundle',
    backing: 'APP_METAFIELD',
    bindingKey: '_superapp_bundle_id',
    bundle,
    deferred: false,
  };
  // Flat path has no per-member binding role; treat every member as a candidate.
  // `injectResolvedRecord` sniffs the member type (as before) and no-ops unrelated
  // specs by identity, preserving R3.2's exact behavior.
  return injectResolvedRecord(spec, null, resolved);
}

/**
 * Generalized member injection (R3.1): wire a resolved shared record into a
 * blueprint member's config, keyed by the member's `type` and its `binding`.
 * Supersedes the hard-coded bundle triangle in R3.2's `injectResolvedBundle`.
 *
 * A member with no relevant resolved data (unrelated type / non-bundle record) is
 * returned BY IDENTITY (same reference), so unbound members are untouched and the
 * flat path regresses byte-identically.
 *
 * The `binding` (when present) carries the member's `availabilitySource` — a
 * product-bundle `display` bound to `'components'` stamps the widget so Sold-Out
 * reads REAL component inventory, not the placeholder BAP (the Fast Bundle bug).
 */
export function injectResolvedRecord(
  spec: RecipeSpec,
  binding: MemberBinding | null,
  resolved: ResolvedCompositeRecord,
): RecipeSpec {
  const config = (spec as { config?: Record<string, unknown> }).config ?? {};
  const bundle = resolved.bundle;

  // product-bundle display surface — the PDP widget.
  if (bundle && spec.type === 'theme.section' && config.kind === 'product-bundle') {
    const next: Record<string, unknown> = {
      ...config,
      bundleId: bundle.bundleId,
      components: bundle.components,
      bindingKey: resolved.bindingKey ?? '_superapp_bundle_id',
    };
    // The load-bearing inventory-source binding: default to real component
    // inventory for a bundle display unless the binding explicitly says otherwise.
    next.availabilitySource = binding?.availabilitySource && binding.availabilitySource !== 'none'
      ? binding.availabilitySource
      : 'components';
    return { ...spec, config: next } as unknown as RecipeSpec;
  }

  // Checkout enforcement/display members — point at the parent bundle variant.
  if (bundle && (spec.type === 'checkout.upsell' || spec.type === 'checkout.block')) {
    return {
      ...spec,
      config: { ...config, offerTitle: bundle.title, productVariantGid: bundle.parentVariantId },
    } as unknown as RecipeSpec;
  }

  // No resolved data for this member type → return by identity (unbound is a no-op).
  return spec;
}

/**
 * Structurally detect the bundle-triangle resolution source: a
 * `functions.cartTransform` member whose config declares a BUNDLE with at least
 * one `bundles[]` entry. Detection is structural (not link-driven) so it is robust
 * to the AI omitting or mislabeling `blueprint.links[]` (design §4).
 */
export function isBundleConfig(spec: RecipeSpec): boolean {
  if (spec.type !== 'functions.cartTransform') return false;
  const config = (spec as { config?: Record<string, unknown> }).config;
  if (!config || config.mode !== 'BUNDLE') return false;
  const bundles = (config as { bundles?: unknown }).bundles;
  return Array.isArray(bundles) && bundles.length > 0;
}

/**
 * The persisted shared-record manifest (R3.1) — the JSON blob on
 * `Recipe.compositeJson`. `memberRoles` is the ordered blueprint role of each
 * member (module order) so a binding's `memberRole` resolves to a Module row.
 */
export type CompositeManifest = {
  sharedRecords: CompositeRecord[];
  bindings: MemberBinding[];
  memberRoles: string[];
};

/** Parse `Recipe.compositeJson` into a manifest, or null when absent/invalid. */
export function parseCompositeManifest(compositeJson: string | null | undefined): CompositeManifest | null {
  if (!compositeJson) return null;
  try {
    const raw = JSON.parse(compositeJson) as Partial<CompositeManifest>;
    const sharedRecords = Array.isArray(raw.sharedRecords) ? raw.sharedRecords : [];
    if (sharedRecords.length === 0) return null;
    return {
      sharedRecords,
      bindings: Array.isArray(raw.bindings) ? raw.bindings : [],
      memberRoles: Array.isArray(raw.memberRoles) ? raw.memberRoles : [],
    };
  } catch {
    return null;
  }
}

export type BlueprintCreateResult = {
  recipeId: string;
  moduleIds: string[];
  firstModuleId: string;
};

/** One member ready to publish: its spec (pre-injection) + the target it deploys to. */
type PlannedMember = {
  moduleId: string;
  versionId: string;
  type: ModuleType;
  spec: RecipeSpec;
  target: DeployTarget;
  /** The blueprint role (R3.1), when the recipe carried a composite manifest. */
  role?: string;
};

/**
 * Per-member co-deploy outcome. `skipped` = a required upstream member (the bundle
 * resolution source) failed, so this dependent was never attempted — it stays DRAFT
 * and is retryable. Additive over the old `{published, failed}` shape (zero prior
 * consumers), so widening is free.
 */
export type BlueprintPublishResult = {
  recipeId: string;
  published: Array<{ moduleId: string; type: string }>;
  failed: Array<{ moduleId: string; type: string; error: string }>;
  skipped: Array<{ moduleId: string; type: string; reason: string }>;
  /** The resolved bundle when a bundle triangle was co-deployed; else null. */
  resolvedBundle: ResolvedBundle | null;
};

/**
 * Co-deploy publish order: the bundle resolution source (cart-transform) first so
 * its resolved GIDs are injected into the dependent theme/checkout members before
 * they compile. When there is no source, order is unchanged. Pure — unit-tested
 * against every catalog entry.
 */
export function orderMembersForCoDeploy<T extends { spec: RecipeSpec }>(members: T[]): T[] {
  const sourceIdx = members.findIndex((m) => isBundleConfig(m.spec));
  if (sourceIdx < 0) return members;
  return [members[sourceIdx]!, ...members.filter((_, i) => i !== sourceIdx)];
}

export class BlueprintService {
  /**
   * Persist a generated blueprint as a `Recipe` row + N draft `Module`s linked
   * via `recipeId`. Returns the new recipe + member module ids.
   */
  async createDraft(shopDomain: string, blueprint: RecipeBlueprint): Promise<BlueprintCreateResult> {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new Error('Shop not found');

    const primary = blueprint.modules[0];
    if (!primary) throw new Error('Blueprint has no modules');

    // R3.1 — persist the shared-record manifest (if any) so publish can re-read it.
    // `memberRoles` snapshots the blueprint role of each member IN MODULE ORDER, so
    // publish can map a binding's `memberRole` → the persisted Module row (Module
    // rows carry `spec.name`, not the blueprint role). Absent ⇒ compositeJson stays
    // null (a flat blueprint; byte-for-byte prior behavior).
    const compositeJson =
      blueprint.sharedRecords || blueprint.bindings
        ? JSON.stringify({
            sharedRecords: blueprint.sharedRecords ?? [],
            bindings: blueprint.bindings ?? [],
            memberRoles: blueprint.modules.map((m) => m.role),
          })
        : null;

    const recipe = await prisma.recipe.create({
      data: {
        shopId: shop.id,
        category: primary.recipe.category,
        title: blueprint.name,
        summary: blueprint.summary,
        compositeJson,
      },
    });

    const moduleService = new ModuleService();
    const moduleIds: string[] = [];
    for (const member of blueprint.modules) {
      const mod = await moduleService.createDraft(shopDomain, member.recipe, {
        recipeId: recipe.id,
        sourceType: 'recipe',
      });
      moduleIds.push(mod.id);
    }

    return { recipeId: recipe.id, moduleIds, firstModuleId: moduleIds[0]! };
  }

  /** Load a blueprint (Recipe) with its member modules + versions for the UI. */
  async getBlueprint(shopDomain: string, recipeId: string) {
    const prisma = getPrisma();
    return prisma.recipe.findFirst({
      where: { id: recipeId, shop: { shopDomain } },
      include: {
        modules: {
          include: { versions: { orderBy: { version: 'desc' } }, activeVersion: true },
        },
      },
    });
  }

  /** List blueprints (grouped recipes) for a shop, newest first. */
  async listBlueprints(shopDomain: string) {
    const prisma = getPrisma();
    return prisma.recipe.findMany({
      where: { shop: { shopDomain }, modules: { some: {} } },
      include: { modules: { select: { id: true, type: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Resolve a `functions.cartTransform` bundle member into a fully-wired
   * `ResolvedBundle` (real component GIDs + parent BAP variant + stable bundleId +
   * R2.2 lowered pricing), reusing the shipped `BundleProductService` end-to-end —
   * nothing is reimplemented. Returns `null` when there is nothing to resolve.
   *
   * Fails LOUD when a bundle's SKUs don't resolve to ≥2 store variants: a partially
   * resolved bundle is a hard error, never a silent placeholder deploy (mirrors
   * PublishService's "never report published when nothing wires" discipline).
   */
  private async resolveBundleForBlueprint(
    admin: AdminClient,
    cartTransformSpec: RecipeSpec,
  ): Promise<ResolvedBundle | null> {
    const config = (cartTransformSpec as { config?: Record<string, unknown> }).config;
    const first = (config as { bundles?: Array<Record<string, unknown>> } | undefined)?.bundles?.[0];
    const componentSkus = (first?.componentSkus as string[] | undefined) ?? [];
    if (!first || componentSkus.length === 0) return null; // nothing to resolve → no-op

    const svc = new BundleProductService(admin);
    const components = await svc.resolveComponents(componentSkus);
    if (components.length < 2) {
      throw new Error(
        `Bundle "${String(first.title ?? 'untitled')}": only ${components.length}/${componentSkus.length} component SKUs resolved to store variants.`,
      );
    }

    const title = String(first.title ?? 'Bundle');
    const bundleId = bundleIdFromTitle(title);
    const parentVariantId = await svc.ensureParentBundleProduct({ bundleId, title, components });
    const bundleSku = typeof first.bundleSku === 'string' ? first.bundleSku : undefined;
    const base: ResolvedBundle = { bundleId, title, parentVariantId, bundleSku, discountPercentage: 0, components };
    // R2.2 — thread any lowered pricing on the bundle into the runtime config.
    return resolveBundleWithPricing(base, first.pricing as PricingPack | undefined);
  }

  /** Flip a member's Module + ModuleVersion to PUBLISHED (mirrors single-publish status flip). */
  private async markMemberPublished(member: PlannedMember): Promise<void> {
    const prisma = getPrisma();
    await prisma.module.update({ where: { id: member.moduleId }, data: { status: 'PUBLISHED' } });
    await prisma.moduleVersion.update({
      where: { id: member.versionId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        targetThemeId: member.target.kind === 'THEME' ? member.target.themeId : null,
      },
    });
  }

  /**
   * Co-deploy all members of a blueprint ("Publish all N"), resolving the bundle
   * triangle (component SKUs → real GIDs + parent BAP variant + stable bundleId)
   * once and injecting it into the dependent theme/checkout members BEFORE they
   * compile, so members wire to each other with real GIDs — not the placeholders
   * the AI generated.
   *
   * Ordering (design §5): the cart-transform resolution SOURCE publishes first; the
   * `ResolvedBundle` is injected into each dependent member; theme + checkout members
   * publish after. The `$app:bundle_config` dual-writer ordering (C4) is enforced —
   * `PublishService.publish(cartTransformSpec)` runs BEFORE
   * `activateCartTransform(...)`, so the wasm reads the resolved config, not the
   * compiler's placeholder metaobject.
   *
   * Best-effort and NOT atomic (Shopify metaobject writes can't be transactional
   * across surfaces): each member publishes independently; a failed member stays
   * DRAFT and is retryable. Idempotent re-run (PublishService writes are
   * handle-keyed; `ensureParentBundleProduct`/`activateCartTransform` reuse existing
   * resources). A blueprint with no bundle triangle publishes each member with no
   * injection. Theme members require a `themeId`.
   */
  async publishBlueprint(
    admin: AdminClient,
    shopDomain: string,
    recipeId: string,
    opts?: { themeId?: string },
  ): Promise<BlueprintPublishResult> {
    const recipe = await this.getBlueprint(shopDomain, recipeId);
    if (!recipe) throw new Error('Blueprint not found');

    const published: BlueprintPublishResult['published'] = [];
    const failed: BlueprintPublishResult['failed'] = [];
    const skipped: BlueprintPublishResult['skipped'] = [];

    // R3.1 — the shared-record manifest, when this blueprint is a composite. Absent
    // ⇒ the flat R3.2 path below runs byte-for-byte as before (back-compat).
    const manifest = parseCompositeManifest((recipe as { compositeJson?: string | null }).compositeJson);

    // 1. Materialize members (DRAFT version + parsed spec + deploy target + role).
    const members: PlannedMember[] = [];
    recipe.modules.forEach((mod, idx) => {
      const draft = mod.versions.find((v) => v.status === 'DRAFT') ?? mod.versions[0];
      if (!draft) {
        failed.push({ moduleId: mod.id, type: mod.type, error: 'No draft version to publish.' });
        return;
      }
      let spec: RecipeSpec;
      try {
        spec = RecipeSpecSchema.parse(JSON.parse(draft.specJson));
      } catch (err) {
        failed.push({ moduleId: mod.id, type: mod.type, error: err instanceof Error ? err.message : String(err) });
        return;
      }
      const isThemeModule = mod.type.startsWith('theme.') || mod.type === 'proxy.widget';
      const target: DeployTarget = isThemeModule
        ? { kind: 'THEME', themeId: opts?.themeId ?? '', moduleId: mod.id }
        : { kind: 'PLATFORM', moduleId: mod.id };
      // Map the persisted module (by order) → its blueprint role via the manifest.
      const role = manifest?.memberRoles[idx];
      members.push({ moduleId: mod.id, versionId: draft.id, type: mod.type as ModuleType, spec, target, role });
    });

    // 2. Resolve the authoritative record(s) BEFORE publishing any dependent.
    //    Composite path (manifest present): the record-provisioning PRE-PASS —
    //    fail-closed on the record (if provisioning throws, NO member publishes).
    //    Flat path (no manifest): the R3.2 structural bundle-triangle resolution.
    let bundle: ResolvedBundle | null = null;
    let compositeResolved: ResolvedCompositeRecord[] = [];

    if (manifest) {
      try {
        compositeResolved = await this.provisionSharedRecords(admin, recipe.shopId, manifest);
        // The product-bundle record carries a ResolvedBundle when its `entityMap`
        // named the component SKUs. When it didn't (the common case — the generated
        // record's entityMap is empty and the SKUs live on the cart-transform member
        // config), fall back to the SAME R3.2 resolver on that member, so the bundle
        // wires end-to-end regardless of where the SKUs were authored. One resolver,
        // no divergence. Fail-closed on failure (mirrors the record pre-pass).
        bundle = compositeResolved.find((r) => r.bundle)?.bundle ?? null;
        if (!bundle) {
          const hasBundleRecord = manifest.sharedRecords.some((r) => r.kind === 'product-bundle');
          const source = hasBundleRecord ? (members.find((m) => isBundleConfig(m.spec)) ?? null) : null;
          if (source) bundle = await this.resolveBundleForBlueprint(admin, source.spec);
        }
      } catch (err) {
        // Fail-closed on the record: provisioning/resolution failed → NO member publishes.
        for (const dep of members) {
          skipped.push({ moduleId: dep.moduleId, type: dep.type, reason: `shared-record provisioning failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        return { recipeId, published, failed, skipped, resolvedBundle: null };
      }
      // When the fallback resolved a bundle, expose it to the binding-driven
      // injection so display/checkout members receive the real GIDs too.
      if (bundle && !compositeResolved.some((r) => r.bundle)) {
        const bundleRecord = manifest.sharedRecords.find((r) => r.kind === 'product-bundle');
        const idx = compositeResolved.findIndex((r) => r.ref === bundleRecord?.ref);
        if (idx >= 0) compositeResolved[idx] = { ...compositeResolved[idx]!, bundle };
      }
    } else {
      const source = members.find((m) => isBundleConfig(m.spec)) ?? null;
      if (source) {
        try {
          bundle = await this.resolveBundleForBlueprint(admin, source.spec);
        } catch (err) {
          // Resolution failed → the whole triangle is unpublishable: the source fails
          // and every other member is skipped (kept DRAFT, retryable). Never publish a
          // dependent against placeholder GIDs.
          failed.push({ moduleId: source.moduleId, type: source.type, error: err instanceof Error ? err.message : String(err) });
          for (const dep of members) {
            if (dep.moduleId === source.moduleId) continue;
            skipped.push({ moduleId: dep.moduleId, type: dep.type, reason: 'bundle resolution failed' });
          }
          return { recipeId, published, failed, skipped, resolvedBundle: null };
        }
      }
    }

    // 3. Publish in dependency order (source first), injecting the resolved record.
    const publisher = new PublishService(admin);
    for (const member of orderMembersForCoDeploy(members)) {
      try {
        if (member.target.kind === 'THEME' && !member.target.themeId) {
          throw new Error('themeId is required to publish a theme member.');
        }
        // Composite path: inject the resolved record keyed by this member's binding.
        // Flat path: inject the resolved bundle via the back-compat shim.
        const spec = manifest
          ? this.injectForMember(member, manifest, compositeResolved)
          : bundle
            ? injectResolvedBundle(member.spec, bundle)
            : member.spec;
        await publisher.publish(spec, member.target);
        // C4 — the $app:bundle_config dual-writer ordering. Publish (metaobject
        // config) THEN activate (runtime metafield with real parentVariantId), so the
        // wasm reads the resolved config as authoritative. Must NOT precede publish.
        // Identical ordering on the composite path — the `bundle` came from the same
        // resolution (the record pre-pass) rather than the member config.
        if (member.type === 'functions.cartTransform' && bundle) {
          await new BundleProductService(admin).activateCartTransform(buildBundleRuntimeConfig([bundle]));
        }
        await this.markMemberPublished(member);
        published.push({ moduleId: member.moduleId, type: member.type });
      } catch (err) {
        // Member stays DRAFT → retryable. Non-atomic by design.
        failed.push({ moduleId: member.moduleId, type: member.type, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { recipeId, published, failed, skipped, resolvedBundle: bundle };
  }

  /**
   * The R3.1 record-provisioning pre-pass: resolve every shared record in the
   * manifest via the per-backing dispatch (`resolveCompositeRecord`). Runs BEFORE
   * any member publishes. Throws on the first failure so the caller can fail-closed
   * (no member publishes against an unresolved record). One canonical resolution
   * path — reuses R3.3's typed-store writer + R3.2's BundleProductService, never a
   * parallel one.
   */
  private async provisionSharedRecords(
    admin: AdminClient,
    shopId: string,
    manifest: CompositeManifest,
  ): Promise<ResolvedCompositeRecord[]> {
    const resolved: ResolvedCompositeRecord[] = [];
    for (const record of manifest.sharedRecords) {
      resolved.push(await resolveCompositeRecord(admin, record, { shopId }));
    }
    return resolved;
  }

  /**
   * Inject the resolved shared record into one member, keyed by its binding
   * (R3.1). Finds the member's binding by its blueprint role, then the resolved
   * record it references, and fans the record out through the generalized
   * `injectResolvedRecord`. An unbound member (no binding / no resolved data) is
   * returned by identity — the same no-op guarantee as the flat path.
   */
  private injectForMember(
    member: PlannedMember,
    manifest: CompositeManifest,
    resolvedRecords: ResolvedCompositeRecord[],
  ): RecipeSpec {
    if (!member.role) return member.spec;
    const binding = manifest.bindings.find((b) => b.memberRole === member.role) ?? null;
    if (!binding) return member.spec;
    const resolved = resolvedRecords.find((r) => r.ref === binding.recordRef);
    if (!resolved) return member.spec;
    return injectResolvedRecord(member.spec, binding, resolved);
  }
}
