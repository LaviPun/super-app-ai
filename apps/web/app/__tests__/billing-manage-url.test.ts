/**
 * buildManagePlanUrl — the Shopify-hosted plan selection page for embedded
 * apps: https://admin.shopify.com/store/{storeHandle}/charges/{appHandle}/pricing_plans
 * storeHandle = shop domain minus .myshopify.com. Null when the app handle
 * env is missing (button hidden rather than a broken link).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildManagePlanUrl } from '~/services/billing/plan-handles';

afterEach(() => { delete process.env.SHOPIFY_APP_HANDLE; });

describe('buildManagePlanUrl', () => {
  it('builds the admin charges URL from the shop domain + app handle', () => {
    process.env.SHOPIFY_APP_HANDLE = 'super-app-ai';
    expect(buildManagePlanUrl('cool-shop.myshopify.com')).toBe(
      'https://admin.shopify.com/store/cool-shop/charges/super-app-ai/pricing_plans',
    );
  });
  it('returns null without SHOPIFY_APP_HANDLE', () => {
    expect(buildManagePlanUrl('cool-shop.myshopify.com')).toBeNull();
  });
});
