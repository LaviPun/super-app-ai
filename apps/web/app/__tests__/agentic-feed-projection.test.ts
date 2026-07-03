import { describe, it, expect } from 'vitest';
import {
  projectFeedItem,
  resolveAttribute,
  type AgenticFeedConfig,
  type RawProductNode,
} from '~/services/agentic/feed-projection';

/**
 * M13 agentic.catalogProfile — the deterministic feed projection. PUBLIC product
 * fields only (no PII); attributeMap resolves best-effort (unresolved keys OMITTED,
 * never null); disclosures appended verbatim.
 */

const node: RawProductNode = {
  id: 'gid://shopify/Product/1',
  title: 'Aurora Down Jacket',
  handle: 'aurora',
  description: 'Warm.',
  vendor: 'Aurora Co',
  productType: 'Jacket',
  onlineStoreUrl: 'https://shop.example.com/products/aurora',
  priceRangeV2: { minVariantPrice: { amount: '199.00', currencyCode: 'USD' } },
  totalInventory: 5,
  featuredImage: { url: 'https://cdn/aurora-1.jpg' },
  images: { nodes: [{ url: 'https://cdn/aurora-1.jpg' }, { url: 'https://cdn/aurora-2.jpg' }] },
  metafields: { nodes: [{ namespace: 'custom', key: 'gtin', value: '0123456789012' }] },
  variants: { nodes: [{ sku: 'AUR-001', barcode: 'BC-1' }] },
};

const cfg = (over: Partial<AgenticFeedConfig> = {}): AgenticFeedConfig => ({
  moduleId: 'mod-1',
  name: 'Feed',
  feedHandle: 'catalog',
  artifacts: ['catalog-feed', 'attribute-map', 'compliance-disclosure'],
  source: { kind: 'all' },
  attributeMap: [],
  disclosures: [],
  ...over,
});

describe('resolveAttribute (M13)', () => {
  it('resolves a metafield:<ns>.<key> path', () => {
    expect(resolveAttribute(node, 'metafield:custom.gtin')).toBe('0123456789012');
  });
  it('resolves a bare top-level field (vendor)', () => {
    expect(resolveAttribute(node, 'vendor')).toBe('Aurora Co');
  });
  it('resolves a variant.<field> path (sku)', () => {
    expect(resolveAttribute(node, 'variant.sku')).toBe('AUR-001');
  });
  it('returns undefined for an unknown metafield (so the row is OMITTED, not null)', () => {
    expect(resolveAttribute(node, 'metafield:custom.doesNotExist')).toBeUndefined();
  });
  it('returns undefined for an unknown bare field', () => {
    expect(resolveAttribute(node, 'nope')).toBeUndefined();
  });
});

describe('projectFeedItem (M13)', () => {
  it('projects PUBLIC product fields only + mapped attributes + appended disclosures', () => {
    const item = projectFeedItem(
      node,
      cfg({
        attributeMap: [
          { key: 'gtin', from: 'metafield:custom.gtin' },
          { key: 'brand', from: 'vendor' },
          { key: 'color', from: 'metafield:custom.missing' }, // unresolved → omitted
        ],
        disclosures: [{ label: 'Origin', text: 'Made in Portugal.' }],
      }),
      'shop.myshopify.com',
    );

    expect(item.id).toBe('gid://shopify/Product/1');
    expect(item.price).toBe('199.00');
    expect(item.currency).toBe('USD');
    expect(item.availability).toBe('in_stock');
    // Featured image deduped against the images list.
    expect(item.images).toEqual(['https://cdn/aurora-1.jpg', 'https://cdn/aurora-2.jpg']);
    // Mapped attributes present; unresolved key omitted (NOT null).
    expect(item.attributes.gtin).toBe('0123456789012');
    expect(item.attributes.brand).toBe('Aurora Co');
    expect('color' in item.attributes).toBe(false);
    // Disclosure appended verbatim.
    expect(item.attributes['disclosure:Origin']).toBe('Made in Portugal.');
    // No PII fields leak into the projection.
    expect(JSON.stringify(item)).not.toMatch(/email|phone|customer/i);
  });

  it('marks out_of_stock when inventory is zero', () => {
    const item = projectFeedItem({ ...node, totalInventory: 0 }, cfg(), 'shop.myshopify.com');
    expect(item.availability).toBe('out_of_stock');
  });

  it('does NOT apply attributeMap when the attribute-map artifact is absent', () => {
    const item = projectFeedItem(
      node,
      cfg({ artifacts: ['catalog-feed'], attributeMap: [{ key: 'brand', from: 'vendor' }] }),
      'shop.myshopify.com',
    );
    expect(item.attributes).toEqual({});
  });

  it('falls back to a constructed product URL when onlineStoreUrl is null', () => {
    const item = projectFeedItem({ ...node, onlineStoreUrl: null }, cfg(), 'shop.myshopify.com');
    expect(item.url).toBe('https://shop.myshopify.com/products/aurora');
  });
});
