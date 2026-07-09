import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, findTemplate } from '@superapp/core';
import {
  CATEGORY_ORDER,
  getCategoryDisplayLabel,
  getCategoryTone,
  getCategoryIcon,
} from '~/utils/type-label';

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
