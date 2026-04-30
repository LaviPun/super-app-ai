import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOG_SURFACES,
  CATALOG_INTENTS,
  CATALOG_COMPONENTS,
  CATALOG_TRIGGERS,
  RECIPE_SPEC_TYPES,
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_DEFAULT_REQUIRES,
  MODULE_TYPE_TO_SURFACE,
} from './allowed-values.js';
import type { ModuleCategory, ModuleType } from './allowed-values.js';

/**
 * Catalog families distinguish how an entry was generated.
 * - 'type'       : Canonical entry per RecipeSpec moduleType (one row each).
 * - 'storefront' : Combinatorial storefront UI rows by surface × component × intent (+ optional trigger).
 *
 * Adding a new family is a structural change; update consumers (filterCatalog, AI mapping, docs).
 */
export const CATALOG_FAMILIES = ['type', 'storefront'] as const;
export type CatalogFamily = (typeof CATALOG_FAMILIES)[number];

export type CatalogEntry = {
  catalogId: string;
  family: CatalogFamily;
  category: ModuleCategory;
  requires: string[];
  description: string;
  tags: string[];
  moduleType?: ModuleType;
  templateKind?: string;
  surface?: string;
  intent?: string;
  trigger?: string;
  defaults?: Record<string, unknown>;
};

/**
 * Canonical templateKind for each RecipeSpec type.
 * Used by AI catalog-details lookup and per-type catalog rows so filtering by
 * templateKind is deterministic and exhaustive.
 *
 * IMPORTANT: When adding a new module type, add its templateKind here so
 * `getCatalogDetailsForType` can return inspiration rows for it.
 */
export const MODULE_TYPE_TO_TEMPLATE_KIND: Record<ModuleType, string> = {
  'theme.banner': 'banner',
  'theme.popup': 'popup',
  'theme.notificationBar': 'notification_bar',
  'theme.contactForm': 'contact_form',
  'theme.effect': 'effect',
  'theme.floatingWidget': 'floating_widget',
  'proxy.widget': 'widget',
  'functions.discountRules': 'discount_rules',
  'functions.deliveryCustomization': 'delivery_customization',
  'functions.paymentCustomization': 'payment_customization',
  'functions.cartAndCheckoutValidation': 'cart_validation',
  'functions.cartTransform': 'cart_transform',
  'functions.fulfillmentConstraints': 'fulfillment_constraints',
  'functions.orderRoutingLocationRule': 'order_routing',
  'checkout.upsell': 'upsell',
  'checkout.block': 'checkout_block',
  'postPurchase.offer': 'post_purchase_offer',
  'admin.block': 'admin_block',
  'admin.action': 'admin_action',
  'pos.extension': 'pos_extension',
  'analytics.pixel': 'analytics_pixel',
  'integration.httpSync': 'http_sync',
  'flow.automation': 'flow_automation',
  'platform.extensionBlueprint': 'extension_blueprint',
  'customerAccount.blocks': 'customer_account_blocks',
};

/**
 * Cross-cutting tags for each moduleType. Drive search/discoverability ('plus-only', 'theme', 'function', etc.).
 */
const MODULE_TYPE_TAGS: Record<ModuleType, readonly string[]> = {
  'theme.banner': ['theme', 'storefront', 'banner'],
  'theme.popup': ['theme', 'storefront', 'popup'],
  'theme.notificationBar': ['theme', 'storefront', 'notification'],
  'theme.contactForm': ['theme', 'storefront', 'contact', 'form', 'lead-capture'],
  'theme.effect': ['theme', 'storefront', 'effect', 'seasonal'],
  'theme.floatingWidget': ['theme', 'storefront', 'floating', 'widget'],
  'proxy.widget': ['proxy', 'storefront', 'widget'],
  'functions.discountRules': ['function', 'discount', 'pricing'],
  'functions.deliveryCustomization': ['function', 'delivery', 'shipping'],
  'functions.paymentCustomization': ['function', 'payment'],
  'functions.cartAndCheckoutValidation': ['function', 'validation', 'cart', 'checkout'],
  'functions.cartTransform': ['function', 'cart', 'transform', 'bundle', 'plus-only'],
  'functions.fulfillmentConstraints': ['function', 'fulfillment'],
  'functions.orderRoutingLocationRule': ['function', 'routing', 'fulfillment'],
  'checkout.upsell': ['checkout', 'upsell', 'plus-only'],
  'checkout.block': ['checkout', 'block', 'plus-only'],
  'postPurchase.offer': ['post-purchase', 'upsell'],
  'admin.block': ['admin', 'block'],
  'admin.action': ['admin', 'action'],
  'pos.extension': ['pos', 'in-store'],
  'analytics.pixel': ['analytics', 'tracking'],
  'integration.httpSync': ['integration', 'sync'],
  'flow.automation': ['flow', 'automation'],
  'platform.extensionBlueprint': ['platform', 'blueprint'],
  'customerAccount.blocks': ['customer-account', 'block'],
};

/**
 * Components that legitimately accept explicit triggers (popup/modal/drawer/toast).
 * Other components (banner, badge, etc.) are emitted only as base storefront rows.
 */
const TRIGGER_COMPONENTS = ['popup', 'modal', 'drawer', 'toast'] as const;

/** Default deterministic cap. Currently fits the full combinatorial output with headroom. */
export const DEFAULT_MAX_ENTRIES = 12000;

export type GenerateCatalogOptions = {
  /** Maximum number of entries to emit. Default: DEFAULT_MAX_ENTRIES. */
  maxEntries?: number;
  /**
   * When true (default), throw if the generated set would exceed `maxEntries` so we never
   * silently truncate in CI. Set to false to allow deterministic prefix truncation.
   */
  strictNoTruncate?: boolean;
};

function makeId(...parts: string[]): string {
  return parts.join('.');
}

function sortByCatalogId(a: CatalogEntry, b: CatalogEntry): number {
  if (a.catalogId < b.catalogId) return -1;
  if (a.catalogId > b.catalogId) return 1;
  return 0;
}

function generateTypeEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const moduleType of RECIPE_SPEC_TYPES) {
    const category = MODULE_TYPE_TO_CATEGORY[moduleType];
    const requires = [...MODULE_TYPE_DEFAULT_REQUIRES[moduleType]];
    const surface = MODULE_TYPE_TO_SURFACE[moduleType];
    const templateKind = MODULE_TYPE_TO_TEMPLATE_KIND[moduleType];
    const typeTags = MODULE_TYPE_TAGS[moduleType];
    out.push({
      catalogId: makeId('type', moduleType),
      family: 'type',
      category,
      requires,
      description: `${moduleType} — ${category} on ${surface}`,
      tags: ['type', category, ...typeTags],
      moduleType,
      templateKind,
      surface,
      defaults: { type: moduleType, surface },
    });
  }
  return out;
}

function generateStorefrontBaseEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const s of CATALOG_SURFACES) {
    for (const c of CATALOG_COMPONENTS) {
      for (const i of CATALOG_INTENTS) {
        out.push({
          catalogId: makeId('storefront', c, i, s),
          family: 'storefront',
          category: 'STOREFRONT_UI',
          requires: ['THEME_ASSETS'],
          description: `${c} for ${i} on ${s}`,
          tags: ['storefront', 'component', c, i, s],
          templateKind: c,
          surface: s,
          intent: i,
          defaults: { placement: s, intent: i },
        });
      }
    }
  }
  return out;
}

function generateStorefrontTriggerEntries(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const s of CATALOG_SURFACES) {
    for (const i of CATALOG_INTENTS) {
      for (const t of CATALOG_TRIGGERS) {
        for (const c of TRIGGER_COMPONENTS) {
          if (!CATALOG_COMPONENTS.includes(c)) continue;
          out.push({
            catalogId: makeId('storefront', c, i, s, 'trigger', t),
            family: 'storefront',
            category: 'STOREFRONT_UI',
            requires: ['THEME_ASSETS'],
            description: `${c} (${t}) for ${i} on ${s}`,
            tags: ['storefront', 'trigger', c, i, s, t],
            templateKind: c,
            surface: s,
            intent: i,
            trigger: t,
            defaults: { placement: s, intent: i, trigger: t },
          });
        }
      }
    }
  }
  return out;
}

/**
 * Generates the module catalog from the Allowed Values Manifest (doc 9.2, Section 14).
 *
 * Sections (deterministic order, each section sorted by catalogId):
 *   1) type.*               — one per RecipeSpec moduleType, with canonical templateKind + tags.
 *   2) storefront.*         — surfaces × components × intents (component-only rows).
 *   3) storefront.*.trigger.* — surfaces × intents × trigger-components × triggers (with explicit trigger).
 *
 * Stable, exhaustive, and predictable: every type is guaranteed to appear; storefront
 * rows fill the combinatorial space; entries are sorted within each section.
 */
export function generateCatalog(opts: GenerateCatalogOptions = {}): CatalogEntry[] {
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const strictNoTruncate = opts.strictNoTruncate ?? true;

  const typeEntries = generateTypeEntries().sort(sortByCatalogId);
  const storefrontBase = generateStorefrontBaseEntries().sort(sortByCatalogId);
  const storefrontTrigger = generateStorefrontTriggerEntries().sort(sortByCatalogId);

  const combined: CatalogEntry[] = [...typeEntries, ...storefrontBase, ...storefrontTrigger];

  if (combined.length > maxEntries) {
    if (strictNoTruncate) {
      throw new Error(
        `Catalog generator: ${combined.length} entries exceeds maxEntries=${maxEntries}. ` +
          `Increase maxEntries or pass { strictNoTruncate: false } to allow deterministic truncation.`,
      );
    }
    return combined.slice(0, maxEntries);
  }
  return combined;
}

/** Lightweight summary of catalog composition; useful for telemetry/diagnostics. */
export function summarizeCatalog(entries: CatalogEntry[]): {
  total: number;
  byFamily: Record<CatalogFamily, number>;
  byCategory: Record<string, number>;
  byTemplateKind: Record<string, number>;
} {
  const byFamily: Record<CatalogFamily, number> = { type: 0, storefront: 0 };
  const byCategory: Record<string, number> = {};
  const byTemplateKind: Record<string, number> = {};
  for (const e of entries) {
    byFamily[e.family] = (byFamily[e.family] ?? 0) + 1;
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
    if (e.templateKind) {
      byTemplateKind[e.templateKind] = (byTemplateKind[e.templateKind] ?? 0) + 1;
    }
  }
  return { total: entries.length, byFamily, byCategory, byTemplateKind };
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('catalog.generator')) {
  const generated = generateCatalog();
  const fp = path.resolve(process.cwd(), 'src/catalog.generated.json');
  // Compact one-entry-per-line layout: small file, line-based diffs.
  const body = '[\n' + generated.map((e) => '  ' + JSON.stringify(e)).join(',\n') + '\n]\n';
  fs.writeFileSync(fp, body);
  const summary = summarizeCatalog(generated);
  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${summary.total} entries to ${fp} ` +
      `(family=${JSON.stringify(summary.byFamily)}, ` +
      `category=${JSON.stringify(summary.byCategory)})`,
  );
}
