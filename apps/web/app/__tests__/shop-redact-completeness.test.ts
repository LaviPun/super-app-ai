import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACT_RETENTION_ALLOWLIST } from '~/routes/webhooks.shop.redact';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * Field names used anywhere in schema.prisma as the source of a direct foreign
 * key to `Shop` (e.g. `shop Shop @relation(fields: [shopId], references: [id])`
 * or `shop Shop @relation(fields: [tenantId], references: [id])`). Derived from
 * the schema itself rather than hardcoded — this is the vocabulary of "this
 * field means shop id" field names actually in use across the codebase.
 */
function shopScopingFieldNames(schema: string): Set<string> {
  const names = new Set<string>();
  // `Shop[]` (a reverse relation declared on the Shop model itself, e.g.
  // `shopOverrides Shop[] @relation("...")`) has no `fields:` clause and is
  // correctly excluded by requiring `Shop` or `Shop?` (not `Shop[]`) before `@relation(fields:`.
  for (const [, field] of schema.matchAll(/\bShop\??\s+@relation\(fields:\s*\[(\w+)\],\s*references:\s*\[id\]/g)) {
    names.add(field!);
  }
  return names;
}

/**
 * Model names in schema.prisma scoped to a shop: either via a direct FK
 * relation to `Shop`, OR via a field using one of the shop-scoping field
 * names collected above even without its own declared `Shop` relation.
 * The second clause is what catches `WorkflowRun`: its `tenantId` column is
 * the same shop-id convention as `WorkflowDef.tenantId` (which DOES declare
 * a direct `Shop` relation), but `WorkflowRun`'s own FK targets `WorkflowDef`
 * via a composite key, not `Shop` directly — a naive "has a declared Shop
 * relation" check would silently miss it. Matching by field-name vocabulary
 * instead of a hardcoded `shopId` literal closes that class of blind spot
 * generally, not just for this one model.
 */
function modelsScopedToShop(): string[] {
  const schema = readFileSync(join(REPO_ROOT, 'apps/web/prisma/schema.prisma'), 'utf8');
  const fieldNames = shopScopingFieldNames(schema);
  const models: string[] = [];
  const modelBlocks = schema.matchAll(/model (\w+) \{([^}]*)\}/gs);
  for (const [, name, body] of modelBlocks) {
    for (const fieldName of fieldNames) {
      if (new RegExp(`^\\s*${fieldName}\\s+String`, 'm').test(body!)) {
        models.push(name!);
        break;
      }
    }
  }
  return models.sort();
}

/** Model names actually deleted/anonymized in the redact route source. */
function modelsHandledInRedactRoute(): string[] {
  const src = readFileSync(join(REPO_ROOT, 'apps/web/app/routes/webhooks.shop.redact.tsx'), 'utf8');
  const models = new Set<string>();
  for (const [, model] of src.matchAll(/prisma\.(\w+)\.(?:deleteMany|delete|update|updateMany)\(/g)) {
    // lowerCamel prisma accessor → PascalCase model name
    models.add(model!.charAt(0).toUpperCase() + model!.slice(1));
  }
  return [...models].sort();
}

describe('shop/redact completeness (WS-G, finding Infra-11)', () => {
  it('every shop-scoped model is either redacted or explicitly retained', () => {
    const all = modelsScopedToShop();
    const handled = new Set(modelsHandledInRedactRoute());
    const allowlisted = new Set<string>(REDACT_RETENTION_ALLOWLIST);
    const missing = all.filter((m) => !handled.has(m) && !allowlisted.has(m));
    expect(missing, `Add these to webhooks.shop.redact.tsx or to REDACT_RETENTION_ALLOWLIST with a reason: ${missing.join(', ')}`).toEqual([]);
  });

  it('every allowlisted model genuinely is shop-scoped (no stale entries)', () => {
    const all = new Set(modelsScopedToShop());
    for (const name of REDACT_RETENTION_ALLOWLIST) {
      expect(all.has(name), `${name} is allowlisted but isn't shop-scoped in schema.prisma — remove the stale entry`).toBe(true);
    }
  });

  it('the field-name vocabulary picks up both shopId and tenantId conventions (regression guard)', () => {
    const schema = readFileSync(join(REPO_ROOT, 'apps/web/prisma/schema.prisma'), 'utf8');
    const names = shopScopingFieldNames(schema);
    expect(names.has('shopId')).toBe(true);
    expect(names.has('tenantId')).toBe(true);
  });
});
