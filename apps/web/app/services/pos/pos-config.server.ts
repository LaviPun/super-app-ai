/**
 * POS UI extension config reader.
 *
 * POS UI extensions CANNOT read Storefront-accessible metaobjects (unlike the
 * theme / customer-account surfaces, which use `shopify.query()`), so the POS
 * runtime reads its module config from THIS app's backend instead. The POS block
 * authenticates with a Shopify session token (App Authentication, POS 10.6.0+ /
 * api_version 2025-07+) and fetches `/api/pos/config`; that loader resolves the
 * shop and calls into this module.
 *
 * The source of truth is the same one every other surface publishes to: a
 * module's PUBLISHED `ModuleVersion`. We read the active/published version for
 * every `pos.extension` module on the shop, parse its persisted `RecipeSpec`,
 * and project it to the small, render-safe shape the POS block consumes. No
 * placeholder/demo data — an unconfigured shop yields an empty block list.
 */
import type { PrismaClient } from '@prisma/client';
import { RecipeSpecSchema, type RecipeSpec, posTargetPresentation } from '@superapp/core';

/** Config the POS block renders. Mirrors the `pos.extension` RecipeSpec config. */
export type PosBlockConfig = {
  /** Stable module id (the published Module row id). */
  moduleId: string;
  /** Merchant-facing module name. */
  name: string;
  /** POS surface target this block is published to, e.g. `pos.product-details.block.render`. */
  target: string;
  /** Button/section label shown in POS. */
  label: string;
  /** How the block renders on POS: `tile` | `modal` | `block` | `action` | `receipt` | `observer`. */
  blockKind?: 'tile' | 'modal' | 'block' | 'action' | 'receipt' | 'observer';
  /** Tile↔modal / menu-item↔action pairing this module uses (derived from target when absent). */
  presentation?: string;
  /** Behaviour performed when tapped (discount, note, loyalty, receipt, etc.). */
  action?: string;
  /** A live value the block renders (falls back to `label` when unresolvable). */
  binding?: string;
  /** Whether a staff PIN is required before the action runs (gates sensitive ops). */
  staffPin?: { required: boolean; reason?: string; role?: string };
  /** Parameters for the declared `action`. */
  actionConfig?: {
    discountTitle?: string;
    discountAmount?: string;
    discountCode?: string;
    note?: string;
    propertyKey?: string;
    propertyValue?: string;
    productVariantId?: string;
    receiptText?: string;
    url?: string;
  };
  /** App-proxy endpoint for loyalty read/write and generic writes. */
  appProxyPath?: string;
  /** For observer modules: the POS event subscribed to and where it forwards. */
  observe?: { event: string; forwardTo?: string };
};

export type PosConfigResult = {
  /** True when at least one published POS module exists for the shop. */
  configured: boolean;
  /** Published POS blocks for the shop (empty when none are configured). */
  blocks: PosBlockConfig[];
};

/** Narrow a parsed RecipeSpec to the `pos.extension` variant. */
function isPosSpec(spec: RecipeSpec): spec is Extract<RecipeSpec, { type: 'pos.extension' }> {
  return spec.type === 'pos.extension';
}

/**
 * Read every PUBLISHED `pos.extension` module config for a shop.
 *
 * "Published" means the module's `activeVersion` (set on publish) has
 * `status === 'PUBLISHED'` — the exact contract the publish path maintains.
 * Drafts and superseded versions are ignored so POS only ever sees live config.
 */
export async function readPublishedPosConfig(
  prisma: PrismaClient,
  shopDomain: string,
): Promise<PosConfigResult> {
  const modules = await prisma.module.findMany({
    where: {
      type: 'pos.extension',
      status: 'PUBLISHED',
      shop: { shopDomain },
    },
    include: { activeVersion: true },
    orderBy: { updatedAt: 'desc' },
  });

  const blocks: PosBlockConfig[] = [];
  for (const mod of modules) {
    const version = mod.activeVersion;
    // Only surface a module whose active version is genuinely published.
    if (!version || version.status !== 'PUBLISHED' || !version.specJson) continue;

    let spec: RecipeSpec;
    try {
      const parsed = RecipeSpecSchema.safeParse(JSON.parse(version.specJson));
      if (!parsed.success) continue;
      spec = parsed.data;
    } catch {
      // Skip malformed persisted specs rather than failing the whole response.
      continue;
    }
    if (!isPosSpec(spec)) continue;

    const cfg = spec.config;
    blocks.push({
      moduleId: mod.id,
      name: mod.name,
      target: cfg.target,
      label: cfg.label,
      blockKind: cfg.blockKind,
      // Additive vocab (all optional). Omitted keys stay undefined so existing
      // POS modules serialize to the exact same shape they did before.
      presentation: cfg.presentation ?? posTargetPresentation(cfg.target),
      action: cfg.action,
      binding: cfg.binding,
      staffPin: cfg.staffPin,
      actionConfig: cfg.actionConfig,
      appProxyPath: cfg.appProxyPath,
      observe: cfg.observe,
    });
  }

  return { configured: blocks.length > 0, blocks };
}
