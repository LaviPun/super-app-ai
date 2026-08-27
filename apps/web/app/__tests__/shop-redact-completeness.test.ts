// apps/web/app/__tests__/shop-redact-completeness.test.ts
/**
 * GDPR shop/redact completeness (WS-G finding [Infra-11], re-verified here
 * as a submission gate). Every Prisma model carrying a shopId field must
 * either be deleted by webhooks.shop.redact.tsx, or have a documented reason
 * it's retained (e.g. audit/billing records with a legal retention basis).
 *
 * Expected to FAIL until PR #17 (WS-G) merges — see docs/launch/gdpr-verification.md.
 * That is the correct, honest state; do not weaken this test to pass early.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('shop/redact completeness', () => {
  it('every shopId-bearing model is handled by webhooks.shop.redact.tsx or documented as retained', () => {
    const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
    const modelsWithShopId: string[] = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)\n\}/gm)]
      .filter((match) => /\bshopId\b/.test(match[2] ?? ''))
      .map((match) => match[1])
      .filter((name): name is string => typeof name === 'string');

    const handler = readFileSync(
      resolve(__dirname, '../routes/webhooks.shop.redact.tsx'),
      'utf8',
    );
    const untouched = modelsWithShopId.filter((model: string) => {
      const prismaField = model.charAt(0).toLowerCase() + model.slice(1);
      return !handler.includes(`prisma.${prismaField}.`);
    });

    // Retained-with-reason allowlist — every entry here MUST have a one-line
    // reason; an empty allowlist means every shopId model must be deleted.
    const RETAINED_WITH_REASON: Record<string, string> = {
      // e.g. AppSubscription: 'billing history retained per Shopify audit requirements',
    };
    const unexplained = untouched.filter((m: string) => !(m in RETAINED_WITH_REASON));
    expect(unexplained, `undeleted + unexplained models: ${unexplained.join(', ')}`).toEqual([]);
  });
});
