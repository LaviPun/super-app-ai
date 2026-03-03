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

## 3. `shopify app deploy` in CI / non-interactive

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

## 4. `/api/publish` silently fails — "Missing moduleId"

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

## 5. Customer Account UI extension — script exceeds 64 KB limit

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

## 6. Embedded app: "This content is blocked. Contact the site owner to fix the issue."

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
type = "backend"
[dev]
command = "pnpm dev"
port = 3000
[build]
command = "pnpm build"
```

With this file and `web_directories = ["apps/web"]` in root `shopify.app.toml`, the CLI will:
- Auto-start `pnpm dev` in `apps/web/`
- Create a tunnel to port 3000
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

## 9. Adding new bugs to this doc

When you hit a new recurring or non-obvious bug:

1. Add a **numbered section** with a short title.
2. Include **symptoms** (exact errors or behavior).
3. Explain **root cause** briefly.
4. Give a **concrete fix** (steps or config).
5. Add **references** (docs, forum, tickets) if useful.

Keep entries short and copy-paste friendly so the next person can fix without re-debugging.
