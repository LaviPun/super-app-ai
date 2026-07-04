# Dev-store QA checklist — full-surface buildout + template libraries

Branch `feat/027-unified-builder` (HEAD `89b309d`). This is a **live dev-store** pass — the CI gates (build/typecheck/tests/`config validate`/dev-MCP validation) are already green; what needs a real store is *render + enforcement + honesty under live data*, which unit tests can't exercise.

## 0. Setup
- [ ] Install/point the app at a Shopify **development store** (Plus dev store for checkout/B2B/POS surfaces).
- [ ] `shopify app deploy` — confirm all extensions register (admin-ui, checkout-ui, customer-account-ui, theme-app-extension, POS block, the 6 admin_link + admin-print/discount-function-settings/segment-template, flow_* extensions, web-pixel, Function crates). Confirm the 2 unstable pickup extensions are **excluded** (`extension_directories` allowlist).
- [ ] Build the Function wasm in CI/with a working `wasm32` toolchain (`cargo build --target=wasm32-unknown-unknown --release`); add each new crate handle to the deployed-function manifest → the Function types flip `deployable`.
- [ ] Env/flags: leave `THEME_NATIVE_SECTION_ENABLED` / `AGENTIC_AGENTS_MD_ENABLED` **off** (no `write_themes` exemption yet); set SMS (`SMS_PROVIDER_*`) + `VAPID_*` only if testing those channels.

## 1. Generation + template grounding (the core loop)
- [ ] In the merchant Builder (`/generate`), request one module per surface family (e.g. "product-page trust badges", "cart free-shipping bar", "tiered volume discount", "loyalty points block in customer account", "abandoned-cart email", "POS loyalty tile", "order-details admin block", "hero section").
- [ ] Each generation resolves to a real `RecipeSpec` (no schema errors); the **518-template RAG grounding** produces output that reflects the studied apps' controls/layouts, not generic filler.
- [ ] Preview renders deterministically (no AI preview generation); tokens/colors match the store palette.
- [ ] "Fill missing settings" button (Validation card, `modules.$moduleId.tsx`) populates missing fields and revalidates.

## 2. Storefront — theme
- [ ] **App-block sections:** add a generated `theme.section` (app-block) via the theme editor; confirm it renders with the compiled scoped CSS/tokens. Test **placement**: a product-targeted block does NOT render on collection/cart (render-gate), and renders on product.
- [ ] **App-embed body:** a popup/floating-widget module renders site-wide; **head injection:** a JSON-LD/pixel/consent module appears in `<head>` and NOT in `<body>`.
- [ ] **Native sections** (only if `write_themes` exemption granted + flag on): push to an **unpublished/duplicated** theme; verify the `sections/superapp-*.liquid` renders, `{% schema %}` presets appear in the editor, allow-list rejects non-superapp paths, and the live theme is never auto-published.
- [ ] **proxy.widget:** embedded (liquid/json) + full-page widgets render at `/apps/superapp/<widgetId>`.

## 3. Checkout + post-purchase (Plus)
- [ ] Generated `checkout.block`/`checkout.upsell` mounts at its target; interactive fields (text/checkbox/choice) capture; buyer-input writes land as cart attributes/note/metafields.
- [ ] Trust-badge/progress-bar/banner layout kinds render; thank-you + post-purchase offers appear.
- [ ] Protected-customer-data fields populate only after the app-level access grant (expect the merchant note otherwise).

## 4. Functions (real enforcement at checkout)
- [ ] Discount rules (tiered/volume/BOGO/gift/cheapest-free) apply at checkout; cart-transform bundles (fixed/mix-match/MERGE) + priceEnding round correctly.
- [ ] Free-shipping (shipping-discount) discounts delivery; delivery/payment customizations hide/rename by the widened predicates (product/tag/customer/address/cart-total); validation blocks by min/max cart; order-routing ranks locations.
- [ ] Pickup-point/local-pickup modules stay `needs_runtime` (honest) until the Shopify APIs stabilize.

## 5. Admin
- [ ] Generated `admin.block`/`admin.action` render on the right resource pages (product/order/customer/variant/collection/…) with fields/badges/tables/buttons from config.
- [ ] `admin.discountUi` settings UI appears in a discount's details, bound to the discount Function; `admin.link` deep-links work; `admin.print` produces a print doc.

## 6. Customer account
- [ ] Generated blocks render across the 23 targets; BUTTON/FORM/MODAL/order-action work.
- [ ] Data bindings resolve **live** via the app proxy: order tracking, store-credit, **loyalty points** (`/apps/superapp/ca/customer-data`), subscription status/next-order — and **degrade to literal content honestly** when no value exists (never a fabricated number).

## 7. POS (the surface the review caught — verify honesty)
- [ ] Generated POS tiles/actions/blocks render across targets.
- [ ] **Actions either do the real thing or toast "unsupported" — NEVER a success toast on a no-op** (the core fix). Discount-apply/add-line-item/note-write actually mutate the cart.
- [ ] Data bindings show live values (cart totals, line item, order name, session) or fall back to the literal label — no fabricated values.
- [ ] Staff-PIN prompts, verifies **server-side** (`/verify-pin`), and blocks the action on reject/no-config (fails closed).
- [ ] Loyalty read/accrue/redeem via `/api/pos/loyalty`; `transaction-complete` observer accrues points idempotently.

## 8. Messaging / flow / integration / agentic
- [ ] Email/slack campaigns send on their triggers; multi-step drip parks + resumes on the durable scheduler.
- [ ] SMS/web-push: with creds set, sends respect **marketing consent** and refuse without opt-in; without creds, the channel is honestly `needs_runtime` (no fake send).
- [ ] Flow: a multi-step flow with a DELAY step parks (WAITING + resumeAt) and resumes via the cron sweep.
- [ ] Integration httpSync: a subscribed webhook (orders/create etc.) signs + delivers to the connected endpoint, retries via the queue, and dead-letters on exhaustion; inbound reconciliation records to the store. (`fulfillments/create`/`draft_orders/create` are honestly ungranted.)
- [ ] Agentic: `/agentic/{shop}/{handle}/mcp` answers JSON-RPC catalog tools; `/.well-known/ucp` + agent-profile serve; sponsored products rank first.

## 9. Regression / honesty sweep
- [ ] Existing pre-buildout modules render/behave **unchanged** (additive optional fields; back-compat is byte-identical in tests — confirm on a store).
- [ ] Any surface still `needs_runtime` shows an honest status in the module UI (not PUBLISHED), with no red-herring "PASS/pass" casing.
- [ ] No console/network errors on the generated storefront surfaces; theme check clean on any pushed Liquid.
