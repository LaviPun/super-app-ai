import type { DeployOperation } from './types';

/**
 * Non-destructive publish op invariants.
 *
 * SuperApp must NEVER touch merchant assets outside these boundaries.
 * All compilers should only emit ops in these namespaces — this is the
 * last-line enforcement before anything reaches the Shopify API.
 *
 * Rules:
 *  1. No THEME_ASSET_DELETE  — could remove merchant sections/assets irreversibly
 *  2. No SHOP_METAFIELD_DELETE — could break extension config irreversibly
 *  3. THEME_ASSET_UPSERT keys must start with a SuperApp-owned path prefix
 *  4. SHOP_METAFIELD_SET namespace must start with "superapp."
 *  5. AUDIT ops are always safe (no side effects)
 */

export const SUPERAPP_ASSET_PREFIXES = [
  'sections/superapp-',
  'assets/superapp-',
  'snippets/superapp-',
] as const;

export const SUPERAPP_METAFIELD_NAMESPACE_PREFIX = 'superapp.' as const;

export type NonDestructiveResult = {
  ok: boolean;
  violations: string[];
};

export function checkNonDestructive(ops: DeployOperation[]): NonDestructiveResult {
  const violations: string[] = [];

  for (const op of ops) {
    switch (op.kind) {
      case 'THEME_ASSET_DELETE':
        violations.push(
          `THEME_ASSET_DELETE is always destructive (key: "${op.key}")`
        );
        break;

      case 'SHOP_METAFIELD_DELETE':
        violations.push(
          `SHOP_METAFIELD_DELETE is always destructive (namespace: "${op.namespace}" key: "${op.key}")`
        );
        break;

      case 'THEME_ASSET_UPSERT': {
        const owned = SUPERAPP_ASSET_PREFIXES.some(p => op.key.startsWith(p));
        if (!owned) {
          violations.push(
            `THEME_ASSET_UPSERT key "${op.key}" is outside SuperApp-owned paths ` +
            `(expected prefix: ${SUPERAPP_ASSET_PREFIXES.join(' | ')})`
          );
        }
        break;
      }

      case 'SHOP_METAFIELD_SET': {
        if (!op.namespace.startsWith(SUPERAPP_METAFIELD_NAMESPACE_PREFIX)) {
          violations.push(
            `SHOP_METAFIELD_SET namespace "${op.namespace}" is outside SuperApp-owned ` +
            `namespace (expected prefix: "${SUPERAPP_METAFIELD_NAMESPACE_PREFIX}")`
          );
        }
        break;
      }

      case 'FUNCTION_CONFIG_UPSERT':
        // Function config is written only to SuperApp-owned $app: metaobjects.
        break;

      case 'METAOBJECT_ENSURE_DEF': {
        if (!op.namespace.startsWith(SUPERAPP_METAFIELD_NAMESPACE_PREFIX)) {
          violations.push(
            `METAOBJECT_ENSURE_DEF namespace "${op.namespace}" is outside SuperApp-owned ` +
            `namespace (expected prefix: "${SUPERAPP_METAFIELD_NAMESPACE_PREFIX}")`
          );
        }
        break;
      }

      case 'AUDIT':
        // Audit ops have no side effects — always safe.
        break;

      default: {
        const _exhaustive: never = op;
        violations.push(`Unknown op kind encountered: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
