/**
 * Pre-submission conformance self-check (WS-S Task 1). Each check re-derives
 * a fact from the current tree — never hardcodes a "known good" value that
 * could silently go stale. Run standalone: `pnpm --dir apps/web submission:check`.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runChecks, type CheckResult } from '../../scripts/submission-conformance-check';

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

/**
 * Fixture-pinned behavior tests. `runChecks` reads a handful of specific
 * relative paths off whatever `repoRoot` it's given — these tests build tiny
 * throwaway "repos" (temp dirs with only the files a given check reads) and
 * assert a SPECIFIC pass/fail outcome, not just "some check ran". A gutted
 * check (e.g. a hardcoded `pass: true`) fails these because the fixture
 * cases assert `pass === false` for a known-bad input.
 *
 * Covers the two checks that had a vacuous-pass bug (billing-api-flow-removed,
 * restricted-scopes-not-requested — see the script's own comments on checks
 * 7 and 9) plus two more (csp-entry-point, gdpr-webhook-topics-declared) to
 * spot-check that the pattern audit didn't miss anything nearby.
 */
describe('submission conformance self-check — fixture-pinned behavior', () => {
  const fixtureRoots: string[] = [];

  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(resolve(tmpdir(), 'ws-s-conformance-'));
    fixtureRoots.push(root);
    for (const [rel, content] of Object.entries(files)) {
      const abs = resolve(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }
    return root;
  }

  function checkFrom(results: CheckResult[], id: string): CheckResult {
    const found = results.find((r) => r.id === id);
    if (!found) throw new Error(`no check with id ${id} in results`);
    return found;
  }

  afterAll(() => {
    for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
  });

  const BILLING_SERVICE_PATH = 'apps/web/app/services/billing/billing.service.ts';
  const TOML_PATH = 'shopify.app.production.toml';
  const ENTRY_SERVER_PATH = 'apps/web/app/entry.server.tsx';

  describe('billing-api-flow-removed (fixed vacuous-pass bug)', () => {
    it('FAILs loudly when billing.service.ts is missing entirely (previously vacuously PASSed)', () => {
      const root = fixture({}); // no billing.service.ts at all
      const check = checkFrom(runChecks(root), 'billing-api-flow-removed');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/missing/i);
    });

    it('FAILs when billing.service.ts still contains appSubscriptionCreate', () => {
      const root = fixture({
        [BILLING_SERVICE_PATH]: 'export async function subscribe() { return appSubscriptionCreate(); }',
      });
      const check = checkFrom(runChecks(root), 'billing-api-flow-removed');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/still contains appSubscriptionCreate/);
    });

    it('PASSes on the real repo (billing.service.ts exists and has migrated off appSubscriptionCreate)', () => {
      const check = checkFrom(runChecks(REPO_ROOT), 'billing-api-flow-removed');
      expect(check.pass).toBe(true);
    });
  });

  describe('restricted-scopes-not-requested (fixed vacuous-pass bug)', () => {
    it('FAILs loudly when shopify.app.production.toml is missing entirely (previously vacuously PASSed)', () => {
      const root = fixture({}); // no toml at all
      const check = checkFrom(runChecks(root), 'restricted-scopes-not-requested');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/cannot verify/i);
    });

    it('FAILs loudly when the toml exists but has no parseable scopes line (previously vacuously PASSed)', () => {
      const root = fixture({ [TOML_PATH]: 'name = "test-app"\n' });
      const check = checkFrom(runChecks(root), 'restricted-scopes-not-requested');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/cannot verify/i);
    });

    it('FAILs when a restricted scope IS present in a parseable scopes line', () => {
      const root = fixture({
        [TOML_PATH]: 'scopes = "read_products,read_all_orders"\n',
      });
      const check = checkFrom(runChecks(root), 'restricted-scopes-not-requested');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/read_all_orders/);
    });

    it('PASSes on the real repo (toml parses and requests none of the restricted scopes)', () => {
      const check = checkFrom(runChecks(REPO_ROOT), 'restricted-scopes-not-requested');
      expect(check.pass).toBe(true);
    });
  });

  describe('csp-entry-point', () => {
    it('FAILs when entry.server.tsx exists but does not call applySecurityHeaders', () => {
      const root = fixture({
        [ENTRY_SERVER_PATH]: 'export default function EntryServer() { return null; }',
      });
      const check = checkFrom(runChecks(root), 'csp-entry-point');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/does not call applySecurityHeaders/);
    });

    it('FAILs when entry.server.tsx is missing entirely', () => {
      const root = fixture({});
      const check = checkFrom(runChecks(root), 'csp-entry-point');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/missing/i);
    });

    it('PASSes on the real repo (entry.server.tsx calls applySecurityHeaders)', () => {
      const check = checkFrom(runChecks(REPO_ROOT), 'csp-entry-point');
      expect(check.pass).toBe(true);
    });
  });

  describe('gdpr-webhook-topics-declared', () => {
    it('FAILs when the toml is missing one of the three required compliance_topics', () => {
      const root = fixture({
        [TOML_PATH]: [
          '[[webhooks.subscriptions]]',
          'uri = "/webhooks/customers/data_request"',
          'compliance_topics = [ "customers/data_request" ]',
          '',
          '[[webhooks.subscriptions]]',
          'uri = "/webhooks/customers/redact"',
          'compliance_topics = [ "customers/redact" ]',
          '',
        ].join('\n'),
      });
      const check = checkFrom(runChecks(root), 'gdpr-webhook-topics-declared');
      expect(check.pass).toBe(false);
      expect(check.detail).toMatch(/shop\/redact/);
    });

    it('FAILs when the toml is missing entirely', () => {
      const root = fixture({});
      const check = checkFrom(runChecks(root), 'gdpr-webhook-topics-declared');
      expect(check.pass).toBe(false);
    });

    it('PASSes on the real repo (all 3 compliance_topics declared)', () => {
      const check = checkFrom(runChecks(REPO_ROOT), 'gdpr-webhook-topics-declared');
      expect(check.pass).toBe(true);
    });
  });
});
