import { test, expect } from '@playwright/test';

// Merchant Dashboard smoke. Embedded merchant routes require a Shopify session,
// so an unauthenticated request is expected to 302 → auth (or 401/403/410).
// The baseline assertion is: the server NEVER returns a 5xx for any merchant
// route (a 5xx means the loader/route module itself threw). We also collect
// console errors when a route happens to render HTML.
//
// No authenticated test-session helper exists for the embedded merchant app in
// this repo (admin uses internalSessionStorage; merchant uses
// shopify.authenticate.admin which needs a live Shopify handshake), so the
// no-5xx contract is the smoke baseline. The orchestrator runs this spec.

const MERCHANT_BASE = process.env.PLAYWRIGHT_MERCHANT_URL ?? 'http://127.0.0.1:3000';

// Every merchant route owned by the Merchant Dashboard surface.
const ROUTES = [
  '/',                       // Dashboard
  '/modules',                // Build · Modules
  '/modules?openBuilder=1',  // Modules with AI builder intent
  '/flows',                  // Build · Flows
  '/flows/build/new',        // New flow builder
  '/connectors',             // Build · Connectors
  '/data',                   // Build · Data
  '/templates',              // Build · Templates
  '/generate',               // Generate flow (full-screen)
  '/analytics',              // Insights · Analytics
  '/activity',               // Insights · Activity
  '/billing',                // Billing
  '/billing/history',        // Billing history
  '/settings',               // Settings
  '/help',                   // Help & guides
];

// An unauthenticated embedded route can legitimately answer with any of these.
const ACCEPTABLE = new Set([200, 204, 301, 302, 303, 307, 308, 401, 403, 410]);

test.describe('merchant dashboard smoke', () => {
  test.beforeEach(async ({}, testInfo) => {
    try {
      const res = await fetch(MERCHANT_BASE, { method: 'HEAD' });
      if (!res.ok && res.status !== 410 && res.status < 500) {
        // reachable but gated — fine to proceed
      }
    } catch {
      testInfo.skip(true, `merchant server not reachable at ${MERCHANT_BASE}`);
    }
  });

  test('no merchant route returns a 5xx', async ({ request }) => {
    for (const path of ROUTES) {
      const response = await request.get(`${MERCHANT_BASE}${path}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      const status = response.status();
      expect(status, `5xx (or unexpected) status for ${path}: ${status}`).toBeLessThan(500);
      expect(ACCEPTABLE.has(status), `unexpected status for ${path}: ${status}`).toBeTruthy();
    }
  });

  test('rendered routes have no uncaught console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));

    for (const path of ROUTES) {
      const resp = await page.goto(`${MERCHANT_BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => null);
      // If the route 302→auth, the page may be a Shopify/auth screen — that's fine.
      if (resp) expect(resp.status(), `5xx for ${path}`).toBeLessThan(500);
    }

    // Ignore benign auth/embedded + dev-only warnings; fail only on real script errors.
    // Excluded: App Bridge/Shopify embed warnings, CSP/sandbox/favicon, network aborts
    // on auth redirects, Vite HMR websocket churn (dev server), and React SSR hydration
    // text-mismatch warnings on the auth/login redirect target.
    const real = errors.filter(
      (e) =>
        !/App Bridge|shopify|sandbox|Content Security Policy|favicon|net::ERR/i.test(e) &&
        !/\[vite\]|WebSocket|HMR|hydrat|did not match|Warning: Text content/i.test(e),
    );
    expect(real, `console errors: ${real.join('\n')}`).toEqual([]);
  });
});
