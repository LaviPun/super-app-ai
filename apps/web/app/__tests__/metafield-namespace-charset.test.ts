import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  THEME_MODULES_NAMESPACE,
  ADMIN_BLOCKS_NAMESPACE,
  ADMIN_ACTIONS_NAMESPACE,
  ADMIN_DISCOUNT_UI_NAMESPACE,
  ADMIN_LINK_NAMESPACE,
  ADMIN_PRINT_NAMESPACE,
  ADMIN_SEGMENT_TEMPLATE_NAMESPACE,
  FUNCTIONS_NAMESPACE,
  CHECKOUT_NAMESPACE,
  CUSTOMER_ACCOUNT_NAMESPACE,
} from '~/services/publish/publish.service';
import { SUPERAPP_METAFIELD_NAMESPACE_PREFIX } from '~/services/recipes/compiler/non-destructive';

/**
 * Shopify metafield namespace charset rule (2026-08 prod hotfix).
 *
 * Both `metafieldDefinitionCreate` and `metafieldsSet` require namespaces to be
 * "3-255 characters long and only contain alphanumeric, hyphen, and underscore
 * characters" (Admin GraphQL MetafieldDefinitionInput / MetafieldsSetInput).
 * Dots are REJECTED — production shipped `superapp.theme` etc. and every
 * theme-module publish 502'd at step 0:
 *
 *   ensureMetafieldDefinition superapp.theme/module_refs
 *   → "Namespace contains one or more invalid characters"
 *
 * The only additional legal shape is the app-reserved form: literal `$app`, or
 * `$app:` followed by a segment that itself satisfies the charset rule.
 *
 * This test locks the rule in two layers so the bug class cannot recur:
 *  1. every exported namespace constant is validated directly, and
 *  2. a source sweep rejects any NEW dotted `superapp.*` metafield namespace
 *     literal in app code, theme-extension Liquid, or extension GraphQL hooks.
 */

const PLAIN_NAMESPACE_RE = /^[A-Za-z0-9_-]{3,255}$/;

function isValidShopifyNamespace(ns: string): boolean {
  if (ns === '$app') return true;
  if (ns.startsWith('$app:')) return PLAIN_NAMESPACE_RE.test(ns.slice('$app:'.length));
  return PLAIN_NAMESPACE_RE.test(ns);
}

describe('metafield namespace charset (Shopify: alphanumeric/hyphen/underscore, 3-255)', () => {
  const exported: Record<string, string> = {
    THEME_MODULES_NAMESPACE,
    ADMIN_BLOCKS_NAMESPACE,
    ADMIN_ACTIONS_NAMESPACE,
    ADMIN_DISCOUNT_UI_NAMESPACE,
    ADMIN_LINK_NAMESPACE,
    ADMIN_PRINT_NAMESPACE,
    ADMIN_SEGMENT_TEMPLATE_NAMESPACE,
    FUNCTIONS_NAMESPACE,
    CHECKOUT_NAMESPACE,
    CUSTOMER_ACCOUNT_NAMESPACE,
  };

  it.each(Object.entries(exported))('%s is a valid Shopify namespace', (_name, value) => {
    expect(isValidShopifyNamespace(value)).toBe(true);
    expect(value).not.toContain('.');
  });

  it('the non-destructive guard prefix itself contains only legal namespace characters', () => {
    // A namespace passing the `startsWith(prefix)` guard must still be able to
    // satisfy Shopify's charset — impossible if the prefix carries a dot.
    expect(SUPERAPP_METAFIELD_NAMESPACE_PREFIX).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('the regex itself rejects the exact production failure and accepts the fix', () => {
    expect(isValidShopifyNamespace('superapp.theme')).toBe(false);
    expect(isValidShopifyNamespace('superapp_theme')).toBe(true);
    expect(isValidShopifyNamespace('ab')).toBe(false); // too short
    expect(isValidShopifyNamespace('$app:superapp_messaging')).toBe(true);
    expect(isValidShopifyNamespace('$app:super.app')).toBe(false);
  });
});

describe('source sweep: no dotted superapp.* metafield namespace literals', () => {
  const REPO_ROOT = path.resolve(__dirname, '../../../..');
  const SWEEP_ROOTS = [
    'apps/web/app',
    'apps/web/theme-extension-src',
    'extensions',
  ];
  const EXTS = new Set(['.ts', '.tsx', '.liquid', '.graphql']);
  // Every way this repo spells a metafield namespace literal. Catches a future
  // dotted namespace at review time instead of at the first production publish.
  const DOTTED_NAMESPACE_PATTERNS: RegExp[] = [
    /metafields\[['"]superapp\.[a-z_.]+['"]\]/, // Liquid: shop.metafields['superapp.theme']
    /namespace:\s*['"]superapp\.[a-z_.]+['"]/, // GraphQL/TS: metafield(namespace: "superapp.admin", ...)
    /NAMESPACE\s*=\s*['"]superapp\.[a-z_.]+['"]/, // TS: const X_NAMESPACE = 'superapp.flow'
  ];

  function* walk(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target' || entry.name === 'build') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(full);
      else if (EXTS.has(path.extname(entry.name))) yield full;
    }
  }

  it('finds zero dotted namespace usages', () => {
    const offenders: string[] = [];
    for (const root of SWEEP_ROOTS) {
      const abs = path.join(REPO_ROOT, root);
      if (!fs.existsSync(abs)) continue;
      for (const file of walk(abs)) {
        if (file.endsWith('metafield-namespace-charset.test.ts')) continue;
        const content = fs.readFileSync(file, 'utf8');
        for (const re of DOTTED_NAMESPACE_PATTERNS) {
          if (re.test(content)) {
            offenders.push(`${path.relative(REPO_ROOT, file)} matches ${re}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
