# WS-QF Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seven small, independent, high-severity fixes now: SSO email allowlist, internal-login rate limiting, honest `needs_runtime` gating for activation-unwired Function types, pending-delete commit on unmount, honest stream-route failure without double billing, module-quota enforcement at publish/agent-create/duplicate, and the activity-service filter clobber.

**Architecture:** Each task is a self-contained fix + test cycle in the existing Remix app (`apps/web`) and `@superapp/core`. No new subsystems; every fix reuses existing infrastructure (`enforceRateLimitWithPolicy`, `QuotaService`, `ActivityLogService`, the eligibility registry, the SSE stream contract). One commit per task.

**Tech Stack:** Remix (Vite), Prisma, Zod, Vitest (node environment, `vi.mock` module-substitution pattern), pnpm workspace.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` — Phase 0, "WS-QF Quick fixes" (findings [Ops-2], [Ops-7], [Deploy-1]/D6-step-1, prior code review, [AI-2], [Deploy-5], plus the activity-filter bug found in review).

## Global Constraints

- Monorepo uses **pnpm@9.15.9**. Run web tests from `apps/web`: `pnpm vitest run <file>`. After ANY edit under `packages/core/src`, rebuild before running web tests: `pnpm --filter @superapp/core build` (apps/web resolves `@superapp/core` from `dist/`).
- Vitest runs in **node** environment (`apps/web/vitest.config.ts`) — no DOM/component rendering. UI logic under test must be extracted into pure helpers.
- Vitest env already provides `INTERNAL_ADMIN_SESSION_SECRET` (`apps/web/vitest.config.ts:17`).
- Test idiom: `vi.hoisted` for mock fns, `vi.mock('~/module', ...)` for every heavy import, then **dynamic `await import(...)`** of the module under test (see `apps/web/app/__tests__/internal-ai-assistant-probe.route.test.ts`).
- Merchant UI is Polaris web components; the small `GenFailed` view in Task 5 reuses existing `gen-*` CSS classes already in `generate._index.tsx` — no new design surface (DESIGN.md unaffected).
- Blueprint co-deploy behavior must NOT change (Task 3): bundles behind `BLUEPRINTS_ENABLED` keep publishing exactly as today.
- Commit messages: conventional prefix + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: SSO email allowlist for internal admin

`apps/web/app/routes/internal.sso.callback.tsx:34-42` currently grants `internal_admin = true` to ANY identity the IdP authenticates — no email check at all. Add an `INTERNAL_SSO_ALLOWED_EMAILS` allowlist (comma-separated, exact-match, case-insensitive), require the ID-token `email` claim to be present (and `email_verified !== false` when that claim exists), deny with an audit log otherwise, and fail boot when SSO is configured without an allowlist.

**Files:**
- Create: `apps/web/app/internal-admin/sso-allowlist.server.ts`
- Create: `apps/web/app/__tests__/internal-sso-allowlist.test.ts`
- Create: `apps/web/app/__tests__/internal-sso-callback.route.test.ts`
- Modify: `apps/web/app/env.server.ts` (schema object ends line 74; SSO block lines 34-38)
- Modify: `apps/web/app/routes/internal.sso.callback.tsx:34-42`

**Interfaces:**
- Produces: `parseAllowedEmails(raw: string | undefined): string[]`; `evaluateSsoIdentity(claims: Record<string, unknown>, allowedEmails: string[]): { ok: true; email: string } | { ok: false; email: string | null; reason: string }`; `auditSsoDenied(request: Request, verdict: { email: string | null; reason: string }): Promise<void>`.
- Consumes: `ActivityLogService` (`~/services/activity/activity.service`), `getClientIp` (`~/services/security/rate-limit.server`).

- [ ] **Step 1: Write the failing helper tests**

Create `apps/web/app/__tests__/internal-sso-allowlist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({ log: vi.fn(async () => {}) }));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

import {
  parseAllowedEmails,
  evaluateSsoIdentity,
  auditSsoDenied,
} from '~/internal-admin/sso-allowlist.server';

beforeEach(() => vi.clearAllMocks());

describe('parseAllowedEmails', () => {
  it('splits on commas, trims, lowercases, drops empties', () => {
    expect(parseAllowedEmails(' Alice@Example.com , bob@x.io ,, ')).toEqual([
      'alice@example.com',
      'bob@x.io',
    ]);
  });

  it('returns [] for undefined / empty', () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails('')).toEqual([]);
  });
});

describe('evaluateSsoIdentity', () => {
  const allowed = ['alice@example.com'];

  it('allows an exact case-insensitive match with verified email', () => {
    const v = evaluateSsoIdentity({ email: 'Alice@Example.COM', email_verified: true }, allowed);
    expect(v).toEqual({ ok: true, email: 'alice@example.com' });
  });

  it('allows when the email_verified claim is absent (claim optional)', () => {
    expect(evaluateSsoIdentity({ email: 'alice@example.com' }, allowed).ok).toBe(true);
  });

  it('denies when the email claim is missing', () => {
    const v = evaluateSsoIdentity({ name: 'no email' }, allowed);
    expect(v).toMatchObject({ ok: false, email: null, reason: 'missing_email_claim' });
  });

  it('denies when email_verified is present and not true', () => {
    const v = evaluateSsoIdentity({ email: 'alice@example.com', email_verified: false }, allowed);
    expect(v).toMatchObject({ ok: false, reason: 'email_not_verified' });
  });

  it('denies an email not on the allowlist', () => {
    const v = evaluateSsoIdentity({ email: 'mallory@evil.com', email_verified: true }, allowed);
    expect(v).toMatchObject({ ok: false, email: 'mallory@evil.com', reason: 'not_on_allowlist' });
  });

  it('denies everyone when the allowlist is empty (fail closed)', () => {
    const v = evaluateSsoIdentity({ email: 'alice@example.com', email_verified: true }, []);
    expect(v).toMatchObject({ ok: false, reason: 'allowlist_empty' });
  });
});

describe('auditSsoDenied', () => {
  it('writes an INTERNAL_ADMIN LOGIN denial with email + reason + ip', async () => {
    const request = new Request('https://app.test/internal/sso/callback', {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    await auditSsoDenied(request, { email: 'mallory@evil.com', reason: 'not_on_allowlist' });
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'INTERNAL_ADMIN',
        action: 'LOGIN',
        resource: 'internal:sso',
        ip: '203.0.113.9',
        details: expect.objectContaining({ outcome: 'denied', email: 'mallory@evil.com', reason: 'not_on_allowlist' }),
      }),
    );
  });

  it('never throws when the audit write fails', async () => {
    hoisted.log.mockRejectedValueOnce(new Error('db down'));
    await expect(
      auditSsoDenied(new Request('https://app.test/x'), { email: null, reason: 'missing_email_claim' }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-sso-allowlist.test.ts`
Expected: FAIL — `Cannot find module '~/internal-admin/sso-allowlist.server'` (or equivalent resolve error).

- [ ] **Step 3: Implement the helper**

Create `apps/web/app/internal-admin/sso-allowlist.server.ts`:

```ts
/**
 * Internal-SSO identity allowlist (WS-QF / Ops-2).
 *
 * The SSO callback previously granted internal-admin to ANY identity the IdP
 * authenticated. These helpers gate the callback on INTERNAL_SSO_ALLOWED_EMAILS
 * (comma-separated, exact-match, case-insensitive) against the ID-token email
 * claim: the claim must be present, and when the IdP sends email_verified it
 * must be true. Denials are audit-logged (best-effort, never throwing).
 */
import { ActivityLogService } from '~/services/activity/activity.service';
import { getClientIp } from '~/services/security/rate-limit.server';

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type SsoIdentityVerdict =
  | { ok: true; email: string }
  | { ok: false; email: string | null; reason: 'missing_email_claim' | 'email_not_verified' | 'allowlist_empty' | 'not_on_allowlist' };

export function evaluateSsoIdentity(
  claims: Record<string, unknown>,
  allowedEmails: string[],
): SsoIdentityVerdict {
  const raw = claims.email;
  const email = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : null;
  if (!email) return { ok: false, email: null, reason: 'missing_email_claim' };
  if ('email_verified' in claims && claims.email_verified !== true) {
    return { ok: false, email, reason: 'email_not_verified' };
  }
  if (allowedEmails.length === 0) return { ok: false, email, reason: 'allowlist_empty' };
  if (!allowedEmails.includes(email)) return { ok: false, email, reason: 'not_on_allowlist' };
  return { ok: true, email };
}

/** Best-effort denial audit — a failed audit write must never mask the denial. */
export async function auditSsoDenied(
  request: Request,
  verdict: { email: string | null; reason: string },
): Promise<void> {
  await new ActivityLogService()
    .log({
      actor: 'INTERNAL_ADMIN',
      action: 'LOGIN',
      resource: 'internal:sso',
      details: { outcome: 'denied', email: verdict.email, reason: verdict.reason },
      ip: getClientIp(request),
    })
    .catch(() => {});
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-sso-allowlist.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write the failing route test**

Create `apps/web/app/__tests__/internal-sso-callback.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  log: vi.fn(async () => {}),
  claims: vi.fn((): Record<string, unknown> => ({ email: 'mallory@evil.com', email_verified: true })),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({ mocked: 'config' })),
  authorizationCodeGrant: vi.fn(async () => ({ claims: hoisted.claims })),
}));

async function callbackRequest() {
  // Real cookie session storage (vitest env provides the secret) so the route's
  // state/verifier check passes and we exercise ONLY the allowlist gate.
  const { internalSessionStorage } = await import('~/internal-admin/session.server');
  const session = await internalSessionStorage.getSession();
  session.set('oidc_state', 'state123');
  session.set('oidc_verifier', 'verifier123');
  const cookie = await internalSessionStorage.commitSession(session);
  return new Request('https://app.test/internal/sso/callback?code=abc&state=state123', {
    headers: { cookie },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
  process.env.INTERNAL_SSO_CLIENT_ID = 'client-id';
  process.env.INTERNAL_SSO_CLIENT_SECRET = 'client-secret';
  process.env.INTERNAL_SSO_REDIRECT_URI = 'https://app.test/internal/sso/callback';
  process.env.INTERNAL_SSO_ALLOWED_EMAILS = 'alice@example.com, bob@example.com';
});

describe('internal.sso.callback allowlist gate', () => {
  it('denies an authenticated identity that is not on the allowlist (403 + audit)', async () => {
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    let threw: Response | null = null;
    try {
      await loader({ request });
    } catch (e) {
      threw = e as Response;
    }
    expect(threw).toBeInstanceOf(Response);
    expect(threw!.status).toBe(403);
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LOGIN',
        resource: 'internal:sso',
        details: expect.objectContaining({ outcome: 'denied', email: 'mallory@evil.com' }),
      }),
    );
  });

  it('denies when the email claim is missing entirely', async () => {
    hoisted.claims.mockReturnValueOnce({ name: 'No Email' });
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    await expect(loader({ request })).rejects.toMatchObject({ status: 403 });
  });

  it('grants an allowlisted, verified identity (302 → /internal)', async () => {
    hoisted.claims.mockReturnValueOnce({ email: 'Alice@Example.com', email_verified: true });
    const { loader } = await import('~/routes/internal.sso.callback');
    const request = await callbackRequest();
    const res = await loader({ request });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/internal');
    expect(hoisted.log).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the route test to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-sso-callback.route.test.ts`
Expected: FAIL — the deny cases get a 302 redirect to `/internal` (no gate exists yet); the allow case may already pass.

- [ ] **Step 7: Wire the gate into the callback**

In `apps/web/app/routes/internal.sso.callback.tsx`, add the import at the top:

```ts
import { parseAllowedEmails, evaluateSsoIdentity, auditSsoDenied } from '~/internal-admin/sso-allowlist.server';
```

Replace lines 34-40 (`const claims = tokens.claims();` through `session.set('internal_name', ...)`) with:

```ts
  const claims = (tokens.claims() ?? {}) as Record<string, unknown>;

  const allowedEmails = parseAllowedEmails(process.env.INTERNAL_SSO_ALLOWED_EMAILS);
  const verdict = evaluateSsoIdentity(claims, allowedEmails);
  if (!verdict.ok) {
    await auditSsoDenied(request, verdict);
    throw new Response('SSO identity not allowed', { status: 403 });
  }

  session.unset('oidc_state');
  session.unset('oidc_verifier');
  session.set('internal_admin', true);
  session.set('internal_email', verdict.email);
  session.set('internal_name', claims.name ?? null);
```

- [ ] **Step 8: Run the route test to verify it passes**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-sso-callback.route.test.ts app/__tests__/internal-sso-allowlist.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire the env schema (fail-closed boot when SSO configured without allowlist)**

In `apps/web/app/env.server.ts`, add to the SSO block (after line 38, `INTERNAL_SSO_REDIRECT_URI`):

```ts
  /** Comma-separated exact-match email allowlist for internal SSO. REQUIRED whenever INTERNAL_SSO_ISSUER is set. */
  INTERNAL_SSO_ALLOWED_EMAILS: z.string().optional(),
```

Then change the schema close (line 74 `});`) to attach a refinement — i.e. turn `const EnvSchema = z.object({ ... });` into:

```ts
const EnvSchema = z
  .object({
    // ... existing fields unchanged ...
  })
  .superRefine((env, ctx) => {
    if (env.INTERNAL_SSO_ISSUER) {
      const allowed = (env.INTERNAL_SSO_ALLOWED_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowed.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTERNAL_SSO_ALLOWED_EMAILS'],
          message:
            'INTERNAL_SSO_ALLOWED_EMAILS is required (comma-separated emails) when INTERNAL_SSO_ISSUER is set — without it SSO would grant internal admin to any IdP identity.',
        });
      }
    }
  });
```

(`z.infer<typeof EnvSchema>` and `safeParse` are unaffected by `superRefine`.)

Append to `apps/web/app/__tests__/internal-sso-allowlist.test.ts`:

```ts
describe('env validation: SSO requires an allowlist', () => {
  const BASE_ENV = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://x',
    SHOPIFY_API_KEY: 'k',
    SHOPIFY_API_SECRET: 's',
    SHOPIFY_APP_URL: 'https://app.test',
    SCOPES: 'write_products',
    ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    INTERNAL_ADMIN_PASSWORD: 'longpassword',
    INTERNAL_ADMIN_SESSION_SECRET: 'vitest-internal-admin-session-secret-32',
  } as const;

  it('boot fails when INTERNAL_SSO_ISSUER is set without INTERNAL_SSO_ALLOWED_EMAILS', async () => {
    const env = await import('~/env.server');
    const saved = { ...process.env };
    try {
      for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v as string;
      process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
      delete process.env.INTERNAL_SSO_ALLOWED_EMAILS;
      env._resetEnvForTest();
      expect(() => env.validateEnv()).toThrow(/INTERNAL_SSO_ALLOWED_EMAILS/);
    } finally {
      process.env = saved;
      env._resetEnvForTest();
    }
  });

  it('boot succeeds with issuer + allowlist, and without SSO at all', async () => {
    const env = await import('~/env.server');
    const saved = { ...process.env };
    try {
      for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v as string;
      process.env.INTERNAL_SSO_ISSUER = 'https://idp.example.com';
      process.env.INTERNAL_SSO_ALLOWED_EMAILS = 'alice@example.com';
      env._resetEnvForTest();
      expect(() => env.validateEnv()).not.toThrow();

      delete process.env.INTERNAL_SSO_ISSUER;
      delete process.env.INTERNAL_SSO_ALLOWED_EMAILS;
      env._resetEnvForTest();
      expect(() => env.validateEnv()).not.toThrow();
    } finally {
      process.env = saved;
      env._resetEnvForTest();
    }
  });
});
```

- [ ] **Step 10: Run all Task 1 tests**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-sso-allowlist.test.ts app/__tests__/internal-sso-callback.route.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/internal-admin/sso-allowlist.server.ts apps/web/app/routes/internal.sso.callback.tsx apps/web/app/env.server.ts apps/web/app/__tests__/internal-sso-allowlist.test.ts apps/web/app/__tests__/internal-sso-callback.route.test.ts
git commit -m "fix(security): internal SSO callback enforces INTERNAL_SSO_ALLOWED_EMAILS allowlist

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Rate-limit the internal login password POST + audit failed attempts

`apps/web/app/routes/internal.login.tsx:40-55` accepts unlimited password guesses and records nothing. Add per-IP limiting via the existing `enforceRateLimitWithPolicy` (`apps/web/app/services/security/rate-limit.server.ts:149`) and audit both failed and successful password logins.

**Files:**
- Create: `apps/web/app/__tests__/internal-login-rate-limit.route.test.ts`
- Modify: `apps/web/app/routes/internal.login.tsx:40-55` (the `action`)

**Interfaces:**
- Consumes: `enforceRateLimitWithPolicy(key, { limit, windowSec })` (throws `AppError` code `RATE_LIMITED`), `getClientIp(request)`, `AppError` (`~/services/errors/app-error.server`), `ActivityLogService`.
- Produces: no new exports — behavior only (429 JSON on limit; 401 unchanged on bad password).

- [ ] **Step 1: Write the failing route test**

Create `apps/web/app/__tests__/internal-login-rate-limit.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';

const hoisted = vi.hoisted(() => ({
  enforceRateLimitWithPolicy: vi.fn(async () => {}),
  getClientIp: vi.fn(() => '203.0.113.9'),
  log: vi.fn(async () => {}),
}));

vi.mock('~/services/security/rate-limit.server', () => ({
  enforceRateLimitWithPolicy: hoisted.enforceRateLimitWithPolicy,
  getClientIp: hoisted.getClientIp,
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

function loginRequest(password: string) {
  const form = new FormData();
  form.set('password', password);
  form.set('to', '/internal');
  return new Request('https://app.test/internal/login', { method: 'POST', body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_ADMIN_PASSWORD = 'correct-horse-battery';
});

describe('internal.login action rate limiting + audit', () => {
  it('applies a per-IP rate limit BEFORE comparing the password', async () => {
    hoisted.enforceRateLimitWithPolicy.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Too many requests. Retry in 60 seconds.' }),
    );
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('correct-horse-battery') });
    expect(res.status).toBe(429);
    expect(hoisted.enforceRateLimitWithPolicy).toHaveBeenCalledWith(
      'internal-login:203.0.113.9',
      expect.objectContaining({ limit: expect.any(Number), windowSec: expect.any(Number) }),
    );
    // Rate-limited requests must not even evaluate the password (no audit row).
    expect(hoisted.log).not.toHaveBeenCalled();
  });

  it('audits a failed password attempt with the client IP and still returns 401', async () => {
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('wrong-password') });
    expect(res.status).toBe(401);
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'INTERNAL_ADMIN',
        action: 'LOGIN',
        resource: 'internal:password',
        ip: '203.0.113.9',
        details: expect.objectContaining({ outcome: 'failed' }),
      }),
    );
  });

  it('audits a successful login and redirects', async () => {
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('correct-horse-battery') });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/internal');
    expect(hoisted.log).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'internal:password', details: expect.objectContaining({ outcome: 'success' }) }),
    );
  });

  it('a failed audit write never blocks the login flow', async () => {
    hoisted.log.mockRejectedValueOnce(new Error('db down'));
    const { action } = await import('~/routes/internal.login');
    const res = await action({ request: loginRequest('wrong-password') });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-login-rate-limit.route.test.ts`
Expected: FAIL — no 429 (limiter never called), no audit calls.

- [ ] **Step 3: Implement the action changes**

In `apps/web/app/routes/internal.login.tsx`, add imports next to the existing session import (line 19):

```ts
import { enforceRateLimitWithPolicy, getClientIp } from '~/services/security/rate-limit.server';
import { AppError } from '~/services/errors/app-error.server';
import { ActivityLogService } from '~/services/activity/activity.service';
```

Replace the `action` (lines 40-55) with:

```ts
// Brute-force guard: 5 attempts / 5 minutes per client IP (Redis-backed with
// in-memory fallback, same infra as the API routes — rate-limit.server.ts).
const LOGIN_RATE_LIMIT = { limit: 5, windowSec: 300 };

export async function action({ request }: { request: Request }) {
  const ip = getClientIp(request);
  try {
    await enforceRateLimitWithPolicy(`internal-login:${ip}`, LOGIN_RATE_LIMIT);
  } catch (e) {
    if (e instanceof AppError && e.code === 'RATE_LIMITED') {
      return json({ error: 'Too many login attempts. Try again in a few minutes.' }, { status: 429 });
    }
    throw e;
  }

  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const to = sanitizeInternalRedirect(String(form.get('to') ?? '/internal'));

  const expected = process.env.INTERNAL_ADMIN_PASSWORD;
  if (!expected) return json({ error: 'Internal admin not configured' }, { status: 500 });

  const audit = (outcome: 'failed' | 'success') =>
    new ActivityLogService()
      .log({
        actor: 'INTERNAL_ADMIN',
        action: 'LOGIN',
        resource: 'internal:password',
        details: { outcome },
        ip,
      })
      .catch(() => {});

  if (!(await constantTimePasswordEquals(password, expected))) {
    await audit('failed');
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  await audit('success');
  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  session.set('internal_admin', true);
  return redirect(to, { headers: { 'Set-Cookie': await commitInternal(session) } });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run app/__tests__/internal-login-rate-limit.route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/internal.login.tsx apps/web/app/__tests__/internal-login-rate-limit.route.test.ts
git commit -m "fix(security): per-IP rate limit + failed-attempt audit on internal login

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Gate activation-unwired Function types as `needs_runtime` (D6 step 1)

Verified reality: the six types `functions.discountRules`, `functions.cartTransform`, `functions.deliveryCustomization`, `functions.paymentCustomization`, `functions.cartAndCheckoutValidation`, `functions.fulfillmentConstraints` classify **deployable** today because their wasm handles are in `DEPLOYED_FUNCTION_EXTENSION_HANDLES` (`apps/web/app/services/publish/deployed-extensions.server.ts:22-31`). But the single-module publish path only writes a config metaobject — the Shopify **activation** mutations (`cartTransformCreate`, `discountAutomaticAppCreate`, and there is no `deliveryCustomizationCreate`/`paymentCustomizationCreate`/`validationCreate`/`fulfillmentConstraintRuleCreate` call anywhere) exist **only** in `apps/web/app/services/bundles/bundle-product.service.ts:199,258`, used by the blueprint co-deploy (`blueprint.service.ts:467-481`). So single-module publishes false-publish. Gate them honestly; blueprint co-deploy keeps working via an explicit context flag. WS-E reverts the gate type-by-type as activation wiring ships.

**Files:**
- Modify: `packages/core/src/extension-eligibility.ts` (append after `isRuntimeShipped`, line 556)
- Modify: `apps/web/app/services/publish/publish-preflight.server.ts` (`ModulePublishabilityContext` line 92; `classifyModulePublishability` after the `!shipped` block, line 214)
- Modify: `apps/web/app/services/publish/publish.service.ts:93-99` (`publish` signature + preflight call)
- Modify: `apps/web/app/services/blueprints/blueprint.service.ts:461` (pass the co-deploy flag)
- Modify: `apps/web/app/__tests__/module-deployability-audit.test.ts` (pins move to the new honest state)
- Modify: `apps/web/app/__tests__/blueprint-deployability.test.ts:51-62` (guardrail asserts the co-deploy context)
- Modify: `apps/web/app/__tests__/publish-functions-reliability.test.ts:49-61`

**Interfaces:**
- Produces (from `@superapp/core`, auto-exported via `packages/core/src/index.ts:23` `export *`): `FUNCTION_ACTIVATION_UNWIRED: Set<ModuleType>`; `functionActivationGap(moduleType: ModuleType): string | undefined`.
- Produces: `classifyModulePublishability(spec, ctx)` honors new `ctx.activationHandledByCoDeploy?: boolean`; `PublishService.publish(spec, target, opts?: { activationHandledByCoDeploy?: boolean })`.
- NOT changed: `isRuntimeShipped` keeps meaning "wasm shipped" (the manifest axis); the activation gap is a separate honesty axis. `analytics.pixel` stays deployable (`webPixelCreate` is real — `publish.service.ts` WEB_PIXEL_UPSERT path).

- [ ] **Step 1: Write the failing tests (new describe in the audit test)**

Append to `apps/web/app/__tests__/module-deployability-audit.test.ts`:

```ts
/**
 * WS-QF / D6 step 1 (2026-08-24): Function types whose wasm IS deployed but whose
 * Shopify ACTIVATION object is never created on the single-module publish path
 * (cartTransformCreate / discountAutomaticAppCreate live only in
 * bundle-product.service.ts, used by blueprint co-deploy; the delivery/payment/
 * validation/fulfillment Create mutations exist nowhere). Publishing one writes a
 * config metaobject and flips PUBLISHED while the Function never runs. Gate them
 * needs_runtime on the single-module path; blueprint co-deploy opts out via
 * activationHandledByCoDeploy. WS-E reverts this set type-by-type.
 */
const ACTIVATION_UNWIRED_TYPES = [
  'functions.discountRules',
  'functions.cartTransform',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.fulfillmentConstraints',
] as const;

describe('INTEGRITY: activation-unwired function types are needs_runtime on single publish', () => {
  const deployed = deployedFunctionExtensions();

  for (const type of ACTIVATION_UNWIRED_TYPES) {
    it(`${type} is needs_runtime with an honest activation reason (wasm deployed is not enough)`, () => {
      const pf = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(pf.status).toBe('needs_runtime');
      expect(pf.willDeploy).toBe(false);
      expect(pf.reasons.join(' ')).toMatch(/activation/i);
    });

    it(`${type} stays deployable for blueprint co-deploy (activationHandledByCoDeploy)`, () => {
      const pf = classifyModulePublishability({ type } as RecipeSpec, {
        deployedExtensions: deployed,
        activationHandledByCoDeploy: true,
      });
      expect(pf.status).toBe('deployable');
      expect(pf.willDeploy).toBe(true);
    });
  }

  it('analytics.pixel is NOT gated (webPixelCreate is a real activation)', () => {
    const pf = classifyModulePublishability({ type: 'analytics.pixel' } as RecipeSpec, {
      deployedExtensions: deployed,
    });
    expect(pf.status).toBe('deployable');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd apps/web && pnpm vitest run app/__tests__/module-deployability-audit.test.ts -t 'activation-unwired'`
Expected: FAIL — the six types currently classify `deployable`.

- [ ] **Step 3: Implement the core registry gap**

In `packages/core/src/extension-eligibility.ts`, append after `isRuntimeShipped` (after line 556):

```ts
/**
 * WS-QF / D6 step 1 (2026-08-24): Function module types whose wasm extension IS
 * deployed (manifest) but whose Shopify ACTIVATION object is never created on the
 * single-module publish path. Publishing one writes its $app config metaobject and
 * flips the module PUBLISHED, but no cartTransformCreate / discountAutomaticAppCreate /
 * deliveryCustomizationCreate / paymentCustomizationCreate / validationCreate /
 * fulfillmentConstraintRuleCreate ever runs (the first two exist only in the app's
 * bundle co-deploy service; the rest exist nowhere) — the Function never executes,
 * a false-publish. `classifyModulePublishability` gates these needs_runtime unless
 * the caller is the blueprint co-deploy (which performs its own activation).
 * WS-E ships activation wiring and removes types from this set one by one.
 */
export const FUNCTION_ACTIVATION_UNWIRED: ReadonlySet<ModuleType> = new Set<ModuleType>([
  'functions.discountRules',
  'functions.cartTransform',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.fulfillmentConstraints',
]);

/** Honest reason string when a type's Shopify activation object is not wired; undefined when unaffected. */
export function functionActivationGap(moduleType: ModuleType): string | undefined {
  if (!FUNCTION_ACTIVATION_UNWIRED.has(moduleType)) return undefined;
  return (
    `${moduleType}: the Function wasm is deployed, but publishing this module only writes its config ` +
    `metaobject — the app never creates the Shopify activation object that makes the Function run ` +
    `(discountAutomaticAppCreate / cartTransformCreate / deliveryCustomizationCreate / ` +
    `paymentCustomizationCreate / validationCreate / fulfillmentConstraintRuleCreate). Until activation ` +
    `wiring lands (WS-E), publishing would report PUBLISHED while changing nothing at checkout, so it is ` +
    `honestly gated needs_runtime.`
  );
}
```

Rebuild core: `pnpm --filter @superapp/core build`

- [ ] **Step 4: Implement the classifier gate + publish/blueprint plumbing**

In `apps/web/app/services/publish/publish-preflight.server.ts`:

1. Add `functionActivationGap` to the `@superapp/core` import list (lines 3-11).
2. Extend the context (line 92):

```ts
export interface ModulePublishabilityContext {
  /** Extension handles known to be deployed via `shopify app deploy` (layer a). */
  deployedExtensions?: Iterable<string>;
  /**
   * Blueprint co-deploy only: the caller performs the Shopify activation itself
   * (BundleProductService.activateCartTransform / ensureAutomaticBundleDiscount),
   * so the FUNCTION_ACTIVATION_UNWIRED gate does not apply. NEVER set on the
   * single-module publish path.
   */
  activationHandledByCoDeploy?: boolean;
}
```

3. In `classifyModulePublishability`, insert AFTER the `if (!shipped) { ... }` block (line 214, before the plan-notes section):

```ts
  // WS-QF / D6 step 1: wasm deployed is necessary but not sufficient — without the
  // Shopify activation object the Function never runs (false-publish). Blueprint
  // co-deploy activates for itself and opts out via activationHandledByCoDeploy.
  const activationGap = functionActivationGap(type);
  if (activationGap && !ctx.activationHandledByCoDeploy) {
    return ModulePublishPreflightResultSchema.parse({
      moduleType: type,
      status: 'needs_runtime',
      reasons: [activationGap],
      ...(eligibility.functionHandle ? { requiresExtension: eligibility.functionHandle } : {}),
      willDeploy: false,
    });
  }
```

In `apps/web/app/services/publish/publish.service.ts:93-96`, thread the flag:

```ts
  async publish(
    spec: RecipeSpec,
    target: DeployTarget,
    opts?: { activationHandledByCoDeploy?: boolean },
  ): Promise<{ compiledJson?: string; preflight: ModulePublishPreflightResult }> {
    // WS5/026: never silently no-op. Gate before any deploy work so a caller
    // cannot report "published" for a type that deploys nothing.
    const preflight = classifyModulePublishability(spec, {
      deployedExtensions: deployedFunctionExtensions(),
      activationHandledByCoDeploy: opts?.activationHandledByCoDeploy === true,
    });
```

In `apps/web/app/services/blueprints/blueprint.service.ts:461`, change:

```ts
        await publisher.publish(spec, member.target, { activationHandledByCoDeploy: true });
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd apps/web && pnpm vitest run app/__tests__/module-deployability-audit.test.ts -t 'activation-unwired'`
Expected: PASS. (Other describes in this file now fail — fixed next step; that is the intended pin-move.)

- [ ] **Step 6: Move the existing pins to the new honest state**

In `apps/web/app/__tests__/module-deployability-audit.test.ts`:

1. Import the new symbol — add `functionActivationGap` to the `@superapp/core` import (lines 2-9).
2. In the first describe, replace the per-type "classifier agrees" loop body (lines 91-97) with:

```ts
    it(`${type} classifier agrees with the registry (manifest ∧ activation)`, () => {
      const shipped = isRuntimeShipped(type, { deployedFunctionHandles: deployed });
      const expectedDeployable = shipped && !functionActivationGap(type);
      const result = classifyModulePublishability({ type } as RecipeSpec, { deployedExtensions: deployed });
      expect(result.status).toBe(expectedDeployable ? 'deployable' : 'needs_runtime');
      expect(result.willDeploy).toBe(expectedDeployable);
    });
```

3. Extend `EXPECTED_NEEDS_RUNTIME` (lines 36-75) with the six gated types + comment:

```ts
  // WS-QF / D6 step 1: wasm deployed but Shopify ACTIVATION object unwired on the
  // single-module publish path (see FUNCTION_ACTIVATION_UNWIRED in
  // extension-eligibility.ts). Blueprint co-deploy still publishes them
  // (activationHandledByCoDeploy). WS-E removes these as activation wiring ships.
  'functions.discountRules',
  'functions.cartTransform',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.fulfillmentConstraints',
```

4. Recompute both set-level tests from the CLASSIFIER (not `isRuntimeShipped`, which intentionally still reports the manifest axis). Replace the bodies of `'the needs_runtime set equals the documented pending set (no silent regression)'` (lines 99-104) and `'reports the deployable surface area (most types)'` (lines 106-112) with:

```ts
  it('the needs_runtime set equals the documented pending set (no silent regression)', () => {
    const needsRuntime = RECIPE_SPEC_TYPES.filter(
      (t) => !classifyModulePublishability({ type: t } as RecipeSpec, { deployedExtensions: deployed }).willDeploy,
    ).sort();
    expect(needsRuntime).toEqual([...EXPECTED_NEEDS_RUNTIME].sort());
  });

  it('reports the deployable surface area (most types)', () => {
    const deployableCount = RECIPE_SPEC_TYPES.filter(
      (t) => classifyModulePublishability({ type: t } as RecipeSpec, { deployedExtensions: deployed }).willDeploy,
    ).length;
    expect(deployableCount).toBe(RECIPE_SPEC_TYPES.length - EXPECTED_NEEDS_RUNTIME.size);
  });
```

5. In `'a known-deployable type still reaches deployable (gate is not over-broad)'` (lines 244-250), replace `'functions.discountRules'` with `'analytics.pixel'`:

```ts
    for (const type of ['analytics.pixel', 'theme.section'] as const) {
```

6. In the declarative-pricing describe (lines 260-314): the two `needs_runtime` cases still pass (declarative check fires before the activation gate — both honest). The last test `'functions.discountRules with a REAL Function mechanism stays deployable (gate is narrow)'` (lines 301-313) now hits the activation gate; replace its assertions with the co-deploy variant so it still proves the pricing gate is narrow:

```ts
  it('functions.discountRules with a REAL Function mechanism passes the pricing gate (deployable under co-deploy)', () => {
    const spec = {
      type: 'functions.discountRules',
      name: 'Real discount',
      config: {
        rules: [{ when: {}, apply: { percentageOff: 10 } }],
        pricing: { model: 'single', mechanism: 'shopify-function-discount', discount: { kind: 'percentage', value: 10 } },
      },
    } as unknown as RecipeSpec;
    // Single-module path: gated by the ACTIVATION gap (not the pricing gate) —
    // the reason must be the activation one, proving the pricing gate is narrow.
    const single = classifyModulePublishability(spec, { deployedExtensions: deployed });
    expect(single.status).toBe('needs_runtime');
    expect(single.reasons.join(' ')).toMatch(/activation/i);
    // Blueprint co-deploy (which activates for itself): fully deployable.
    const coDeploy = classifyModulePublishability(spec, {
      deployedExtensions: deployed,
      activationHandledByCoDeploy: true,
    });
    expect(coDeploy.status).toBe('deployable');
    expect(coDeploy.willDeploy).toBe(true);
  });
```

7. The false-publish integrity loop (lines 207-234) only inspects types with `willDeploy === true`, so the newly gated types are skipped automatically — no edit needed there.

In `apps/web/app/__tests__/blueprint-deployability.test.ts:51-60`, the guardrail must assert the context blueprints actually publish under — replace the `classifyModulePublishability` call with:

```ts
        const preflight = classifyModulePublishability(
          { type: member.moduleType } as RecipeSpec,
          // Blueprint members publish via BlueprintService.publishBlueprint, which
          // passes activationHandledByCoDeploy (it runs the activation mutations
          // itself — activateCartTransform / ensureAutomaticBundleDiscount).
          { deployedExtensions: deployed, activationHandledByCoDeploy: true },
        );
```

In `apps/web/app/__tests__/publish-functions-reliability.test.ts:49-61` (`'blocks a function type whose extension is not deployed (fail loudly)'`), the second half asserted deployable-with-handle; update to the new honest state:

```ts
  it('blocks a function type whose extension is not deployed (fail loudly)', () => {
    const spec = specForType('functions.discountRules');
    if (!spec) return;
    const blocked = classifyModulePublishability(spec, { deployedExtensions: [] });
    expect(blocked.status).toBe('needs_runtime');
    expect(blocked.requiresExtension).toBe(FUNCTION_EXTENSION_HANDLES['functions.discountRules']);

    // With the wasm deployed the single-module path is STILL gated: the Shopify
    // activation object is unwired (WS-QF / D6 step 1) — honest, not silent.
    const activationGated = classifyModulePublishability(spec, {
      deployedExtensions: [FUNCTION_EXTENSION_HANDLES['functions.discountRules']!],
    });
    expect(activationGated.status).toBe('needs_runtime');
    expect(activationGated.reasons.join(' ')).toMatch(/activation/i);

    // Blueprint co-deploy (which performs activation itself) stays deployable.
    const ok = classifyModulePublishability(spec, {
      deployedExtensions: [FUNCTION_EXTENSION_HANDLES['functions.discountRules']!],
      activationHandledByCoDeploy: true,
    });
    expect(ok.status).toBe('deployable');
    expect(ok.willDeploy).toBe(true);
  });
```

- [ ] **Step 7: Run every touched suite**

Run: `pnpm --filter @superapp/core build && cd apps/web && pnpm vitest run app/__tests__/module-deployability-audit.test.ts app/__tests__/blueprint-deployability.test.ts app/__tests__/publish-functions-reliability.test.ts app/__tests__/blueprint-co-deploy.test.ts app/__tests__/publish-preflight.test.ts app/__tests__/publish-contract-drift.test.ts`
Expected: ALL PASS. (`blueprint-co-deploy` exercises `BlueprintService.publishBlueprint`, which now passes the flag — it must stay green with no edits. If it fails, the flag plumbing in Step 4 is wrong; fix the plumbing, do not edit that test.)

Note the intended merchant-visible behavior change: the Builder validate tab (`generate._index.tsx` uses `classifyModulePublishability` in its `validate` intent) and `/api/publish` now honestly report these six types as not-yet-deployable with the activation reason, instead of false-publishing.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/extension-eligibility.ts apps/web/app/services/publish/publish-preflight.server.ts apps/web/app/services/publish/publish.service.ts apps/web/app/services/blueprints/blueprint.service.ts apps/web/app/__tests__/module-deployability-audit.test.ts apps/web/app/__tests__/blueprint-deployability.test.ts apps/web/app/__tests__/publish-functions-reliability.test.ts
git commit -m "fix(publish): gate activation-unwired function types needs_runtime (D6 step 1)

Single-module publish of the six wasm-backed function types wrote a config
metaobject but never created the Shopify activation object, so modules
false-published. Blueprint co-deploy keeps working via
activationHandledByCoDeploy. WS-E reverts this gate type-by-type.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Commit (don't cancel) the pending delete on unmount

`apps/web/app/routes/modules._index.tsx:199` — the unmount cleanup `useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, [])` clears the 6-second undo timer, so navigating away inside the undo window silently cancels the delete the merchant confirmed. On unmount the pending delete must COMMIT (fire the POSTs, `keepalive` so navigation doesn't kill them); Undo keeps working while mounted. (No `<StrictMode>` in `entry.client.tsx`/`root.tsx`, so cleanup only runs on real unmount.)

**Files:**
- Create: `apps/web/app/utils/pending-delete.ts`
- Create: `apps/web/app/__tests__/pending-delete.test.ts`
- Modify: `apps/web/app/routes/modules._index.tsx:198-199`

**Interfaces:**
- Produces: `commitPendingDeletes(ids: string[], fetchImpl?: typeof fetch): void` — fire-and-forget POST `/api/modules/:id/delete` per id with `keepalive: true`; rejections swallowed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/pending-delete.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { commitPendingDeletes } from '~/utils/pending-delete';

describe('commitPendingDeletes', () => {
  it('fires one keepalive POST per pending module id', () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    commitPendingDeletes(['m1', 'm2'], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/modules/m1/delete',
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'same-origin' }),
    );
    expect(fetchImpl).toHaveBeenCalledWith('/api/modules/m2/delete', expect.anything());
  });

  it('swallows rejections (unmount path must never throw)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network gone');
    });
    expect(() => commitPendingDeletes(['m1'], fetchImpl as unknown as typeof fetch)).not.toThrow();
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 0));
  });

  it('no-ops on an empty id list', () => {
    const fetchImpl = vi.fn();
    commitPendingDeletes([], fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/pending-delete.test.ts`
Expected: FAIL — module `~/utils/pending-delete` not found.

- [ ] **Step 3: Implement the helper**

Create `apps/web/app/utils/pending-delete.ts`:

```ts
/**
 * Commit an undo-window pending delete when its owning component unmounts.
 *
 * The modules index shows a 6s "Undo" window after a confirmed delete; while it
 * is open the row is only hidden optimistically. If the merchant navigates away
 * before the timer fires, the delete must COMMIT (they confirmed it) — not
 * silently cancel. `keepalive: true` lets the browser finish the POST during
 * navigation. Fire-and-forget: the component is gone, so there is nothing to
 * toast — rejections are swallowed.
 */
export function commitPendingDeletes(ids: string[], fetchImpl: typeof fetch = fetch): void {
  for (const id of ids) {
    void fetchImpl(`/api/modules/${id}/delete`, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { Accept: 'application/json' },
    }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm vitest run app/__tests__/pending-delete.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the unmount cleanup**

In `apps/web/app/routes/modules._index.tsx`, add the import near the other `~/utils` imports:

```ts
import { commitPendingDeletes } from '~/utils/pending-delete';
```

Replace lines 198-199:

```ts
  // Never let an undo timer fire after the component tears down.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
```

with:

```ts
  // Unmount: COMMIT the pending delete, don't cancel it. The merchant confirmed
  // the delete; navigating away inside the undo window must not silently undo it.
  // (Undo while mounted still works via undoPending — this only runs on teardown.)
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const cur = pendingRef.current;
      pendingRef.current = null;
      if (cur) commitPendingDeletes(cur.ids);
    },
    [],
  );
```

- [ ] **Step 6: Verify nothing else regressed in the route's suites**

Run: `cd apps/web && pnpm vitest run app/__tests__/pending-delete.test.ts app/__tests__/merchant-auth-guards.test.ts`
Expected: PASS. Also run a quick typecheck of the touched file: `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json` (or the project's `pnpm typecheck` if defined) — no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/utils/pending-delete.ts apps/web/app/routes/modules._index.tsx apps/web/app/__tests__/pending-delete.test.ts
git commit -m "fix(modules): commit pending delete on unmount instead of silently cancelling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Stream route honest failure + single billing

Three verified defects, fixed together because they share one contract:
1. **Server** — `apps/web/app/routes/api.ai.create-module.stream.tsx:378` calls `jobs.succeed` even when `validCount === 0`; no terminal error frame is sent, so the client can't tell "finished with nothing" from "worked".
2. **Billing** — `optionCallBillableUnits(idx)` (`apps/web/app/services/ai/llm.server.ts:751-753`) bills index 0 whether it succeeded or failed (call sites 1772/1791 stream, 2016/2030 parallel). A fully-failed generation still bills 1 unit, and `QuotaService.countUsage` sums `requestCount` over ALL `AiUsage` rows (`quota.service.ts:72-78`) — so `RECIPE_GENERATION_OPTION_FAILED` rows with `requestCount: 1` count against quota.
3. **Client** — `generate._index.tsx:610-622`: an `error` SSE frame throws into the catch, which auto-refires the full generation via the batch route (`/api/ai/create-module`) — a second billable request. Decision of record for this plan: **no auto-refire after a server-terminal error frame; show an honest retry UI.** The batch fallback survives ONLY for transport failure (SSE unreachable/`!res.ok`), where combined with fix 2 the stream leg billed 0 — so the merchant pays at most once in every path and no correlation-id dedupe is needed.

**Files:**
- Modify: `apps/web/app/services/ai/llm.server.ts` (replace `optionCallBillableUnits`, lines 751-753 + call sites 1772, 1791, 2016, 2030; state instantiation in `generateValidatedRecipeOptionsStream` before line 1681 and in `generateValidatedRecipeOptionsParallel` before line 1925)
- Rewrite: `apps/web/app/__tests__/option-call-billable-units.test.ts`
- Create: `apps/web/app/services/ai/generation-outcome.server.ts`
- Create: `apps/web/app/__tests__/generation-outcome.test.ts`
- Create: `apps/web/app/__tests__/create-module-stream.route.test.ts`
- Modify: `apps/web/app/routes/api.ai.create-module.stream.tsx:378`
- Create: `apps/web/app/utils/generation-outcome.ts` (client decision helper)
- Modify: `apps/web/app/routes/generate._index.tsx` (phase union line 428, streamGenerate lines 548-624, render line 832, new `GenFailed` component)

**Interfaces:**
- Produces (`llm.server.ts`): `type GenerationBillingState = { charged: boolean }`; `newGenerationBillingState(): GenerationBillingState`; `claimOptionBillableUnit(state, outcome: 'ok' | 'failed'): number`. `optionCallBillableUnits` is DELETED (only consumers were the four call sites + its test — verified by grep).
- Produces (`generation-outcome.server.ts`): `finalizeGenerationJob(jobs: Pick<JobService,'succeed'|'fail'>, jobId: string, validCount: number, meta: Record<string, unknown>): Promise<{ kind: 'succeeded' } | { kind: 'failed'; code: 'NO_VALID_OPTIONS'; message: string }>`.
- Produces (`utils/generation-outcome.ts`): `nextStepAfterStream({ gotAny, sawErrorFrame, transportFailed }): 'proceed' | 'show-retry' | 'batch-fallback'`.
- SSE contract addition: terminal frame `event: error`, `data: { code: 'NO_VALID_OPTIONS', message }` when a completed stream produced 0 valid options.

- [ ] **Step 1: Rewrite the billing-unit test (failing)**

Replace the entire contents of `apps/web/app/__tests__/option-call-billable-units.test.ts` with:

```ts
/**
 * Billing contract for fan-out option generation (WS-QF / AI-2):
 *  - Exactly ONE billable unit per merchant request, claimed by the FIRST
 *    SUCCESSFUL option call (argument evaluation is synchronous, so the
 *    check-and-set can't race across the parallel option tasks).
 *  - FAILED option calls NEVER bill. QuotaService.countUsage sums requestCount
 *    over all AiUsage rows, so a requestCount:1 on a RECIPE_GENERATION_OPTION_FAILED
 *    row would charge quota for a generation the merchant never received.
 *  - A request where every option fails bills 0 units (regression guard).
 */
import { describe, it, expect } from 'vitest';
import { newGenerationBillingState, claimOptionBillableUnit } from '~/services/ai/llm.server';

describe('claimOptionBillableUnit', () => {
  it('bills exactly 1 unit across three successful options', () => {
    const state = newGenerationBillingState();
    const units = ['ok', 'ok', 'ok'].map((o) => claimOptionBillableUnit(state, o as 'ok'));
    expect(units).toEqual([1, 0, 0]);
  });

  it('a failed option never bills; the first SUCCESS claims the unit', () => {
    const state = newGenerationBillingState();
    expect(claimOptionBillableUnit(state, 'failed')).toBe(0);
    expect(claimOptionBillableUnit(state, 'ok')).toBe(1);
    expect(claimOptionBillableUnit(state, 'ok')).toBe(0);
  });

  it('REGRESSION: a fully-failed generation bills 0 units (never counted by QuotaService)', () => {
    const state = newGenerationBillingState();
    const total = ['failed', 'failed', 'failed']
      .map((o) => claimOptionBillableUnit(state, o as 'failed'))
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it('single-option request with a success bills exactly 1', () => {
    const state = newGenerationBillingState();
    expect(claimOptionBillableUnit(state, 'ok')).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/option-call-billable-units.test.ts`
Expected: FAIL — `newGenerationBillingState`/`claimOptionBillableUnit` are not exported.

- [ ] **Step 3: Implement the billing change in llm.server.ts**

Replace `optionCallBillableUnits` (`apps/web/app/services/ai/llm.server.ts:751-753`, keep its preceding doc comment context) with:

```ts
/**
 * Per-request option-billing state. Exactly ONE billable unit per merchant
 * request — claimed by the FIRST SUCCESSFUL option call. Failed option calls
 * never bill (their AiUsage rows carry requestCount 0, so QuotaService's
 * requestCount sum can't charge quota for a generation the merchant never got).
 * Claiming is synchronous (argument evaluation), so the parallel option tasks
 * cannot race the check-and-set.
 */
export type GenerationBillingState = { charged: boolean };

export function newGenerationBillingState(): GenerationBillingState {
  return { charged: false };
}

export function claimOptionBillableUnit(state: GenerationBillingState, outcome: 'ok' | 'failed'): number {
  if (outcome === 'failed' || state.charged) return 0;
  state.charged = true;
  return 1;
}
```

Then wire the four call sites:

1. In `generateValidatedRecipeOptionsStream`, immediately before `const tasks: Promise<OneResult>[] = APPROACH_HINTS.slice(0, optionCount).map(...)` (line 1681), add:

```ts
  const billing = newGenerationBillingState();
```

- Success record (line 1772): `requestCount: optionCallBillableUnits(idx),` → `requestCount: claimOptionBillableUnit(billing, 'ok'),`
- Failure record (line 1791): → `requestCount: claimOptionBillableUnit(billing, 'failed'),`

2. In `generateValidatedRecipeOptionsParallel`, immediately before `const calls = APPROACH_HINTS.slice(0, optionCount).map(...)` (line 1925), add the same `const billing = newGenerationBillingState();`
- Success record (line 2016): → `requestCount: claimOptionBillableUnit(billing, 'ok'),`
- Failure record (line 2030): → `requestCount: claimOptionBillableUnit(billing, 'failed'),`

3. Delete the old `optionCallBillableUnits` function entirely. Explicit edit list for straggler references: the record-ai-usage-resilience test references it only in a comment — update that comment to say `claimOptionBillableUnit`; and `llm.server.ts:2722` (a comment mentioning `optionCallBillableUnits`) — update it likewise. Grep to confirm no stragglers: `grep -rn optionCallBillableUnits apps/web/app` must return nothing.

- [ ] **Step 4: Run billing tests**

Run: `cd apps/web && pnpm vitest run app/__tests__/option-call-billable-units.test.ts app/__tests__/record-ai-usage-resilience.test.ts app/__tests__/ai-generate-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing finalize-helper test**

Create `apps/web/app/__tests__/generation-outcome.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { nextStepAfterStream } from '~/utils/generation-outcome';

describe('finalizeGenerationJob', () => {
  it('fails the job and returns a typed terminal error when 0 options validated', async () => {
    const jobs = { succeed: vi.fn(async () => {}), fail: vi.fn(async () => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 0, { type: 'theme.section' });
    expect(terminal).toMatchObject({ kind: 'failed', code: 'NO_VALID_OPTIONS' });
    expect(jobs.fail).toHaveBeenCalledTimes(1);
    expect(jobs.fail.mock.calls[0]![0]).toBe('job-1');
    expect(String(jobs.fail.mock.calls[0]![1])).toMatch(/NO_VALID_OPTIONS/);
    expect(jobs.succeed).not.toHaveBeenCalled();
  });

  it('succeeds the job with the option count when ≥1 option validated', async () => {
    const jobs = { succeed: vi.fn(async () => {}), fail: vi.fn(async () => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 2, { type: 'theme.section' });
    expect(terminal).toEqual({ kind: 'succeeded' });
    expect(jobs.succeed).toHaveBeenCalledWith('job-1', expect.objectContaining({ optionCount: 2, type: 'theme.section' }));
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});

describe('nextStepAfterStream (client decision)', () => {
  it('proceeds when any option arrived', () => {
    expect(nextStepAfterStream({ gotAny: true, sawErrorFrame: false, transportFailed: false })).toBe('proceed');
    expect(nextStepAfterStream({ gotAny: true, sawErrorFrame: true, transportFailed: false })).toBe('proceed');
  });

  it('NEVER auto-refires after a server terminal error frame (double-billing guard)', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: true, transportFailed: false })).toBe('show-retry');
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: true, transportFailed: true })).toBe('show-retry');
  });

  it('falls back to the batch route only on pure transport failure', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: true })).toBe('batch-fallback');
  });

  it('empty stream with no error frame and no transport failure → honest retry (no silent refire)', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: false })).toBe('show-retry');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/generation-outcome.test.ts`
Expected: FAIL — both modules missing.

- [ ] **Step 7: Implement both helpers**

Create `apps/web/app/services/ai/generation-outcome.server.ts`:

```ts
import type { JobService } from '~/services/jobs/job.service';

export type StreamTerminal =
  | { kind: 'succeeded' }
  | { kind: 'failed'; code: 'NO_VALID_OPTIONS'; message: string };

/**
 * Terminal job state for a generation request (WS-QF / AI-2). A stream that
 * completes with 0 valid options is a FAILURE: jobs.fail + a typed terminal
 * error frame — never jobs.succeed (which hid total failure from ops and let
 * the client silently re-bill via the batch route).
 */
export async function finalizeGenerationJob(
  jobs: Pick<JobService, 'succeed' | 'fail'>,
  jobId: string,
  validCount: number,
  meta: Record<string, unknown>,
): Promise<StreamTerminal> {
  if (validCount === 0) {
    const message = 'Generation produced 0 valid options.';
    await jobs.fail(jobId, new Error(`NO_VALID_OPTIONS: ${message}`));
    return { kind: 'failed', code: 'NO_VALID_OPTIONS', message };
  }
  await jobs.succeed(jobId, { optionCount: validCount, ...meta });
  return { kind: 'succeeded' };
}
```

Create `apps/web/app/utils/generation-outcome.ts`:

```ts
export type StreamOutcomeInput = {
  /** At least one `option` frame arrived and rendered. */
  gotAny: boolean;
  /** The server sent a terminal `error` SSE frame (it ran and finished — retrying is a NEW billable request). */
  sawErrorFrame: boolean;
  /** The SSE transport itself failed (fetch rejected / !res.ok / no body) — the stream leg billed nothing. */
  transportFailed: boolean;
};

export type StreamNextStep = 'proceed' | 'show-retry' | 'batch-fallback';

/**
 * What the generate UI does after the stream ends (WS-QF / AI-2). A server
 * terminal error means the generation RAN and failed — auto-refiring the batch
 * route would silently start a second billable request, so the merchant gets an
 * honest retry UI instead. The batch fallback survives only for transport
 * failure, where the stream request never generated (and billed 0).
 */
export function nextStepAfterStream(o: StreamOutcomeInput): StreamNextStep {
  if (o.gotAny) return 'proceed';
  if (o.sawErrorFrame) return 'show-retry';
  if (o.transportFailed) return 'batch-fallback';
  return 'show-retry';
}
```

- [ ] **Step 8: Run helper tests**

Run: `cd apps/web && pnpm vitest run app/__tests__/generation-outcome.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing stream-route test**

Create `apps/web/app/__tests__/create-module-stream.route.test.ts`:

```ts
/**
 * WS-QF / AI-2: the SSE route must jobs.fail + emit a terminal `error` frame
 * (code NO_VALID_OPTIONS) when a completed stream validated 0 options — and
 * still jobs.succeed on the happy path. Everything heavy is mocked; the real
 * code under test is the route's terminal handling (finalizeGenerationJob wiring).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin: {} })),
  enforceRateLimit: vi.fn(async () => {}),
  streamEvents: [] as Array<Record<string, unknown>>,
  jobCreate: vi.fn(async () => ({ id: 'job-1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  quotaEnforce: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/services/ai/llm.server', () => ({
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
  },
  getLlmClient: vi.fn(),
  attributeServedCost: vi.fn(),
  recordAiUsage: vi.fn(),
  generateValidatedBlueprint: vi.fn(),
  generateValidatedRecipeOptionsStream: async function* () {
    for (const ev of hoisted.streamEvents) yield ev;
  },
}));
vi.mock('~/services/ai/option-ranking.server', () => ({
  rankOptions: vi.fn(() => ({ recommendedIndex: 0, scores: [{ index: 0, score: 1, badges: [] }] })),
}));
vi.mock('~/services/observability/ai-usage.service', () => ({ AiUsageService: class {} }));
vi.mock('~/services/ai/judge-polish.server', () => ({
  isJudgePolishEnabled: () => false,
  judgeAndPolishOption: vi.fn(),
  polishIsNotWorse: vi.fn(),
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ shop: { upsert: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })) } }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    start = hoisted.jobStart;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.quotaEnforce;
  },
}));
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: class {
    refreshPlanTier = vi.fn(async () => 'BASIC');
  },
}));
vi.mock('~/services/ai/classify.server', () => ({
  classifyUserIntent: vi.fn(async () => ({ moduleType: 'admin.block' })),
  CONFIDENCE_THRESHOLDS: { DIRECT: 0.8, WITH_ALTERNATIVES: 0.5 },
}));
vi.mock('~/services/ai/cheap-classifier.server', () => ({
  augmentWithCheapClassifier: vi.fn(async (c: unknown) => c),
}));
vi.mock('~/services/ai/intent-packet.server', () => ({
  buildIntentPacket: vi.fn(() => ({
    classification: { intent: 'test', surface: 'ADMIN', confidence: 0.9, alternatives: [], reasons: [] },
    routing: { prompt_profile: 'default' },
  })),
}));
vi.mock('~/services/ai/token-budget.server', () => ({ serializeIntentPacketForPrompt: vi.fn(() => '{}') }));
vi.mock('~/services/ai/prompt-router.server', () => ({ buildPromptRouterDecision: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/requirement-spec.server', () => ({ extractRequirementSpec: vi.fn(async () => ({})) }));
vi.mock('~/services/ai/solution-search.server', () => ({
  searchSolutions: vi.fn(() => ({ grounding: '', exemplar: null })),
}));
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic: vi.fn(async () => {}) }));
vi.mock('~/services/theme/apply-store-palette.server', () => ({ applyStorePalette: vi.fn() }));
vi.mock('~/services/ai/apply-style-pack.server', () => ({ applyStylePackTokens: vi.fn() }));
vi.mock('~/services/ai/apply-composition.server', () => ({ applyCompositionRules: vi.fn() }));
vi.mock('~/services/ai/design-reference.server', () => ({ loadStoreAesthetic: vi.fn(async () => null) }));
vi.mock('~/services/ai/blueprint-planner', () => ({ planBlueprint: vi.fn(() => ({ kind: 'single' })) }));
vi.mock('~/env.server', () => ({ isBlueprintsEnabled: () => false }));

function streamRequest() {
  const fd = new FormData();
  fd.set('prompt', 'a size guide');
  return new Request('https://app.test/api/ai/create-module/stream', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.streamEvents = [];
});

describe('api.ai.create-module.stream terminal handling', () => {
  it('0 valid options → jobs.fail + terminal error frame NO_VALID_OPTIONS (never succeed)', async () => {
    hoisted.streamEvents = [
      { kind: 'started', index: 0, approach: 'A', total: 3 },
      { kind: 'option_failed', index: 0, approach: 'A', error: 'invalid' },
      { kind: 'done', valid: 0, total: 3 },
    ];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    const body = await res.text();
    expect(body).toContain('event: error');
    expect(body).toContain('NO_VALID_OPTIONS');
    expect(hoisted.jobFail).toHaveBeenCalledTimes(1);
    expect(hoisted.jobSucceed).not.toHaveBeenCalled();
  });

  it('≥1 valid option → jobs.succeed, no error frame', async () => {
    hoisted.streamEvents = [
      { kind: 'started', index: 0, approach: 'A', total: 3 },
      {
        kind: 'option',
        index: 0,
        approach: 'A',
        option: { explanation: 'e', recipe: { type: 'admin.block', name: 'X' } },
      },
      { kind: 'done', valid: 1, total: 3 },
    ];
    const { action } = await import('~/routes/api.ai.create-module.stream');
    const res = await action({ request: streamRequest() });
    const body = await res.text();
    expect(body).toContain('event: option');
    expect(body).not.toContain('event: error');
    expect(hoisted.jobSucceed).toHaveBeenCalledWith('job-1', expect.objectContaining({ optionCount: 1 }));
    expect(hoisted.jobFail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run it to verify the first case fails**

Run: `cd apps/web && pnpm vitest run app/__tests__/create-module-stream.route.test.ts`
Expected: FAIL — 0-options case gets `jobs.succeed` and no `event: error`. (The happy-path case should already pass.)

- [ ] **Step 11: Wire the route**

In `apps/web/app/routes/api.ai.create-module.stream.tsx`, add the import:

```ts
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
```

Replace line 378:

```ts
        await jobs.succeed(job.id, { optionCount: validCount, type: classification.moduleType });
```

with:

```ts
        // WS-QF / AI-2: 0 valid options is a FAILURE — jobs.fail + a typed
        // terminal error frame so the client shows retry instead of silently
        // re-running (and re-billing) the whole generation via the batch route.
        const terminal = await finalizeGenerationJob(jobs, job.id, validCount, {
          type: classification.moduleType,
        });
        if (terminal.kind === 'failed') {
          send('error', {
            code: terminal.code,
            message: `${terminal.message} Please try again — this attempt was not billed.`,
          });
        }
```

- [ ] **Step 12: Run the route test to verify it passes**

Run: `cd apps/web && pnpm vitest run app/__tests__/create-module-stream.route.test.ts`
Expected: PASS (both cases).

- [ ] **Step 13: Wire the client (honest retry UI, no auto-refire)**

In `apps/web/app/routes/generate._index.tsx`:

1. Import the helper (top of file, with the other `~/utils` imports):

```ts
import { nextStepAfterStream } from '~/utils/generation-outcome';
```

2. Extend the phase union (line 428) and add error state right below it:

```ts
  const [phase, setPhase] = useState<'generating' | 'choosing' | 'ready' | 'failed'>('generating');
  const [genError, setGenError] = useState<string | null>(null);
```

3. Rework `streamGenerate` (lines 548-624). Inside the frame loop, replace the terminal-error branch (lines 610-612):

```ts
              } else if (ev === 'error') {
                throw new Error(payload.message || 'Generation failed');
              }
```

with (declare `let sawErrorFrame: string | null = null;` next to `let gotAny = false;` at line 556):

```ts
              } else if (ev === 'error') {
                // Server-terminal failure: the generation RAN and produced nothing.
                // Do NOT throw into the transport catch — that path auto-refires
                // the batch route and bills a second request.
                sawErrorFrame = payload.message || 'Generation failed';
              }
```

Then replace the tail of the function (lines 618-622):

```ts
      if (!gotAny) throw new Error('no options streamed');
    } catch {
      // Batch fallback — only if streaming produced nothing usable.
      if (!gotAny) proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
    }
```

with:

```ts
      const next = nextStepAfterStream({ gotAny, sawErrorFrame: sawErrorFrame != null, transportFailed: false });
      if (next === 'show-retry') {
        setGenError(sawErrorFrame ?? 'The AI returned no valid concepts.');
        genStartedRef.current = false;
        setPhase('failed');
      }
      // next === 'proceed' → applyOptions already rendered the chooser.
    } catch {
      // Transport failure only (SSE unreachable / !res.ok / no body): the stream
      // leg billed nothing, so the proven batch route is a safe single retry.
      const next = nextStepAfterStream({ gotAny, sawErrorFrame: false, transportFailed: true });
      if (next === 'batch-fallback') {
        proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
      }
    }
```

4. Reset the error on regenerate — in `regenerate` (lines 784-792) add `setGenError(null);` before `setPhase('generating');`.

5. Add the render branch after line 832 (`if (phase === 'generating') ...`):

```ts
  if (phase === 'failed') return <GenFailed prompt={seedPrompt} message={genError} onRetry={regenerate} onCancel={() => navigate('/modules')} />;
```

6. Add the component next to `GenLoading` (after line 943), reusing the existing `gen-*` classes:

```tsx
function GenFailed({ prompt, message, onRetry, onCancel }: any) {
  return (
    <div className="gen-loading">
      <div className="gen-loading-card">
        <div className="gen-loading-eyebrow"><span className="pulse-dot" />Generation failed</div>
        <div className="t-h2" style={{ marginTop: 6, textAlign: 'center' }}>No concepts this time</div>
        <div className="gen-prompt-echo">“{prompt}”</div>
        <p style={{ textAlign: 'center', margin: '12px 0 4px' }}>
          {message || 'The AI returned no valid concepts.'} This attempt was not billed.
        </p>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onRetry}>Try again</button>
        <button className="btn btn-plain btn-plain-subdued" style={{ marginTop: 8 }} onClick={onCancel}>Back to modules</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Full Task-5 verification**

Run: `cd apps/web && pnpm vitest run app/__tests__/option-call-billable-units.test.ts app/__tests__/generation-outcome.test.ts app/__tests__/create-module-stream.route.test.ts app/__tests__/record-ai-usage-resilience.test.ts app/__tests__/ai-generate-options.test.ts app/__tests__/fallback-cost-attribution.test.ts`
Expected: PASS. Then typecheck: `cd apps/web && pnpm exec tsc --noEmit` — no new errors in `generate._index.tsx`.

- [ ] **Step 15: Commit**

```bash
git add apps/web/app/services/ai/llm.server.ts apps/web/app/services/ai/generation-outcome.server.ts apps/web/app/utils/generation-outcome.ts apps/web/app/routes/api.ai.create-module.stream.tsx apps/web/app/routes/generate._index.tsx apps/web/app/__tests__/option-call-billable-units.test.ts apps/web/app/__tests__/generation-outcome.test.ts apps/web/app/__tests__/create-module-stream.route.test.ts apps/web/app/__tests__/record-ai-usage-resilience.test.ts
git commit -m "fix(ai): honest stream failure (jobs.fail + error frame) and single billing per request

0-option streams now fail the job and emit a typed NO_VALID_OPTIONS frame;
the client shows a retry UI instead of silently re-billing via the batch
route; failed option calls never carry a billable requestCount.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Close the module-quota enforcement holes

Verified reality (differs slightly from the original finding): `moduleCount` (plan caps 3/20/100/1000, counting **PUBLISHED** modules — `quota.service.ts:93-98`) IS enforced on the merchant save path (`api.ai.create-module-from-recipe.tsx:38`), from-template (`api.modules.from-template.tsx:101`), and blueprint create (`api.ai.create-blueprint.tsx:47`). The genuine holes: **(a)** `api.publish.tsx` — the exact place the PUBLISHED count grows — has no check at all, so unlimited drafts can be published past the cap; **(b)** the agent API create (`api.agent.modules.tsx:69`) and **(c)** the duplicate action (`modules.$moduleId.tsx:252`) create drafts with no check, unlike every other create path. Fix all three. Publish needs a dedicated check that **excludes the module being published** so re-publishing an already-published module at cap never blocks.

**Files:**
- Modify: `apps/web/app/services/billing/quota.service.ts` (new method after `enforce`, line 35)
- Modify: `apps/web/app/__tests__/billing-quota.test.ts` (append describe)
- Modify: `apps/web/app/routes/api.publish.tsx` (imports; insert before `jobs.create`, line 207)
- Modify: `apps/web/app/routes/api.agent.modules.tsx:63-79`
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (duplicate branch, before line 252)
- Create: `apps/web/app/__tests__/agent-modules-quota.route.test.ts`

**Interfaces:**
- Produces: `QuotaService.enforcePublishCap(shopId: string, moduleId: string): Promise<void>` — throws `AppError` code `RATE_LIMITED` when publishing `moduleId` would exceed the plan's published-module cap (counts `PUBLISHED` modules with `id != moduleId`; `-1` = unlimited).
- Consumes: `getPlanConfig`, `AppError`, prisma `module.count`.

- [ ] **Step 1: Write the failing service tests**

Append to `apps/web/app/__tests__/billing-quota.test.ts`:

```ts
describe('QuotaService.enforcePublishCap — publish-time published-module cap', () => {
  it('allows publishing when other published modules are under the cap', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: 3 }));
    hoisted.moduleCount.mockResolvedValue(2); // 2 OTHER published modules
    await expect(new QuotaService().enforcePublishCap('shop_1', 'mod_x')).resolves.toBeUndefined();
    // The count must EXCLUDE the module being published (re-publish never blocks).
    expect(hoisted.moduleCount).toHaveBeenCalledWith({
      where: { shopId: 'shop_1', status: 'PUBLISHED', id: { not: 'mod_x' } },
    });
  });

  it('blocks when publishing would exceed the cap (other published >= limit)', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: 3 }));
    hoisted.moduleCount.mockResolvedValue(3);
    try {
      await new QuotaService().enforcePublishCap('shop_1', 'mod_x');
      throw new Error('expected enforcePublishCap to throw');
    } catch (e) {
      const err = e as AppError;
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.message).toMatch(/Module limit reached/);
      expect(err.details).toMatchObject({ kind: 'moduleCount', used: '3', limit: '3' });
    }
  });

  it('never blocks on unlimited (-1) plans', async () => {
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: -1 }));
    await expect(new QuotaService().enforcePublishCap('shop_1', 'mod_x')).resolves.toBeUndefined();
    expect(hoisted.moduleCount).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run app/__tests__/billing-quota.test.ts`
Expected: FAIL — `enforcePublishCap` is not a function; pre-existing describes still pass.

- [ ] **Step 3: Implement the service method**

In `apps/web/app/services/billing/quota.service.ts`, add after `enforce` (line 35):

```ts
  /**
   * Publish-time published-module cap (WS-QF / Deploy-5). `moduleCount` counts
   * PUBLISHED modules, so /api/publish is exactly where the cap is crossed —
   * yet it had no check (unlimited drafts could be published past the plan cap).
   * Counts published modules EXCLUDING the one being published, so re-publishing
   * an already-published module at cap never blocks.
   */
  async enforcePublishCap(shopId: string, moduleId: string): Promise<void> {
    const prisma = getPrisma();
    const sub = await prisma.appSubscription.findUnique({ where: { shopId } });
    const planName = sub?.planName ?? 'FREE';
    const config = await getPlanConfig(planName);
    const limit = this.limitFor(config.quotas, 'moduleCount');
    if (limit === -1) return; // unlimited

    const publishedOthers = await prisma.module.count({
      where: { shopId, status: 'PUBLISHED', id: { not: moduleId } },
    });
    if (publishedOthers >= limit) {
      throw new AppError({
        code: 'RATE_LIMITED',
        message: `Module limit reached. You have ${publishedOthers}/${limit} published modules on the ${config.displayName} plan. Upgrade or unpublish an existing module to publish this one.`,
        details: { kind: 'moduleCount', used: String(publishedOthers), limit: String(limit), plan: planName },
      });
    }
  }
```

- [ ] **Step 4: Run service tests to verify they pass**

Run: `cd apps/web && pnpm vitest run app/__tests__/billing-quota.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing agent-create route test**

Create `apps/web/app/__tests__/agent-modules-quota.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '~/services/errors/app-error.server';
// A known-valid RecipeSpec: the route validates body.spec with the REAL
// RecipeSpecSchema, so use a shipped template spec rather than a hand-rolled one.
import { MODULE_TEMPLATES } from '@superapp/core';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  createDraft: vi.fn(async () => ({ id: 'mod-new', name: 'X', type: 'theme.section', status: 'DRAFT', versions: [{ version: 1 }] })),
  enforce: vi.fn(async () => {}),
  shopFindUnique: vi.fn(async () => ({ id: 'shop-1' })),
  log: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    createDraft = hoisted.createDraft;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.enforce;
  },
}));
vi.mock('~/db.server', () => ({ getPrisma: () => ({ shop: { findUnique: hoisted.shopFindUnique } }) }));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

function createRequest() {
  const spec = MODULE_TEMPLATES.find((t) => t.spec.type === 'theme.section')!.spec;
  return new Request('https://app.test/api/agent/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spec }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('api.agent.modules create quota', () => {
  it('enforces the moduleCount quota BEFORE creating the draft', async () => {
    hoisted.enforce.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Module limit reached. 3/3.' }),
    );
    const { action } = await import('~/routes/api.agent.modules');
    const res = await action({ request: createRequest() });
    expect(res.status).toBe(429);
    expect(hoisted.enforce).toHaveBeenCalledWith('shop-1', 'moduleCount');
    expect(hoisted.createDraft).not.toHaveBeenCalled();
  });

  it('creates the draft when under quota (201)', async () => {
    const { action } = await import('~/routes/api.agent.modules');
    const res = await action({ request: createRequest() });
    expect(res.status).toBe(201);
    expect(hoisted.createDraft).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && pnpm vitest run app/__tests__/agent-modules-quota.route.test.ts`
Expected: FAIL — quota never enforced, draft created anyway (first case gets 201).

- [ ] **Step 7: Wire the three routes**

**(a) `apps/web/app/routes/api.agent.modules.tsx`** — add imports:

```ts
import { QuotaService } from '~/services/billing/quota.service';
import { AppError } from '~/services/errors/app-error.server';
```

In `action`, move the shop lookup ABOVE the create and enforce the quota. Replace lines 68-79 (`const moduleService = ...` through the activity log) with:

```ts
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  // Same plan cap as every other create path (from-recipe / from-template / blueprint).
  if (shopRow) {
    try {
      await new QuotaService().enforce(shopRow.id, 'moduleCount');
    } catch (e) {
      if (e instanceof AppError && e.code === 'RATE_LIMITED') {
        return json({ error: e.message }, { status: 429 });
      }
      throw e;
    }
  }

  const moduleService = new ModuleService();
  const module = await moduleService.createDraft(session.shop, parsed.data);

  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'MODULE_CREATED',
    resource: `module:${module.id}`,
    shopId: shopRow?.id,
    details: { name: parsed.data.name, type: parsed.data.type, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});
```

**(b) `apps/web/app/routes/api.publish.tsx`** — add imports:

```ts
import { QuotaService } from '~/services/billing/quota.service';
import { AppError } from '~/services/errors/app-error.server';
```

Insert immediately BEFORE the `const jobs = new JobService();` block (line 207):

```ts
      // WS-QF / Deploy-5: the published-module cap is crossed HERE (moduleCount
      // counts PUBLISHED modules), so enforce it before any publish work.
      // Excludes this module from the count, so a re-publish at cap never blocks.
      if (shopRow) {
        try {
          await new QuotaService().enforcePublishCap(shopRow.id, module.id);
        } catch (e) {
          if (e instanceof AppError && e.code === 'RATE_LIMITED') {
            await logRequestOutcome({
              shopId: shopRow.id,
              pathOrIntent: '/api/publish',
              success: false,
              details: { error: e.message, moduleId: module.id },
            });
            return json({ error: e.message, code: 'MODULE_LIMIT_REACHED' }, { status: 429 });
          }
          throw e;
        }
      }
```

**(c) `apps/web/app/routes/modules.$moduleId.tsx`** — add the same two imports (`QuotaService`, `AppError`); in the `intent === 'duplicate'` branch, insert immediately BEFORE `const copy = await ms.createDraft(session.shop, { ...spec, name });` (line 252):

```ts
    // Same plan cap as every other create path.
    try {
      await new QuotaService().enforce(mod.shopId, 'moduleCount');
    } catch (e) {
      if (e instanceof AppError && e.code === 'RATE_LIMITED') {
        return json({ error: e.message }, { status: 429 });
      }
      throw e;
    }
```

- [ ] **Step 8: Run all Task-6 tests + touched-route suites**

Run: `cd apps/web && pnpm vitest run app/__tests__/billing-quota.test.ts app/__tests__/agent-modules-quota.route.test.ts app/__tests__/merchant-auth-guards.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, no new type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/services/billing/quota.service.ts apps/web/app/routes/api.publish.tsx apps/web/app/routes/api.agent.modules.tsx "apps/web/app/routes/modules.\$moduleId.tsx" apps/web/app/__tests__/billing-quota.test.ts apps/web/app/__tests__/agent-modules-quota.route.test.ts
git commit -m "fix(billing): enforce module cap at publish, agent create, and duplicate

moduleCount counts PUBLISHED modules but /api/publish never checked it;
agent-API create and module duplicate skipped the create-time check every
other path has. Re-publishing at cap never blocks (self excluded).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Activity service — `excludeActions` must not clobber `action`

`apps/web/app/services/activity/activity.service.ts:176-177` (note: path is `services/activity/`, not `services/`):

```ts
    if (opts.action) where.action = opts.action;
    if (opts.excludeActions && opts.excludeActions.length > 0) where.action = { notIn: opts.excludeActions };
```

A caller passing both gets the `action` filter silently overwritten. Combine them.

**Files:**
- Create: `apps/web/app/__tests__/activity-list-filters.test.ts`
- Modify: `apps/web/app/services/activity/activity.service.ts:175-177`

**Interfaces:**
- Produces: `ActivityLogService.list({ action, excludeActions })` builds `where.action = { equals: action, notIn: excludeActions }` when both are given; single-filter behavior unchanged.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/__tests__/activity-list-filters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  findMany: vi.fn(async () => []),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ activityLog: { findMany: hoisted.findMany } }),
}));
vi.mock('~/services/observability/correlation.server', () => ({
  getRequestContext: () => undefined,
}));
vi.mock('~/services/observability/telemetry-budget.server', () => ({
  applyTelemetryBudget: (d: unknown) => d,
}));

import { ActivityLogService } from '~/services/activity/activity.service';

beforeEach(() => vi.clearAllMocks());

function whereOfLastCall(): Record<string, unknown> {
  const args = hoisted.findMany.mock.calls.at(-1)?.[0] as { where: Record<string, unknown> };
  return args.where;
}

describe('ActivityLogService.list action filters', () => {
  it('action alone → exact match', async () => {
    await new ActivityLogService().list({ action: 'MODULE_PUBLISHED' });
    expect(whereOfLastCall().action).toBe('MODULE_PUBLISHED');
  });

  it('excludeActions alone → notIn', async () => {
    await new ActivityLogService().list({ excludeActions: ['PAGE_LOAD', 'APP_NAV'] });
    expect(whereOfLastCall().action).toEqual({ notIn: ['PAGE_LOAD', 'APP_NAV'] });
  });

  it('BOTH → combined (excludeActions must not clobber the action filter)', async () => {
    await new ActivityLogService().list({
      action: 'MODULE_PUBLISHED',
      excludeActions: ['PAGE_LOAD', 'APP_NAV'],
    });
    expect(whereOfLastCall().action).toEqual({
      equals: 'MODULE_PUBLISHED',
      notIn: ['PAGE_LOAD', 'APP_NAV'],
    });
  });

  it('empty excludeActions with action → exact match (no useless notIn)', async () => {
    await new ActivityLogService().list({ action: 'LOGIN', excludeActions: [] });
    expect(whereOfLastCall().action).toBe('LOGIN');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && pnpm vitest run app/__tests__/activity-list-filters.test.ts`
Expected: FAIL — the BOTH case yields `{ notIn: [...] }` with the `equals` clobbered.

- [ ] **Step 3: Implement the fix**

In `apps/web/app/services/activity/activity.service.ts`, replace lines 175-177:

```ts
    if (opts.actor) where.actor = opts.actor;
    if (opts.action) where.action = opts.action;
    if (opts.excludeActions && opts.excludeActions.length > 0) where.action = { notIn: opts.excludeActions };
```

with:

```ts
    if (opts.actor) where.actor = opts.actor;
    // action + excludeActions COMBINE — excludeActions must never clobber a
    // caller-supplied exact action filter.
    if (opts.excludeActions && opts.excludeActions.length > 0) {
      where.action = opts.action
        ? { equals: opts.action, notIn: opts.excludeActions }
        : { notIn: opts.excludeActions };
    } else if (opts.action) {
      where.action = opts.action;
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && pnpm vitest run app/__tests__/activity-list-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/activity/activity.service.ts apps/web/app/__tests__/activity-list-filters.test.ts
git commit -m "fix(activity): combine action + excludeActions filters instead of clobbering

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final gate (after all 7 tasks)

- [ ] Run the full web suite: `pnpm --filter @superapp/core build && cd apps/web && pnpm vitest run`
  - Expected: fully green — WS-B has already fixed the theme-check/catalog/control-packs reds; any red here is a WS-QF regression.
- [ ] Run `pnpm --filter @superapp/core test` (core's own suite) — green.
- [ ] `cd apps/web && pnpm exec tsc --noEmit` — no new type errors.

## Verification & scope-correction notes for the executor

- **Finding 6 correction (verified 2026-08-24):** the "main create-module save path" (`api.ai.create-module` + stream) does NOT persist modules — the save goes through `/api/ai/create-module-from-recipe`, which already enforces `moduleCount` (line 38). The real holes closed here are publish (`api.publish.tsx`), agent create (`api.agent.modules.tsx`), and duplicate (`modules.$moduleId.tsx`). Do not add a quota check to the generation routes — they correctly enforce `aiRequest` only.
- **Task 3 line refs drift:** line numbers cited are from `master@6af6df2`-era files; anchor edits on the quoted code, not the numbers.
- **Task 5 dedupe decision:** the plan removes the auto-refire (option "honest retry UI"), so correlation-id billing dedupe from the original finding is intentionally NOT built — the transport-only fallback plus zero-billing-on-failure already guarantees at-most-one billed unit per merchant attempt.
- **`agent publish` route** (`api.agent.modules.$moduleId.publish.tsx`) also lacks the publish cap; it is a thin wrapper — if trivially wireable during Task 6 add the same `enforcePublishCap` block, otherwise leave a note for WS-E (do not expand scope with new test scaffolding).

## Cross-review reconciliation (2026-08-24)

Edits applied from the cross-plan review:

- **C3** — Final gate expectation changed from "green except pre-existing reds (WS-B owns those)" to fully green: WS-B has already fixed the theme-check/catalog/control-packs reds, so any red in the final gate is a WS-QF regression.
- **D5** — Task 5 Step 3 item 3 now explicitly lists `llm.server.ts:2722` (a comment mentioning `optionCallBillableUnits`) alongside the record-ai-usage-resilience test comment in the straggler edit list; the `grep … must return nothing` gate stays.
