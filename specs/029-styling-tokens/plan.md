# Phase #2 — Styling Token System (implementation plan)

**Feature Directory**: `029-styling-tokens` · **Created**: 2026-07-03 · **Status**: In progress on `feat/027-unified-builder`
**Parent initiative**: [`specs/028-recipe-vocabulary`](../028-recipe-vocabulary/spec.md) (phase #2)
**Approved direction**: adopt the research **OKLCH token system** (`028/research/design/design-vocabulary.md` §1) over the coarse-enum status quo — user-approved 2026-07-03 to deviate from DESIGN.md, so **DESIGN.md is updated to match** as part of this work (per the CLAUDE.md design-governance rule).

## Goal
`StorefrontStyle` is a coarse-enum system (`padding: small|medium|large`, 5 flat hexes) that can't carry the token grammar DESIGN.md's 6 style packs already describe. Widen it into a real **design-token substrate** — OKLCH seed-derived 12-step semantic color ramp with `-content` pairing, a size-aware type scale, a 9-step spacing scale, a two-track radius ladder + `scaling`, four named elevation idioms, and motion tokens — emitted as `--sa-*` vars, wired into the 6 packs, exposed in StyleBuilder, and referenced by the generator against **semantic token names, never raw hex/px**. Quality bar: parity-or-better with the studied apps; merchant extends via generate settings.

## Blast radius (mapped)
`packages/core/src/{storefront-style.ts, allowed-values.ts, recipe.ts, control-packs/packs/style.pack.ts, __tests__/storefront-style.test.ts}` · `apps/web/app/services/recipes/compiler/{style-compiler.ts, proxy.widget.ts}` · `apps/web/app/services/ai/{style-packs.server.ts, prompt-expectations.server.ts, design-qa.server.ts, llm.server.ts}` · `apps/web/app/services/preview/preview.service.ts` · `apps/web/app/components/{StyleBuilder.tsx, ConfigEditor.tsx}` · `apps/web/app/__tests__/style-compiler.test.ts` · `DESIGN.md`.

## Increment order (each tested + committed independently)
- **2A — Non-color token scales (additive, low-risk).** Motion tokens (`--sa-motion-fast|base|slow|ambient`, `--sa-ease-standard|enter|exit`), the 9-step spacing scale, the two-track radius ladder + `scaling`, the four named shadow idioms (soft / glow / border-carried / emboss-inset) as layered multi-shadows, and the size-aware type scale + font-family roles. New **optional** schema fields with defaults → existing recipes keep validating. Compiler emits the new vars; old vars stay. Update `allowed-values`, `storefront-style` defaults, both style tests, and DESIGN.md §Typography/§Spacing/§Layout/§Motion.
- **2B — OKLCH semantic color system (higher-risk, migration).** Add the 3-tier color model: a seed-derived OKLCH 12-step ramp + the 12-role semantic set each with a `-content` foreground + alpha/`-25` steps + surface-nesting `content-1..4`. **Back-compat:** keep the existing flat `colors.{text,background,…}` as a legacy tier the compiler still honors; when semantic tokens are present they win, else derive them from the legacy hexes (no persisted-recipe breakage; live storefront CSS vars stay stable). Ramp generation is a deterministic pure function (`oklch-ramp.ts`) with unit tests (even stops, contrast guarantees on 11/12 over 1–2, 9-solid-on-white).
- **2C — Wire the 6 packs.** Enrich each `StylePack` in `style-packs.server.ts` with its §4 grammar (radius, shadow idiom, density, motion personality, accent strategy) over the extracted `StorePalette`/`StoreTypography`; add the Tailark sub-mood variant as a second dropdown. `selectPack()` unchanged; only the token payload grows.
- **2D — Generator contract + StyleBuilder UI + sanitizer hardening.** Prompt-expectations: instruct emission **against semantic token names + full interaction-state set**, never raw values. StyleBuilder: expose the new tokens (pack picker + mood + the widened builder controls). Harden `sanitizeCustomCss` denylist (`position:fixed`, `expression()`, off-origin `url()`, `behavior:`) keeping the root-scope wrapper. design-qa: keep the contrast guarantee against the new `-content` pairing.

## Migration & safety rules
- Every new schema field is **optional with a default** → old persisted recipes validate unchanged.
- The compiler emits **both** legacy and new `--sa-*` vars during 2A/2B so live-rendered modules never lose a variable they reference.
- OKLCH ramp generation is deterministic (no `Math.random`), pure, unit-tested.
- Each increment: `pnpm --filter @superapp/core build` + affected vitest + `pnpm --filter web typecheck` green before commit.

## Success criteria
- **SC-1**: New token vars emitted by `compileStyleVars` for a default style (motion, spacing scale, radius ladder+scaling, 4 shadow idioms, type scale) — covered by `style-compiler.test.ts`.
- **SC-2**: OKLCH ramp is perceptually even + passes the contrast pairings (unit test); legacy flat-hex recipes still compile identically for the vars they used.
- **SC-3**: All 6 packs carry the §4 grammar; `selectPack()` still returns a valid pack for every `AestheticSignals` input.
- **SC-4**: Generator prompt references semantic token names; design-qa contrast check runs against `-content` pairs.
- **SC-5**: DESIGN.md reflects the adopted OKLCH direction (Decisions Log entry).
- **SC-6**: `typecheck` + full affected test set green after each increment.
