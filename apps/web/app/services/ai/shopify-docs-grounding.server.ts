/**
 * Shopify platform docs grounding (plan Phase 3c / roadmap M11 grounding half).
 *
 * Generation prompts historically leaned on training-data-era Shopify knowledge,
 * which drifts: deprecated Discount sub-APIs, renamed extension targets, stale
 * function constraints. This module injects a SMALL, curated, per-module-family
 * block of CURRENT Shopify platform facts into the create prompt so the model
 * codes against today's platform, not its memory.
 *
 * Production cannot call the Shopify Dev MCP (it is a dev-only stdio server), so
 * the facts are distilled at build time into a committed JSON snapshot
 * (`shopify-docs/snapshot.json`) and loaded here with ZERO network dependency.
 * Refresh the snapshot with `apps/web/scripts/build-shopify-docs-snapshot.ts`.
 */
import type { ModuleType } from '@superapp/core';
import snapshotJson from './shopify-docs/snapshot.json';

interface FamilyBlock {
  docBlock: string;
  tokenEstimate: number;
  sourceRefs?: string[];
}

interface DocsSnapshot {
  generatedAt: string;
  source: 'shopify-dev-mcp' | 'model-knowledge';
  note?: string;
  families: Record<string, FamilyBlock>;
}

/**
 * The snapshot is imported (not read from disk) so it is bundled with the server
 * build — zero filesystem/network dependency at runtime, and effectively a
 * module-level singleton cache.
 */
const SNAPSHOT = snapshotJson as DocsSnapshot;

/**
 * Maps each of the 29 recipe module types to a snapshot family key. Types that
 * are app-served surfaces with no first-party Shopify extension contract
 * (integration.httpSync, messaging.campaign, agentic.catalogProfile,
 * platform.extensionBlueprint, pos.extension) intentionally have no family —
 * `getShopifyDocsBlock` returns undefined for them (nothing authoritative to
 * ground against yet). Add a family here + a block in the snapshot to light one up.
 */
const MODULE_TYPE_TO_FAMILY: Partial<Record<ModuleType, string>> = {
  'theme.section': 'theme',
  'proxy.widget': 'theme',
  'checkout.upsell': 'checkoutUi',
  'checkout.block': 'checkoutUi',
  'postPurchase.offer': 'postPurchase',
  'functions.discountRules': 'discountFunction',
  'functions.shippingDiscount': 'discountFunction',
  'functions.cartTransform': 'cartTransform',
  'functions.deliveryCustomization': 'deliveryPaymentFunction',
  'functions.paymentCustomization': 'deliveryPaymentFunction',
  'functions.cartAndCheckoutValidation': 'deliveryPaymentFunction',
  'functions.fulfillmentConstraints': 'deliveryPaymentFunction',
  'functions.orderRoutingLocationRule': 'deliveryPaymentFunction',
  'functions.localPickupDeliveryOption': 'deliveryPaymentFunction',
  'functions.pickupPointDeliveryOption': 'deliveryPaymentFunction',
  'admin.block': 'adminExtension',
  'admin.action': 'adminExtension',
  'admin.discountUi': 'adminExtension',
  'admin.link': 'adminExtension',
  'admin.print': 'adminExtension',
  'admin.segmentTemplate': 'adminExtension',
  'customerAccount.blocks': 'customerAccount',
  'flow.automation': 'flow',
  'analytics.pixel': 'webPixel',
};

/** Warn (never throw) once the snapshot is older than this. */
const STALENESS_WARN_DAYS = 60;

/** Env off-switch: set SHOPIFY_DOCS_GROUNDING_DISABLED=1 to suppress injection. */
function isDisabled(): boolean {
  const v = process.env.SHOPIFY_DOCS_GROUNDING_DISABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

let staleWarned = false;

/**
 * Whole-day age of the snapshot. Returns undefined if `generatedAt` is
 * unparseable.
 */
export function snapshotAgeDays(): number | undefined {
  const generated = Date.parse(SNAPSHOT.generatedAt);
  if (Number.isNaN(generated)) return undefined;
  const ms = Date.now() - generated;
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function warnIfStale(): void {
  if (staleWarned) return;
  const age = snapshotAgeDays();
  if (age !== undefined && age > STALENESS_WARN_DAYS) {
    staleWarned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[shopify-docs-grounding] snapshot is ${age} days old (> ${STALENESS_WARN_DAYS}); ` +
        'refresh via apps/web/scripts/build-shopify-docs-snapshot.ts',
    );
  }
}

/**
 * Returns the current-platform constraints block for a module type, framed as a
 * self-headed prompt section, or undefined when there is no family for the type
 * (or the snapshot is unavailable / disabled). Small and correctness-critical —
 * injected by default across all confidence tiers.
 */
export function getShopifyDocsBlock(moduleType: string): string | undefined {
  if (isDisabled()) return undefined;
  const family = MODULE_TYPE_TO_FAMILY[moduleType as ModuleType];
  if (!family) return undefined;
  const block = SNAPSHOT.families[family];
  if (!block?.docBlock) return undefined;
  warnIfStale();
  return `Shopify platform constraints (current — obey exactly; your training data may be stale):\n${block.docBlock}`;
}

/** For tests/observability: the family key a module type resolves to, if any. */
export function familyForModuleType(moduleType: string): string | undefined {
  return MODULE_TYPE_TO_FAMILY[moduleType as ModuleType];
}
