# WS-D — Shopify Conformance & Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app pass the Shopify App Store conformance gates (per-shop CSP, token-exchange auth, App Bridge in `<head>`) and replace the hand-rolled Billing API flow with Shopify App Pricing (Decision D3), then bump to Admin API 2026-07 and `@shopify/shopify-app-remix` v5.

**Architecture:** A new `entry.server.tsx` becomes the single choke point for document security headers (per-shop `frame-ancestors` for the embedded surface, `'none'` for `/internal`). Auth moves to Shopify managed installation + token exchange (already half-configured: `use_legacy_install_flow = false`). Billing inverts: Shopify hosts the plan-selection/charge UI (App Pricing, configured in the Partner Dashboard, not code); the app only *syncs* plan state — from the welcome-link redirect (`plan_handle` param) and from the Partner API `activeSubscription` query (the canonical source; App Pricing sends **no webhooks**) — into the existing `AppSubscription` row that `QuotaService` reads.

**Tech Stack:** Remix 2.17 (vite), `@shopify/shopify-app-remix` 3.8.5 → 5.x, Prisma, vitest, Shopify CLI, Partner API GraphQL (2026-07), Admin API 2026-04 → 2026-07.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-D bullet, Decisions D3 + D8; findings [Conf-1..4], [Deploy-4]). Doc grounding as of 2026-08-24: shopify.dev "Set up iframe protection", "Shopify App Pricing" (+ "Migrate to Shopify App Pricing", "Setup subscription charges", "Redirect to the plan selection page"), Partner API 2026-07 `activeSubscription`, shopify-app-remix v3/v4/v5 docs + future-flags pages, "Manage access scopes".

## Global Constraints

- Admin API target after Task 9: **2026-07** everywhere (master-plan global constraint; all current GraphQL ops already validate on it).
- Merchant UI: **Polaris web components only** (`s-*`); no new `@shopify/polaris` React imports in merchant routes.
- Route handlers ≤ 60s; no long work added to requests by this plan.
- WS-A has landed: config lives in `shopify.app.production.toml` (prod app, Railway URL, `automatically_update_urls_on_dev=false`) and `shopify.app.dev.toml` (separate dev app). Every `shopify app deploy` / `config validate` in this plan targets `--config production`; every `shopify app dev` runs the DEV app. Config edits apply to `shopify.app.production.toml` and are mirrored into `shopify.app.dev.toml`.
- App Pricing key facts (grounded, do NOT re-derive from memory):
  - Plans are configured in the **Partner Dashboard** (Distribution → Manage listing → Pricing content), not in code and not in `shopify.app.toml`.
  - **No webhooks.** `APP_SUBSCRIPTIONS_UPDATE` is not sent for App Pricing contracts. Plan state = welcome-link redirect params (`plan_handle`, `shop`) + Partner API `activeSubscription(appId:, shopId:)` (returns `null` when no active contract; Partner API rate limit 4 req/s).
  - Plan selection page URL: `https://admin.shopify.com/store/{storeHandle}/charges/{appHandle}/pricing_plans` — embedded apps must navigate the **top** window to it.
  - Partner API auth: `POST https://partners.shopify.com/{org_id}/api/2026-07/graphql.json` with `X-Shopify-Access-Token: {partner_api_client_token}`; the token needs the **Manage apps** permission and is org-scoped (a real secret — server-only env).
- Tier names/prices come from code (`PLAN_CONFIGS` in `apps/web/app/services/billing/billing.service.ts:24-90` + `docs/app.md:140-148`): FREE $0 (3 modules), STARTER $19/14-day trial (20), GROWTH $79/14-day trial (100), PRO $299/7-day trial (1000), ENTERPRISE "Contact us" (unlimited). **Note:** the WS-D brief said "SCALE"; the codebase has no SCALE tier — the 1000-module tier is `PRO`. Use the code names. ENTERPRISE is not listed in App Pricing (internal override only).
- `Shop.planTier` is the **Shopify shop plan** (Plus vs non-Plus, owned by `capability.service.ts`) — it is NOT the billing plan. Billing plan lives on `AppSubscription.planName`. Task 7 removes the one place that conflates them.

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/app/entry.server.tsx` (create) | Streaming SSR + document response headers (calls the helper below) |
| `apps/web/app/security-headers.server.ts` (create) | Route-aware CSP: `/internal` → `frame-ancestors 'none'`; else `addDocumentResponseHeaders` |
| `apps/web/app/components/EmbeddedHeadScripts.tsx` (create) | `<meta shopify-api-key>` + `app-bridge.js` + `polaris.js` head tags, correct order |
| `apps/web/app/services/billing/plan-handles.ts` (create) | App Pricing `plan_handle` ⇄ `BillingPlan` map |
| `apps/web/app/services/billing/plan-sync.service.ts` (create) | Partner API client + idempotent `AppSubscription` sync + sweep |
| `apps/web/app/routes/billing.callback.tsx` (create) | Welcome-link landing: verify via Partner API, sync, redirect to `/billing` |
| `apps/web/app/routes/billing._index.tsx` (rewrite) | Read-only plan display + usage + "Manage plan" → Shopify-hosted page |
| `apps/web/app/services/billing/billing.service.ts` (shrink) | Delete `createSubscription`; keep plan configs, `getActiveSubscription`, internal override |
| `apps/web/app/services/billing/quota.service.ts` (fix) | Honor `AppSubscription.status` when resolving the plan |
| `apps/web/app/shopify.server.ts`, `apps/web/app/root.tsx`, `shopify.app.production.toml` (mirrored into `shopify.app.dev.toml`), `extensions/*/shopify.extension.toml` | Conformance + version edits in place |

---

### Task 1: `entry.server.tsx` with per-shop CSP (App Store hard gate)

Why: `addDocumentResponseHeaders` (`apps/web/app/shopify.server.ts:41`) has **zero call sites** — no document response ever carries the per-shop `frame-ancestors` CSP that App Store review checks ("Set up iframe protection"). There is no `apps/web/app/entry.server.tsx`; Remix uses its built-in default. The installed helper (see `node_modules/@shopify/shopify-app-remix/dist/cjs/server/authenticate/helpers/add-response-headers.js`) sets `Content-Security-Policy: frame-ancestors https://{shop} https://admin.shopify.com …` when a valid `?shop=` param is present, and sets nothing for an embedded app when it's absent. Danger: `/internal` must keep `frame-ancestors 'none'` (`apps/web/app/routes/internal.tsx:26`) even if someone appends `?shop=x.myshopify.com` — so the helper must never run for `/internal` paths.

**Files:**
- Create: `apps/web/app/security-headers.server.ts`
- Create: `apps/web/app/entry.server.tsx`
- Modify: `apps/web/app/shopify.server.ts:40` (stale comment)
- Test: `apps/web/app/__tests__/security-headers.test.ts`

**Interfaces:**
- Produces: `applySecurityHeaders(request: Request, headers: Headers): void` — imported by `entry.server.tsx`.
- Consumes: `addDocumentResponseHeaders` from `~/shopify.server` (existing export).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/security-headers.test.ts
/**
 * applySecurityHeaders — the entry.server document-header hook.
 * /internal must ALWAYS be frame-ancestors 'none' (even with a ?shop= param —
 * otherwise a crafted link could make the internal admin frameable by a shop).
 * Everything else delegates to shopify-app-remix's addDocumentResponseHeaders.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  addDocumentResponseHeaders: vi.fn((request: Request, headers: Headers) => {
    // Mirror the real helper's observable behavior (embedded app):
    const shop = new URL(request.url).searchParams.get('shop');
    if (shop) {
      headers.set(
        'Content-Security-Policy',
        `frame-ancestors https://${shop} https://admin.shopify.com;`,
      );
    }
  }),
}));

vi.mock('~/shopify.server', () => ({
  addDocumentResponseHeaders: hoisted.addDocumentResponseHeaders,
}));

import { applySecurityHeaders } from '~/security-headers.server';

beforeEach(() => vi.clearAllMocks());

describe('applySecurityHeaders', () => {
  it('delegates embedded document requests to addDocumentResponseHeaders (per-shop CSP)', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/modules?shop=test-shop.myshopify.com&embedded=1'),
      headers,
    );
    expect(hoisted.addDocumentResponseHeaders).toHaveBeenCalledTimes(1);
    expect(headers.get('Content-Security-Policy')).toBe(
      'frame-ancestors https://test-shop.myshopify.com https://admin.shopify.com;',
    );
  });

  it("forces frame-ancestors 'none' on /internal and never calls the shopify helper", () => {
    const headers = new Headers();
    applySecurityHeaders(new Request('https://app.example.com/internal/login'), headers);
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it("keeps 'none' on /internal even when a shop param is appended", () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/internal/stores?shop=evil.myshopify.com'),
      headers,
    );
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/web test -- security-headers`
Expected: FAIL — `Cannot find module '~/security-headers.server'`.

- [ ] **Step 3: Implement the helper**

```ts
// apps/web/app/security-headers.server.ts
import { addDocumentResponseHeaders } from '~/shopify.server';

/**
 * Document-level security headers, applied in entry.server.tsx for every
 * server-rendered HTML response.
 *
 * - /internal is a standalone admin: always frame-ancestors 'none'
 *   (matches apps/web/app/routes/internal.tsx headers; guarded here so a
 *   ?shop= query param can never downgrade it via the shopify helper).
 * - Everything else gets shopify-app-remix's per-shop CSP + app-bridge
 *   preload Link header (App Store iframe-protection requirement).
 */
export function applySecurityHeaders(request: Request, headers: Headers): void {
  const { pathname } = new URL(request.url);
  if (pathname === '/internal' || pathname.startsWith('/internal/')) {
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return;
  }
  addDocumentResponseHeaders(request, headers);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/web test -- security-headers`
Expected: 3 passing.

- [ ] **Step 5: Create `entry.server.tsx`**

This is the standard shopify-app-remix streaming entry for Remix 2 on Node (the app's stack: `@remix-run/node` 2.17, React 18, vite, `remix-serve`). `isbot` is already a dependency (`apps/web/package.json` → `"isbot": "^5.1.42"`).

```tsx
// apps/web/app/entry.server.tsx
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { RemixServer } from '@remix-run/react';
import { createReadableStreamFromReadable } from '@remix-run/node';
import type { EntryContext } from '@remix-run/node';
import { isbot } from 'isbot';
import { applySecurityHeaders } from '~/security-headers.server';

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  applySecurityHeaders(request, responseHeaders);

  const userAgent = request.headers.get('user-agent');
  const callbackName = isbot(userAgent ?? '') ? 'onAllReady' : 'onShellReady';

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} abortDelay={streamTimeout} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );
    // Abort the render 1s after the stream timeout so the rejection above wins.
    setTimeout(abort, streamTimeout + 1000);
  });
}
```

Also update the stale comment at `apps/web/app/shopify.server.ts:40` to:
`// Document response headers (per-shop CSP) are applied in app/entry.server.tsx via applySecurityHeaders.`
(Keep the `boundary.headers` export in `root.tsx` — it still merges route headers on error responses; entry.server is the layer that adds the CSP.)

- [ ] **Step 6: Verify the app still builds and serves**

Run: `pnpm --dir apps/web typecheck && pnpm --dir apps/web build`
Expected: both green (a broken entry.server fails the build immediately).

- [ ] **Step 7: Verify headers on a live dev server**

Run `pnpm --dir apps/web dev` (or `shopify app dev`), then:

```bash
# /internal renders without auth and must be non-frameable:
curl -sI "http://localhost:3000/internal/login" | grep -i content-security-policy
# Expected: Content-Security-Policy: frame-ancestors 'none'
```

For the per-shop header (authenticated document requests redirect when curl'd, and Remix skips entry.server for redirects): open the app on the dev store, DevTools → Network → the top document request → Response Headers. Expected: `Content-Security-Policy: frame-ancestors https://<dev-store>.myshopify.com https://admin.shopify.com …` and a `Link: <https://cdn.shopify.com/shopifycloud/app-bridge.js>; rel="preload"` header.

- [ ] **Step 8: Run the full suite + commit**

```bash
pnpm --dir apps/web test
git add apps/web/app/entry.server.tsx apps/web/app/security-headers.server.ts \
  apps/web/app/shopify.server.ts apps/web/app/__tests__/security-headers.test.ts
git commit -m "feat(conformance): entry.server.tsx emits per-shop frame-ancestors CSP [Conf-1]"
```

---

### Task 2: Token-exchange auth (managed installation) + redirect URLs

Why: `shopifyApp()` (`apps/web/app/shopify.server.ts:22-36`) has no `future.unstable_newEmbeddedAuthStrategy`, so embedded auth still uses the legacy authorization-code redirect flow — but `shopify.app.toml:141` has `redirect_urls = [ ]`, so a production install would dead-end at the OAuth callback. Managed installation is already on (`use_legacy_install_flow = false`, toml:128). Fix both ways: enable token exchange (primary), and populate `redirect_urls` (belt-and-braces fallback — e.g. non-embedded contexts). Grounded: the flag is named `unstable_newEmbeddedAuthStrategy` in v3 AND is still the same opt-in future flag in the v4/v5 docs (future-flags pages list it in all three) — it survives the Task 11 upgrade unchanged; keep it set.

**Files:**
- Modify: `apps/web/app/shopify.server.ts:21-35`
- Verify/Modify: `shopify.app.production.toml` `[auth]` (+ mirror `shopify.app.dev.toml` if needed)

**Interfaces:**
- Produces: no API change; `authenticate.admin()` behavior changes (token exchange instead of redirects).

- [ ] **Step 1: Enable the future flag**

In `apps/web/app/shopify.server.ts`, add to the `shopifyApp({...})` config (after `distribution: AppDistribution.AppStore,`):

```ts
  // Managed installation + token exchange: no OAuth redirect dance for the
  // embedded app. Requires use_legacy_install_flow = false in
  // shopify.app.production.toml (already set). Flag name is stable through
  // shopify-app-remix v5.
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
```

- [ ] **Step 2: Verify `redirect_urls`**

Verify `shopify.app.production.toml` `[auth] redirect_urls` (written by WS-A Task 9) contains `https://<railway-domain>/auth/callback`; append `https://<railway-domain>/auth/login` if absent (login fallback). Mirror the dev-app equivalents only if the CLI hasn't already written them.

(The auth splat route exists: `apps/web/app/routes/auth.$.tsx`, `authPathPrefix: '/auth'`.)

- [ ] **Step 3: Validate config**

Run: `shopify app config validate --config production`
Expected: no errors.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --dir apps/web typecheck && pnpm --dir apps/web test`
Expected: green (the flag changes runtime behavior, not types used by the app).

- [ ] **Step 5: Verify a clean install on the dev store — twice (dev app, then production app)**

The clean-install check is done twice: the dev app via the CLI, then the production app via an install link on the Railway domain (this replaces any stale "re-verify after WS-A" notes).

**(a) Dev app via CLI:**
1. `shopify app dev` → press `p` to open on the dev store.
2. Uninstall the app from the dev store first (Settings → Apps and sales channels), then reinstall via the CLI-provided install link.
3. Expected: install completes with the managed-installation grant screen, **no** `/admin/oauth/authorize` full-page redirect loop after install; app loads embedded; server logs show `authenticate.admin` succeeding (token exchange happens transparently on first request).
4. DevTools → Network: the app's document/data requests carry `Authorization: Bearer <session token>`; no repeated top-level redirects.

**(b) Production app via install link on the Railway domain:** uninstall the production app from the dev store, reinstall via its install link, and repeat checks 3–4 against the Railway-hosted app.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/shopify.server.ts shopify.app.production.toml shopify.app.dev.toml
git commit -m "feat(conformance): token-exchange embedded auth + auth redirect fallback [Conf-2]"
```

---

### Task 3: App Bridge script into `<head>` (before polaris.js)

Why: App Store requirement (changelog 2024-10-15, enforced since 2025-10-15): "apps … must use the latest Shopify App Bridge by adding the app-bridge.js script tag to the **head** of each document". Today `AppProvider` from `@shopify/shopify-app-remix/react` injects `<script src=".../app-bridge.js" data-api-key=...>` inside `<body>` (`apps/web/app/root.tsx:147`; injection confirmed in the package source), while `polaris.js` loads in `<head>` (`root.tsx:135`) — wrong location and wrong order (Polaris web components integrate with App Bridge; App Bridge must come first). Current documented pattern: `<meta name="shopify-api-key" content="...">` followed by the plain `app-bridge.js` script tag in `<head>`. Nothing in the merchant surface uses Polaris **React** (verified: zero `@shopify/polaris` imports under `app/routes/` outside `/internal` and zero under `app/components/`), so the `AppProvider` wrapper can be dropped entirely rather than neutralized.

**Files:**
- Create: `apps/web/app/components/EmbeddedHeadScripts.tsx`
- Modify: `apps/web/app/root.tsx` (head block ~130-136; embedded body branch 146-167; imports)
- Test: `apps/web/app/__tests__/embedded-head-scripts.test.tsx`

**Interfaces:**
- Produces: `EmbeddedHeadScripts({ apiKey }: { apiKey: string })` React component rendered in `<head>`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/app/__tests__/embedded-head-scripts.test.tsx
/**
 * App Store requirement: app-bridge.js must load from the CDN in <head>,
 * configured via the shopify-api-key meta tag, BEFORE polaris.js (Polaris
 * web components integrate with App Bridge). app-bridge.js must not be
 * deferred; polaris.js keeps defer.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmbeddedHeadScripts } from '~/components/EmbeddedHeadScripts';

describe('EmbeddedHeadScripts', () => {
  const html = renderToStaticMarkup(<EmbeddedHeadScripts apiKey="test-key-123" />);

  it('renders the api-key meta tag before the app-bridge script', () => {
    const meta = html.indexOf('name="shopify-api-key"');
    const appBridge = html.indexOf('https://cdn.shopify.com/shopifycloud/app-bridge.js');
    expect(meta).toBeGreaterThan(-1);
    expect(appBridge).toBeGreaterThan(-1);
    expect(meta).toBeLessThan(appBridge);
    expect(html).toContain('content="test-key-123"');
  });

  it('loads app-bridge.js before polaris.js', () => {
    const appBridge = html.indexOf('shopifycloud/app-bridge.js');
    const polaris = html.indexOf('shopifycloud/polaris.js');
    expect(polaris).toBeGreaterThan(appBridge);
  });

  it('does not defer app-bridge.js (must configure before other scripts run)', () => {
    const appBridgeTag = html.slice(
      html.indexOf('<script', html.indexOf('app-bridge.js') - 200),
      html.indexOf('app-bridge.js') + 'app-bridge.js"></script>'.length,
    );
    expect(appBridgeTag).not.toContain('defer');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/web test -- embedded-head-scripts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// apps/web/app/components/EmbeddedHeadScripts.tsx
/**
 * Head scripts for the embedded (Shopify admin) surface.
 * Order matters and is an App Store requirement:
 *   1. shopify-api-key meta   — configures App Bridge
 *   2. app-bridge.js          — must be in <head>, not deferred, before other scripts
 *   3. polaris.js (defer)     — defines the s-* web components; integrates with App Bridge
 * Replaces the <script> that @shopify/shopify-app-remix's AppProvider used to
 * inject into <body> (wrong location per the 2025-10-15 App Store requirement).
 */
export function EmbeddedHeadScripts({ apiKey }: { apiKey: string }) {
  return (
    <>
      <meta name="shopify-api-key" content={apiKey} />
      <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      <script src="https://cdn.shopify.com/shopifycloud/polaris.js" defer />
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir apps/web test -- embedded-head-scripts`
Expected: 3 passing.

- [ ] **Step 5: Wire into `root.tsx` and drop the AppProvider injection**

In `apps/web/app/root.tsx`:

1. Replace the head-script block (lines ~130-136) — the whole `{embedded && !isInternal && (<script src=".../polaris.js" defer />)}` block plus its comment — with:

```tsx
        {embedded && !isInternal && <EmbeddedHeadScripts apiKey={apiKey} />}
```

Place it **immediately after `<Meta />`** and before `<Links />` so app-bridge.js is the first script in `<head>`.

2. In the body, replace the embedded branch's `<AppProvider isEmbeddedApp apiKey={apiKey}>` … `</AppProvider>` (lines 147-167) with a fragment — keep every child exactly as-is (`<ClientErrorReporting />`, `<ActivityLogger />`, `<s-app-nav>…</s-app-nav>`, `<div className="app-content"><Outlet /></div>`):

```tsx
        {embedded && !isInternal ? (
          <>
            <ClientErrorReporting />
            <ActivityLogger />
            {/* …existing s-app-nav + app-content unchanged… */}
          </>
        ) : (
```

3. Remove the now-unused import: `import { AppProvider } from '@shopify/shopify-app-remix/react';` (line 18). Add `import { EmbeddedHeadScripts } from '~/components/EmbeddedHeadScripts';`.

(`s-app-nav` and the other `s-*` elements are driven by app-bridge.js/polaris.js, not by the React AppProvider — no behavior depends on the removed wrapper.)

- [ ] **Step 6: Typecheck + full tests**

Run: `pnpm --dir apps/web typecheck && pnpm --dir apps/web test`
Expected: green.

- [ ] **Step 7: Verify in the dev store**

`shopify app dev`, open the app in the admin, then in DevTools:
1. Elements → `<head>` contains, in order: the `shopify-api-key` meta, `app-bridge.js` (no defer), `polaris.js` (defer). `<body>` contains **no** `app-bridge.js` script.
2. `s-app-nav` still renders the left-rail nav (Dashboard/Build/Insights/Support/Settings/Billing); `s-page` headings still upgrade.
3. Console: no App Bridge warning about script placement or missing api key.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/root.tsx apps/web/app/components/EmbeddedHeadScripts.tsx \
  apps/web/app/__tests__/embedded-head-scripts.test.tsx
git commit -m "feat(conformance): app-bridge.js to <head> before polaris.js; drop AppProvider body injection [Conf-3]"
```

---

### Task 4: App Pricing plan-state foundation (schema, handles, PlanSyncService)

Why (D3): Under App Pricing the app never creates charges; it must *learn* the plan. Mechanisms (grounded): (a) welcome-link redirect carries `?plan_handle=…`; (b) Partner API `activeSubscription(appId:, shopId:)` is the canonical live state (returns `null` = no active contract); (c) there are **no** subscription webhooks — cancellations/freezes are only discoverable by querying, so Task 5 adds a cron sweep. This task builds the storage + service; it degrades gracefully (no-ops with a warning) until the Partner Dashboard runbook (Task 8) supplies env values.

**Files:**
- Modify: `apps/web/prisma/schema.prisma` (`Shop` ~line 13, `AppSubscription` ~line 393)
- Modify: `apps/web/app/env.server.ts` (schema ~line 46 area + a new helper)
- Create: `apps/web/app/services/billing/plan-handles.ts`
- Create: `apps/web/app/services/billing/plan-sync.service.ts`
- Test: `apps/web/app/__tests__/billing-plan-sync.test.ts`

**Interfaces:**
- Produces:
  - `PLAN_BY_HANDLE: Record<string, BillingPlan>` and `planFromHandle(handle: string | null | undefined): BillingPlan | null`
  - `getPartnerApiConfig(): { token: string; orgId: string; appGid: string } | null` (env.server.ts)
  - `class PlanSyncService { syncShop(shopDomain: string): Promise<{ plan: BillingPlan; changed: boolean }>; sweep(limit?: number): Promise<{ synced: number; failed: number }> }`
  - Prisma: `Shop.shopGid String?`, `AppSubscription.planHandle String?`, `AppSubscription.lastSyncedAt DateTime?`
- Consumes: `BillingPlan` type from `billing.service.ts`; `shopify.unauthenticated.admin(shopDomain)` (existing export, `shopify.server.ts:43`) to fetch the shop GID once; `ActivityLogService`.

- [ ] **Step 1: Schema + env plumbing**

`apps/web/prisma/schema.prisma`:
- On `Shop` (after `planTier`): `shopGid       String?  // gid://shopify/Shop/… — for Partner API activeSubscription lookups`
- On `AppSubscription` (after `shopifySubId`):
```prisma
  planHandle      String?   // App Pricing plan handle (free|starter|growth|pro); null = internal override / legacy
  lastSyncedAt    DateTime? // last successful Partner API reconcile
```

Run: `pnpm --dir apps/web exec prisma migrate dev --name app-pricing-plan-sync`
Expected: migration created + applied; `prisma generate` runs.

`apps/web/app/env.server.ts` — add to the zod schema (all optional; billing sync is inert without them):

```ts
  SHOPIFY_PARTNER_API_TOKEN: z.string().optional(),
  SHOPIFY_PARTNER_ORG_ID: z.string().optional(),
  SHOPIFY_APP_GID: z.string().optional(),       // gid://shopify/App/<id>
  SHOPIFY_APP_HANDLE: z.string().optional(),    // app handle from the Partner Dashboard listing URL
```

and export:

```ts
export function getPartnerApiConfig():
  | { token: string; orgId: string; appGid: string }
  | null {
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN;
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const appGid = process.env.SHOPIFY_APP_GID;
  if (!token || !orgId || !appGid) return null;
  return { token, orgId, appGid };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/app/__tests__/billing-plan-sync.test.ts
/**
 * PlanSyncService — the ONLY writer of App Pricing plan state.
 * Covers: handle mapping, null contract → FREE, idempotent upsert,
 * missing Partner env → graceful no-op, shopGid lazy fetch, sweep batching.
 * All I/O mocked (fetch, prisma, unauthenticated admin).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(async () => ({})),
  subFindUnique: vi.fn(),
  subFindMany: vi.fn(async () => []),
  subUpsert: vi.fn(async () => ({})),
  activityLog: vi.fn(async () => ({})),
  graphql: vi.fn(),
  partnerConfig: vi.fn(() => ({
    token: 'ptltkn_test',
    orgId: '1234567',
    appGid: 'gid://shopify/App/999',
  })),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique, update: hoisted.shopUpdate },
    appSubscription: {
      findUnique: hoisted.subFindUnique,
      findMany: hoisted.subFindMany,
      upsert: hoisted.subUpsert,
    },
  }),
}));
vi.mock('~/env.server', () => ({ getPartnerApiConfig: hoisted.partnerConfig }));
vi.mock('~/shopify.server', () => ({
  unauthenticated: {
    admin: vi.fn(async () => ({ admin: { graphql: hoisted.graphql } })),
  },
}));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class { log = hoisted.activityLog; },
}));

import { planFromHandle } from '~/services/billing/plan-handles';
import { PlanSyncService } from '~/services/billing/plan-sync.service';

function partnerResponse(items: Array<{ handle: string }> | null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        activeSubscription:
          items === null
            ? null
            : {
                billingPeriod: 'EVERY_30_DAYS',
                cancelAtEndOfCycle: false,
                trialEndsAt: null,
                currentBillingCycle: {
                  startTime: '2026-08-01T00:00:00Z',
                  endTime: '2026-09-01T00:00:00Z',
                },
                items: items.map((i) => ({ ...i, price: { __typename: 'FlatRatePrice' } })),
                legacySubscriptionId: null,
              },
      },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.shopFindUnique.mockResolvedValue({
    id: 'shop_1',
    shopDomain: 't.myshopify.com',
    shopGid: 'gid://shopify/Shop/42',
  });
  hoisted.subFindUnique.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => partnerResponse([{ handle: 'growth' }])));
});

describe('planFromHandle', () => {
  it('maps the four App Pricing handles', () => {
    expect(planFromHandle('free')).toBe('FREE');
    expect(planFromHandle('starter')).toBe('STARTER');
    expect(planFromHandle('growth')).toBe('GROWTH');
    expect(planFromHandle('pro')).toBe('PRO');
  });
  it('returns null for unknown/empty handles', () => {
    expect(planFromHandle('scale')).toBeNull();
    expect(planFromHandle(null)).toBeNull();
  });
});

describe('PlanSyncService.syncShop', () => {
  it('queries the Partner API with org endpoint + token and upserts the mapped plan', async () => {
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('GROWTH');
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://partners.shopify.com/1234567/api/2026-07/graphql.json');
    expect(init.headers['X-Shopify-Access-Token']).toBe('ptltkn_test');
    expect(JSON.parse(init.body).variables).toEqual({
      appId: 'gid://shopify/App/999',
      shopId: 'gid://shopify/Shop/42',
    });
    expect(hoisted.subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_1' },
        create: expect.objectContaining({ planName: 'GROWTH', planHandle: 'growth', status: 'ACTIVE' }),
        update: expect.objectContaining({ planName: 'GROWTH', planHandle: 'growth', status: 'ACTIVE' }),
      }),
    );
  });

  it('null contract → FREE', async () => {
    (fetch as any).mockResolvedValue(partnerResponse(null));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('FREE');
    expect(hoisted.subUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ planName: 'FREE', planHandle: null, status: 'ACTIVE' }),
      }),
    );
  });

  it('unknown handle → FREE (never grants quota on an unmapped plan)', async () => {
    (fetch as any).mockResolvedValue(partnerResponse([{ handle: 'mystery' }]));
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.plan).toBe('FREE');
  });

  it('fetches + persists the shop GID when missing', async () => {
    hoisted.shopFindUnique.mockResolvedValue({
      id: 'shop_1', shopDomain: 't.myshopify.com', shopGid: null,
    });
    hoisted.graphql.mockResolvedValue({
      json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/42' } } }),
    });
    await new PlanSyncService().syncShop('t.myshopify.com');
    expect(hoisted.shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { shopGid: 'gid://shopify/Shop/42' } }),
    );
  });

  it('no Partner env → keeps current DB plan and does not fetch', async () => {
    hoisted.partnerConfig.mockReturnValueOnce(null as never);
    hoisted.subFindUnique.mockResolvedValue({ planName: 'STARTER', status: 'ACTIVE' });
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res).toEqual({ plan: 'STARTER', changed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs BILLING_PLAN_CHANGED only when the plan actually changed', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'GROWTH', status: 'ACTIVE' });
    const res = await new PlanSyncService().syncShop('t.myshopify.com');
    expect(res.changed).toBe(false);
    expect(hoisted.activityLog).not.toHaveBeenCalled();
  });
});

describe('PlanSyncService.sweep', () => {
  it('syncs the stalest subscriptions up to the limit and survives per-shop failures', async () => {
    hoisted.subFindMany.mockResolvedValue([
      { shopId: 'shop_1', shop: { shopDomain: 'a.myshopify.com' } },
      { shopId: 'shop_2', shop: { shopDomain: 'b.myshopify.com' } },
    ]);
    const svc = new PlanSyncService();
    const spy = vi
      .spyOn(svc, 'syncShop')
      .mockResolvedValueOnce({ plan: 'GROWTH', changed: false })
      .mockRejectedValueOnce(new Error('partner 429'));
    const res = await svc.sweep(2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ synced: 1, failed: 1 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --dir apps/web test -- billing-plan-sync`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `plan-handles.ts`**

```ts
// apps/web/app/services/billing/plan-handles.ts
import type { BillingPlan } from './billing.service';

/**
 * App Pricing plan handles ⇄ in-app plan names.
 * These handles are pinned when the plans are created in the Partner Dashboard
 * (Task 8 runbook) — if a handle changes there, it MUST change here in the
 * same release. ENTERPRISE is intentionally absent: it is an internal override
 * (BillingService.setPlanForShop), never an App Pricing public plan.
 */
export const PLAN_BY_HANDLE: Record<string, BillingPlan> = {
  free: 'FREE',
  starter: 'STARTER',
  growth: 'GROWTH',
  pro: 'PRO',
};

export function planFromHandle(handle: string | null | undefined): BillingPlan | null {
  if (!handle) return null;
  return PLAN_BY_HANDLE[handle.trim().toLowerCase()] ?? null;
}
```

- [ ] **Step 5: Implement `plan-sync.service.ts`**

```ts
// apps/web/app/services/billing/plan-sync.service.ts
import { getPrisma } from '~/db.server';
import { getPartnerApiConfig } from '~/env.server';
import { unauthenticated } from '~/shopify.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { planFromHandle } from './plan-handles';
import type { BillingPlan } from './billing.service';

const PARTNER_API_VERSION = '2026-07';

// Validated against the Partner API 2026-07 schema via the Shopify dev MCP (2026-08-24).
const ACTIVE_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle { startTime endTime }
      items { handle description price { __typename active currency ... on FlatRatePrice { amount } } }
      pendingUpdate { billingPeriod items { handle } }
      legacySubscriptionId
    }
  }
`;

type ActiveSubscription = {
  trialEndsAt: string | null;
  currentBillingCycle?: { startTime: string; endTime: string } | null;
  items: Array<{ handle: string }>;
  legacySubscriptionId: string | null;
} | null;

export class PlanSyncService {
  /**
   * Reconcile one shop's AppSubscription row from the Partner API.
   * Idempotent; safe to call from the welcome-link redirect AND the cron sweep.
   * Without Partner env config it is a no-op that reports the current DB plan.
   */
  async syncShop(shopDomain: string): Promise<{ plan: BillingPlan; changed: boolean }> {
    const prisma = getPrisma();
    const cfg = getPartnerApiConfig();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new Error(`PlanSyncService: unknown shop ${shopDomain}`);

    const existing = await prisma.appSubscription.findUnique({ where: { shopId: shop.id } });
    if (!cfg) {
      logger.warn('[plan-sync] Partner API env not configured — skipping sync', { shopDomain });
      return { plan: (existing?.planName as BillingPlan) ?? 'FREE', changed: false };
    }

    const shopGid = shop.shopGid ?? (await this.ensureShopGid(shopDomain));
    const sub = await this.fetchActiveSubscription(cfg, shopGid);
    if (sub?.legacySubscriptionId) {
      // Should never happen for this app (no public installs pre-App-Pricing); loud if it does.
      logger.warn('[plan-sync] contract carries a legacySubscriptionId', { shopDomain });
    }

    const handle = sub?.items[0]?.handle ?? null;
    const plan: BillingPlan = sub ? (planFromHandle(handle) ?? 'FREE') : 'FREE';
    const changed = (existing?.planName ?? 'FREE') !== plan || existing?.status !== 'ACTIVE';

    const data = {
      planName: plan,
      planHandle: sub ? handle : null,
      shopifySubId: null,
      status: 'ACTIVE',
      trialEndsAt: sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null,
      currentPeriodEnd: sub?.currentBillingCycle?.endTime
        ? new Date(sub.currentBillingCycle.endTime)
        : null,
      lastSyncedAt: new Date(),
    };
    await prisma.appSubscription.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, ...data },
      update: data,
    });

    if (changed) {
      await new ActivityLogService().log({
        actor: 'SYSTEM',
        action: 'BILLING_PLAN_CHANGED',
        shopId: shop.id,
        details: { plan, planHandle: handle, source: 'app-pricing-sync' },
      }).catch(() => {});
    }
    return { plan, changed };
  }

  /**
   * Cron reconcile (App Pricing has NO webhooks — cancellations/freezes are
   * only visible by querying). Oldest-synced first; caps requests per tick to
   * respect the Partner API's 4 req/s limit.
   */
  async sweep(limit = 20): Promise<{ synced: number; failed: number }> {
    const prisma = getPrisma();
    const stale = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.appSubscription.findMany({
      where: {
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: stale } }],
        NOT: { planName: 'ENTERPRISE' }, // internal override — never reconciled away
      },
      orderBy: { lastSyncedAt: 'asc' },
      take: limit,
      include: { shop: { select: { shopDomain: true } } },
    });
    let synced = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.syncShop(row.shop.shopDomain);
        synced += 1;
      } catch (err) {
        failed += 1;
        logger.warn('[plan-sync] sweep item failed', {
          shopDomain: row.shop.shopDomain,
          ...safeErrorMeta(err),
        });
      }
    }
    return { synced, failed };
  }

  private async fetchActiveSubscription(
    cfg: { token: string; orgId: string; appGid: string },
    shopGid: string,
  ): Promise<ActiveSubscription> {
    const res = await fetch(
      `https://partners.shopify.com/${cfg.orgId}/api/${PARTNER_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': cfg.token,
        },
        body: JSON.stringify({
          query: ACTIVE_SUBSCRIPTION_QUERY,
          variables: { appId: cfg.appGid, shopId: shopGid },
        }),
      },
    );
    if (!res.ok) throw new Error(`Partner API HTTP ${res.status}`);
    const payload = (await res.json()) as {
      data?: { activeSubscription?: ActiveSubscription };
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).filter(Boolean).join('; ') || 'Partner API error');
    }
    return payload.data?.activeSubscription ?? null;
  }

  private async ensureShopGid(shopDomain: string): Promise<string> {
    const { admin } = await unauthenticated.admin(shopDomain);
    const res = await admin.graphql(`#graphql
      query ShopGid { shop { id } }
    `);
    const json = (await res.json()) as { data?: { shop?: { id?: string } } };
    const gid = json.data?.shop?.id;
    if (!gid) throw new Error(`PlanSyncService: could not resolve shop GID for ${shopDomain}`);
    const prisma = getPrisma();
    await prisma.shop.update({ where: { shopDomain }, data: { shopGid: gid } });
    return gid;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --dir apps/web test -- billing-plan-sync`
Expected: all passing. Then `pnpm --dir apps/web typecheck`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/prisma apps/web/app/env.server.ts \
  apps/web/app/services/billing/plan-handles.ts \
  apps/web/app/services/billing/plan-sync.service.ts \
  apps/web/app/__tests__/billing-plan-sync.test.ts
git commit -m "feat(billing): App Pricing plan-state sync — Partner API activeSubscription + handle map [Conf-4]"
```

---

### Task 5: Welcome-link callback route + cron reconcile hook

Why: The welcome link is the only push-style signal App Pricing gives the app (redirect with `plan_handle` + `shop`). The handler must **not** trust the URL param (any merchant can type it) — it treats it as a hint and verifies via `PlanSyncService.syncShop` (Partner API). The cron sweep covers cancellations/freezes that have no redirect.

**Files:**
- Create: `apps/web/app/routes/billing.callback.tsx`
- Modify: `apps/web/app/routes/api.cron.tsx` (add a best-effort sweep alongside the existing fan-outs)
- Test: `apps/web/app/__tests__/billing-callback.test.ts`

**Interfaces:**
- Consumes: `PlanSyncService.syncShop(shopDomain)` (Task 4), `shopify.authenticate.admin`.
- Produces: route `GET /billing/callback?plan_handle=…` → 302 `/billing`. This exact relative path (`/billing/callback`) is what Task 8 configures as every plan's **Welcome link**.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/app/__tests__/billing-callback.test.ts
/**
 * /billing/callback — App Pricing welcome-link landing.
 * Must authenticate the embedded request, sync plan state from the Partner
 * API (NEVER trusting plan_handle from the URL), and land on /billing.
 * A sync failure must not strand the merchant — still redirect, plan will
 * reconcile via cron.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 't.myshopify.com' } })),
  syncShop: vi.fn(async () => ({ plan: 'GROWTH', changed: true })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/billing/plan-sync.service', () => ({
  PlanSyncService: class { syncShop = hoisted.syncShop; },
}));

import { loader } from '~/routes/billing.callback';

beforeEach(() => vi.clearAllMocks());

describe('billing.callback loader', () => {
  it('syncs from the Partner API (not the URL param) and redirects to /billing', async () => {
    const res = (await loader({
      request: new Request('https://app.example.com/billing/callback?plan_handle=growth'),
      params: {},
      context: {},
    } as never)) as Response;
    expect(hoisted.syncShop).toHaveBeenCalledWith('t.myshopify.com');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/billing');
  });

  it('still redirects when the sync fails (cron will reconcile)', async () => {
    hoisted.syncShop.mockRejectedValueOnce(new Error('partner down'));
    const res = (await loader({
      request: new Request('https://app.example.com/billing/callback?plan_handle=pro'),
      params: {},
      context: {},
    } as never)) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/billing');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --dir apps/web test -- billing-callback`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```tsx
// apps/web/app/routes/billing.callback.tsx
import { redirect } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { PlanSyncService } from '~/services/billing/plan-sync.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

/**
 * App Pricing welcome link (configured per-plan in the Partner Dashboard as
 * the relative path "/billing/callback"). Shopify appends ?plan_handle=…
 * after the merchant approves a charge. The param is a HINT ONLY — the plan
 * of record is re-fetched from the Partner API, so a forged URL cannot
 * grant quota. A failed sync never strands the merchant: the cron sweep in
 * api.cron.tsx reconciles within a tick.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const planHandle = new URL(request.url).searchParams.get('plan_handle');
  try {
    const { plan } = await new PlanSyncService().syncShop(session.shop);
    logger.info('[billing.callback] plan synced', { shopDomain: session.shop, plan, planHandle });
  } catch (err) {
    logger.error('[billing.callback] plan sync failed — deferring to cron reconcile', {
      shopDomain: session.shop,
      planHandle,
      ...safeErrorMeta(err),
    });
  }
  return redirect('/billing');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/web test -- billing-callback`
Expected: 2 passing.

- [ ] **Step 5: Hook the sweep into the cron tick**

In `apps/web/app/routes/api.cron.tsx`, next to the existing best-effort fan-outs (the scheduled-messaging / httpSync blocks around lines 105-140), add — same try/catch style so a sweep failure never 500s the tick:

```ts
  // App Pricing has no subscription webhooks: reconcile plan state (cancels,
  // freezes, out-of-band changes) against the Partner API. Best-effort.
  try {
    const { synced, failed } = await new PlanSyncService().sweep();
    if (synced || failed) logger.info('[api.cron] plan-sync sweep', { synced, failed });
  } catch (err) {
    logger.warn('[api.cron] plan-sync sweep failed', { ...safeErrorMeta(err) });
  }
```

with `import { PlanSyncService } from '~/services/billing/plan-sync.service';` at the top.

- [ ] **Step 6: Full tests + typecheck, then commit**

```bash
pnpm --dir apps/web typecheck && pnpm --dir apps/web test
git add apps/web/app/routes/billing.callback.tsx apps/web/app/routes/api.cron.tsx \
  apps/web/app/__tests__/billing-callback.test.ts
git commit -m "feat(billing): welcome-link callback + cron plan reconcile (App Pricing has no webhooks)"
```

---

### Task 6: QuotaService honors subscription status

Why [Deploy-4]: `quota.service.ts:15-17` reads `sub?.planName ?? 'FREE'` and **ignores `status`** — a shop whose subscription is `CANCELLED` (set by the `app/uninstalled` handler in `webhooks.tsx:177-180`, or by a future reconcile state) keeps paid quotas forever. Plan resolution must collapse to FREE for any non-ACTIVE status.

**Files:**
- Modify: `apps/web/app/services/billing/quota.service.ts` — enforce, getUsageSummary, **and enforcePublishCap (added by WS-QF)** all route through `resolvePlanName`
- Test: `apps/web/app/__tests__/billing-quota.test.ts` (extend)

**Interfaces:**
- Produces: no signature change; `enforce`, `getUsageSummary`, and `enforcePublishCap` all resolve the plan through a shared private `resolvePlanName`.

- [ ] **Step 1: Write the failing tests** (append to `billing-quota.test.ts`)

```ts
describe('QuotaService — subscription status', () => {
  it('treats a CANCELLED subscription as FREE', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'GROWTH', status: 'CANCELLED' });
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 10 }));
    hoisted.aiAggregate.mockResolvedValue({ _sum: { requestCount: 5 } });
    await new QuotaService().enforce('shop_1', 'aiRequest');
    expect(hoisted.getPlanConfig).toHaveBeenCalledWith('FREE');
  });

  it('treats an EXPIRED subscription as FREE in getUsageSummary', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'PRO', status: 'EXPIRED' });
    hoisted.getPlanConfig.mockResolvedValue(config({}));
    const summary = await new QuotaService().getUsageSummary('shop_1');
    expect(hoisted.getPlanConfig).toHaveBeenCalledWith('FREE');
    expect(summary.plan).toBe('FREE');
  });

  it('uses the plan when status is ACTIVE', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'GROWTH', status: 'ACTIVE' });
    hoisted.getPlanConfig.mockResolvedValue(config({ aiRequestsPerMonth: 1000 }));
    await new QuotaService().enforce('shop_1', 'aiRequest');
    expect(hoisted.getPlanConfig).toHaveBeenCalledWith('GROWTH');
  });

  it('enforcePublishCap resolves limits as FREE for a CANCELLED subscription', async () => {
    hoisted.subFindUnique.mockResolvedValue({ planName: 'GROWTH', status: 'CANCELLED' });
    hoisted.getPlanConfig.mockResolvedValue(config({ modulesTotal: 3 }));
    hoisted.moduleCount.mockResolvedValue(0);
    await new QuotaService().enforcePublishCap('shop_1', 'mod_x');
    expect(hoisted.getPlanConfig).toHaveBeenCalledWith('FREE');
  });
});
```

Note: the existing `beforeEach` sets `subFindUnique` to `{ planName: 'STARTER' }` with **no status** — update that fixture to `{ planName: 'STARTER', status: 'ACTIVE' }` so existing tests keep passing under the new rule.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --dir apps/web test -- billing-quota`
Expected: the 4 new tests FAIL (`getPlanConfig` called with `'GROWTH'`/`'PRO'` instead of `'FREE'`).

- [ ] **Step 3: Implement**

In `quota.service.ts`, replace all three plan lookups (in `enforce`, `getUsageSummary`, and WS-QF's `enforcePublishCap`) with a shared helper:

```ts
  /** Non-ACTIVE subscriptions grant no paid quota (cancelled, expired, frozen…). */
  private async resolvePlanName(shopId: string): Promise<string> {
    const prisma = getPrisma();
    const sub = await prisma.appSubscription.findUnique({ where: { shopId } });
    if (!sub || sub.status !== 'ACTIVE') return 'FREE';
    return sub.planName;
  }
```

and in all three methods: `const planName = await this.resolvePlanName(shopId);`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --dir apps/web test -- billing-quota`
Expected: all passing (old + new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/services/billing/quota.service.ts apps/web/app/__tests__/billing-quota.test.ts
git commit -m "fix(billing): quota resolution honors subscription status — non-ACTIVE means FREE [Deploy-4]"
```

---

### Task 7: Remove the hand-rolled charge flow; billing UI goes read-only

Why (D3): Under App Pricing an app "doesn't need to use the Billing API"; the Billing API is now marked **legacy**. `BillingService.createSubscription` (`billing.service.ts:104-183`, `appSubscriptionCreate`) and the `/billing` plan-purchase `action` (`billing._index.tsx:37-70`) must go. The UI becomes: current plan + usage (kept) + "Manage plan" opening the Shopify-hosted plan selection page at the top window.

**Files:**
- Modify: `apps/web/app/services/billing/billing.service.ts` (delete lines 92-183 `createSubscription` + its response types; fix `setPlanForShop`)
- Modify: `apps/web/app/routes/billing._index.tsx` (delete `action`; rewrite body)
- Modify: `apps/web/app/env.server.ts` (remove `BILLING_TEST_MODE` + `isBillingTestModeEnabled`, lines 46 and 131-134 — after this task its only caller is gone)
- Modify: `docs/app.md` (§"Plans & quotas", lines 136-150)
- Test: `apps/web/app/__tests__/billing-service.test.ts` (rewrite), `apps/web/app/__tests__/billing-manage-url.test.ts` (create)

**Interfaces:**
- Produces: `buildManagePlanUrl(shopDomain: string): string | null` exported from `~/services/billing/plan-handles.ts` (returns null when `SHOPIFY_APP_HANDLE` unset). `BillingService` keeps: `getActiveSubscription`, `cancelSubscription`, `getPlanConfig`, `setPlanForShop` (internal override — used by `internal.stores._index.tsx:147`).
- Consumes: `QuotaService.getUsageSummary` (unchanged), `getAllPlanConfigs` (unchanged — plan quota display still comes from `PlanTierConfig`/`PLAN_CONFIGS`; App Pricing owns *charging*, the app still owns *quota definitions*).

- [ ] **Step 1: Write the failing URL-builder test**

```ts
// apps/web/app/__tests__/billing-manage-url.test.ts
/**
 * buildManagePlanUrl — the Shopify-hosted plan selection page for embedded
 * apps: https://admin.shopify.com/store/{storeHandle}/charges/{appHandle}/pricing_plans
 * storeHandle = shop domain minus .myshopify.com. Null when the app handle
 * env is missing (button hidden rather than a broken link).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { buildManagePlanUrl } from '~/services/billing/plan-handles';

afterEach(() => { delete process.env.SHOPIFY_APP_HANDLE; });

describe('buildManagePlanUrl', () => {
  it('builds the admin charges URL from the shop domain + app handle', () => {
    process.env.SHOPIFY_APP_HANDLE = 'super-app-ai';
    expect(buildManagePlanUrl('cool-shop.myshopify.com')).toBe(
      'https://admin.shopify.com/store/cool-shop/charges/super-app-ai/pricing_plans',
    );
  });
  it('returns null without SHOPIFY_APP_HANDLE', () => {
    expect(buildManagePlanUrl('cool-shop.myshopify.com')).toBeNull();
  });
});
```

Run: `pnpm --dir apps/web test -- billing-manage-url` → FAIL (no export).

- [ ] **Step 2: Implement `buildManagePlanUrl`** (append to `plan-handles.ts`)

```ts
export function buildManagePlanUrl(shopDomain: string): string | null {
  const appHandle = process.env.SHOPIFY_APP_HANDLE;
  if (!appHandle) return null;
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/i, '');
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}
```

Run: `pnpm --dir apps/web test -- billing-manage-url` → PASS.

- [ ] **Step 3: Shrink `BillingService`**

In `billing.service.ts`:
1. Delete lines 92-183: the `BillingUserError` / `BillingTopLevelError` / `AppSubscriptionCreatePayload` / `BillingAppSubscriptionCreateResponse` types and the whole `createSubscription` method (the `#graphql appSubscriptionCreate` mutation goes with it).
2. Delete the now-unused imports: `AdminApiContext` (line 1) and `isBillingTestModeEnabled` (line 4).
3. In `setPlanForShop` (lines 206-213): **remove** the `prisma.shop.update({ … planTier … })` write. `Shop.planTier` is the Shopify shop plan (`capability.service.ts` owns it); the billing plan lives on `AppSubscription`. Keep the `recordSubscription` call.
4. `recordSubscription` stays (it's the internal-override writer; the App Pricing writer is `PlanSyncService`).

- [ ] **Step 4: Rewrite `billing._index.tsx`**

Loader — drop the `BillingService` import usage for creation, add the manage URL (with `import { sealAccessToken } from '~/services/shops/access-token.server';` — WS-A Task 11's helper):

```tsx
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: sealAccessToken(session.accessToken ?? ''), planTier: 'UNKNOWN' },
    });
  }
  const quota = new QuotaService();
  const billing = new BillingService();
  const [sub, usage, plans] = await Promise.all([
    billing.getActiveSubscription(shopRow.id),
    quota.getUsageSummary(shopRow.id),
    getAllPlanConfigs(),
  ]);
  return json({
    sub, usage, plans,
    managePlanUrl: buildManagePlanUrl(session.shop),
  });
}
```

> **Guard note:** WS-A encrypted `Shop.accessToken` at rest — every rewrite of a writer site must keep the seal (`grep -n 'accessToken: session' apps/web/app/routes/billing._index.tsx | grep -v sealAccessToken` → empty).

Delete the entire `action` (lines 37-70). In the body component:
- Delete `changeFetcher`, `pendingPlan`, `changePlan`, `requestPlanChange`, `downgradeTo` state, the `useEffect` on `changeFetcher.data`, and the whole `<ConfirmModal>` block (lines 200-222) — downgrades now happen on Shopify's page, which owns its own confirmation.
- Current-plan card: replace the "Change plan" button with

```tsx
{managePlanUrl && (
  <s-button
    variant="primary"
    onClick={() => window.open(managePlanUrl, '_top')}
  >
    Manage plan
  </s-button>
)}
```

(`'_top'` is required: the plan selection page lives outside the app iframe.) Keep the "Billing history" button.
- Plans grid: keep the four cards as a read-only comparison (name, price, quota checklist). Replace each card's "Choose …" button with nothing for the current plan (`<s-badge tone="success">Current</s-badge>` already shown) and, for other plans, the same top-window `Manage plan` button (secondary variant); ENTERPRISE keeps its "Contact us" → help link. The plan-status line under the heading becomes: `Plans are billed by Shopify. Select or change your plan on the Shopify-hosted pricing page.`
- Honor status in the display: `const current = sub?.status === 'ACTIVE' ? (sub?.planName ?? 'FREE') : 'FREE';` (mirrors Task 6's rule so UI and enforcement agree).

- [ ] **Step 5: Rewrite `billing-service.test.ts`**

Replace the file's `createSubscription` suites with coverage of what remains:

```ts
/**
 * BillingService after the App Pricing migration: no charge creation —
 * Shopify owns charging. What's left: subscription reads, internal plan
 * override (which must NOT touch Shop.planTier — that's the Shopify shop
 * plan, not the billing plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({})),
  updateMany: vi.fn(async () => ({})),
  findUnique: vi.fn(async () => ({ planName: 'GROWTH', status: 'ACTIVE' })),
  shopUpdate: vi.fn(async () => ({})),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    appSubscription: {
      upsert: hoisted.upsert,
      updateMany: hoisted.updateMany,
      findUnique: hoisted.findUnique,
    },
    shop: { update: hoisted.shopUpdate },
  }),
}));

import { BillingService } from '~/services/billing/billing.service';

beforeEach(() => vi.clearAllMocks());

describe('BillingService (App Pricing model)', () => {
  it('no longer exposes a charge-creation path', () => {
    expect((BillingService.prototype as Record<string, unknown>).createSubscription).toBeUndefined();
  });

  it('setPlanForShop records the override without touching Shop.planTier', async () => {
    await new BillingService().setPlanForShop('shop_1', 'ENTERPRISE');
    expect(hoisted.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId: 'shop_1' },
        update: expect.objectContaining({ planName: 'ENTERPRISE', status: 'ACTIVE' }),
      }),
    );
    expect(hoisted.shopUpdate).not.toHaveBeenCalled();
  });

  it('cancelSubscription marks the row CANCELLED', async () => {
    await new BillingService().cancelSubscription('shop_1');
    expect(hoisted.updateMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_1' },
      data: { status: 'CANCELLED' },
    });
  });
});
```

- [ ] **Step 6: Purge `BILLING_TEST_MODE`**

```bash
grep -rn "isBillingTestModeEnabled\|BILLING_TEST_MODE" apps/web/app apps/web/.env.example 2>/dev/null
```
Expected after Step 3: hits only in `env.server.ts` (schema line 46, helper lines 131-134) and possibly `.env.example` — delete them all. (App Pricing's replacement for test charges is the per-plan "Free for partners and developers" dev-store checkbox — Task 8.)

- [ ] **Step 7: Update `docs/app.md` §Plans & quotas (lines 136-150)**

Rewrite the closing paragraph (line 148) to state: plans are defined and billed via **Shopify App Pricing**; merchants view/select plans on the Shopify-hosted pricing page reached from the app's Billing page ("Manage plan"); quotas per tier remain owner-editable on the internal Plan tiers page; trial days are configured on the App Pricing plans. Remove the sentence claiming "you can … switch plans from the Billing page inside the app".

- [ ] **Step 8: Full suite + typecheck + dev sanity**

```bash
pnpm --dir apps/web typecheck && pnpm --dir apps/web test
```
Expected: green — including `subscription-advancement*.test.ts` (they exercise trial/period fields on `AppSubscription`; if they call `createSubscription`, port those cases to `PlanSyncService`/`recordSubscription` equivalents rather than deleting assertions).
Then `shopify app dev`: `/billing` renders plan + usage; "Manage plan" hidden (no `SHOPIFY_APP_HANDLE` yet — set after Task 8); no console errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/services/billing apps/web/app/routes/billing._index.tsx \
  apps/web/app/env.server.ts apps/web/app/__tests__ docs/app.md
git commit -m "feat(billing): remove appSubscriptionCreate flow; /billing is read-only + Shopify-hosted manage-plan link (D3)"
```

---

### Task 8: Partner Dashboard runbook — configure App Pricing + live verification

Why: App Pricing plans live in the Partner Dashboard, not code. This is an executable ops checklist; the code from Tasks 4-7 is inert until it's done. Requires the app owner's Partner account (org-owner permission is needed to create Partner API clients). **All of this is configured on the production app:** the App Pricing plans, `SHOPIFY_APP_GID`, `SHOPIFY_APP_HANDLE`, and the pricing-page URL all belong to the production app; the end-to-end lifecycle (Step 5) runs by opening the *production* app installed on the dev store (Railway URL), not via `shopify app dev`.

**Files:**
- Modify: `.env` (local) / secrets registry (WS-A): `SHOPIFY_PARTNER_API_TOKEN`, `SHOPIFY_PARTNER_ORG_ID`, `SHOPIFY_APP_GID`, `SHOPIFY_APP_HANDLE`
- Modify: `apps/web/.env.example` (document the four vars)

- [ ] **Step 1: Opt in to Shopify App Pricing**

Partner Dashboard → Apps → Super App AI → **Distribution** → Manage listing → published language → **Pricing content → Manage** → **Settings → Select "Shopify App Pricing" → Switch**. (This app has no live Billing API subscriptions — it was never publicly released — so the migration path's "check both billing systems" dual-read is unnecessary; the `legacySubscriptionId` warning in `PlanSyncService` is the tripwire if that assumption is ever wrong.)

- [ ] **Step 2: Create the four public plans**

Under **Public plans → Add**, create (handles must match `plan-handles.ts` exactly):

| Display name | Handle | Billing | Trial | Welcome link | Top features (from PLAN_CONFIGS quotas) |
|---|---|---|---|---|---|
| Free | `free` | Free | — | `/billing/callback` | 10 AI generations/mo · 3 published modules · 50 workflow runs/mo |
| Starter | `starter` | $19/mo | 14 days | `/billing/callback` | 200 AI generations/mo · 20 modules · 1,000 workflow runs/mo |
| Growth | `growth` | $79/mo | 14 days | `/billing/callback` | 1,000 AI generations/mo · 100 modules · 10,000 workflow runs/mo |
| Pro | `pro` | $299/mo | 7 days | `/billing/callback` | 10,000 AI generations/mo · 1,000 modules · 100,000 workflow runs/mo |

On every paid plan check **"Free for partners and developers"** (dev-store testing; replaces the deleted `BILLING_TEST_MODE`). If the dashboard assigns a different handle than requested (handles may be derived from the display name), update `PLAN_BY_HANDLE` in `apps/web/app/services/billing/plan-handles.ts` **in the same change** and rerun `pnpm --dir apps/web test -- billing-plan-sync`. ENTERPRISE: do not create a public plan.

- [ ] **Step 3: Create the Partner API client + collect env values**

1. Partner Dashboard → Settings → **Partner API clients** → create client with **Manage apps** permission → copy token → `SHOPIFY_PARTNER_API_TOKEN`.
2. `SHOPIFY_PARTNER_ORG_ID` = the number in the dashboard URL `partners.shopify.com/<org_id>/…`.
3. `SHOPIFY_APP_GID`: run in a scratch script or the dev MCP against the app's Admin API — `{ currentAppInstallation { app { id } } }` — or read the app ID from the Partner Dashboard app URL and form `gid://shopify/App/<id>`.
4. `SHOPIFY_APP_HANDLE`: from the app listing URL / app setup page (expected `super-app-ai`; verify, don't assume).
5. Add all four to `.env`, and as placeholders with comments to `apps/web/.env.example`.

- [ ] **Step 4: Verify the Partner API from the shell**

```bash
curl -s -X POST "https://partners.shopify.com/$SHOPIFY_PARTNER_ORG_ID/api/2026-07/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: $SHOPIFY_PARTNER_API_TOKEN" \
  -d '{"query":"query($appId: ID!, $shopId: ID!){ activeSubscription(appId:$appId, shopId:$shopId){ items { handle } } }","variables":{"appId":"'$SHOPIFY_APP_GID'","shopId":"gid://shopify/Shop/<dev-store-numeric-id>"}}'
```
Expected: HTTP 200 with `{"data":{"activeSubscription":null}}` (no plan selected yet) — not an auth error.

- [ ] **Step 5: End-to-end plan lifecycle on the dev store (production app, Railway URL)**

1. Open the *production* app installed on the dev store (served from the Railway URL — not `shopify app dev`); `/billing` now shows the "Manage plan" button (env set on the Railway `web` service).
2. Click it → top window lands on `https://admin.shopify.com/store/<dev-store>/charges/<app-handle>/pricing_plans` listing the 4 plans.
3. Select **Growth** → approve ($0 on dev store) → redirected into the app at `/billing/callback?plan_handle=growth` → lands on `/billing` showing **Growth**.
4. `pnpm --dir apps/web exec prisma studio` (or psql): `AppSubscription` row has `planName=GROWTH`, `planHandle=growth`, `status=ACTIVE`, fresh `lastSyncedAt`; `Shop.shopGid` populated.
5. Cancel the plan from the Shopify-hosted page; force a reconcile: `curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:3000/api/cron"` after clearing `lastSyncedAt` (`UPDATE "AppSubscription" SET "lastSyncedAt" = NULL;`) → row flips to `planName=FREE`; `/billing` shows Free; an AI-generate attempt past the FREE quota is blocked with the RATE_LIMITED message.

- [ ] **Step 6: Commit the docs artifacts**

```bash
git add apps/web/.env.example
git commit -m "docs(billing): App Pricing env vars + runbook verified on dev store"
```

---

### Task 9: Scope re-consent rollout (19-scope list)

Why: `shopify.app.production.toml` documents the audit-restored 19-scope list (`scopes = "read_checkouts,…,write_products"` — the scopes line); existing installs run on the old shrunk 8-scope grant, so bundle publishes / function-config writes fail silently. **Note:** WS-A Task 9 Step 6 already released the 19-scope config; this task's Step 3 deploy is therefore expected to be a no-op config-wise — its job is the re-consent *verification* (Steps 2/4) and the dated annotation. Grounded rollout mechanics ("Manage access scopes", managed installation): deploy the TOML via `shopify app deploy` → **merchants are prompted to approve the added scopes the next time they open the app** (no reinstall, no OAuth URL work — token exchange + managed install handle it); `app/scopes_update` fires on approval (already subscribed, toml:77-79, and logged by `webhooks.tsx:203-219`). Removed scopes would drop silently on next open (none are being removed here). `optional_scopes = ["write_themes"]` prompts nobody until the app calls `shopify.scopes.request(['write_themes'])` at runtime.

Precondition: Tasks 1-3 merged (the deploy that ships scopes should also ship the conformance fixes), Task 2's install verification green.

**Files:** none beyond what previous tasks changed — this is a release + verification sequence.

- [ ] **Step 1: Pre-deploy validation**

```bash
shopify app config validate --config production   # TOML valid
pnpm --dir apps/web test                          # suite green
git status                                        # clean tree on the release commit
```

- [ ] **Step 2: Record the currently-granted scopes on the dev store (baseline)**

In the embedded app's DevTools console (App Bridge is loaded after Task 3):
```js
await shopify.scopes.query()
```
Save the `granted` list — expected to be the old 8-scope set on a pre-existing install.

- [ ] **Step 3: Deploy**

```bash
shopify app deploy --config production
```
Confirm the release includes the config change (the CLI prints the config diff — verify the scopes line matches the `shopify.app.production.toml` scopes line verbatim). Since WS-A Task 9 Step 6 already released this config, expect a config-wise no-op here.

- [ ] **Step 4: Verify the re-consent prompt path**

1. Open the app on the dev store (existing install). Expected: Shopify interposes the "additional permissions" grant screen before the app loads.
2. Approve. Expected: app loads; `shopify.scopes.query()` now lists all 19 scopes as granted.
3. Verify the `app/scopes_update` webhook landed: internal admin → Activity log shows `APP_SCOPES_UPDATE` with the new `appScopes` array (handler `webhooks.tsx:203-219`).
4. Functional probe of the restored scopes: run `query { cartTransforms(first: 1) { nodes { id } } }` and a `productCreate`/`productUpdate` (or a metaobject write) via GraphiQL on the dev store, confirming no `ACCESS_DENIED`. The real cart-transform end-to-end proof is WS-E Task 17 Step 6.
5. Negative check: `write_themes` was NOT prompted (it's optional); `shopify.scopes.query()` shows it as optional/not granted.

- [ ] **Step 5: Document the rollout state**

Append one dated line to the audit note in `shopify.app.production.toml` (the scopes audit comment block): `# 2026-XX-XX: 19-scope list deployed; re-consent verified on dev store (see WS-D Task 9).` Commit:

```bash
git add shopify.app.production.toml
git commit -m "chore(scopes): mark 19-scope re-consent rollout deployed + verified"
```

For production merchants (post-submission there are none yet — D8 means this ships before launch): no further action; every future install gets the full list at install time.

---

### Task 10: Admin API 2026-04 → 2026-07 everywhere

Why: master-plan global constraint; keeps webhooks, app code, and extensions on one dated version. Enumerated call sites (verified by grep):
- `apps/web/app/shopify.server.ts:9` — `SHOPIFY_API_VERSION = '2026-04'`
- `apps/web/app/shopify-api.server.ts:6` — fallback `'2026-04'`
- `shopify.app.production.toml` + `shopify.app.dev.toml` — `[webhooks] api_version = "2026-04"`
- 24 extension TOMLs on `2026-04`: admin-segment-template, admin-print, admin-ui, checkout-ui, discount-function-settings, customer-account-ui, superapp-cart-checkout-validation, superapp-cart-transform, superapp-discount, superapp-delivery-customization, superapp-flow-action-send-http, superapp-flow-action-tag-order, superapp-flow-action-send-notification, superapp-flow-action-write-store, superapp-flow-trigger-connector-synced, superapp-flow-trigger-module-published, superapp-flow-trigger-data-record-created, superapp-flow-trigger-workflow-failed, superapp-flow-trigger-workflow-completed, superapp-fulfillment-constraints, superapp-payment-customization, superapp-order-routing, superapp-shipping-discount, theme-app-extension, superapp-sidekick-data
- **Leave alone:** `superapp-local-pickup` + `superapp-pickup-point` (`unstable` by design, excluded from deploy — toml:9-14), `superapp-pos-block` (already `2026-07`), `admin-link` + `superapp-web-pixel` (no `api_version` key), and `provider-model-catalog.server.ts` `apiPresetVersion: '2026-04'` (that's an **AI-provider feature preset**, not a Shopify version — do not touch).
- Tests that pin the version: `apps/web/app/__tests__/sidekick-extension.test.ts:167` (regex `2026-04`; the test's resolved toml path is already `shopify.app.production.toml` — updated by WS-A Task 9 Step 4b), `apps/web/app/__tests__/workflow-connectors.test.ts:7` (mock URL string).

**Files:** the list above.

- [ ] **Step 1: Flip the tests first (TDD for a version bump)**

- `sidekick-extension.test.ts:167`: `expect(toml).toMatch(/api_version\s*=\s*"2026-07"/);`
- `workflow-connectors.test.ts:7`: mock URL → `'https://test.myshopify.com/admin/api/2026-07/graphql.json'` (and any assertion that echoes it).

Run: `pnpm --dir apps/web test -- sidekick-extension workflow-connectors`
Expected: FAIL (code still on 2026-04).

- [ ] **Step 2: Bump the code + TOMLs**

```bash
cd /Users/lavipun/Work/ai-shopify-superapp
# extensions (only files that pin 2026-04):
grep -rl 'api_version = "2026-04"' extensions/*/shopify.extension.toml \
  | xargs sed -i '' 's/api_version = "2026-04"/api_version = "2026-07"/'
# app config webhooks (both apps):
sed -i '' 's/api_version = "2026-04"/api_version = "2026-07"/' shopify.app.production.toml shopify.app.dev.toml
```
Then by hand:
- `shopify.server.ts:9` → `const SHOPIFY_API_VERSION = '2026-07';`
- `shopify-api.server.ts:6` → `process.env.SHOPIFY_API_VERSION ?? '2026-07';`

Sanity: `grep -rn '"2026-04"' apps/web/app extensions shopify.app.production.toml shopify.app.dev.toml --include='*.ts' --include='*.toml'` → only comment/doc mentions and the AI `apiPresetVersion` remain.

- [ ] **Step 3: Validate + build**

```bash
pnpm --dir apps/web test && pnpm --dir apps/web typecheck
shopify app config validate --config production
shopify app build          # rebuilds function extensions against 2026-07 target schemas
```
Expected: all green. (Function input queries were already validated against 2026-07 per the master-plan audit; if any function build fails on a schema diff, that function's `run.graphql` must be re-validated via the dev MCP `validate_graphql_codeblocks` with the matching `functions_*` API and fixed — do not pin that one extension back without recording it in the TOML comment.)

- [ ] **Step 4: Dev-store smoke**

`shopify app dev`: app loads; publish one storefront module end-to-end (metaobject write path exercises the bumped Admin version); trigger a `products/update` (edit a product) and confirm the webhook processes (webhook api_version bump).

- [ ] **Step 5: Commit + deploy**

```bash
git add apps/web/app/shopify.server.ts apps/web/app/shopify-api.server.ts \
  shopify.app.production.toml shopify.app.dev.toml extensions apps/web/app/__tests__
git commit -m "chore(shopify): Admin API 2026-04 -> 2026-07 (app, webhooks, 24 extensions)"
shopify app deploy --config production
```

---

### Task 11: `@shopify/shopify-app-remix` 3.8.5 → 5.x

Why: v3 is two majors behind; v5 is current. Grounded breaking-change inventory checked against this codebase:

| Change | Impact here |
|---|---|
| **v4:** REST client removed from the package | None — zero `admin.rest`/`restResources` usage (grep-verified) |
| **v4:** `LATEST_API_VERSION`/`RELEASE_CANDIDATE_API_VERSION` removed; `apiVersion` required | Already passes explicit `apiVersion` (`shopify.server.ts:25`) |
| **v4:** `v3_webhookAdminContext`, `v3_authenticatePublic`, `v3_lineItemBilling` flags removed (behavior now default) | None set; no bare `authenticate.public()` calls (only `.public.pos` / `.public.appProxy`, both retained APIs) |
| **v4:** Node ≥ 20.10 | Satisfied (runtime Node 24; engines bumped below) |
| **v5:** Node ≥ 22 | Bump root `package.json` engines `>=20.20.0` → `>=22.0.0` |
| **v5:** deprecated webhook `subTopic` removed | No usage (grep `subTopic` → none) |
| **v5:** stricter GraphQL client types + hardened app-proxy validation | May surface type errors in `admin.graphql` call sites and needs a proxy smoke test |
| `unstable_newEmbeddedAuthStrategy` | Still a valid opt-in flag in v5 (per v5 future-flags docs) — **keep it set** from Task 2 |
| Peer: `@shopify/shopify-app-session-storage-prisma` | Currently `^5.2.3`; must move to the major that peers with shopify-app-remix v5 (read `peerDependencies` of the installed v5 package and match) |

Precondition: Tasks 1-3 done — `AppProvider` from `@shopify/shopify-app-remix/react` is already gone (root.tsx), so the react entrypoint's v4/v5 churn is moot; `entry.server.tsx` + flag are in place.

**Files:**
- Modify: `apps/web/package.json`, `package.json` (engines), lockfile
- Modify: `apps/web/app/shopify.server.ts` (only if types demand it)
- Possible ripple: any `admin.graphql` call sites with looser casts

- [ ] **Step 1: Upgrade the packages**

```bash
pnpm --dir apps/web add @shopify/shopify-app-remix@^5
# Read the required peer majors, then match them:
node -e "console.log(require('./apps/web/node_modules/@shopify/shopify-app-remix/package.json').peerDependencies)"
pnpm --dir apps/web add @shopify/shopify-app-session-storage-prisma@latest   # pick the major the peer range names
```
Also bump root `package.json` engines to `"node": ">=22.0.0"`.

- [ ] **Step 2: Typecheck and burn down errors**

Run: `pnpm --dir apps/web typecheck`
Expected first pass: possible errors at `shopify.server.ts:25` (`apiVersion … as any`) and `:30` (`sessionStorage … as any`). Fix by removing the casts — with matching majors both should typecheck natively:

```ts
import { AppDistribution, ApiVersion, shopifyApp } from '@shopify/shopify-app-remix/server';
// …
  apiVersion: '2026-07' as ApiVersion,   // or ApiVersion.July26 if the enum member exists
  sessionStorage: getSessionStorage(),
```

(If `getSessionStorage()`'s declared type still mismatches, fix the type in `apps/web/app/session.server.ts` rather than re-adding `as any`.) Chase any remaining errors in `authenticate.*` call sites; the narrowed GraphQL response types may require tightening a few `(await res.json()) as …` casts — keep the runtime shape identical.

- [ ] **Step 3: Full suite**

Run: `pnpm --dir apps/web test`
Expected: green. Pay attention to webhook tests (context shape is the v4 default now — the app already destructures `{ admin, payload, shop, topic }` which is the v4+ shape, so no change expected) and the Task 1/4/5 suites (mocked `~/shopify.server` interfaces unchanged).

- [ ] **Step 4: Dev-store smoke (the v5-sensitive surfaces)**

`shopify app dev`, then verify each:
1. Fresh install + embedded load (token exchange still on — flag kept).
2. Document CSP header still present (entry.server path — Task 1 Step 7 check).
3. Webhook delivery: edit a product → `products/update` processed (server log).
4. **App proxy** (v5 hardened validation): open a published proxy widget on the storefront (`/apps/superapp/...` → `proxy.$widgetId.tsx`) and the recommend endpoint — both must return content, not 400s.
5. POS/session-token route if reachable: `authenticate.public.pos` unchanged signature.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/web/package.json pnpm-lock.yaml apps/web/app
git commit -m "chore(deps): shopify-app-remix 3.8.5 -> 5.x (+ matching session storage); drop config casts"
```

---

## Execution order & shippability

Each task lands independently green: 1 → 2 → 3 (conformance, deployable immediately) → 4 → 5 → 6 → 7 (billing code, inert-but-safe until 8) → 8 (ops, activates billing) → 9 (release + re-consent) → 10 (version bump) → 11 (library upgrade). Tasks 4-7 may merge before 8 because every sync path no-ops gracefully without the Partner env. Task 9's deploy should carry 1-3; Task 11 last so the upgrade lands on a fully-passing, already-conformant baseline.

## Out of scope (tracked elsewhere)

- Stable domain / hosting (WS-A) — landed; Task 2 Step 5 (b) and Task 8 Step 5 already run against the production app on the Railway domain, so no post-cutover re-verify remains.
- Quota enforcement coverage at create+publish call sites (WS-QF).
- App Store listing content, GDPR completeness, submission checklist (WS-S).
- Usage-based billing / App Events API — the app bills flat tiers only; revisit only if pricing changes.

## Cross-review reconciliation (2026-08-24)

Edits applied from the cross-plan review:

- **B4.2** — Global Constraints: the "`application_url` is still a tunnel until WS-A lands…" bullet replaced — WS-A has landed; this plan operates on `shopify.app.production.toml` / `shopify.app.dev.toml`, deploys/validates target `--config production`, and `shopify app dev` runs the dev app. (Mechanical follow-through: `--config production` added to the deploy/validate commands in Tasks 2, 9, 10; the File Structure table and stale `shopify.app.toml` git-add paths retargeted; the Out-of-scope "re-verify after WS-A" bullet resolved.)
- **B4.3** — Task 2 Step 2: the tunnel `redirect_urls` edit deleted; replaced with verification of the WS-A-written `[auth] redirect_urls` in `shopify.app.production.toml` (append the `/auth/login` fallback if absent; mirror the dev app only if the CLI hasn't).
- **B4.4** — Task 9: file refs retargeted from `shopify.app.toml:119` / the lines-108-118 audit comment to the `shopify.app.production.toml` scopes line and audit-comment block; note added that WS-A Task 9 Step 6 already released the 19-scope config, so Step 3's deploy is a config-wise no-op — this task's job is the re-consent verification (Steps 2/4) and the dated annotation.
- **B4.5** — Task 10: `sed` targets are now `shopify.app.production.toml shopify.app.dev.toml`; noted that the sidekick test's resolved toml path is already updated by WS-A Task 9 Step 4b.
- **B5** — Task 6: Files list and Step 3 now cover all three plan lookups (`enforce`, `getUsageSummary`, and WS-QF's `enforcePublishCap`) routing through `resolvePlanName`; Step 1 gained a fourth failing test (`enforcePublishCap` with `{ planName: 'GROWTH', status: 'CANCELLED' }` → `getPlanConfig('FREE')`).
- **B6** — Task 7 Step 4: the `shopRow` create seals the token (`accessToken: sealAccessToken(session.accessToken ?? '')`, import from `~/services/shops/access-token.server` — WS-A Task 11's module name, verified) plus the writer-site guard note (grep must show no unsealed `accessToken: session` in `billing._index.tsx`).
- **C1** — Task 9 Step 4: the bundle-module-publish scope probe replaced with GraphiQL probes (`cartTransforms(first: 1)` + a `productCreate`/`productUpdate` or metaobject write, no `ACCESS_DENIED`); the real cart-transform end-to-end proof is WS-E Task 17 Step 6.
- **C2** — Task 8: App Pricing plans, `SHOPIFY_APP_GID`, `SHOPIFY_APP_HANDLE`, and the pricing-page URL are configured on the **production** app; Step 5's lifecycle runs by opening the production app on the dev store (Railway URL), not `shopify app dev`. Task 2 Step 5: clean-install check done twice — dev app via CLI, then production app via install link on the Railway domain.
