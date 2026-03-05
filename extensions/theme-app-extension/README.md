# SuperApp Theme Modules (Theme App Extension)

This extension renders **theme modules** (banner, popup, notification bar, effect) from the shop metafield `superapp.theme.modules`. The app never writes directly to theme files; it only sets this metafield when you publish a theme module.

## How it works

1. In the app, when you **publish** a theme.banner, theme.popup, theme.notificationBar, or theme.effect module, the app merges its config into the shop metafield `superapp.theme.modules` (JSON: moduleId → { type, name, config, style }).
2. The **SuperApp Theme Modules** app embed block (`blocks/superapp-theme-modules.liquid`) reads that metafield and renders each module on the storefront.
3. Merchants must **enable the app embed** in the theme editor: Theme → Customize → App embeds → enable "SuperApp Theme Modules".

The app may in future expose **slot blocks** (Universal, Product, Cart) and an **App Embed** runtime loader. Slot→module assignment would live in the app UI: the Theme Editor is only used to add the block; which module renders in each slot is chosen in the app (Theme Editor cannot show dynamic module lists).

## Blocks

- **superapp-theme-modules.liquid** — App embed (target: body). Reads `shop.metafields['superapp.theme'].modules` and renders banner, notification bar, popup, and effect modules.
- **banner.liquid** / **notification-bar.liquid** — Optional section blocks for manual theme editor use (separate from the metafield-driven embed).

**Planned:**

- **Universal Slot block** — Section block; one slot per block; which module renders is set in the app UI (slot_key or implicit).
- **Product Slot block** — Section block restricted to product templates; product resource with autofill for product-aware modules.
- **Cart Slot block** — Section block restricted to cart template; cart-aware modules (e.g. shipping bars, upsells).
- **App Embed (runtime loader)** — Global JS/behaviors (popups, floating widgets, analytics). Settings kept minimal (e.g. slot_key or implicit); module config and slot→module mapping in app/DB.
