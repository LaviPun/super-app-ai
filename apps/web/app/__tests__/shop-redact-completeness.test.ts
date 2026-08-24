import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REDACT_RETENTION_ALLOWLIST } from '~/routes/webhooks.shop.redact';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** Model names in schema.prisma with a `shopId` field (required or optional). */
function modelsWithShopId(): string[] {
  const schema = readFileSync(join(REPO_ROOT, 'apps/web/prisma/schema.prisma'), 'utf8');
  const models: string[] = [];
  const modelBlocks = schema.matchAll(/model (\w+) \{([^}]*)\}/gs);
  for (const [, name, body] of modelBlocks) {
    if (/^\s*shopId\s+String/m.test(body!)) models.push(name!);
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
  it('every shopId-bearing model is either redacted or explicitly retained', () => {
    const all = modelsWithShopId();
    const handled = new Set(modelsHandledInRedactRoute());
    const allowlisted = new Set<string>(REDACT_RETENTION_ALLOWLIST);
    const missing = all.filter((m) => !handled.has(m) && !allowlisted.has(m));
    expect(missing, `Add these to webhooks.shop.redact.tsx or to REDACT_RETENTION_ALLOWLIST with a reason: ${missing.join(', ')}`).toEqual([]);
  });

  it('every allowlisted model genuinely has a shopId field (no stale entries)', () => {
    const all = new Set(modelsWithShopId());
    for (const name of REDACT_RETENTION_ALLOWLIST) {
      expect(all.has(name), `${name} is allowlisted but has no shopId field in schema.prisma — remove the stale entry`).toBe(true);
    }
  });
});
