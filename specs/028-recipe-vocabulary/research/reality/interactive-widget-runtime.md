# Reality Audit — Interactive Widget Runtime

**Subsystem:** Interactive widget runtime (storefront renderer allowlist; spin-to-win / scratchcard / multi-frame state / discount-code pool; DESIGN.md §H claims)
**Date:** 2026-07-03 (re-audit)
**HEAD:** `4f056da` on `feat/027-unified-builder` (original audit was `a948f1c` on `feat/superapp-redesign`)
**Method:** Re-traced the live storefront render path (Liquid block → snippet → runtime JS) and the in-app preview path at current HEAD; re-checked the recipe schema, intent routing, blueprint catalog, and every dossier-§H named service/type/model; re-grepped the full source tree (excluding `.next`/`dist`/`build`) for any spin/scratch/wheel/probability/code-pool symbol; diffed all runtime-relevant files against `a948f1c`.

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

The subsystem is **unchanged**. The commits landed since `a948f1c` (027 unified-builder, streaming, config-driven settings, `admin.discountUi`) touched the *builder UI and admin extension surface*, **not** the storefront interactive-widget runtime. No spin/scratch/wheel/probability/code-pool runtime was added; none was removed.

Prior-finding status:

- **PRIOR: repo-wide grep = zero runtime symbols → STILL-OPEN (unchanged).** Source-only grep (excluding `.next`/`dist`/`build`) for `spinToWin|scratchcard|wheel|roulette|winRate|winProbability|codePool|multiframe|SpinService|CodeIssuanceService|RouletteCampaignService|RouletteAnalyticsService|weighted.?random|PlayLock|CodeBatch|SpinResult` returns **zero** hits in `apps/web`, `packages`, `extensions`. The only spin/scratch strings remain the two sample prompts in `apps/web/app/services/ai/intent-examples.ts:37-38`. (Note: an unfiltered grep hits `apps/frontend/.next/static/chunks/framework-*.js` for the substring `wheel` inside minified React event-name tables — a false positive, not a widget runtime.)

- **PRIOR: storefront renderer is a fixed six-kind allowlist + popup engine → STILL-OPEN (unchanged).** `extensions/theme-app-extension/snippets/superapp-module.liquid` is still a hard `{% case kind %}` over `banner`, `notification-bar`, `popup`, `contactForm`, `effect`, `floatingWidget`, `product-bundle`, and a generic `{% else %}` section branch (superapp-module.liquid:48-289). The client runtime `extensions/theme-app-extension/assets/superapp-modules.js` still self-documents "Two features" — popup engine + app-proxy contact form (superapp-modules.js:1-8). **`git diff --stat a948f1c HEAD` on both files = no change.**

- **PRIOR: intent classifier accepts "spin the wheel" and silently downgrades to a static popup → STILL-OPEN (unchanged).** `apps/web/app/services/ai/intent-examples.ts:37-38` still lists "scratch card to reveal a discount code" / "spin the wheel for a random discount" (file diff since `a948f1c` = none). `apps/web/app/services/ai/blueprint-catalog.ts:70-89` still resolves intent `promo.discount_reveal` to `primaryRole: 'reveal-popup'`, `moduleType: 'theme.section'`, `kindHint: 'popup'` + a `functions.discountRules` — a static title/body/CTA popup, never a wheel.

**NEW findings (from the changed code):**

- **NEW — `f459b49` "render the REAL generated module in the preview" makes the downgrade *visible*, not fixed.** The `/generate` builder canvas previously rendered a hardcoded CSS mock; it now POSTs the merged recipe to `/api/preview` and renders real `PreviewService` output in a sandboxed iframe (preview.service.ts:48-59). For a "spin the wheel" prompt this now faithfully shows the **static popup** the recipe actually compiles to — an honesty improvement (no more fake preview), but it does **not** add any wheel runtime. The preview dispatch is still the same six-kind switch (preview.service.ts:82-94); `proxyWidget` and the new `interactiveSurfacePreview`/`case 'proxy.widget'` branches contain **zero** spin/wheel/canvas/`requestAnimationFrame`/probability/segment logic (grep = empty).

- **NEW — `d42c9ff` `admin.discountUi` is an admin config form, not a storefront interactive widget.** The new recipe type (recipe.ts:357-380) is category `ADMIN_UI`; it exposes admin form fields (`text`/`number`/`toggle`/`select`) to configure a paired discount Function. It is declarative-only: `extension-eligibility.ts:191` marks it (`runtimeShipped:false`), and `apps/web/app/services/recipes/compiler/index.ts:57-58` AUDIT-compiles it and preflight-gates it `needs_runtime`. It has **no** storefront render path and **no** relation to spin/scratch/wheel runtime.

- **NEW — recipe schema still cannot carry a wheel.** `packages/core/src/recipe.ts:122` keeps `theme.section.config.kind` as free-form `z.string().min(1).max(60).default('custom')` with **no** `winProbability`/`segments`/`codePool`/`probability` field. The only additive schema changes in this range are `admin.discountUi` (above) and a `SEND_SLACK_MESSAGE` `webhookUrl` tweak (recipe.ts:467-476) — neither relates to interactive widgets.

**Net delta:** 0 fixed / 3 still-open (all three prior findings persist verbatim), plus 3 new confirmations that the 027/spring-2026 work did not touch this gap.

---

## Live path (what actually runs)

Storefront render chain, all confirmed present and wired at HEAD `4f056da`:
- `extensions/theme-app-extension/blocks/superapp-theme-modules.liquid` (app-embed, `target: body`) iterates `shop.metafields['superapp.theme']['module_refs']` and renders `{% render 'superapp-module' %}` for non-section/block activation types. Three sibling blocks render the section/block ones.
- `extensions/theme-app-extension/snippets/superapp-module.liquid` is the single markup source of truth: a hard `{% case kind %}` over `banner`, `notification-bar`, `popup`, `contactForm`, `effect`, `floatingWidget`, `product-bundle`, plus a generic `{% else %}` section branch (superapp-module.liquid:48-289). Popup branch (superapp-module.liquid:79-100) emits only title/body/CTA + trigger/frequency attrs.
- `extensions/theme-app-extension/assets/superapp-modules.js` is the *entire* client runtime: (1) popup open/close/focus-trap/frequency-suppression engine, (2) app-proxy contact-form fetch submission (superapp-modules.js:1-8). No state machine, no canvas, no fps loop, no reveal/apply-code step.
- In-app preview: `apps/web/app/services/preview/preview.service.ts` dispatches `theme.section` on the same closed kind set (`sectionNotificationBar`/`sectionBanner`/`sectionPopup`/`sectionContactForm`/`sectionEffect`/`sectionFloatingWidget`, preview.service.ts:82-94) — deterministic HTML, no AI, no interactive runtime. Non-storefront types get `interactiveSurfacePreview` (a static surface preview, still no spin/wheel logic).

Recipe schema: `packages/core/src/recipe.ts:122` — `theme.section.config.kind` is free-form `z.string().min(1).max(60).default('custom')`; the section config has `title/subtitle/body/imageUrl/blocks[]/ctaText/ctaUrl` + open `.catchall`, but **no** `winProbability`, `segments`, `codePool`, or `probability` field.

---

## Claim-by-claim

### Claim 1 — "Storefront renderer is a fixed template allowlist (banner, notificationBar, popup=title/body/CTA, contactForm, effect, floatingWidget)"
- **Claim:** DESIGN.md:125-126 (§H).
- **Reality:** Exactly true at HEAD. `{% case kind %}` in superapp-module.liquid:48-289 hard-codes those kinds; anything else falls to the generic `{% else %}` static branch. Unchanged since `a948f1c`.
- **wired:** live | **verdict:** already-executed | **action:** keep

### Claim 2 — "They cannot render an interactive spinning wheel, per-segment odds, or a discount-code pool today"
- **Claim:** DESIGN.md:126 (§H).
- **Reality:** Confirmed absent. Source-only grep (excluding build dirs) for all spin/scratch/wheel/roulette/probability/code-pool symbols returns **zero** hits. The only such strings are two sample prompts in intent-examples.ts:37-38.
- **wired:** absent | **verdict:** already-executed (gap correctly stated) | **action:** keep

### Claim 3 — "The popup branch ignores config.blocks and any win-rate field"
- **Claim:** DESIGN.md:126 (§H).
- **Reality:** Confirmed. `{% when 'popup' %}` (superapp-module.liquid:79-100) reads only title/body/ctaText/ctaUrl + trigger attrs; never touches `mod_cfg.blocks`; no win-rate field exists to touch.
- **wired:** absent | **verdict:** already-executed | **action:** keep

### Claim 4 — Dossier §H services: `RouletteCampaignService`, `SpinService`, `CodeIssuanceService`, `RouletteAnalyticsService`, `CaptureService`
- **Claim:** `docs/design-system/research-dossier.md:539-545` (§H8 service table).
- **Reality:** **None exist in code.** Grep for all four service names + `PlayLock`/`CodeBatch`/`SpinResult`/`weighted.?random` across `*.ts/*.tsx/*.prisma` returns **no production hits** (only the markdown dossier). The only real Capture class is generic `ModuleCaptureService` (`apps/web/app/services/data/module-capture.service.ts:58`), for contact/form captures — unrelated to spin gating or code issuance.
- **wired:** absent | **verdict:** required (for the feature) | **action:** document-honestly / rebuild when prioritized

### Claim 5 — Dossier §H: validated Σ per-segment probabilities = 100 + three code sources (single / uploaded_list / auto_unique via Shopify)
- **Claim:** research-dossier.md:539-541.
- **Reality:** No data model, no validator, no schema field. No `schema.prisma` model matching `Roulette|Spin|Campaign|CodeBatch|PlayLock|SpinResult` (grep: none). Recipe schema has no probability/code-source field (recipe.ts:110-152). The `validateProbabilities`/weighted-draw functions live only as fenced markdown in the dossier — never imported, never called.
- **wired:** absent | **verdict:** required (for the feature) | **action:** document-honestly / rebuild when prioritized

### Claim 6 — Multi-frame / stateful widget runtime (spin → result → reveal → apply-code)
- **Claim:** implied by dossier §H (`SpinResult`, checkout injection, spin→result state machine).
- **Reality:** The client runtime (superapp-modules.js) has **no state machine** beyond popup open/close and a one-shot form POST. No canvas, no fps loop, no reveal step, no code-apply/checkout-injection. Absent end to end. Unchanged since `a948f1c`.
- **wired:** absent | **verdict:** required (for the feature) | **action:** document-honestly / rebuild when prioritized

### Claim 7 — User prompt "spin the wheel for a random discount" produces a working spin widget
- **Claim:** intent-examples.ts:37-38 (recognized prompts).
- **Reality:** Routes to intent `promo.discount_reveal` (blueprint-catalog.ts:70), which resolves to `role: 'reveal-popup', moduleType: 'theme.section', kindHint: 'popup'` + `functions.discountRules` (blueprint-catalog.ts:73-89). Output is a static title/body/CTA popup, **not** a wheel — the AI accepts the spin prompt and silently downgrades it. **NEW:** since `f459b49`, the `/generate` builder preview renders the *real* PreviewService output, so the downgraded popup is now shown truthfully (no more fake mock) — but no wheel is added.
- **wired:** stub (prompt accepted, capability downgraded) | **verdict:** partial | **action:** document-honestly (intent examples over-promise vs. what the popup renders)

---

## Summary table

| # | Claim (source) | wired | verdict | action |
|---|---|---|---|---|
| 1 | Fixed template allowlist of 6 kinds (DESIGN.md:125-126) | live | already-executed | keep |
| 2 | No wheel / per-segment odds / code-pool render (DESIGN.md:126) | absent | already-executed | keep |
| 3 | Popup ignores blocks + win-rate (DESIGN.md:126) | absent | already-executed | keep |
| 4 | Roulette/Spin/CodeIssuance services (dossier §H8) | absent | required | document-honestly / rebuild |
| 5 | Validated Σ-probabilities + 3 code sources (dossier §H) | absent | required | document-honestly / rebuild |
| 6 | Multi-frame stateful spin runtime + checkout inject | absent | required | document-honestly / rebuild |
| 7 | "spin the wheel" prompt → working widget (intent-examples.ts:37-38) | stub | partial | document-honestly |

---

## Bottom line

Re-audit at HEAD `4f056da`: the interactive-widget runtime is unchanged — all three prior findings STILL-OPEN (zero runtime symbols; hard six-kind Liquid allowlist + popup/contact-form JS engine; classifier accepts "spin the wheel"/"scratch card" then silently downgrades to a static title/body/CTA popup), 0 fixed; the 027 builder work (f459b49) only made that downgrade *visible* by rendering the real recipe, and spring-2026's `admin.discountUi` is an admin config form with no storefront runtime — neither adds a wheel, and the recipe schema still has nowhere to put segment probabilities or a code pool.
