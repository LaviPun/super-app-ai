import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { RecipeSpec } from '@superapp/core';
import {
  DEPLOYED_FUNCTION_EXTENSION_HANDLES,
  deployedFunctionExtensions,
} from '~/services/publish/deployed-extensions.server';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { blueprintIntents, getBlueprintCatalogEntry } from '~/services/ai/blueprint-catalog';
import {
  bundleIdFromTitle,
  buildBundleRuntimeConfig,
  type ResolvedBundle,
} from '~/services/bundles/bundle-product.service';
import { injectResolvedBundle } from '~/services/blueprints/blueprint.service';

// extensions/ lives at the repo root; vitest runs from apps/web.
const EXTENSIONS_DIR = path.resolve(process.cwd(), '..', '..', 'extensions');

function tomlHandlesByType(type: string): Set<string> {
  const handles = new Set<string>();
  if (!fs.existsSync(EXTENSIONS_DIR)) return handles;
  for (const dir of fs.readdirSync(EXTENSIONS_DIR)) {
    const toml = path.join(EXTENSIONS_DIR, dir, 'shopify.extension.toml');
    if (!fs.existsSync(toml)) continue;
    const text = fs.readFileSync(toml, 'utf8');
    if (!new RegExp(`type\\s*=\\s*"${type}"`).test(text)) continue;
    for (const m of text.matchAll(/handle\s*=\s*"([^"]+)"/g)) handles.add(m[1]!);
  }
  return handles;
}

describe('deployed-extensions manifest tracks the real extensions/ on disk', () => {
  it('every manifested function handle is a real type="function" extension', () => {
    const onDisk = tomlHandlesByType('function');
    for (const handle of DEPLOYED_FUNCTION_EXTENSION_HANDLES) {
      expect(onDisk.has(handle), `extensions/ is missing a function with handle "${handle}"`).toBe(true);
    }
  });
});

describe('GUARDRAIL: every blueprint-catalog member is end-to-end deployable', () => {
  const deployed = deployedFunctionExtensions();

  for (const intent of blueprintIntents()) {
    const entry = getBlueprintCatalogEntry(intent)!;
    for (const member of entry.modules) {
      it(`${intent} → "${member.role}" (${member.moduleType}) is deployable`, () => {
        const preflight = classifyModulePublishability(
          { type: member.moduleType } as RecipeSpec,
          { deployedExtensions: deployed },
        );
        expect(
          preflight.willDeploy,
          `${member.moduleType} is "${preflight.status}" — ${preflight.reasons[0] ?? 'not deployable'}`,
        ).toBe(true);
      });
    }
  }
});

// --- bundle-product pure helpers + injection ------------------------------

const resolvedBundle: ResolvedBundle = {
  bundleId: 'starter-bundle',
  title: 'Starter Bundle',
  parentVariantId: 'gid://shopify/ProductVariant/500',
  discountPercentage: 0,
  components: [
    { sku: 'A', variantId: 'gid://shopify/ProductVariant/11', title: 'Cleanser', priceLabel: '24.00' },
    { sku: 'B', variantId: 'gid://shopify/ProductVariant/12', title: 'Serum', priceLabel: '38.00' },
  ],
};

describe('bundle-product helpers', () => {
  it('bundleIdFromTitle is stable + handle-safe', () => {
    expect(bundleIdFromTitle('Starter Bundle!')).toBe('starter-bundle');
    expect(bundleIdFromTitle('  ')).toBe('bundle');
  });

  it('buildBundleRuntimeConfig is the function-readable shape', () => {
    const cfg = buildBundleRuntimeConfig([resolvedBundle]);
    expect(cfg).toEqual({
      bundles: [
        {
          bundleId: 'starter-bundle',
          parentVariantId: 'gid://shopify/ProductVariant/500',
          title: 'Starter Bundle',
          discountPercentage: 0,
        },
      ],
    });
  });
});

describe('injectResolvedBundle wires members for deploy', () => {
  it('injects component variants + bundle id into the theme bundle widget', () => {
    const spec = {
      type: 'theme.section',
      name: 'Bundle UI',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'product-bundle', activation: 'section', title: 'Build your bundle' },
    } as unknown as RecipeSpec;
    const out = injectResolvedBundle(spec, resolvedBundle) as unknown as { config: Record<string, unknown> };
    expect(out.config.bundleId).toBe('starter-bundle');
    expect(out.config.components).toHaveLength(2);
    expect((out.config.components as Array<{ variantId: string }>)[0]!.variantId).toBe(
      'gid://shopify/ProductVariant/11',
    );
  });

  it('points the checkout upsell at the parent bundle variant', () => {
    const spec = {
      type: 'checkout.upsell',
      name: 'Bundle checkout',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: { offerTitle: 'x', productVariantGid: 'gid://shopify/ProductVariant/0', discountPercent: 0 },
    } as unknown as RecipeSpec;
    const out = injectResolvedBundle(spec, resolvedBundle) as unknown as { config: Record<string, unknown> };
    expect(out.config.offerTitle).toBe('Starter Bundle');
    expect(out.config.productVariantGid).toBe('gid://shopify/ProductVariant/500');
  });

  it('leaves unrelated members untouched', () => {
    const spec = {
      type: 'functions.cartTransform',
      name: 'merge',
      category: 'FUNCTION',
      requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
      config: { mode: 'BUNDLE', bundles: [] },
    } as unknown as RecipeSpec;
    expect(injectResolvedBundle(spec, resolvedBundle)).toBe(spec);
  });
});
