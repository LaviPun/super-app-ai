# SuperApp Theme Modules (Theme App Extension)

This extension renders **theme modules** (banner, popup, notification bar, effect) from the shop metafield `superapp.theme.modules`. The app never writes directly to theme files; it only sets this metafield when you publish a theme module.

## How it works

1. In the app, when you **publish** a theme.banner, theme.popup, theme.notificationBar, or theme.effect module, the app merges its config into the shop metafield `superapp.theme.modules` (JSON: moduleId → { type, name, config, style }).
2. The **SuperApp Theme Modules** app embed block (`blocks/superapp-theme-modules.liquid`) reads that metafield and renders each module on the storefront.
3. Merchants must **enable the app embed** in the theme editor: Theme → Customize → App embeds → enable "SuperApp Theme Modules".

## Blocks

- **superapp-theme-modules.liquid** — App embed (target: body). Reads `shop.metafields['superapp.theme'].modules` and renders banner, notification bar, popup, and effect modules.
- **banner.liquid** / **notification-bar.liquid** — Optional section blocks for manual theme editor use (separate from the metafield-driven embed).
