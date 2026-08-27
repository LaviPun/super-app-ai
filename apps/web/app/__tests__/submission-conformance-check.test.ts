/**
 * Pre-submission conformance self-check (WS-S Task 1). Each check re-derives
 * a fact from the current tree — never hardcodes a "known good" value that
 * could silently go stale. Run standalone: `pnpm --dir apps/web submission:check`.
 */
import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../../scripts/submission-conformance-check';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('submission conformance self-check', () => {
  const results = runChecks(REPO_ROOT);

  it('runs at least the fixed set of checks (regression net on the check list itself)', () => {
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual(
      [
        'csp-entry-point',
        'app-bridge-head-order',
        'token-exchange-auth',
        'gdpr-webhook-topics-declared',
        'gdpr-webhook-handlers-exist',
        'app-pricing-plan-sync-present',
        'billing-api-flow-removed',
        'scope-list-matches-code',
        'restricted-scopes-not-requested',
        'tae-liquid-budget',
      ].sort(),
    );
  });

  it('every check on current master either passes or fails with a human-readable reason (never throws)', () => {
    for (const r of results) {
      expect(typeof r.pass).toBe('boolean');
      if (!r.pass) expect(r.detail.length).toBeGreaterThan(0);
    }
  });
});
