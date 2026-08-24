import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import { MetafieldService } from '~/services/shopify/metafield.service';
import { WebPixelService } from '~/services/shopify/web-pixel.service';
import { ActivationService, moduleTypeForFunctionKey } from '~/services/publish/activation.service';
import { BundleProductService } from '~/services/bundles/bundle-product.service';
import { getPrisma } from '~/db.server';
import {
  THEME_MODULES_NAMESPACE, THEME_MODULE_REFS_KEY,
  ADMIN_BLOCKS_NAMESPACE, ADMIN_BLOCK_REFS_KEY,
  ADMIN_ACTIONS_NAMESPACE, ADMIN_ACTION_REFS_KEY,
  ADMIN_DISCOUNT_UI_NAMESPACE, ADMIN_DISCOUNT_UI_REFS_KEY,
  ADMIN_LINK_NAMESPACE, ADMIN_LINK_REFS_KEY,
  ADMIN_PRINT_NAMESPACE, ADMIN_PRINT_REFS_KEY,
  ADMIN_SEGMENT_TEMPLATE_NAMESPACE, ADMIN_SEGMENT_TEMPLATE_REFS_KEY,
  FUNCTIONS_NAMESPACE,
  CHECKOUT_NAMESPACE, CHECKOUT_UPSELL_REFS_KEY,
  CUSTOMER_ACCOUNT_NAMESPACE, CUSTOMER_ACCOUNT_BLOCK_REFS_KEY,
} from '~/services/publish/publish.service';

export type UnpublishReport = {
  removedRefs: string[];
  deletedMetaobjects: string[];
  deletedActivations: string[];
  deletedWebPixel: boolean;
  /** shop metafields deleted by inverting a SHOP_METAFIELD_SET op (fix 2, final review). */
  deletedShopMetafields: string[];
  /**
   * Shared-activation teardown steps SKIPPED because a sibling PUBLISHED module
   * still owns the functionKey (fix 1a, final review) — kept as an explicit,
   * truthful entry so the report never reads as "cleaned up" when it deliberately
   * left a shared resource alone.
   */
  skipped: Array<{ functionKey: string; reason: string }>;
};

/** One refs-list surface family: publish's write mirrored for teardown (E6). */
type RefsFamily = { ns: string; key: string; metaobjectType: string; handle: (moduleId: string) => string };

const REFS_FAMILIES: Record<string, RefsFamily> = {
  themeModulePayload:          { ns: THEME_MODULES_NAMESPACE, key: THEME_MODULE_REFS_KEY, metaobjectType: '$app:superapp_module', handle: (m) => `superapp-module-${m}` },
  adminBlockPayload:           { ns: ADMIN_BLOCKS_NAMESPACE, key: ADMIN_BLOCK_REFS_KEY, metaobjectType: '$app:superapp_admin_block', handle: (m) => `superapp-block-${m}` },
  adminActionPayload:          { ns: ADMIN_ACTIONS_NAMESPACE, key: ADMIN_ACTION_REFS_KEY, metaobjectType: '$app:superapp_admin_action', handle: (m) => `superapp-action-${m}` },
  adminDiscountUiPayload:      { ns: ADMIN_DISCOUNT_UI_NAMESPACE, key: ADMIN_DISCOUNT_UI_REFS_KEY, metaobjectType: '$app:superapp_admin_discount_ui', handle: (m) => `superapp-discount-ui-${m}` },
  adminLinkPayload:            { ns: ADMIN_LINK_NAMESPACE, key: ADMIN_LINK_REFS_KEY, metaobjectType: '$app:superapp_admin_link', handle: (m) => `superapp-link-${m}` },
  adminPrintPayload:           { ns: ADMIN_PRINT_NAMESPACE, key: ADMIN_PRINT_REFS_KEY, metaobjectType: '$app:superapp_admin_print', handle: (m) => `superapp-print-${m}` },
  adminSegmentTemplatePayload: { ns: ADMIN_SEGMENT_TEMPLATE_NAMESPACE, key: ADMIN_SEGMENT_TEMPLATE_REFS_KEY, metaobjectType: '$app:superapp_admin_segment_template', handle: (m) => `superapp-segment-template-${m}` },
  checkoutUpsellPayload:       { ns: CHECKOUT_NAMESPACE, key: CHECKOUT_UPSELL_REFS_KEY, metaobjectType: '$app:superapp_checkout_upsell', handle: (m) => `superapp-checkout-upsell-${m}` },
  customerAccountBlockPayload: { ns: CUSTOMER_ACCOUNT_NAMESPACE, key: CUSTOMER_ACCOUNT_BLOCK_REFS_KEY, metaobjectType: '$app:superapp_customer_account_block', handle: (m) => `superapp-ca-block-${m}` },
};

/**
 * UnpublishService — inverts what PublishService.publish wrote to Shopify for
 * a module: refs-list metaobjects (theme/admin/checkout/customer-account
 * surfaces), function-config metaobjects + activations, the shared web pixel,
 * and (for functions.cartTransform) the cart-transform activation. Idempotent
 * throughout — an already-gone resource is treated as success, never an error,
 * so unpublish is safe to retry after a partial failure.
 *
 * Re-compiles `spec` with the SAME compiler publish used (E6): cleanup can
 * never drift from what was actually deployed, because it's derived from the
 * identical compile output rather than a hand-maintained mirror of it.
 */
export class UnpublishService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly session: { shopId?: string },
  ) {}

  async unpublish(spec: RecipeSpec, target: DeployTarget): Promise<UnpublishReport> {
    const result = compileRecipe(spec, target);
    const mo = new MetaobjectService(this.admin);
    const mf = new MetafieldService(this.admin);
    const report: UnpublishReport = {
      removedRefs: [], deletedMetaobjects: [], deletedActivations: [], deletedWebPixel: false,
      deletedShopMetafields: [], skipped: [],
    };
    const moduleId = target.moduleId;

    // 1. refs-list surfaces — remove ref FIRST, delete metaobject LAST, so a
    //    storefront/admin read never sees a dangling reference mid-teardown.
    for (const [payloadKey, family] of Object.entries(REFS_FAMILIES)) {
      if (!(result as unknown as Record<string, unknown>)[payloadKey] || !moduleId) continue;
      const gid = await mo.getMetaobjectIdByHandle(family.metaobjectType, family.handle(moduleId));
      if (!gid) continue; // already gone — idempotent
      const current = await mo.getModuleGidList(family.ns, family.key);
      if (current.includes(gid)) {
        await mo.setModuleGidList(family.ns, family.key, current.filter((g) => g !== gid));
        report.removedRefs.push(gid);
      }
      await mo.deleteMetaobject(gid);
      report.deletedMetaobjects.push(gid);
    }

    // 2. proxy widget (handle-keyed, no refs list)
    if (result.proxyWidgetPayload) {
      const gid = await mo.getMetaobjectIdByHandle('$app:superapp_proxy_widget', `superapp-proxy-${result.proxyWidgetPayload.widgetId}`);
      if (gid) {
        await mo.deleteMetaobject(gid);
        report.deletedMetaobjects.push(gid);
      }
    }

    // 3. ops-driven surfaces
    for (const op of result.ops) {
      if (op.kind === 'FUNCTION_CONFIG_UPSERT') {
        await this.unpublishFunction(mo, mf, op.functionKey, report, moduleId);
      }
      if (op.kind === 'WEB_PIXEL_UPSERT') {
        report.deletedWebPixel = await this.maybeDeleteWebPixel(moduleId);
      }
      if (op.kind === 'SHOP_METAFIELD_SET') {
        // Fix 2 (final review): SHOP_METAFIELD_SET was never inverted — flow.automation
        // / messaging.campaign / integration.httpSync unpublish left their per-module
        // shop metafield behind forever. Each op's key is derived from the module's own
        // name (compiler's `slug(spec.name)`), so it is never shared across modules —
        // no guard needed, unlike the function-config surfaces below.
        await mf.deleteShopMetafield(op.namespace, op.key);
        report.deletedShopMetafields.push(`${op.namespace}/${op.key}`);
      }
      // THEME_ASSET_UPSERT (native sections) is flag-gated and never produced by
      // the default app-block path; when the flag ships live, mirror publish by
      // deleting via ThemeFilesService here. Publishing throws while the flag is
      // off, so there is nothing to clean up today.
    }

    // 4. cartTransform (no FUNCTION_CONFIG_UPSERT op since Task 8 — keyed off spec type)
    if (spec.type === 'functions.cartTransform' && this.session.shopId) {
      if (await this.hasPublishedSibling('cartTransform', moduleId)) {
        // Fix 1a (final review): FunctionActivation('cartTransform') is ONE row per
        // shop, shared by every cartTransform module. A sibling still-PUBLISHED
        // cartTransform module owns the live shop-wide config — deleting the shared
        // activation here would break it too. Skip, record the skip.
        report.skipped.push({
          functionKey: 'cartTransform',
          reason: `shared with another PUBLISHED ${moduleTypeForFunctionKey('cartTransform')} module on this shop`,
        });
      } else {
        await new ActivationService(this.admin, this.session.shopId).deleteForFunctionKey('cartTransform');
        report.deletedActivations.push('cartTransform');
        // The parent bundle product stays (merchant may have orders referencing it) —
        // documented behavior, matches Shopify guidance to not hard-delete products.

        // Fix 3 (final review): a non-Plus cartTransform publish writes a
        // managed-discount fallback leg (activateBundleCartTransformForPlan →
        // writeBundlePricingRules merges `bundle:*` rules into the SHARED
        // discountRules metaobject + ensures the discountRules activation — see
        // bundle-activation.server.ts). Tearing down the LAST cartTransform module
        // must clear that leg too — but ONLY when no OTHER PUBLISHED
        // functions.discountRules module owns that same shared discountRules
        // activation (reuses the fix-1a guard): a real discount module's rules and
        // activation must survive a bundle unpublish untouched.
        if (await this.hasPublishedSibling('discountRules', undefined)) {
          report.skipped.push({
            functionKey: 'discountRules',
            reason: `shared with another PUBLISHED ${moduleTypeForFunctionKey('discountRules')} module on this shop`,
          });
        } else {
          // writeBundlePricingRules(mo, []) has clear-stale semantics: it strips only
          // the `bundle:*`-tagged managed rules (any genuinely-unmanaged rules survive)
          // and is a safe no-op when there is nothing managed to clear.
          await new BundleProductService(this.admin).writeBundlePricingRules(mo, []);
          await new ActivationService(this.admin, this.session.shopId).deleteForFunctionKey('discountRules');
          report.deletedActivations.push('discountRules');
        }
      }
    }

    return report;
  }

  private async unpublishFunction(
    mo: MetaobjectService,
    mf: MetafieldService,
    functionKey: string,
    report: UnpublishReport,
    moduleId?: string,
  ): Promise<void> {
    const existing = await mo.getFunctionConfigByKey(functionKey);
    if (!existing) return; // already gone — idempotent

    // discountRules metaobject may carry managed bundle rules (id "bundle:*") the
    // bundle path owns — strip only the module's rules and KEEP the metaobject,
    // metafield ref, and activation alive for them.
    if (functionKey === 'discountRules') {
      const rules = Array.isArray(existing.config.rules) ? (existing.config.rules as Array<Record<string, unknown>>) : [];
      const managed = rules.filter((r) => typeof r.id === 'string' && (r.id as string).startsWith('bundle:'));
      if (managed.length > 0) {
        await mo.upsertFunctionConfigObject('discountRules', { ...existing.config, rules: managed });
        return;
      }
    }

    // Fix 1a (final review): FunctionActivation is @@unique([shopId, functionKey]) —
    // ONE row per shop, shared by every module compiling to this functionKey. Before
    // Task-8-era singleton enforcement (publish-time, PublishService) shipped, two
    // sibling modules of the same functions.* type could both reach PUBLISHED; even
    // after that guard, an already-published pair from before it shipped must still be
    // protected here. Skip teardown (record the skip in the report — a truthful
    // positive ledger, never a silent "cleaned up" that changed nothing) when a sibling
    // PUBLISHED module of the same type still exists; still tear down when this was the
    // last one.
    if (await this.hasPublishedSibling(functionKey, moduleId)) {
      report.skipped.push({
        functionKey,
        reason: `shared with another PUBLISHED ${moduleTypeForFunctionKey(functionKey)} module on this shop`,
      });
      return;
    }

    await mf.deleteShopMetafield(FUNCTIONS_NAMESPACE, `fn_${functionKey}`);
    await mo.deleteMetaobject(existing.metaobjectId);
    report.deletedMetaobjects.push(existing.metaobjectId);

    if (this.session.shopId) {
      await new ActivationService(this.admin, this.session.shopId).deleteForFunctionKey(functionKey);
      report.deletedActivations.push(functionKey);
    }
  }

  /** Whether another PUBLISHED module of the type backing `functionKey` still
   *  exists on this shop (excluding `excludeModuleId`, the module currently being
   *  unpublished) — the shared-teardown guard fix 1a/fix 3 both call. Mirrors
   *  `maybeDeleteWebPixel`'s prisma.module.count approach. No shopId ⇒ can't scope
   *  the query safely ⇒ treated as "no sibling" (matches every other shopId-gated
   *  Shopify-side write in this service). */
  private async hasPublishedSibling(functionKey: string, excludeModuleId?: string): Promise<boolean> {
    if (!this.session.shopId) return false;
    const count = await getPrisma().module.count({
      where: {
        shopId: this.session.shopId,
        type: moduleTypeForFunctionKey(functionKey),
        status: 'PUBLISHED',
        ...(excludeModuleId ? { id: { not: excludeModuleId } } : {}),
      },
    });
    return count > 0;
  }

  /** The web pixel is ONE shared app pixel per shop — only delete when this was the
   *  last published analytics.pixel module. */
  private async maybeDeleteWebPixel(excludeModuleId?: string): Promise<boolean> {
    if (this.session.shopId) {
      const others = await getPrisma().module.count({
        where: {
          shopId: this.session.shopId,
          type: 'analytics.pixel',
          status: 'PUBLISHED',
          ...(excludeModuleId ? { id: { not: excludeModuleId } } : {}),
        },
      });
      if (others > 0) return false;
    }
    return new WebPixelService(this.admin).delete();
  }
}
