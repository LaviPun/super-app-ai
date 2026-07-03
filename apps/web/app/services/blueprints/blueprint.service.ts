/**
 * BlueprintService — persistence + co-deploy for multi-module blueprints.
 *
 * A blueprint reuses the existing `Recipe` row as the group (Recipe.modules),
 * so each member is a normal Module/ModuleVersion and all existing
 * compile/preview/publish paths apply unchanged. See docs/blueprints.md.
 */
import { getPrisma } from '~/db.server';
import type { DeployTarget, ModuleType, PricingPack, RecipeBlueprint, RecipeSpec } from '@superapp/core';
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
 */
export function injectResolvedBundle(spec: RecipeSpec, bundle: ResolvedBundle): RecipeSpec {
  const config = (spec as { config?: Record<string, unknown> }).config ?? {};

  if (spec.type === 'theme.section' && config.kind === 'product-bundle') {
    return {
      ...spec,
      config: { ...config, bundleId: bundle.bundleId, components: bundle.components },
    } as unknown as RecipeSpec;
  }

  if (spec.type === 'checkout.upsell') {
    return {
      ...spec,
      config: { ...config, offerTitle: bundle.title, productVariantGid: bundle.parentVariantId },
    } as unknown as RecipeSpec;
  }

  if (spec.type === 'checkout.block') {
    return {
      ...spec,
      config: { ...config, offerTitle: bundle.title, productVariantGid: bundle.parentVariantId },
    } as unknown as RecipeSpec;
  }

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

    const recipe = await prisma.recipe.create({
      data: {
        shopId: shop.id,
        category: primary.recipe.category,
        title: blueprint.name,
        summary: blueprint.summary,
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
    const base: ResolvedBundle = { bundleId, title, parentVariantId, discountPercentage: 0, components };
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

    // 1. Materialize members (DRAFT version + parsed spec + deploy target).
    const members: PlannedMember[] = [];
    for (const mod of recipe.modules) {
      const draft = mod.versions.find((v) => v.status === 'DRAFT') ?? mod.versions[0];
      if (!draft) {
        failed.push({ moduleId: mod.id, type: mod.type, error: 'No draft version to publish.' });
        continue;
      }
      let spec: RecipeSpec;
      try {
        spec = RecipeSpecSchema.parse(JSON.parse(draft.specJson));
      } catch (err) {
        failed.push({ moduleId: mod.id, type: mod.type, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
      const isThemeModule = mod.type.startsWith('theme.') || mod.type === 'proxy.widget';
      const target: DeployTarget = isThemeModule
        ? { kind: 'THEME', themeId: opts?.themeId ?? '', moduleId: mod.id }
        : { kind: 'PLATFORM', moduleId: mod.id };
      members.push({ moduleId: mod.id, versionId: draft.id, type: mod.type as ModuleType, spec, target });
    }

    // 2. Resolve the bundle triangle (if any) BEFORE publishing any dependent.
    const source = members.find((m) => isBundleConfig(m.spec)) ?? null;
    let bundle: ResolvedBundle | null = null;
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

    // 3. Publish in dependency order (source first), injecting the resolved bundle.
    const publisher = new PublishService(admin);
    for (const member of orderMembersForCoDeploy(members)) {
      try {
        if (member.target.kind === 'THEME' && !member.target.themeId) {
          throw new Error('themeId is required to publish a theme member.');
        }
        const spec = bundle ? injectResolvedBundle(member.spec, bundle) : member.spec;
        await publisher.publish(spec, member.target);
        // C4 — the $app:bundle_config dual-writer ordering. Publish (metaobject
        // config) THEN activate (runtime metafield with real parentVariantId), so the
        // wasm reads the resolved config as authoritative. Must NOT precede publish.
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
}
