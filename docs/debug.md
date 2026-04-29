# Debug notes — known bugs and fixes

This doc records recurring bugs and their resolutions so they are not repeated.

---

## 1. Customer Account UI extension — bundle resolution failures

**Extension:** `extensions/customer-account-ui` (SuperApp Customer Blocks)

### Symptoms

- `Could not resolve "@shopify/ui-extensions-react/customer-account"`
- `Could not resolve "react"` / `Could not resolve "react/jsx-runtime"`
- `Could not resolve "react-reconciler"`
- `No matching export in ... @shopify/ui-extensions ... for import "Badge"` (and other components)

### Root causes

| Error | Cause |
|-------|--------|
| `@shopify/ui-extensions-react/customer-account` | Extension had no installable deps in scope for the bundler (e.g. missing deps or wrong workspace resolution). |
| `react` / `react/jsx-runtime` | **`react` was not listed in the extension's `dependencies`** — only `@types/react` in devDependencies. |
| `react-reconciler` | **Not declared**; required by `@remote-ui/react` (used by `@shopify/ui-extensions-react`). |
| `No matching export ... Badge` etc. | **Version mismatch:** `@shopify/ui-extensions` and `@shopify/ui-extensions-react` must be the **exact same version**; e.g. one on 2025.11.0 and the other on 2025.7.3 breaks the build. |

### Fix (do not skip)

In `extensions/customer-account-ui/package.json`:

1. **Add `react`** to `dependencies` (e.g. `"react": "^18.3.1"`).
2. **Add `react-reconciler`** to `dependencies` (e.g. `"react-reconciler": "^0.29.0"`).
3. **Pin both Shopify packages to the same version** (no caret), e.g.:
   - `"@shopify/ui-extensions": "2025.7.3"`
   - `"@shopify/ui-extensions-react": "2025.7.3"`

Then from repo root: `pnpm install --no-frozen-lockfile` (or update lockfile as needed).

### Reference

- [Shopify community: Could not resolve "react-reconciler"](https://community.shopify.dev/t/error-could-not-resolve-react-reconciler/24795)
- [Shopify community: ui-extensions not compatible with ui-extensions-react](https://community.shopify.dev/t/shopify-ui-extensions-not-compatible-with-shopify-ui-extensions-react/26302)

---

## 2. Customer Account UI extension — `customer-account.page.render` target separation

**Extension:** `extensions/customer-account-ui`

### Symptoms

- Deploy/build succeeds, then:
- **Validation error:** `The target 'customer-account.page.render' cannot be combined with any other targets`

### Root cause

In practice, combining `customer-account.page.render` with block-level targets (e.g. `order-index.block.render`, `order-status.block.render`, `profile.block.render`) in a single extension causes Shopify validation failures. This is reproducible and consistent, though not called out in a single authoritative Shopify doc. Shopify may impose constraints when mixing page-level and block-level targets in one extension.

### Fix

Recommended: separate page-level and block-level targets into different extensions.

- **Option A:** One extension for **page only**  
  - In `shopify.extension.toml`, keep only the `customer-account.page.render` target and remove the other `[[extensions.targeting]]` blocks.
- **Option B:** One extension for **blocks only** (current setup)  
  - Keep only block targets in this extension. This is what `superapp-customer-blocks` does today.
- **Option C:** Two extensions  
  - Split into e.g. "SuperApp Customer Page" (page render only) and "SuperApp Customer Blocks" (order-index, order-status, profile blocks).

Avoid adding `customer-account.page.render` to an extension that already registers other customer-account targets.

---

## 3. Admin Order Summary / Admin Block not showing on the order page

**Templates:** “Admin Block”, “Admin Order Support Card”, or any module with target `admin.order-details.block.render` (or other `admin.*` targets).

### Symptoms

- You create a module from an Admin template (e.g. “Admin Block” / “Order Details Block”) and publish it.
- The module shows as **Published** in the app, but **nothing appears** on the Shopify Admin order page (Orders → [order] → no custom block/card).

### Root cause (two parts)

1. **No Admin UI extension is deployed**  
   The app only has a **Customer Account UI** extension (`extensions/customer-account-ui`), which registers:
   - `customer-account.order-index.block.render`
   - `customer-account.order-status.block.render`
   - `customer-account.profile.block.render`  
   There is **no extension** that registers `admin.order-details.block.render` (or any `admin.*` target). So Shopify Admin has nowhere to render the block.

2. **Compiler does not deploy admin blocks**  
   For module type `admin.block` (and `pos.extension`, etc.), the compiler only returns an `AUDIT` op — it does **not** write any metafield or config that an Admin extension could read. So even if an Admin UI extension were added later, the app would still need a compiler path that writes admin-block config (e.g. to a metafield) and that extension would need to read it.

### Where things *do* show

- **Customer Account** (customer-facing):  
  Use templates that target **Customer Account** (e.g. “Order status block”, “Order index block”, “Profile block”). Those are compiled to the `superapp.customer_account` / `blocks` metafield and **are** rendered by the existing Customer Account UI extension on:
  - **Order status page** (customer view of a single order)
  - **Order index page** (customer’s order list)
  - **Profile page**

So “order” in **Customer Account** = the **customer’s** order status/index pages. “Order” in **Admin** = the **merchant’s** order details page in Shopify Admin. Only the former is implemented today.

### What would be needed for Admin order blocks to show

1. Add an **Admin UI extension** (Polaris Admin Extensions) that registers e.g. `admin.order-details.block.render` in its `shopify.extension.toml`.
2. Implement a **compiler path** for `admin.block` that writes config (e.g. shop metafield) that this extension reads.
3. Build and deploy that extension with `shopify app deploy`.

Until then, use **Customer Account** templates if you want blocks to appear on the **customer** order status/index pages.

---

## 4. `shopify app deploy` in CI / non-interactive

### Symptoms

- `Flag not specified: allow-updates`
- Message: "This flag is required in non-interactive terminal environments, such as a CI environment"

### Fix

Run deploy with the required flag:

```bash
pnpm exec shopify app deploy --allow-updates
```

Use the same in CI or when piping input. In an interactive terminal you can omit it and answer the prompt.

---

## 5. `/api/publish` silently fails — "Missing moduleId"

**Route:** `apps/web/app/routes/api.publish.tsx`

### Symptoms

- Clicking **Publish** on the module detail page returns `{ "error": "Missing moduleId" }` (HTTP 400).
- No errors in the browser console. The `<Form method="post">` submits successfully but the body is never parsed.

### Root cause

The module detail page (`modules.$moduleId.tsx`) uses a Remix `<Form method="post" action="/api/publish">`, which sends `application/x-www-form-urlencoded`. The API route only called `request.json()`, which returns `null` for form-encoded bodies — so `body?.moduleId` was always falsy.

A second issue: only `theme.banner` was routed to `{ kind: 'THEME' }` deploy target. `theme.popup` and `theme.notificationBar` were incorrectly sent as `PLATFORM`, causing publish failures for those module types.

### Fix

1. **Detect `Content-Type`** and parse accordingly:
   - `application/json` → `request.json()`
   - Otherwise → `request.formData()` and extract `moduleId`, `themeId`, `version` from form fields.
2. **Route all `theme.*` types** to THEME target using `spec.type.startsWith('theme.')` instead of `=== 'theme.banner'`.

### Reference

- Remix `<Form>` sends `application/x-www-form-urlencoded` by default, not JSON.
- Shopify embedded app bridges do not change form encoding.

---

## 6. Customer Account UI extension — script exceeds 64 KB limit

**Extension:** `extensions/customer-account-ui`

### Symptoms

- `shopify app dev` or deploy: **"Your script size is 74 KB which exceeds the 64 KB limit"**
- Dev preview fails to start.

### Root cause

As of API version **2025-10** / **2026-01**, Shopify enforces a **64 KB** compiled script limit for UI extensions. Using **React** + `@shopify/ui-extensions-react` (and thus `react-reconciler`, `@remote-ui/react`) pushes the bundle over that limit.

### Fix

**Migrate to Preact + Polaris web components** (recommended by Shopify for 2026-01):

1. **Dependencies** (`extensions/customer-account-ui/package.json`):
   - Remove: `react`, `react-reconciler`, `@shopify/ui-extensions-react`.
   - Add: `preact` (e.g. `^10.10.0`), `@preact/signals` (e.g. `^2.3.0`), `@shopify/ui-extensions` at **2026.1.0** (or 2026.01.x).

2. **Entry and UI**:
   - Each block entry file must `import '@shopify/ui-extensions/preact'` and `import { render } from 'preact'`.
   - Default export: `export default async function extension() { render(<YourBlock />, document.body); }`.
   - Replace React components (`BlockStack`, `Heading`, `Text`, `Link`, `Badge`, `Divider`) with **Polaris web components**: `<s-stack>`, `<s-heading>`, `<s-text>`, `<s-link>`, `<s-badge>`, `<s-separator>` (or equivalent).

3. **API**:
   - Use the **global `shopify` object** (e.g. `shopify.query()` for GraphQL) instead of React hooks like `useApi()`. Add `[extensions.capabilities]` with `api_access = true` in `shopify.extension.toml` if you use Storefront API.

4. **TypeScript**:
   - In the extension's `tsconfig.json`, set `"jsxImportSource": "preact"` so JSX compiles for Preact.

After migration, the bundle stays under 64 KB and deploy/dev succeed.

### Reference

- [Upgrading to 2026-01](https://shopify.dev/docs/api/customer-account-ui-extensions/2026-01/upgrading-to-2026-01)
- [Shopify community: Script exceeds 64 KB limit](https://community.shopify.dev/t/2025-10-0-rc-script-exceeds-64-kb-limit/21953)

---

## 6a. Admin UI extension (order/customer/product block) — script exceeds 64 KB limit

**Extension:** `extensions/admin-ui` (SuperApp Order Block, SuperApp Customer Block, SuperApp Product Block)

### Symptoms

- `shopify app dev` or deploy: **"Your script size is 71 KB which exceeds the 64 KB limit"** for one or more of `superapp-admin-order-block`, `superapp-admin-customer-block`, `superapp-admin-product-block`.
- App preview fails to start.

### Root cause

Same as §6: the **64 KB** compiled script limit. Using **React** + `@shopify/ui-extensions-react/admin` pushes each admin block bundle over the limit.

### Fix

**Migrate to Preact + Polaris web components** (same approach as Customer Account UI in §6):

1. **Dependencies** (`extensions/admin-ui/package.json`): Use `preact`, `@preact/signals`, and `@shopify/ui-extensions` at **2026.1.0** only. Remove `react`, `react-reconciler`, and `@shopify/ui-extensions-react`.

2. **Entry and UI:** Each block entry (e.g. `OrderDetails.tsx`) uses `import '@shopify/ui-extensions/preact'`, `import { render } from 'preact'`, and default export `export default async function extension() { render(<Block />, document.body); }`. Replace React components with Polaris web components: `<s-admin-block>`, `<s-stack>`, `<s-text>`, `<s-link>`, `<s-badge>`.

3. **API:** Use `fetch('shopify:admin/api/graphql.json', { method: 'POST', body: JSON.stringify({ query: '...' }) })` for the shop metafield query instead of `useApi().query()`. Ensure `[extensions.capabilities]` has `api_access = true` in `shopify.extension.toml`.

4. **TypeScript:** In the extension's `tsconfig.json`, set `"jsxImportSource": "preact"`.

After migration, all three admin block bundles stay under 64 KB and deploy/dev succeed.

---

## 7. Embedded app: "This content is blocked. Contact the site owner to fix the issue."

**Context:** Opening the app from Shopify Admin (Apps → Super App AI) shows a blank iframe with this message.

### Root cause

The app loads inside an iframe. The browser or Shopify blocks the content when:

1. **App URL is HTTP (e.g. localhost)** — Admin is on `https://admin.shopify.com`. If the configured App URL is `http://localhost:3000`, the iframe loads HTTP inside HTTPS. Browsers block this **mixed content**, so the iframe shows "This content is blocked."
2. **App URL is wrong or unreachable** — The URL stored in the Partner Dashboard (or in the app config) doesn't match where the app is running, or the server/tunnel is down.

### Fix

**For local development:**

1. **Use the Shopify CLI tunnel (HTTPS).** From the repo root run:
   ```bash
   shopify app dev
   ```
   This starts a tunnel (HTTPS URL) and the Remix app, and updates the app's configuration so the App URL is the tunnel URL.

2. **Open the app from Admin only after `shopify app dev` is running.** Use the store that the CLI selected (e.g. kushtestinfotech). The iframe will load the tunnel URL (HTTPS), so the app will load.

3. **Ensure `SHOPIFY_APP_URL` matches the tunnel.** When you run `shopify app dev`, the CLI may update `.env` or you may need to copy the tunnel URL (e.g. `https://xxxx.trycloudflare.com`) into `apps/web/.env` as `SHOPIFY_APP_URL=...`. Restart the dev process after changing `.env`.

**If you already use a tunnel:**

- Confirm the app process is running and the tunnel is active.
- In **Partner Dashboard → Your app → App setup → URLs**, the App URL must be exactly the tunnel URL (HTTPS). If it still shows `http://localhost:3000`, run `shopify app dev` again so the CLI can update it, or set the App URL manually to your current tunnel URL.

**Production:** Set the App URL in Partner Dashboard to your production HTTPS URL (e.g. `https://your-app.example.com`). Ensure the app is deployed and reachable at that URL.

### CLI prints `app_home │ Using URL: http://localhost:3000` (sub-issue)

This means the CLI found **no web component to tunnel**. The fix is `apps/web/shopify.web.toml` (already in the repo):

```toml
roles = ["frontend", "backend"]
[commands]
dev = "pnpm dev"
build = "pnpm build"
```

Port is not hard-coded: the CLI assigns a port and sets `PORT` when running `shopify app dev` (avoids "port 3000 is not available"). Vite uses `process.env.PORT` or defaults to 3000 when you run `pnpm dev` directly.

With this file and `web_directories = ["apps/web"]` in root `shopify.app.toml`, the CLI will:
- Auto-start `pnpm dev` in `apps/web/`
- Assign a port and create a tunnel to it
- Update the app URL to `https://xxxx.trycloudflare.com`

After ensuring the file is present, **press q to quit `shopify app dev`** and re-run from the repo root:

```bash
cd /path/to/ai-shopify-superapp
shopify app dev
```

Look for `app_home │ Using URL: https://...` — if HTTPS, the admin iframe will load the app.

### Additional checks

1. **URL must be HTTPS** — if still `http://localhost:3000`, the `shopify.web.toml` is not being discovered; confirm `web_directories = ["apps/web"]` exists in the root `shopify.app.toml`.
2. **Check for extension build failures** — if the CLI shows "script size exceeds 64 KB" the dev preview may not start; fix the extension first (see §5) then restart.
3. **Test the tunnel URL directly** — paste the HTTPS URL from the CLI into a new browser tab. If the app loads there but not in Admin, hard refresh (Cmd+Shift+R) or use incognito.
4. **`SHOPIFY_APP_URL` env** — use `./dev.sh` (or `pnpm dev` from repo root) to auto-patch `apps/web/.env`; see §7 for details.

### Reference

- [Shopify: Set up iframe protection](https://shopify.dev/docs/apps/build/security/set-up-iframe-protection) (frame-ancestors; `@shopify/shopify-app-remix` sets these via `boundary.headers`).
- [Shopify CLI web component config](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)

---

## 7. Embedded app "Invalid path /?embedded=1&hmac=..." — missing token exchange flag

### Symptom

Embedded app shows `Invalid path /?embedded=1&hmac=...` in the Shopify Admin iframe. The app loads but authentication fails on every request.

### Root cause

`shopify.server.ts` was missing the `future.unstable_newEmbeddedAuthStrategy` flag. Without it, `@shopify/shopify-app-remix` v2.x uses the **legacy OAuth redirect flow**, which requires properly configured `redirect_urls` and is fragile with dynamic tunnel URLs.

With the flag enabled, the app uses **token exchange** — App Bridge sends a session token in the request header, and the server exchanges it for an access token. No redirect flow, no redirect URLs needed.

This flag is included in every standard Shopify CLI template (`shopify app init`), which is why other apps work out of the box.

### Additional issues found

| Problem | Effect |
|---------|--------|
| Duplicate `apps/web/shopify.app.toml` with literal `$SHOPIFY_API_KEY` strings | TOML doesn't support env var interpolation — this file had invalid values. CLI only reads the root TOML. |
| `SHOPIFY_APP_URL` in `.env` had `/extensions/dev-console` appended | App URL must be origin-only (scheme + host). The CLI injects the correct tunnel URL at runtime. |
| `redirect_urls = []` in root TOML | Not needed with token exchange, but would break the legacy OAuth flow. |

### Fix

In `apps/web/app/shopify.server.ts`:

```ts
import { shopifyApp, AppDistribution } from '@shopify/shopify-app-remix/server';

export const shopify = shopifyApp({
  // ...existing config...
  distribution: AppDistribution.AppStore,
  authPathPrefix: '/auth',
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});
```

Also:
- Delete `apps/web/shopify.app.toml` (only the root one matters).
- Set `SHOPIFY_APP_URL` in `.env` to `http://localhost:3000` (fallback only — CLI overrides at dev time).
- Ensure `use_legacy_install_flow = false` in root `shopify.app.toml` (required for managed install + token exchange).

### Reference

- [Shopify: New embedded auth strategy](https://shopify.dev/docs/api/shopify-app-remix#embedded-auth-strategy)
- [Shopify: Token exchange](https://shopify.dev/docs/apps/auth/get-access-tokens/token-exchange)
- [Shopify: Managed installation](https://shopify.dev/docs/apps/auth/installation#shopify-managed-installation)

---

## 8. Admin app: cards sharp corners — Polaris new Card (ShadowBevel)

### Symptom

Cards (Connectors, Billing plan cards, Dashboard stats, etc.) have sharp, zero-radius corners in the embedded app even after adding CSS overrides for `.Polaris-LegacyCard`.

### Root cause

The app uses Polaris’s **new `Card`** component (`import { Card } from '@shopify/polaris'`), which renders **ShadowBevel + Box** with class **`.Polaris-ShadowBevel`**. It does **not** use LegacyCard (`.Polaris-LegacyCard`). Polaris sets `border-radius: 0` on small viewports for the new Card, so overrides targeting only LegacyCard had no effect.

### Fix

1. **app.css** — Include `.Polaris-ShadowBevel` in the rounded-corners rule:
   ```css
   .Polaris-ShadowBevel, .Polaris-Banner, .Polaris-LegacyCard {
     border-radius: 12px !important;
     overflow: hidden;
   }
   ```
2. **root.tsx** — Add the same selector to the inline `<style>` in `<head>` so rounding applies even when the external stylesheet loads late (e.g. after cache reset).

### Reference

- Polaris 12: `Card` → `ShadowBevel` (`.Polaris-ShadowBevel`); `LegacyCard` is deprecated and uses `.Polaris-LegacyCard`.

---

## 10. Embedded app: postMessage origin mismatch and hydration errors

**Context:** App runs in Admin iframe via tunnel (e.g. `https://xxxx.trycloudflare.com`). Console shows postMessage and hydration errors.

### Symptom 1: `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('https://xxxx.trycloudflare.com') does not match the recipient window's origin ('https://admin.shopify.com')`

The App Bridge (or auth flow) sends a message using the app’s origin (tunnel URL) as the target, while the iframe parent is `admin.shopify.com`. With Cloudflare (or similar) tunnels, the app URL changes each run, and the library may use that URL as the postMessage target; the parent rejects it.

**What to do:** This is expected when using a dynamic tunnel URL. Ensure **Partner Dashboard → App → App setup → URLs** has the **exact** tunnel URL that `shopify app dev` prints. The app should still load; the message may be retried or handled by the bridge. For production, use a stable App URL so the origin is consistent.

### Symptom 2: `Prop className did not match. Server: "...mediumTitle" Client: "...mobileView ...mediumTitle"` and `Hydration failed because the initial UI does not match what was rendered on the server`

The server has no viewport, so Polaris Page/Header renders without `mobileView`. The client runs inside a narrow iframe and adds `Polaris-Page-Header--mobileView`, so the initial HTML and the first client render differ and React throws during hydration.

**Fix:** Defer viewport-dependent UI until after mount. In the route that uses Polaris `Page` (e.g. Modules), render a minimal placeholder (e.g. a div with `Spinner`) on the server and on the first client paint, then in `useEffect` set `mounted` to true and render the full `Page`. That way server and client both output the same initial HTML and there is no className mismatch. See `apps/web/app/routes/modules._index.tsx`: `mounted` state + `if (!mounted) return <div>...<Spinner /></div>;` then the full page.

---

## 11. Module detail page: `ReferenceError: Cannot access 'isPublishing' before initialization`

**Route:** `apps/web/app/routes/modules.$moduleId.tsx`

### Symptoms

- Opening any module detail page crashes the embedded app with **"Application Error"**.
- Server log: `ReferenceError: Cannot access 'isPublishing' before initialization at ModuleDetail (modules.$moduleId.tsx:107:...)`.

### Root cause

JavaScript `const` declarations are in the Temporal Dead Zone (TDZ) — they cannot be referenced before their declaration line, even within the same function body. The file had:

```ts
const isSaving = nav.state !== 'idle' || isPublishing;  // line 107 — reads isPublishing
// ...many lines later...
const publishFetcher = useFetcher();
const isPublishing = publishFetcher.state !== 'idle';    // line 122 — too late
```

`isPublishing` is declared after `isSaving`, so `isSaving` throws a TDZ error at runtime.

React hooks have the added constraint that their **call order must be stable** — reordering hooks changes the call order, which is safe as long as no hooks are added or removed conditionally. Reordering `const`-derivations of hook results is always safe.

### Fix

Move all `useFetcher` calls and their derived booleans **above** any code that references them:

```ts
const nav = useNavigation();
const modifyFetcher = useFetcher<...>();
const modifyConfirmFetcher = useFetcher<...>();
const publishFetcher = useFetcher<{ error?: string }>();
const PublishForm = publishFetcher.Form;
const isPublishing = publishFetcher.state !== 'idle';
const isModifying = modifyFetcher.state !== 'idle';
const isModifyConfirming = modifyConfirmFetcher.state !== 'idle';
const isSaving = nav.state !== 'idle' || publishFetcher.state !== 'idle';
```

Also: after changing a Remix file, **restart the dev server** — HMR does not always recompile cleanly and may serve stale compiled output that still contains the error.

---

## 12. Publish 500 — "Theme not found" (REST API deprecated)

**Route:** `apps/web/app/services/shopify/theme.service.ts`

### Symptoms

- Publish returns HTTP 500 with `{"error":"Theme 133507481791 not found. Please check the theme ID."}`
- Theme validation passes (theme exists in `listThemes()`), but asset upsert fails
- Preview shows only a text label for `theme.effect` modules — no particles or animations

### Root cause

1. **REST API deprecated:** `ThemeService.upsertAsset()` and `deleteAsset()` used `this.admin.rest.post/delete` with path `themes/{id}/assets.json`. Shopify REST theme asset endpoints are deprecated in API version `2026-01` and return 404. The `normalizeThemeApiError` mapped 404 → "Theme not found".

2. **Preview text-only:** The `PreviewService.effect()` method rendered a text description (`"Effect: snowfall (medium, normal)"`) instead of actual CSS particle animations.

### Fix

1. **Migrated ThemeService to GraphQL:** `upsertAsset` now uses `themeFilesUpsert` mutation; `deleteAsset` uses `themeFilesDelete`. Numeric theme IDs are converted to GID format (`gid://shopify/OnlineStoreTheme/{id}`) via `toGid()` helper. GraphQL `userErrors` are checked and thrown as `Error`.

2. **Effect preview with animations:** `PreviewService.effect()` now renders actual particle `<div>` elements with CSS `@keyframes superapp-effect-fall` animation matching the compiled Liquid/CSS output (particle count from intensity, animation speed from speed config, snowfall vs confetti particle styles).

### Reference

- Shopify GraphQL Admin API: `themeFilesUpsert` / `themeFilesDelete` mutations
- GID format: `gid://shopify/OnlineStoreTheme/{numeric_id}`

---

## 13. Anthropic 429 causes `Unable to decode turbo-stream response` (blank page, no error shown)

**Route:** `apps/web/app/routes/api.ai.create-module.tsx`
**Date:** 2026-03-06

### Symptoms

- UI shows the AI generating animation indefinitely, then shows a blank Application Error page.
- Browser console: `Unable to decode turbo-stream response from URL: /api/ai/create-module.data`
- API log shows attempt 0 → HTTP 429 → duration ~400ms, then nothing.

### Root cause

On a 429 from Anthropic, the old retry logic used 15s–30s backoffs (3 attempts). Total wait time exceeded the Cloudflare tunnel request timeout. The server never finished sending a response body, so Remix's turbo-stream client threw a decode error on the client — resulting in a blank page with no user-facing message.

### Fix

1. **`ai-http.server.ts`:** 429 retries exactly once with `min(retry-after, 10s)` delay. After one retry it throws immediately with `{ statusCode: 429 }` on the error object. This keeps total wait under 10s.
2. **`api.ai.create-module.tsx`:** Catches `e?.statusCode === 429` and returns `json({ error: 'RATE_LIMITED', message: '...' }, { status: 429 })` — a decodable JSON response (not a server timeout).
3. **`modules._index.tsx`:** Renders a warning banner with "Try again" button for `RATE_LIMITED` errors instead of critical red.

### Rule

Never use long backoffs (>10s) in request handlers that go through Cloudflare tunnels or any proxy with a timeout. Fail fast, surface a clean error, let the client retry.

---

## 14. Anthropic org rate limit (10K tokens/min) — all requests fail with 429

**Route:** `apps/web/app/routes/api.ai.create-module.tsx`
**Date:** 2026-03-06

### Symptoms

- Error: `"This request would exceed your organization's rate limit of 10,000 input tokens per minute (org: ..., model: claude-sonnet-4-6)"`
- Happens consistently after 1–2 requests within a 60-second window.

### Root cause

Anthropic free/starter tier has a 10K input tokens/min org-wide limit. The compiled prompt is ~1,400 tokens. Back-to-back requests from multiple test users (or rapid testing) exhausts the quota.

### Fix

1. **`llm.server.ts`:** Added `FallbackLlmClient` class. If Anthropic throws 429, it transparently retries the same prompt with OpenAI (`gpt-4o-mini`). No change needed in callers.
2. **Token reduction for high-confidence:** Skip full types list (~2K tokens) and intent packet on first attempt when classifier confidence ≥ 0.8 (type already known).
3. **`openai-responses.client.server.ts`:** Added system prompt + `max_output_tokens: 4096` to match Anthropic output quality. Fixed default model typo: `gpt-5-mini` → `gpt-4o-mini`.

### Setup

Set `OPENAI_API_KEY` in `.env`. Fallback activates automatically when both keys are present.

### Rule

Always have a fallback AI provider configured. Org-level rate limits are shared across all users of the Anthropic account, not per-shop.

---

## 15. "Redirected you too many times" after clicking "Use this option"

**Route:** `apps/web/app/routes/modules._index.tsx`
**Date:** 2026-03-06

### Symptoms

- After clicking "Use this option", browser shows `ERR_TOO_MANY_REDIRECTS` (blank page with redirect error).
- Module **is** created successfully — it appears in the table after a manual page refresh.
- Only happens with Cloudflare tunnel URLs, not necessarily in production.

### Root cause

`confirmFetcher` returned `{ moduleId }`. The `useEffect` navigated with:

```ts
window.location.href = `/modules/${confirmFetcher.data.moduleId}`;
```

`window.location.href` in a Shopify embedded app (running inside an iframe) bypasses App Bridge's router and forces a raw browser navigation. Shopify's `authenticate.admin()` in the loader detects the missing auth context and issues a redirect to add `host`/HMAC params. That redirect goes through the Cloudflare tunnel → triggers another auth check → infinite loop.

### Fix

```ts
// WRONG — causes redirect loop in embedded Shopify app
window.location.href = `/modules/${confirmFetcher.data.moduleId}`;

// CORRECT — stays inside App Bridge iframe context, auth already satisfied
navigate(`/modules/${confirmFetcher.data.moduleId}`);
```

Use Remix's `useNavigate()` from `@remix-run/react` for all intra-app navigation.

### Rule

**Never use `window.location.href` for navigation inside embedded Shopify apps.** Always use `useNavigate()` or Remix `<Link>`. `window.location.href` bypasses App Bridge and causes auth redirect loops — especially visible with Cloudflare tunnel URLs.

---

## 16. Anthropic `server_tool_use` blocks → 422 hydration failure

**Route:** `apps/web/app/routes/api.agent.modules.$moduleId.hydrate.tsx` / `api.ai.hydrate-module.tsx`
**Date:** 2026-03-06

### Symptoms

- Hydration returns HTTP 422 with error: `Anthropic response missing text (content had N block(s), types: server_tool_use)`.
- API log shows Anthropic returned HTTP 200 but no usable text content.

### Root cause

On certain Anthropic API tiers, Anthropic's built-in server-side tools are automatically invoked when the request matches a trigger pattern. The response contains only `server_tool_use` content blocks — no `text` blocks. `extractText()` found nothing and threw.

`FallbackLlmClient` only caught `statusCode === 429` at the time, so it did not retry with OpenAI.

### Fix

Broadened `FallbackLlmClient.generateRecipe()` to catch **any** error from the primary client (not just 429) and retry with OpenAI fallback. If both fail, the primary error is re-thrown.

```ts
// llm.server.ts — FallbackLlmClient
async generateRecipe(prompt, hints) {
  try {
    return await this.primary.generateRecipe(prompt, hints);
  } catch (primaryErr) {
    try {
      return await this.fallback.generateRecipe(prompt, hints);
    } catch {
      throw primaryErr; // both failed — most informative error
    }
  }
}
```

### Rule

Any Anthropic-specific error (tool-use blocks, model refusals, unexpected content types) should silently fall back to OpenAI. Never gate `FallbackLlmClient` on a specific error code.

---

## 17. OpenAI `max_output_tokens: 4096` causes JSON truncation on hydration

**File:** `apps/web/app/services/ai/clients/openai-responses.client.server.ts`
**Date:** 2026-03-07

### Symptoms

- Hydration returns: `Hydrate envelope validation failed after 2 attempts: SyntaxError: Unterminated string in JSON at position 8604`
- API log: OpenAI returned HTTP 200 but the JSON ends mid-string.
- Happens only when Anthropic is rate-limited and OpenAI fallback is used.

### Root cause

`openAiGenerateRecipe` had `max_output_tokens: 4096` hardcoded. The hydration envelope (with `adminConfig.jsonSchema`, `themeEditorSettings`, `implementationPlan`, etc.) easily exceeds 4096 output tokens. OpenAI truncates at the token limit, producing invalid JSON.

The Anthropic client already defaulted to `maxTokens: 8192`. OpenAI had no equivalent parameter — the cap was hardcoded with no way to override it per call site.

### Fix

1. Added `maxTokens?: number` parameter to `openAiGenerateRecipe` (same pattern as Anthropic client).
2. Changed default from `4096` → `8192`: `max_output_tokens: opts.maxTokens ?? 8192`.
3. Propagated `maxTokens` through `LlmClient.generateRecipe(prompt, hints)` interface (added `maxTokens` to hints).
4. `hydrateRecipeSpec` in `llm.server.ts` now passes `maxTokens: 16000` to give hydration ample headroom.
5. `FallbackLlmClient`, `EnvOpenAiClient`, `EnvClaudeClient`, `ConfiguredLlmClient` all propagate `hints.maxTokens`.

### Rule

Never hardcode `max_output_tokens` in a client function. Always accept it as an override parameter. Callers that need large responses (like hydration) must explicitly request higher token limits.

---

## 18. Hydration 200s+ duration exceeds Cloudflare timeout → turbo-stream decode error

**Route:** `apps/web/app/routes/api.ai.hydrate-module.tsx`
**Date:** 2026-03-07

### Symptoms

- Client shows: `Unable to decode turbo-stream response from URL: .../api/ai/hydrate-module.data`
- API log shows: hydrate-module HTTP 422 after 200,000+ ms.
- OpenAI fallback (triggered by Anthropic 429) took 71s+ for hydration, total request ~200s.
- Same root cause as BUG-001 (§13): request exceeds Cloudflare tunnel timeout → server never sends response body → client decode fails.

### Root cause

The hydration prompt included a `previewHtml` instruction asking the AI to generate a full self-contained HTML document as part of the same JSON response. This instruction:

1. Roughly doubled the output token count (HTML preview is large).
2. Combined with the already-large hydration envelope, pushed OpenAI well past 4096 tokens (hitting the truncation bug in §17).
3. Made the overall AI response time 3–4× longer than without `previewHtml`, exceeding the Cloudflare tunnel timeout (~90-100s).

### Fix

Removed `previewHtml` from the hydration prompt (`hydrate-prompt.server.ts`). The `PreviewService` already generates accurate, interactive, type-specific HTML previews deterministically — no AI generation needed. The module detail page continues to use `PreviewService` as the preview source.

The `previewHtml` field remains in `HydrateEnvelopeSchema` as `optional()` for future use (e.g. a separate dedicated call), but is no longer requested in the prompt.

### Rule

Do not bundle large generative tasks (HTML generation, multi-section reports) in the same AI call as structured JSON output. Each call must stay well under the timeout budget. Deterministic alternatives (like `PreviewService`) are always preferable for UI previews.

---

## 19. `PrismaClientValidationError: Unknown argument 'shopId'` on ApiLog / ErrorLog / Job / AiUsage / FlowStepLog create

**Files:** `api-log.service.ts`, `error-log.service.ts`, `ai-usage.service.ts`, `job.service.ts`, `flow-runner.service.ts`
**Date:** 2026-03-07

### Symptoms

- App throws `PrismaClientValidationError: Unknown argument 'shopId'. Did you mean 'shop'?` when any route that uses observability logging is opened.
- Error appears immediately on page load (e.g. opening a module detail page triggers the hydrate route → `ApiLogService.start()` → crash).

### Root cause

The Prisma client was generated from an older schema snapshot where `shopId` was not yet a scalar field on these models. The current schema defines:

```prisma
shopId String?
shop   Shop?   @relation(fields: [shopId], references: [id])
```

When the Prisma client is stale (not regenerated after schema changes), Prisma exposes only the relation name (`shop`) in the create input — not the underlying scalar (`shopId`). Passing `shopId: value` directly throws `Unknown argument`.

### Fix

Changed all affected `prisma.*.create()` calls to use the Prisma relation connect syntax instead of the scalar:

```ts
// WRONG — fails if Prisma client is stale
shopId: params.shopId ?? null

// CORRECT — works regardless of Prisma client generation state
shop: params.shopId ? { connect: { id: params.shopId } } : undefined
```

Fixed in: `ApiLogService.start()`, `ApiLogService.write()`, `ErrorLogService.write()`, `AiUsageService.record()`, `JobService.create()`, `FlowStepLog` create in `flow-runner.service.ts`.

### Rule

After modifying `schema.prisma`, always run `pnpm prisma generate` in `apps/web/` before restarting the dev server. If it's not clear whether the client is up to date, prefer the relation connect syntax over scalar assignment — it works in both cases.

---

## 21. Adding new bugs to this doc

When you hit a new recurring or non-obvious bug:

1. Add a **numbered section** with a short title.
2. Include **symptoms** (exact errors or behavior).
3. Explain **root cause** briefly.
4. Give a **concrete fix** (steps or config).
5. Add **references** (docs, forum, tickets) if useful.

Keep entries short and copy-paste friendly so the next person can fix without re-debugging.

---

## Quick reference: Cloudflare tunnel timeout rules

Cloudflare tunnels (trycloudflare.com) have a hard request timeout of ~90–100 seconds. Any server handler that takes longer will drop the connection mid-response — the client sees `Unable to decode turbo-stream response` (Remix) or a generic network error.

**Budget per handler:**
- AI create-module: ≤ 60s (3 attempts × ~20s each)
- AI hydrate-module: ≤ 60s (envelope only, no extra generative tasks)
- Publish: ≤ 30s (Shopify GraphQL calls)
- Connector test: ≤ 20s

**Never do in a single handler:**
- Long AI backoff retries (>10s per retry — see §13)
- Bundled large generative tasks in the same AI call (see §18)
- Synchronous polling loops waiting for external state

---

## 22. Admin block metafield never written — `PLATFORM` target missing `moduleId`

### Symptoms
- Admin block module publishes successfully (status shows PUBLISHED)
- `superapp.admin/blocks` shop metafield is never created/updated
- Admin UI extension always shows "No admin blocks configured" placeholder
- Block content never appears in Shopify Admin order/product/customer pages

### Root cause
`api.publish.tsx` built the `DeployTarget` as:
```ts
// WRONG — no moduleId for non-theme modules
const target: DeployTarget = isThemeModule
  ? { kind: 'THEME', themeId: ..., moduleId: module.id }
  : { kind: 'PLATFORM' };  // ← moduleId missing
```
`PublishService.publish()` gates the metafield write on `target.moduleId`:
```ts
if (adminBlockPayload && target.moduleId) { ... } // always false for PLATFORM
```
So the metafield was never set for `admin.block` (or any non-theme module type).

### Fix
1. Added `moduleId?: string` to the `PLATFORM` variant of `DeployTarget` in `packages/core/src/recipe.ts`
2. Passed `moduleId: module.id` in the PLATFORM target in `api.publish.tsx`
3. Rebuilt `@superapp/core` (`npm run build` in `packages/core/`)

### Rule
Any new non-theme module type that needs to write a metafield on publish must ensure `target.moduleId` is set. The publish service uses `target.moduleId` as the key for all platform-side metafield writes (`admin.block`, `admin.action`, future types).

---

## 23. Preact UI extensions — `s-*` component prop mismatches between admin and checkout contexts

### Symptoms
TypeScript errors like:
- `Property 'appearance' does not exist on type 'TextProps & BaseElementPropsWithChildren<TextElement>'`
- `Property 'fontWeight' does not exist on type 'TextProps'`
- `Property 's-inline' does not exist on type 'JSX.IntrinsicElements'`
- `Property 'title' does not exist on type 'BannerProps'`

### Root cause
Checkout UI extensions (`purchase.checkout.block.render`, `purchase.thank-you.block.render`) import `@shopify/ui-extensions` which applies strict, target-specific prop types to `s-*` components. These are different from the generic `s-*` web component declarations used in admin/customer-account extensions.

Specifically:
- Checkout `s-text` has no `appearance` or `fontWeight` prop
- Checkout `s-banner` has no `title` prop
- `s-inline` does not exist in checkout context
- `s-badge` only accepts `'critical' | 'auto' | 'neutral'` tones (not `'success'`)
- `gap="tight"` is not a valid spacing value in checkout

### Fix
In `checkout-ui` components:
- Use `<s-text>` without `appearance`/`fontWeight`
- Use `<s-banner tone={...}>` without `title`
- Replace `s-inline` with `s-stack` for layout
- Only use spacing values valid in checkout (`"base"`, `"none"` etc.)
- For `s-badge` tones use only `'critical' | 'auto' | 'neutral'`

Admin and customer-account extensions have custom `s-*` declarations (via `shopify.d.ts`) that accept arbitrary props — checkout uses the real API types.

---

## 24. Admin block renderer shows nothing — config fields not matching hardcoded keys

### Symptoms
- Admin block renders only the module label (bold heading) but no content below it
- Module has config fields but none appear in Shopify Admin

### Root cause
`AdminBlockRenderer` originally looked for specific hardcoded config keys (`message`, `description`, `body`, `ctaText`, `ctaUrl`, `status`, `linkText`, `linkUrl`). AI-generated modules use different field names (`shouldRender`, `printInstructions`, etc.) that didn't match.

### Fix
Replaced the hardcoded field renderer with a fully generic renderer that iterates `Object.entries(block.config)` and renders all fields dynamically:
- Strings with URL-like key names → `<s-link>`
- Booleans → `<s-badge tone="success|critical">`
- Arrays → bullet list of `<s-text>`
- Objects → expanded key-value rows
- All other values → `<s-text>` with label prefix

**Rule:** Never hardcode expected field names in UI extension renderers. AI generates arbitrary config schemas — the renderer must be schema-agnostic.
