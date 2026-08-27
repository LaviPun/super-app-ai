import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import {
  CATEGORY_ORDER,
  getCategoryDisplayLabel,
  getCategoryTone,
  getCategoryIcon,
  catIcon,
} from '~/utils/type-label';

/**
 * Polaris web components `<s-icon type="...">` icon set actually shipped by
 * the live `https://cdn.shopify.com/shopifycloud/polaris.js` runtime the app
 * loads (see `EmbeddedHeadScripts.tsx`) — NOT the `@shopify/polaris-types`
 * devDependency's declared `IconType` union, which still lists `'layer'` as
 * valid even though the deployed runtime does not ship it (confirmed by
 * downloading the live bundle and extracting its icon-name manifest — an
 * array of `"<name> <content-hash>"` entries used to build each icon's
 * `admin-ui-foundations/icons/<hash>.svg` URL; `'layer'` is absent, `'apps'`
 * is present). That version skew between the type package and the unversioned
 * CDN script is exactly how the `catIcon` fallback regression this file
 * guards against slipped past `tsc`: `'layer'` type-checked fine but the
 * icon rendered blank in production. This allowlist is the subset of that
 * live manifest actually referenced by `s-icon type="..."` in this app today
 * (grepped) plus `'apps'`, the new fallback.
 */
const CONFIRMED_LIVE_ICON_TYPES = new Set([
  'alert-triangle', 'apps', 'arrow-down', 'arrow-left', 'arrow-right', 'bolt',
  'cart', 'chart-line', 'check', 'chevron-right', 'credit-card', 'database',
  'desktop', 'live', 'settings', 'team', 'connect', 'automation', 'view',
  'wand', 'x',
]);

/**
 * Regression coverage for the "everything is Storefront UI" taxonomy bug.
 *
 * The Templates gallery + Modules routes used to bucket items with a local
 * `designType(type: string)` heuristic whose catch-all `return 'Storefront UI'`
 * mislabeled ADMIN_UI / CUSTOMER_ACCOUNT / checkout / proxy items as
 * "Storefront UI" and buried the real theme.section storefront templates.
 *
 * The fix buckets on the raw library `category` via the shared
 * `~/utils/type-label` helpers. These tests lock that 1:1 mapping.
 */
describe('template taxonomy (category → display bucket)', () => {
  const EXPECTED: Record<string, string> = {
    STOREFRONT_UI: 'Storefront UI',
    ADMIN_UI: 'Admin UI',
    CUSTOMER_ACCOUNT: 'Customer Account',
    FUNCTION: 'Function',
    INTEGRATION: 'Integration',
    FLOW: 'Flow',
  };

  it('maps each of the six raw categories to its correct bucket', () => {
    for (const [raw, label] of Object.entries(EXPECTED)) {
      expect(getCategoryDisplayLabel(raw)).toBe(label);
    }
  });

  it('does NOT collapse ADMIN_UI into "Storefront UI"', () => {
    expect(getCategoryDisplayLabel('ADMIN_UI')).toBe('Admin UI');
    expect(getCategoryDisplayLabel('ADMIN_UI')).not.toBe('Storefront UI');
  });

  it('maps CUSTOMER_ACCOUNT to "Customer Account", not "Storefront UI"', () => {
    expect(getCategoryDisplayLabel('CUSTOMER_ACCOUNT')).toBe('Customer Account');
    expect(getCategoryDisplayLabel('CUSTOMER_ACCOUNT')).not.toBe('Storefront UI');
  });

  it('CATEGORY_ORDER lists exactly the six real buckets', () => {
    expect([...CATEGORY_ORDER].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(CATEGORY_ORDER).not.toContain('Data store'); // the dead pill is dropped
  });

  it('gives every category a valid tone (has a --p-<tone>-bg var) and an icon', () => {
    const tonesWithBg = new Set(['info', 'success', 'warning', 'magic', 'critical']);
    for (const raw of CATEGORY_ORDER) {
      expect(tonesWithBg.has(getCategoryTone(raw))).toBe(true);
      expect(getCategoryIcon(raw)).toBeTruthy();
    }
  });

  it('buckets a real admin.action template (ADMA-B2B-01) to "Admin UI"', () => {
    const t = findTemplate('ADMA-B2B-01');
    expect(t).toBeTruthy();
    expect(t!.category).toBe('ADMIN_UI');
    expect(t!.type).toBe('admin.action');
    // The heuristic's catch-all would have made this "Storefront UI".
    expect(getCategoryDisplayLabel(t!.category)).toBe('Admin UI');
  });

  it('every template in the library carries one of the six known categories', () => {
    const known = new Set<string>(CATEGORY_ORDER);
    for (const t of MODULE_TEMPLATES) {
      expect(known.has(t.category)).toBe(true);
    }
  });
});

/**
 * Regression coverage for a live merchant-admin console error: `<s-icon
 * type="layer">` rendered blank because 'layer' is not a real Polaris web
 * components icon type in the deployed polaris.js runtime — `catIcon`'s
 * catch-all fallback (`CAT_ICON[...] ?? 'layer'`) was reaching for it on any
 * category not covered by `CAT_ICON`'s known keys.
 */
describe('catIcon fallback (Polaris s-icon type validity)', () => {
  it('every one of the six real categories resolves to a confirmed-live icon type', () => {
    for (const raw of CATEGORY_ORDER) {
      expect(CONFIRMED_LIVE_ICON_TYPES.has(catIcon(raw))).toBe(true);
    }
  });

  it('falls back to a confirmed-live icon type for an unknown/garbage category, never "layer"', () => {
    for (const garbage of ['', 'NOT_A_CATEGORY', 'Data store', undefined as unknown as string]) {
      const icon = catIcon(garbage);
      expect(icon).not.toBe('layer');
      expect(CONFIRMED_LIVE_ICON_TYPES.has(icon)).toBe(true);
    }
  });

  it('the fallback is "apps" specifically', () => {
    expect(catIcon('NOT_A_CATEGORY')).toBe('apps');
  });
});
