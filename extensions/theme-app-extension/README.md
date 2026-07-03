# SuperApp Theme Modules (Theme App Extension)

This extension renders **theme modules** from the shop metafield `superapp.theme/module_refs` (`list.metaobject_reference`). The app never writes directly to theme files; it only updates this metafield when you publish a theme module.

Since Module System v2 every storefront module compiles to `theme.section`, so each metaobject's `module_type` is always `theme.section` and the preset is carried in `config_json.kind` — one of `banner`, `notification-bar`, `popup`, `contactForm`, `effect`, `floatingWidget`, `product-bundle`, or any other (generic section) value.

## How it works

1. In the app, when you **publish** a storefront module, the app upserts a `$app:superapp_module` metaobject and updates `superapp.theme/module_refs` with the referenced metaobject IDs.
2. The **SuperApp Theme Modules** app embed block (`blocks/superapp-theme-modules.liquid`) reads that metafield and renders each `global`/`overlay` module (popups, sitewide banners, effects, floating widgets). Section/product/collection modules are rendered by their slot blocks.
3. All four blocks render module markup through a single shared snippet, `snippets/superapp-module.liquid`, which dispatches on `config_json.kind`. Any non-preset kind falls through to the generic section renderer (title / subtitle / image / body / repeatable blocks / CTA).
4. Merchants must **enable the app embed** in the theme editor: Theme → Customize → App embeds → enable "SuperApp Theme Modules".

You can also add the **SuperApp Module Slot** section block to any section: set the block’s “Module ID” to a published module’s ID (from the app); that slot will render that module.

## Assets & runtime

- **assets/superapp-modules.css** — shared styles for every module kind. Wired once per page via each block's schema `stylesheet` attribute.
- **assets/superapp-modules.js** — shared runtime (vanilla, no deps). Wired once per page via each block's schema `javascript` attribute. Drives popup open/close on the configured trigger (load / timed / exit-intent / scroll / click) with scrim/Escape/close-button dismissal, focus trapping, `prefers-reduced-motion`, and per-module re-show suppression via local/session storage. Also progressively enhances `APP_PROXY` contact forms to submit via `fetch()` with an inline success/error status instead of navigating to the proxy's raw JSON response.

## Blocks

- **superapp-theme-modules.liquid** — App embed (target: body). Reads `shop.metafields['superapp.theme']['module_refs']` and renders each `global`/`overlay` module via the shared snippet.
- **universal-slot.liquid** — Section block; `module_id` (text) setting; renders any published module by ID.
- **product-slot.liquid** / **collection-slot.liquid** — Section blocks intended for product / collection templates; render a module by ID (e.g. product bundles, collection promotions).

**Planned:**

- **Option B (slot_key + app UI mapping):** slot_key or implicit block ID; app UI dropdown to assign module → slot; mapping in metafields/DB.
- **Cart Slot block** — Section block restricted to cart template; cart-aware modules (e.g. shipping bars, upsells).
