# Phase 28 · Recipe-Vocabulary Research Corpus — INDEX

This directory is the **evidence base** for the recipe-vocabulary redesign. It answers
two questions with citations:

1. **What does the market express?** — 58 competitor plugin records + a design study +
   two market-context memos, distilled into a settings vocabulary, a surface matrix,
   and a design vocabulary.
2. **What does our code actually run on the live path?** — 8 code-evidenced reality
   audits, reconciled against (1) in a single honest **gap analysis** and a concrete
   **doc-correction list**.

Everything downstream (phases #2 visuals/styling · #3 compositional control-packs ·
#4 multi-surface composites) should be planned against `synthesis/gap-analysis.md`,
not against the docs — the audits show a large "built-not-wired" layer the docs
narrate as live.

---

## How to use this corpus (phases #2–#4)

- **Start at [`synthesis/gap-analysis.md`](synthesis/gap-analysis.md).** Its §5 ROADMAP
  (R0–R4) is the single ranked, phase-tagged worklist. Every item cites **[EXT]** (a
  plugin record) **and** **[INT]** (`file:line`), and is tagged BUILD / WIRE / PRUNE/DOC.
- **Phase #2 (visuals/styling):** Roadmap Tier 1 (R1.x). Source material:
  [`design/design-vocabulary.md`](design/design-vocabulary.md) (the token spec) +
  the GemPages/PageFly plugin records. Reality seam: `reality/` has no style audit, but
  the gap-analysis cites `storefront-style.ts:34-96` and the six style packs directly.
- **Phase #3 (compositional control-packs):** Roadmap Tier 2 (R2.x). Source material:
  [`synthesis/settings-vocabulary.md`](synthesis/settings-vocabulary.md) (55 candidate
  packs). Reality: [`reality/control-packs.md`](reality/control-packs.md) +
  [`reality/module-system-version.md`](reality/module-system-version.md) (the composer is
  built-not-wired — resolve, don't narrate).
- **Phase #4 (multi-surface composites / bundler):** Roadmap Tier 3 (R3.x). Source:
  [`synthesis/surface-matrix.md`](synthesis/surface-matrix.md) (the four irreducible
  composites). Reality: `reality/blueprints.md`, `extension-eligibility.md`,
  `flow-automation.md`, `backend-data-layer.md`.
- **Before touching docs:** [`synthesis/re-planned-docs.md`](synthesis/re-planned-docs.md)
  is the file-by-file edit list; gap-analysis §3 (PRUNE) and §4 (DOC CORRECTIONS) are the
  rationale.

**Evidence convention throughout:** plugin records tag every claim `(confirmed)` vs
`(inferred)`; reality audits tag every claim `live | built-not-wired | stub | absent`
and `already-executed | keep | wire | prune`; synthesis cites both sides.

---

## Contents

### `synthesis/` — the four consumable artifacts (read these first)

| File | What it is |
|---|---|
| [gap-analysis.md](synthesis/gap-analysis.md) | **Primary deliverable.** target-vocabulary − verified-reality. §0 "Closed by 027 work" (re-audited at HEAD `4f056da`), §1 MISSING (M1–M13, ranked by leverage; M11–M13 are the Spring-26 / AI-leverage items), §2 EXISTS (don't rebuild), §3 PRUNE (P1–P10 dead/aspirational), §4 DOC CORRECTIONS, §5 ranked ROADMAP (R0–R4, phase-tagged, every item cites EXT+INT). |
| [settings-vocabulary.md](synthesis/settings-vocabulary.md) | Union of all 58 plugins' `settings_taxonomy` → deduped → **55 candidate control packs** in 11 groups, each with recurrence-based P0/P1/P2 priority. Feeds phase #3. |
| [surface-matrix.md](synthesis/surface-matrix.md) | SURFACE × CAPABILITY matrix across the plugin set; identifies the four irreducible composites and the two real surface holes (messaging, durable scheduler). Feeds phase #4. |
| [re-planned-docs.md](synthesis/re-planned-docs.md) | Concrete file-by-file doc-edit list (before/after) for the doc-reality deltas the audits surfaced. |

### `reality/` — 8 code-evidenced audits (the "what actually runs" side)

| File | Subsystem audited |
|---|---|
| [extension-eligibility.md](reality/extension-eligibility.md) | The 21 extension types; which of the fleet deploy for real vs false-published; the `needs_runtime` gate. |
| [flow-automation.md](reality/flow-automation.md) | Live linear `FlowRunnerService` vs the vapor DAG engine (`FLOW_ENGINE_V2`, cron resume, DLQ, rate-limit — all unwired). |
| [blueprints.md](reality/blueprints.md) | Blueprint generation (real, end-to-end) vs `composeBlueprint`/`publishBlueprint` co-deploy (zero callers). |
| [control-packs.md](reality/control-packs.md) | The "single source of truth" claim vs 3/10 packs hand-pinned; composer built-not-wired. |
| [backend-data-layer.md](reality/backend-data-layer.md) | DataStore CRUD/export/capture (more built than docs admit) vs typed-schema writer (`ensureTypedStore`, zero non-test callers). |
| [hydrate-outputs.md](reality/hydrate-outputs.md) | Which of the 6 hydrate outputs actually render (1: validation report) vs persisted-but-inert. |
| [interactive-widget-runtime.md](reality/interactive-widget-runtime.md) | The 6-kind widget allowlist + popup engine vs the paper spin-to-win spec (zero runtime symbols). |
| [module-system-version.md](reality/module-system-version.md) | The `v1`/`v2` flag — settable + read on one loader, consumed by nothing. |

### Verification

| File | What it is |
|---|---|
| [reaudit-changelog.md](reaudit-changelog.md) | Verifier pass (2026-07-03, HEAD `4f056da`): adversarial spot-check of the `reality/` re-audits, the doc corrections, and `gap-analysis.md` against current code. Per-subsystem FIXED vs STILL-OPEN with file:line; edited-vs-already-accurate doc list. |

### `design/` — design-vocabulary study (feeds phase #2)

| File | What it is |
|---|---|
| [design-vocabulary.md](design/design-vocabulary.md) | **Consolidated output.** One unified visual vocabulary (OKLCH 12-step ramp, `-content` pairing, two-track radius, elevation idioms, motion tokens) mapped onto the six existing style packs + `--sa-*` compiler. |
| [batch-1.md](design/batch-1.md) … [batch-8.md](design/batch-8.md) | The eight raw research batches consolidated into `design-vocabulary.md`. |

### `plugins/` — 58 competitor plugin records (the market-demand side)

Three named anchors — [loox.md](plugins/loox.md), [rebuy.md](plugins/rebuy.md),
[fast-bundle.md](plugins/fast-bundle.md) — plus 55 fanned-out records. Each record has a
uniform schema: `identity · surfaces · settings_taxonomy · capabilities · pricing`, with
every claim tagged `(confirmed)` or `(inferred)`.

<details>
<summary>All 58 records</summary>

`appikon-notify-me` · `appstle-subscriptions` · `bold-brain` · `bold-bundles` ·
`bold-checkout` · `bold-custom-pricing` · `bold-discounts` · `bold-memberships` ·
`bold-product-options` · `bold-subscriptions` · `bold-upsell` · `bon-loyalty` ·
`boost-ai-search` · `bundler` · `candy-rack` · `discount-ninja` · `fast-bundle` ·
`fera` · `foxkit` · `gempages` · `globo-product-options` · `growave` ·
`hextom-countdown` · `hextom-usb` · `honeycomb-upsell` · `hulk-infinite-options` ·
`intuitive-shipping` · `judge-me` · `justuno` · `kaching-bundles` · `kickflip` ·
`klaviyo` · `loop-subscriptions` · `loox` · `loyaltylion` · `moon-bundles` ·
`okendo` · `omnisend` · `pagefly` · `privy` · `provesource` · `pushowl` · `rebuy` ·
`recharge` · `reconvert` · `rivo` · `seal-subscriptions` · `selleasy` ·
`shopify-search-discovery` · `slide-cart-corner` · `smile-io` · `stamped` ·
`swym-wishlist-plus` · `ultimate-special-offers` · `upcart` · `wide-bundles` ·
`yotpo-reviews` · `zipify-ocu`

</details>

### Top-level market-context memos

| File | What it is |
|---|---|
| [ai-leverage.md](ai-leverage.md) | Where AI-generation is the wedge vs the plugin market — strategic framing for the vocabulary. |
| [shopify-editions-spring-2026.md](shopify-editions-spring-2026.md) | Platform-capability context from the Spring 2026 Shopify Editions (new surfaces/APIs to design toward). |

---

## Coverage & gaps

**Coverage is complete and evidence-dense. Ready to hand to phase #2.**

| Folder | Expected | Found | Status |
|---|---|---|---|
| `plugins/` | ~58 (55 fanned-out + loox/rebuy/fast-bundle) | **58** | ✅ complete; all 5–22 KB, uniform schema, confirmed/inferred tags |
| `design/` | 8 batch files + design-vocabulary.md | **9** | ✅ complete |
| `reality/` | 8 audits | **8** | ✅ complete; all 7.7–17 KB, live/built-not-wired tagging |
| `synthesis/` | settings-vocabulary, surface-matrix, gap-analysis, re-planned-docs | **4** | ✅ complete; all 16–45 KB |

- **No missing files.** No thin/placeholder files: smallest is
  `reality/module-system-version.md` at 7.7 KB (a genuine focused audit, not a stub).
- **Gap-analysis evidence check: PASS.** Every roadmap item R0.1–R4.6 cites **both** an
  EXT (plugin **or** Spring-26 platform capability) and an INT `file:line`; every M-item
  (§1, M1–M13) and P-item (§3, P1–P10) is likewise double-cited. The §0 "Closed by 027"
  rows each cite the re-audit file:line that verifies the fix. No claim is asserted
  without evidence.
- **No cosmetic nits outstanding.** The prior "surface-matrix says 57 vs 58" nit is
  resolved — `synthesis/surface-matrix.md:3` now reads **58**, matching every other file.

**Nothing needs re-running.** Re-audit verification (`reaudit-changelog.md`, 2026-07-03,
HEAD `4f056da`) confirmed the corpus + docs are consistent with current code.
