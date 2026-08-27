# WS-F Merchant UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the merchant-facing app trustworthy and complete: the Builder (`/generate`) persists real progress and never fakes it, module settings are edited through a real type-aware form instead of one hard-coded storefront shape, every advertised button goes somewhere real, support copy is honest about being AI, no merchant page leaks internal AI cost data, the module preview link can't be used to view another shop's data, publishing has a confirm step and a way to see the result, and `/generate` finally renders through the same Polaris shell as the rest of the app instead of a 1939-line vendored-CSS route that is the last of its kind.

**Architecture:** No new services of significant size. This plan is almost entirely route/component surgery on already-real backends: `SchemaForm` (built, mounted nowhere merchant-relevant) gets wired to the hydrate-produced `adminConfig` (module detail) and to a per-type JSON Schema derived from `getRecipeJsonSchemaForType` (the Builder, replacing the hard-coded buy-bar fields). The Builder's fake `setInterval` progress bar is replaced by a pure event→step mapping fed by the SSE frames the stream endpoint already emits (`option`/`ranking`/`option_updated`/`error`) — no new backend. `MerchantShell`'s `polaris` prop already exists and is exercised by every other merchant route; `/generate` is the last holdout, so migrating it is "catch up to the pattern," not "invent one." The one net-new piece of infrastructure is a short-lived, HMAC-authenticated capability token for the shop-scoped preview link, built on the crypto helper the repo already has (`encryptJson`/`decryptJson`).

**Tech Stack:** Remix (apps/web), Prisma, Vitest, Polaris web components (`<s-*>`), Shopify Admin API 2026-07.

**Spec:** `docs/superpowers/plans/2026-08-24-launch-program.md` (WS-F section, Phase 4, Decision D4, D7) — the nine-domain audit of 2026-08-24 at `master@6af6df2`. Findings referenced below as [UI-N] per the master plan's WS-F bullet.

## Dependencies (plan header — read before executing)

- **Runs after WS-E merges.** WS-E ("publish integrity") substantially rewrote `apps/web/app/routes/modules.$moduleId.tsx` (Unpublish button + `ConfirmModal`, embed-activation banner + theme-editor deep link, structured partial-failure banner reading `publishFetcher.data.{code,failedOp,guidance}`, `RollbackService`). This plan was written and verified against the **WS-E worktree** copy of that file (`/Users/lavipun/Work/sa-wt-ws-e/apps/web/app/routes/modules.$moduleId.tsx`, at WS-E commit `2f4a0cb`), not master's older copy. Every task that touches this file below cites worktree line numbers; re-verify line numbers once WS-E actually merges (content should be identical, offsets from later WS-E commits may shift).
- **Runs after WS-QF merges.** WS-QF Task 4 changes the unmount-cleanup behavior on `apps/web/app/routes/modules._index.tsx` (delete becomes commit-on-unmount instead of silent-cancel) — no overlap with this plan's files, no action needed here beyond awareness. WS-QF Task 6 adds `QuotaService.enforcePublishCap` calls to `api.publish.tsx`, `api.agent.modules.tsx`, and **`modules.$moduleId.tsx`'s duplicate branch (before line 252 in master's numbering)** — the same file Tasks 6, 7, 11, 12 below touch. Land WS-QF first; if it hasn't, rebase Task 6 onto its result rather than re-deriving the quota check.
- **Task 17 (draft persistence) is BLOCKED-until WS-C lands its job/draft-persistence interface.** WS-C's plan does not exist yet at the time of writing (checked: no `docs/superpowers/plans/2026-08-24-ws-c*.md`). Task 17 defines the interface this plan needs (`GenerationJobService.enqueue`, a job-status poll shape, a server-persisted draft row) as a **consumed interface** and is written to be dropped in once WS-C ships it — it is the only task in this plan gated on another workstream. Every other task in this plan is independent of WS-C and can ship immediately.
- **Ordering within this plan:** `modules.$moduleId.tsx` is touched by Tasks 6, 7, 11, 12 (in that order) — sequence them in that order to avoid needless rebases. `generate._index.tsx` is touched by Tasks 8, 9, 10, 13, 14, 16 (in that order) for the same reason. Task 15 depends on Task 14 (it deletes the branch Task 14 stops using). Task 16 should run after Task 14 (auditing responsive layout on markup that's about to be rewritten is wasted work).

## Global Constraints

- Merchant UI: **Polaris web components only** (`<s-page>`, `<s-section>`, `<s-*>`); no `@shopify/polaris` (React) imports, no `~/components/superapp` imports in merchant routes (DESIGN.md, Polaris Implementation Rules). Internal admin (`internal.*`) is out of scope for this plan and keeps its vendored system untouched.
- No component-test precedent exists in this repo (`grep -r "@testing-library" apps/web` — zero hits; `apps/web/vitest.config.ts` runs `environment: 'node'`, not `jsdom`). Per the plan charter, this means: **pure client-side decision logic gets extracted into a plain `.ts` module and unit-tested directly** (the established pattern — see `apps/web/app/utils/generation-outcome.ts` + `apps/web/app/__tests__/generation-outcome.test.ts`); **route loaders/actions get tested at the route level** by importing `action`/`loader` directly and mocking every collaborator with `vi.mock` (the established pattern — see `apps/web/app/__tests__/agent-publish-quota.route.test.ts`, reproduced in full under "Shared test patterns" below). JSX-only changes (markup, Polaris migration, CSS) are verified by the binding build rule below plus a manual/browser check — they are not unit-tested, matching WS-E's precedent for UI-affordance steps (WS-E Task 10 Step 4).
- **BINDING build rule:** every task below touches at least one route file. Run `cd apps/web && pnpm build` (equivalently `pnpm --filter web build` from repo root) before every commit in this plan — client/server graph violations (e.g. a server-only import leaking into a component the client bundles) are invisible to `tsc`/`vitest` and only surface at build time. See `apps/web/app/services/billing/plan-status.ts` for the client-safe-helper pattern if a task needs to share logic across the server/client boundary.
- Run commands: `cd apps/web && npx vitest run <file>` for single-file test steps; `pnpm build` for the build gate; `pnpm lint` (`eslint app scripts --format unix --max-warnings 100`) after any non-trivial route edit.
- All file paths below are repo-relative to `/Users/lavipun/Work/ai-shopify-superapp` unless explicitly prefixed with the WS-E worktree path.
- No numeric claims in this plan are asserted without a command that produced them (program rule, WS-J) — every LOC/count figure below was derived via `wc -l` / `grep -c` at investigation time, cited inline.

## Verified ground truth (2026-08-24, repo HEAD at investigation time (a few commits past `master@6af6df2`, the audited commit) + WS-E worktree `2f4a0cb`)

Facts every task below relies on — re-verified against code, do not re-derive:

- **`generate._index.tsx`** (`apps/web/app/routes/generate._index.tsx`, 1939 lines) is the **only** merchant route still calling `<MerchantShell fullBleed>` without the `polaris` prop (`grep -rn "<MerchantShell" apps/web/app/routes/*.tsx | grep -v polaris` → one hit, `generate._index.tsx:401`). `MerchantShell`'s own doc comment (`apps/web/app/components/merchant/MerchantShell.tsx:38-43`) calls the non-`polaris` path "the legacy branch," deleted "once the last page migrates" — this is that page. The legacy branch renders `<MerchantSubnav />` (vendored, `~/components/superapp/MerchantSubnav.tsx`) + a `.m-content` div (`MerchantShell.tsx:155-159`); the `polaris` branch renders `<SubnavTabs />` (`~/components/merchant/polaris.tsx:224-246`).
- `generate._index.tsx` has **no runtime conditional** selecting legacy-vs-Polaris — it unconditionally renders vendored markup (202 `className=` hits at investigation time) mixed with ad-hoc `<s-*>` element usage (`s-icon`×32, `s-select`×14, `s-banner`×9, `s-text-field`×8, etc. — already partial adoption to build on). It has **no `ErrorBoundary` export** (grep: zero matches).
- `generate.css` (`apps/web/app/styles/superapp/generate.css`) is **234 lines** (`wc -l`) and is **exclusively** `generate._index.tsx`'s CSS — not imported directly by the route (Remix `links()`-free); instead all four vendored stylesheets are globally linked in `apps/web/app/root.tsx:10-13` (`polaris.css` 342 lines, `shell.css` 190 lines, `pages.css` 204 lines, `generate.css` 234 lines — `wc -l apps/web/app/styles/superapp/*.css` → 970 total). **`polaris.css`, `shell.css`, and `pages.css` are shared with internal admin** — `grep -rl 'className="page\|className="grid-\|className="m-content"' apps/web/app/routes/internal*.tsx` returns 36+ files. Only `generate.css` can be deleted outright once `generate._index.tsx` migrates; the other three must be **relocated** (root.tsx global link → `internal.tsx`'s `links()`), not deleted — this matches DESIGN.md's own stated plan ("the vendored CSS therefore remains globally linked in root.tsx until [generate migration] lands, after which it moves to the internal layout's links()").
- The Builder's "progress" (`generate._index.tsx:245-251` `GEN_STEPS`, `:660-666` the `setInterval` tick, `:963` the width calc) is **entirely simulated** — a `setInterval(..., 560)` ticking independent of the real SSE stream. The route **does** receive real incremental events at `:588-622` (`option`, `ranking`, `blueprint`, `score`, `option_updated`, `error`) via `streamGenerate` (`:549-647`, `fetch('/api/ai/create-module/stream', ...)` at `:565`) — none of those handlers touch `stepIdx`.
- **No `AbortController` exists anywhere in `generate._index.tsx`** (grep: zero matches). The stream `fetch` at `:565` has no `signal`. The "Cancel" button (`GenLoading` component, `:941-968`, `onCancel` wired at `:856` to `() => navigate('/')`) only navigates away — the in-flight `fetch`/reader loop at `:549-647` keeps running, keeps billing, keeps writing state after the merchant thinks they cancelled.
- **`SchemaForm`** (`apps/web/app/components/SchemaForm.tsx`, 372 lines) is fully built, not a stub: `SchemaFormProps = { schema: JsonSchemaNode; uiSchema?: Record<string, SectionUiHints>; value: Record<string, unknown>; onChange: (next) => void; tier?: 'basic'|'advanced'; disabled?: boolean }`. Its own header comment (`SchemaForm.tsx:4-7`) says it's meant to power "(a) module settings from the v2 control-pack composer, (b) the hydrate step's `adminConfig`... (c) typed data-record forms" — **only (c) is wired**: the single live import site is `apps/web/app/routes/data.$storeKey.tsx:8`, rendered in `AddRecordModal` at line 256. It is not imported by `modules.$moduleId.tsx` or `generate._index.tsx`.
- The `adminConfig` envelope hydrate actually persists (`apps/web/app/schemas/hydrate-envelope.server.ts:49-53`) is `{ jsonSchema: z.record(z.unknown()), uiSchema: z.record(z.unknown()).optional(), defaults: z.record(z.unknown()) }` — a **loose record**, shape-compatible with `SchemaForm`'s `Record<string, SectionUiHints>` (same cast pattern already used at `data.$storeKey.tsx:256-257`: `schema={... as JsonSchemaNode}`, `uiSchema={... as Record<string, SectionUiHints>}`). **This is a different, narrower contract than `packages/platform-contracts/src/module-settings.ts`'s `AdminFormSchema`** (which declares `uiSchema` as an *array* of `{path, widget, ...}` hints) — that contract is not what's actually persisted to `adminConfigSchemaJson` today and is out of scope for this plan.
- `apps/web/app/routes/api.ai.hydrate-module.tsx` (131 lines, backs the "Generate full settings" button) is **fully wired and functional** — real auth, real quota check, real `hydrateRecipeSpec` call, writes `adminConfigSchemaJson`/`adminDefaultsJson`/`validationReportJson` to the draft `ModuleVersion` (lines 94-107), returns `{ ok, validationReport, hydratedAt }`. It has **zero test coverage** (`find apps/web/app/__tests__ -iname "*hydrate-module*"` → nothing). The button (`modules.$moduleId.tsx` worktree lines 838-849) and its handler (`:578-580`, posting to `/api/ai/hydrate-module`) are also correctly wired. **[UI-3]'s premise ("wire end-to-end or remove") does not reproduce — this path already works; the gap is test coverage, not wiring.**
- `apps/web/app/routes/modules.$moduleId.tsx`'s loader (worktree lines 50-216) reads `adminConfigSchemaJson`/`adminDefaultsJson` off `hydratedSource` (lines 128-129) but **does not forward them to the client** — the `hydration` object returned in the loader's `json(...)` (line 215) only carries `{ status, hydratedAt, validationReport, everHydrated }` (built at lines 170-187). SchemaForm-mounting work must add the schema/defaults to this object.
- `ModuleService.createNewVersion(shopDomain, moduleId, spec)` (`apps/web/app/services/modules/module.service.ts:81-113`, worktree-identical) is the existing, reusable "save a config edit as a new DRAFT version" primitive — it already preserves hydration data forward (lines 87-106) so a SchemaForm save doesn't need bespoke version-creation logic.
- **Buy-bar hard-coding** lives entirely in `generate._index.tsx`: `BASE_SETTINGS` (`:253-258`), `CONCEPT_PRESETS` (`:263-276`), `settingsMap` state + `set()` writer (`:433`, `:452-453`), the `GenControls` component's per-field hard-coded inputs (`:1363-1431`, only mounted when `moduleType` is `theme.section`/`proxy.widget`, gated at `:1368` `isStorefront`), and the two-way mappers `mergeSettingsIntoRecipe`/`settingsFromRecipe` (`:324-351`/`:354-370`) that hard-code `config.label`/`config.price`/`style.layout.mode`/etc. Non-storefront types already go through `GenConfigControls` (`:1299-1361`), which infers a widget from the JS runtime type of each `config` value — closer to schema-driven but still not using `SchemaForm` or a real schema.
- **A real per-type JSON Schema source already exists**: `getRecipeJsonSchemaForType(moduleType): JsonSchemaObject | undefined` (`apps/web/app/services/ai/recipe-json-schema.server.ts:244`), built from the control-pack registry (`packages/core/src/control-packs/types.ts`, which explicitly documents packs as convertible "to JSON Schema" and carries an optional `uiSchema?: UiHints` "for SchemaForm" per its own doc comment at line 137). This is the schema source Task 8 uses to kill the buy-bar hard-coding — **note the `.server.ts` suffix: this module must stay server-only; a route loader computes the schema and ships it as data, never import `recipe-json-schema.server.ts` from client code** (binding build rule exists precisely for this class of mistake).
- **Broken CTA #1 (template detail):** `apps/web/app/routes/templates.$templateId.tsx:86-92` — the "Use template" button calls `navigate(\`/modules?templateId=${...}\`)`. `apps/web/app/routes/modules._index.tsx` never reads a `templateId` search param (it only reads `openBuilder`, line 176) — the click silently lands on the empty Modules list. **Still broken at HEAD.** The working pattern already exists one route up: `apps/web/app/routes/templates._index.tsx:171-174/210-213` POSTs to `/api/modules/from-template` (handled by `apps/web/app/routes/api.modules.from-template.tsx:72` reading `form.get('templateId')`).
- **Broken CTA #2 (dashboard quick action):** investigated and **does not reproduce**. `apps/web/app/routes/_index.tsx:131-154`'s four quick actions (`#/app/modules`, `#/app/templates`, `#/app/flows/build/new`, `#/app/connectors`) all resolve to real, existing routes via `MerchantShell.go` → `superappRoute()`. `git diff 6af6df2 HEAD -- apps/web/app/routes/_index.tsx` shows no changes to this component. **No task in this plan touches it** (see Decisions of record, F1).
- **Broken CTA #3 (workflow install):** `apps/web/app/routes/flows._index.tsx:283-285` — the "Templates" button calls `ctx.go('#/app/templates?type=Flow')`, landing on `templates._index.tsx`, which loads `MODULE_TEMPLATES` (not `WORKFLOW_TEMPLATES`) and merely filters by `category === 'FLOW'` (line 82) — wrong catalog. Git-blame: pre-`d182fdc` this button linked to `/flows/templates` directly; `d182fdc` regressed it. `apps/web/app/routes/flows.templates.tsx` is real and correctly wired (loads `WORKFLOW_TEMPLATES`, has a working install POST action) but is **reachable by nobody** — zero references anywhere in `apps/web/app` or `apps/web/e2e` outside the route file itself.
- **D7 — captures:** `apps/web/app/routes/modules.$moduleId_.captures.tsx` (129 lines) is real and complete (Polaris table, CSV/print export) but unlinked from module detail — `git show d182fdc^:apps/web/app/routes/modules.$moduleId.tsx:619` shows a `View data captures →` link that `d182fdc` dropped and nothing restored (confirmed absent in both master and the WS-E worktree copy). Data model: `apps/web/prisma/schema.prisma:773-793`, `model DataCapture` (fields: `id, shopId, instanceId, moduleId, customerId?, captureType, payloadSchemaVersion, payload, piiFlags?, createdAt`). Read path: `prisma.dataCapture.findMany({ where: { moduleId, shopId }, ... })` (`modules.$moduleId_.captures.tsx:22-27`).
- **AI-cost leakage on a merchant page:** `apps/web/app/routes/jobs._index.tsx` (508 lines) is a **merchant-facing** route (path `/jobs`, distinct from the internal-admin `/internal/jobs`) that displays raw dollar cost, token counts, and provider/model names: the "Store AI usage and cost" section (lines 322-359, a full `<s-table>` of `formatCents(row.costCents)`/`fmtNum(row.tokensIn/Out)`/provider+model per row) and a per-job cost cell (lines 433-438, `formatCents(j.aiUsage.costCents)`). It is currently unreachable via nav (no command-palette entry, no `INSIGHTS_TABS`/`BUILD_TABS` entry — `apps/web/app/components/merchant/polaris.tsx:207-219`), but it is a live, working route that a merchant can hit directly, so the leak is real regardless of nav wiring.
- **Preview auth gap:** `apps/web/app/routes/preview.$moduleId.tsx:19-29` — when the URL carries a `shop` query param (the normal path: `modules.$moduleId.tsx:568`'s `window.open` uses `\`/preview/${moduleId}?shop=${encodeURIComponent(data.shop)}\`\`), `shopify.authenticate.admin` is **skipped entirely** and `shop` is trusted as-is. Any caller who obtains a `(shop, moduleId)` pair (browser history, referrer, a shared link) can view that shop's compiled module HTML with no authentication — a capability-URL model masquerading as authorization. `apps/web/app/routes/api.preview.tsx` (the Builder's live iframe preview) is correctly authenticated and is not the gap.
- **Maya AI-disclosure (D4) actively contradicts the decision**, not merely omits disclosure: `apps/web/app/services/support/triage.server.ts:149` instructs the LLM to "write it as Maya, a friendly human support representative — never mention AI, bots, or automation." `apps/web/app/components/support/badges.tsx:17-27` defines `SUPPORT_AGENT_NAME = 'Maya'` and relabels the internal `AI_RESPONDED` status as merchant-visible `'Answered'`, with its own comment stating "support reads as a human team, so no 'AI' wording." `apps/web/app/routes/support.$ticketId.tsx:59-64`'s `ROLE_LABEL` shows AI replies as `` `${SUPPORT_AGENT_NAME} · Support team` `` — visually identical to a real human reply (`human_agent: 'Support team'`). One inconsistent leak exists at `apps/web/app/routes/api.support.ticket-action.tsx:80` ("... with the AI workup attached" — merchant-visible, on escalate only). Internal-admin routes (`internal.support.*`) already say "AI" freely — the split is deliberate but the merchant half is the opposite of D4.
- **Publish has no confirm step and no post-publish storefront link.** In the WS-E worktree, `modules.$moduleId.tsx`'s Publish button (line 671) calls `publish()` (lines 604-608) directly with zero confirmation — contrast Delete/Unpublish, which both go through `<ConfirmModal>` (lines 768-781). The theme-pick control already exists (`<s-select label="Publish to theme">`, lines 757-765). After a successful publish there is no "view on storefront" affordance anywhere in the file — only the embed-activation deep-link banner (theme modules missing the app embed) and the partial-failure banner.
- Publish/agent-publish routes (`api.publish.tsx`, `api.agent.modules.$moduleId.publish.tsx`) are **single synchronous call-and-response** — no incremental progress, no SSE, no polling. `JobService.create/start/succeed/fail` bookkeeping exists but is never surfaced to the client. This confirms Task 17 (draft persistence with real progress) needs WS-C's async infrastructure; it cannot be built against today's publish routes.
- No BullMQ/job-queue infra exists yet in `apps/web` (`grep -rln "bullmq\|BullMQ" apps/web/app` → zero hits) — WS-C has not landed.
- `<s-grid gridTemplateColumns="repeat(3, 1fr)">`-style fixed multi-column grids exist across merchant routes (e.g. `apps/web/app/routes/modules._index.tsx:126,148,316,397,401,425`) with **zero responsive `@media` handling anywhere in `apps/web/app/styles/merchant.css`** (`grep -n "@media" merchant.css` → only a `prefers-reduced-motion` block, no width-based query at all) — confirms the mobile-pass finding.

## Decisions of record for this plan

| # | Decision |
|---|----------|
| F1 | **Dashboard quick-action CTA finding does not reproduce (verified 2026-08-24).** No task in this plan touches `apps/web/app/routes/_index.tsx`'s `QuickActions`. If the audit meant a different element, re-open with a specific selector. |
| F2 | **Buy-bar hard-coding is replaced with `getRecipeJsonSchemaForType`-derived schemas**, not a bespoke buy-bar schema and not a rewrite of `GenConfigControls`'s ad-hoc type-inference. One `SchemaForm` mount serves every module type in the Builder's settings panel once Task 8 lands; `GenControls`/`GenConfigControls`/`BASE_SETTINGS`/`CONCEPT_PRESETS`/`mergeSettingsIntoRecipe`/`settingsFromRecipe` are deleted together in that task, not incrementally. |
| F3 | **Preview auth is fixed with a signed capability token built on the existing `encryptJson`/`decryptJson` (AES-256-GCM, `ENCRYPTION_KEY`)**, not a new signing scheme. `preview.$moduleId.tsx`'s `shop` query param is replaced by an opaque `token` param minted server-side (in the authenticated `modules.$moduleId.tsx` loader) at click time, short-TTL, bound to `(shop, moduleId)`. |
| F4 | **D7 scope split: this plan wires the "workflow install" CTA (`/flows/templates` reachability) and the captures link because both are literally "fix a broken/missing CTA on an existing merchant page" — squarely [UI-4]/captures-D7 as named in the master plan's WS-F bullet. `/jobs` nav-restoration and the master plan's DELETE list (`/picker`, `/advanced`, `/api-usage`, `/logs`, `api.module-captures.tsx`, and the `INSIGHTS_TABS`/`MerchantSubnav.tsx` dedupe) are NOT in this plan** — they are Phase 5 / WS-I's "orphan pages per archaeology report + D7" per the master plan's workstream list. This plan does, however, fix the AI-cost leak on `/jobs` (Task 1) regardless of `/jobs`'s reachability, because the leak is real on the live route independent of nav wiring. |
| F5 | **CSS: delete `generate.css` outright (234 LOC, verified generate-exclusive); relocate (not delete) `polaris.css`+`shell.css`+`pages.css` from `root.tsx`'s global links to `internal.tsx`'s `links()`**, because those three are shared with internal admin (verified: 36+ `internal.*.tsx` files reference their classes). No task in this plan asserts a specific total LOC-deleted figure without deriving it via `wc -l` at execution time. |
| F6 | **"Generate full settings" [UI-3] is closed as "already wired," not rebuilt.** Task 6 adds the missing regression test and the loader plumbing Task 7 needs; it does not touch `api.ai.hydrate-module.tsx`'s logic. |
| F7 | **The Builder's real-progress and AbortController work (Tasks 9-10) targets today's existing SSE stream endpoint (`/api/ai/create-module/stream`)**, not WS-C's future async jobs — the stream endpoint already emits real incremental events; only the client-side progress mapping is fake. This work is NOT blocked on WS-C. Only Task 17 (full server-persisted drafts across page reloads) is. |
| F8 | **`MerchantSubnav.tsx` and the legacy `MerchantShell` branch are deleted in Task 15 (this plan)**, not deferred to WS-I, because Task 14 makes `generate._index.tsx` — verified the only remaining caller — the last consumer; leaving dead code in a file this plan is actively editing violates "no unrequested scope for convenience" less than leaving a confirmed-dead branch in a shell component this plan just finished migrating off of. |

## File Structure (created / modified)

```
apps/web/app/routes/jobs._index.tsx                          [M] remove merchant AI-cost/token/provider display
apps/web/app/routes/templates.$templateId.tsx                 [M] "Use template" → POST /api/modules/from-template
apps/web/app/routes/flows._index.tsx                          [M] "Templates" button → /flows/templates
apps/web/app/components/support/badges.tsx                    [M] persona/status-label disclosure copy
apps/web/app/routes/support.$ticketId.tsx                     [M] ROLE_LABEL disclosure copy
apps/web/app/services/support/triage.server.ts                [M] suggestedReply prompt — disclose AI
apps/web/app/routes/api.support.ticket-action.tsx              [M] escalate system-message copy
apps/web/app/services/security/preview-token.server.ts        [C] mint/verify short-lived preview capability token
apps/web/app/routes/preview.$moduleId.tsx                     [M] verify token instead of trusting raw `shop`
apps/web/app/__tests__/preview-token.test.ts                  [C]
apps/web/app/routes/modules.$moduleId.tsx                     [M] loader: forward adminConfig; mount SchemaForm; captures link; publish confirm + view-on-storefront (Tasks 6,7,11,12)
apps/web/app/routes/api.modules.$moduleId.update-config.tsx   [C] SchemaForm save action
apps/web/app/utils/admin-config-schema.ts                     [C] parse/guard helpers for the hydrate-produced (jsonSchema,uiSchema,defaults) triple
apps/web/app/__tests__/hydrate-module.route.test.ts            [C]
apps/web/app/__tests__/update-config.route.test.ts             [C]
apps/web/app/routes/generate._index.tsx                        [M] kill buy-bar hard-coding (Task 8); real progress (Task 9); AbortController (Task 10); ErrorBoundary (Task 13); Polaris migration (Task 14); mobile pass (Task 16)
apps/web/app/utils/generation-outcome.ts                       [M] add stream-event→step mapping + abort classification
apps/web/app/__tests__/generation-outcome.test.ts               [M] new cases for the above
apps/web/app/components/merchant/MerchantShell.tsx             [M] delete the legacy (non-polaris) branch (Task 15)
apps/web/app/components/superapp/MerchantSubnav.tsx            [D] deleted (Task 15)
apps/web/app/root.tsx                                           [M] drop the generate.css link; move the other three to internal layout (Task 15)
apps/web/app/routes/internal.tsx                                [M] pick up polaris.css/shell.css/pages.css via links() (Task 15)
apps/web/app/styles/superapp/generate.css                       [D] deleted (Task 15)
apps/web/app/styles/merchant.css                                [M] responsive rules (Task 16)
apps/web/app/services/generation/generation-job.interface.ts   [C] WS-C consumed-interface stub (Task 17, BLOCKED)
```

## Shared test patterns

**Route-level test harness** (mock every collaborator, import `action`/`loader` directly, build a real `Request`) — reused verbatim from `apps/web/app/__tests__/agent-publish-quota.route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin: {} })),
  // ...one vi.fn() per collaborator the route imports
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
// ...one vi.mock per import

function createRequest(body: Record<string, unknown> = {}) {
  return new Request('https://app.test/api/...', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => vi.clearAllMocks());
```

**Pure client-logic extraction** — reused from `apps/web/app/utils/generation-outcome.ts` + `apps/web/app/__tests__/generation-outcome.test.ts`: any decision a route component makes from event data (which step to show, whether to fall back, whether to bill) lives in a plain exported function in `app/utils/*.ts`, unit-tested directly, imported into the route with zero logic duplicated in JSX.

---

### Task 1: Remove AI-cost leakage from the merchant `/jobs` route

**Files:**
- Modify: `apps/web/app/routes/jobs._index.tsx`

**Interfaces:**
- No new exports. Loader stops computing `aiSummary30d`/`aiSummaryAllTime`/per-job `aiUsage` for the client; those aggregations either move to `internal.jobs.tsx` (already has store-level AI usage per repo memory) or are simply deleted here since internal admin's Usage/Activity tabs already cover this data.

- [ ] **Step 1: Confirm scope** — `grep -n "aiUsage\|costCents\|tokensIn\|tokensOut\|formatCents" apps/web/app/routes/jobs._index.tsx` and record the line ranges (verified at investigation time: loader aggregation lines 128-211 + 247; JSX lines 322-359 "Store AI usage and cost" section, and lines 433-438 per-job cost cell). Re-run this grep at execution time — line numbers may have shifted if WS-QF/WS-E landed unrelated edits to this file (unlikely; it's not in their file lists).

- [ ] **Step 2: Delete the merchant-facing cost display.** Remove the entire `<s-section heading="Store AI usage and cost">...</s-section>` block (JSX) and the per-job `{j.aiUsage ? (...) : null}` cost cell. Remove the now-unused loader aggregation (`aiUsageRows`, `aiUsageByCorrelation`, `aiGrouped30d`/`aiGroupedAllTime`, `summarizeAiGroups`, `formatCents`, and the `aiUsage`/`aiSummary30d`/`aiSummaryAllTime` fields from the loader's returned `json(...)` and from `jobsData`'s per-job mapping) — keep everything else (job status/type/duration/module link/trigger source), since that's legitimate merchant-facing operational data.

- [ ] **Step 3: Route-level regression test** — create `apps/web/app/__tests__/jobs-index-no-cost-leak.route.test.ts` using the shared harness pattern (mock `shopify.server`, `~/db.server`'s `getPrisma` to return canned `job`/`activityLog` rows with **no** `aiUsage`/`aiProvider` mocks configured — if the loader still tries to call `prisma.aiUsage.findMany`/`prisma.aiUsage.groupBy`, the test's unmocked call throws, failing loudly):

```ts
import { describe, it, expect, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  shopFindFirst: vi.fn(async () => ({ id: 'shop_1' })),
  jobFindMany: vi.fn(async () => [
    { id: 'job_1', type: 'AI_GENERATE', status: 'SUCCESS', attempts: 1, error: null,
      createdAt: new Date(), startedAt: new Date(), finishedAt: new Date(),
      correlationId: 'corr_1', requestId: 'req_1', payload: '{}', result: null },
  ]),
  activityFindMany: vi.fn(async () => []),
  moduleFindMany: vi.fn(async () => []),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findFirst: hoisted.shopFindFirst },
    job: { findMany: hoisted.jobFindMany },
    activityLog: { findMany: hoisted.activityFindMany },
    module: { findMany: hoisted.moduleFindMany },
    // Deliberately NO `aiUsage` / `aiProvider` keys — if loader code still
    // reaches for prisma.aiUsage.*, this throws "Cannot read properties of
    // undefined" and the test fails, proving the cost query was removed.
  }),
}));

describe('jobs._index loader — WS-F: no AI-cost leak to merchants', () => {
  it('loads without touching prisma.aiUsage / prisma.aiProvider', async () => {
    const { loader } = await import('~/routes/jobs._index');
    const res = await loader({ request: new Request('https://app.test/jobs') } as never);
    const payload = await res.json();
    expect(payload).not.toHaveProperty('aiSummary30d');
    expect(payload).not.toHaveProperty('aiSummaryAllTime');
    expect(payload.jobs[0]).not.toHaveProperty('aiUsage');
  });
});
```

- [ ] **Step 4: Run** — `cd apps/web && npx vitest run app/__tests__/jobs-index-no-cost-leak.route.test.ts`. Expected: FAIL until Step 2 lands, then PASS.

- [ ] **Step 5: Build gate** — `cd apps/web && pnpm build`. Expected: succeeds (removing unused `formatCents`/aggregation code should not break anything; fix any resulting unused-import lint error).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/jobs._index.tsx apps/web/app/__tests__/jobs-index-no-cost-leak.route.test.ts
git commit -m "fix(merchant): remove AI cost/token/provider display from the merchant /jobs route"
```

---

### Task 2: Fix the template-detail "Use template" CTA

**Files:**
- Modify: `apps/web/app/routes/templates.$templateId.tsx`
- Modify: `apps/web/app/__tests__` (new file below)

**Interfaces:**
- No new route — reuses the already-working `POST /api/modules/from-template` (`apps/web/app/routes/api.modules.from-template.tsx`, reads `form.get('templateId')`).

- [ ] **Step 1: Read the working pattern** — `apps/web/app/routes/templates._index.tsx:171-174` (or nearby) for the exact `<Form method="post" action="/api/modules/from-template">` / `useFetcher` idiom already used successfully in this codebase; mirror it exactly rather than inventing a new one.

- [ ] **Step 2: Failing test first** — create `apps/web/app/__tests__/template-detail-use-template.route.test.ts`. Since this is a client `onClick` handler (not a loader/action), extract the target-URL/body decision into a tiny pure helper first (consistent with the plan's "no component tests" constraint):

`apps/web/app/utils/template-detail.ts` (new, tiny):
```ts
/** Builds the fetcher submit args for "Use template" — single source of truth
 *  so the button and its test agree on the real endpoint contract. */
export function useTemplateSubmission(templateId: string): { action: string; body: { templateId: string } } {
  return { action: '/api/modules/from-template', body: { templateId } };
}
```

```ts
import { describe, it, expect } from 'vitest';
import { useTemplateSubmission } from '~/utils/template-detail';

describe('template-detail "Use template" CTA (WS-F: was a dead navigate to an unread query param)', () => {
  it('submits to the real from-template endpoint with the templateId', () => {
    expect(useTemplateSubmission('tmpl_123')).toEqual({
      action: '/api/modules/from-template',
      body: { templateId: 'tmpl_123' },
    });
  });
});
```

- [ ] **Step 3: Run** — `npx vitest run app/__tests__/template-detail-use-template.route.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement the helper**, then wire the button in `templates.$templateId.tsx:86-92` to a `useFetcher` that submits via `useTemplateSubmission(template.id)` instead of `navigate(...)`, and on success (`fetcher.data?.ok` — check `api.modules.from-template.tsx`'s actual success shape and match it) navigate to the new module (`/modules/${fetcher.data.id}`) or show a toast + `navigate('/modules')` if `api.modules.from-template.tsx` doesn't return the new module id.

- [ ] **Step 5: Run the test** (PASS) + `pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/templates.\$templateId.tsx apps/web/app/utils/template-detail.ts apps/web/app/__tests__/template-detail-use-template.route.test.ts
git commit -m "fix(merchant): template detail 'Use template' now creates the module instead of dead-navigating"
```

---

### Task 3: Fix the workflow-install CTA (`/flows/templates` reachability)

**Files:**
- Modify: `apps/web/app/routes/flows._index.tsx`

**Interfaces:** None new — `apps/web/app/routes/flows.templates.tsx` already works; this task only makes it reachable.

- [ ] **Step 1: Confirm current state** — `sed -n '280,290p' apps/web/app/routes/flows._index.tsx` to re-verify the button still calls `ctx.go('#/app/templates?type=Flow')` at the line found during investigation (283 at HEAD; re-check, since WS-QF/WS-E don't touch this file but re-verify regardless).

- [ ] **Step 2: Repoint the button** to a real navigation to `/flows/templates` (match the file's existing navigation idiom — `useNavigate()` if already imported, else `ctx.go` is fine as long as the target is the real path, not the `#/app/templates` alias which only resolves module templates):

```tsx
<s-button slot="secondary-actions" icon="theme-template" onClick={() => navigate('/flows/templates')}>
  Templates
</s-button>
```

(Import `useNavigate` from `@remix-run/react` if not already present in this file.)

- [ ] **Step 3: Route-level smoke test** — since this is a pure link-target fix with no server logic, add one assertion to whatever existing route test file covers `flows._index.tsx` (if none exists, skip a dedicated test here — this is a one-line JSX target change, not new behavior, matching WS-E's precedent of not unit-testing pure UI-affordance edits). Instead, verify by reading the rendered `href`/`onClick` target in the diff and running `pnpm build`.

- [ ] **Step 4: `pnpm build`.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/routes/flows._index.tsx
git commit -m "fix(merchant): flows 'Templates' button repoints to /flows/templates (D7 regression from d182fdc)"
```

---

### Task 4: Maya AI-disclosure copy (D4)

**Files:**
- Modify: `apps/web/app/services/support/triage.server.ts`
- Modify: `apps/web/app/components/support/badges.tsx`
- Modify: `apps/web/app/routes/support.$ticketId.tsx`
- Modify: `apps/web/app/routes/api.support.ticket-action.tsx`
- Modify: `apps/web/app/__tests__/support-triage.test.ts` (or create if none exists for the prompt-building function)

**Interfaces:** `TICKET_STATUS_LABEL`/`ROLE_LABEL` string values change; `buildTriagePrompt`'s system-prompt string changes. No signature changes.

- [ ] **Step 1: Failing test on the prompt content** — locate or create a test for `buildTriagePrompt` (check `apps/web/app/__tests__` for an existing triage prompt test first; if `buildTriagePrompt` isn't exported, export it — it's already a standalone pure function per the investigation, `triage.server.ts:143`):

```ts
import { describe, it, expect } from 'vitest';
import { buildTriagePrompt } from '~/services/support/triage.server';

describe('buildTriagePrompt — D4: Maya is disclosed as AI', () => {
  it('does NOT instruct the model to hide that it is AI', () => {
    const { system } = buildTriagePrompt({ shopDomain: 's.myshopify.com', subject: 'x', description: 'y', moduleContext: null });
    expect(system.toLowerCase()).not.toMatch(/never mention ai, bots, or automation/);
    expect(system.toLowerCase()).not.toMatch(/friendly human support representative/);
    expect(system.toLowerCase()).toMatch(/maya.*ai|ai.*assistant/);
  });
});
```

- [ ] **Step 2: Run** — FAIL (current prompt text matches the forbidden pattern).

- [ ] **Step 3: Rewrite the prompt instruction** at `triage.server.ts:149` — replace:

```
'suggestedReply (a short, polite first reply to the merchant: acknowledge, state what happens next; never promise a fix time; write it as Maya, a friendly human support representative — never mention AI, bots, or automation, and do not add a signature since the UI already shows your name),',
```
with:
```
'suggestedReply (a short, polite first reply to the merchant: acknowledge, state what happens next; never promise a fix time; write it as Maya, SuperApp\'s AI support assistant — it is fine and expected to say you are an AI when it is natural to do so, never claim to be a human; do not add a signature since the UI already shows your name),',
```

- [ ] **Step 4: Run the test** (PASS).

- [ ] **Step 5: Update merchant-visible labels** — `badges.tsx:16-27`:

```ts
// Merchant-facing support persona: Maya is disclosed as an AI assistant (D4 —
// "instant AI answer, humans on escalation"). One place to change the name.
export const SUPPORT_AGENT_NAME = 'Maya';

// Merchant-facing status labels: honest about AI vs human authorship (D4).
export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  AI_RESPONDED: 'Answered by Maya (AI)',
  ESCALATED: 'With the team',
  RESOLVED: 'Resolved',
};
```

`support.$ticketId.tsx:59-64`:

```ts
// Merchant-facing: assistant replies are labeled as AI (D4 disclosure).
const ROLE_LABEL: Record<string, string> = {
  merchant: 'You',
  assistant: `${SUPPORT_AGENT_NAME} · AI assistant`,
  human_agent: 'Support team',
  system: 'System',
};
```

Also update the duplicate status-badge copy at `support.$ticketId.tsx:50-56` (the `base` array building the status stepper — `{ key: 'AI_RESPONDED', label: 'Answered' }` → `{ key: 'AI_RESPONDED', label: 'Answered by Maya (AI)' }`) to keep the two labels in sync.

- [ ] **Step 6: Fix the stray leak/inconsistency** at `api.support.ticket-action.tsx:80` — this line is fine as an *escalate* system message (it correctly says "AI workup"), but is currently the ONLY place AI is mentioned; leave it, since after Step 5 the initial reply already discloses AI too, so this is now consistent rather than a stray leak. No change needed here beyond re-reading it post-Step-5 to confirm it no longer reads as inconsistent.

- [ ] **Step 7: Run the full support test slice** — `npx vitest run app/__tests__/support-triage.test.ts` (or wherever the new test lives) plus any existing support-route tests (`grep -rl "support" apps/web/app/__tests__ | grep -i ticket`). Expected: PASS.

- [ ] **Step 8: `pnpm build` + `pnpm lint`.**

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/services/support/triage.server.ts apps/web/app/components/support/badges.tsx apps/web/app/routes/support.\$ticketId.tsx apps/web/app/__tests__
git commit -m "fix(merchant): Maya support copy discloses AI per D4 (was instructed to impersonate a human)"
```

---

### Task 5: Preview endpoint auth — signed capability token

**Files:**
- Create: `apps/web/app/services/security/preview-token.server.ts`
- Modify: `apps/web/app/routes/preview.$moduleId.tsx`
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (worktree: the `window.open` call site, line 568)
- Create: `apps/web/app/__tests__/preview-token.test.ts`

**Interfaces:**

```ts
export function mintPreviewToken(input: { shop: string; moduleId: string }, ttlMs?: number): string;
/** Throws on expiry/mismatch; never partially trusts a token. */
export function verifyPreviewToken(token: string, expected: { moduleId: string }): { shop: string };
```

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('preview-token (WS-F: preview.$moduleId.tsx auth gap)', () => {
  it('mints a token that verifies back to the same shop for the same moduleId', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' });
    const { shop } = verifyPreviewToken(token, { moduleId: 'mod_1' });
    expect(shop).toBe('acme.myshopify.com');
  });

  it('rejects a token minted for a different moduleId', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' });
    expect(() => verifyPreviewToken(token, { moduleId: 'mod_2' })).toThrow();
  });

  it('rejects an expired token', async () => {
    const { mintPreviewToken, verifyPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' }, -1);
    expect(() => verifyPreviewToken(token, { moduleId: 'mod_1' })).toThrow(/expired/i);
  });

  it('rejects garbage input rather than throwing an unrelated decrypt error a caller could probe with', async () => {
    const { verifyPreviewToken } = await import('~/services/security/preview-token.server');
    expect(() => verifyPreviewToken('not-a-real-token', { moduleId: 'mod_1' })).toThrow();
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Implement:**

```ts
import { encryptJson, decryptJson } from '~/services/security/crypto.server';

const DEFAULT_TTL_MS = 5 * 60_000; // 5 minutes — long enough for the merchant's window.open to load

type PreviewTokenPayload = { shop: string; moduleId: string; exp: number };

/** Opaque, tamper-proof (AES-256-GCM) capability token binding a preview link
 *  to exactly one (shop, moduleId) pair for a short window — replaces trusting
 *  a raw `?shop=` query param (WS-F: preview.$moduleId.tsx had no auth on this path). */
export function mintPreviewToken(input: { shop: string; moduleId: string }, ttlMs = DEFAULT_TTL_MS): string {
  const payload: PreviewTokenPayload = { shop: input.shop, moduleId: input.moduleId, exp: Date.now() + ttlMs };
  return encryptJson(payload);
}

export function verifyPreviewToken(token: string, expected: { moduleId: string }): { shop: string } {
  let payload: PreviewTokenPayload;
  try {
    payload = decryptJson<PreviewTokenPayload>(token);
  } catch {
    throw new Error('Invalid preview token');
  }
  if (payload.moduleId !== expected.moduleId) throw new Error('Preview token does not match this module');
  if (Date.now() > payload.exp) throw new Error('Preview token expired');
  return { shop: payload.shop };
}
```

- [ ] **Step 4: Run** (PASS).

- [ ] **Step 5: Wire the loader** — `preview.$moduleId.tsx:19-29`, replace the `shop` query-param trust with token verification:

```ts
const token = new URL(request.url).searchParams.get('token')?.trim();
const ms = new ModuleService();

let mod;
if (token) {
  const { shop } = verifyPreviewToken(token, { moduleId });
  mod = await ms.getModule(shop, moduleId);
} else {
  // Backward-compat: embedded/admin GET with a real session still authenticates.
  const { session } = await shopify.authenticate.admin(request);
  mod = await ms.getModule(session.shop, moduleId);
}
```

Add `import { verifyPreviewToken } from '~/services/security/preview-token.server';`. Any `verifyPreviewToken` throw propagates as an unhandled error → Remix's error boundary (acceptable: an invalid/expired/foreign token should fail loudly, not silently 404 — a 404 would leak "this moduleId exists"; letting it throw a generic 500 is the honest failure mode here). If a cleaner 403 is preferred, wrap in try/catch and `return json({ error: 'Invalid or expired preview link' }, { status: 403 })`.

- [ ] **Step 6: Mint the token at the call site** — `modules.$moduleId.tsx` (worktree line 568-ish), the `window.open` needs a token instead of the raw shop. Since `openPreview` is a client-side callback with no server round-trip today, either (a) mint the token server-side in the loader (cheap, no Shopify call, same pattern as `embedDeepLink`) and pass it down as loader data, or (b) add a tiny authenticated `GET /api/modules/:id/preview-token` the client calls just before `window.open`. **Choose (a)** — it's one extra loader field, no new route, matches the `embedDeepLink` precedent exactly:

In the loader (near the `embedDeepLink` computation, worktree line ~211): `const previewToken = mintPreviewToken({ shop: session.shop, moduleId }, 5 * 60_000);` and add `previewToken` to the returned `json({...})`. In the component, change the `window.open` call to `` `/preview/${moduleId}?token=${encodeURIComponent(data.previewToken)}` ``.

- [ ] **Step 7: Run** the full preview-token test + `grep -rn "preview.\$moduleId\|api.preview" apps/web/app/__tests__` for any existing test asserting the old `?shop=` contract and update it. `pnpm build`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/services/security/preview-token.server.ts apps/web/app/routes/preview.\$moduleId.tsx apps/web/app/routes/modules.\$moduleId.tsx apps/web/app/__tests__/preview-token.test.ts
git commit -m "fix(merchant): preview.\$moduleId.tsx authorizes via a signed capability token, not a trusted shop param"
```

---

### Task 6: Close "Generate full settings" [UI-3] — regression test + expose `adminConfig` on the loader

**Files:**
- Create: `apps/web/app/__tests__/hydrate-module.route.test.ts`
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (loader only — worktree lines ~170-187, 215)

**Interfaces:**
- `hydration` object (returned from the loader) gains: `jsonSchema: unknown | null`, `uiSchema: unknown | null`, `defaults: unknown | null` (raw parsed JSON — `SchemaForm`-shaped consumption happens in Task 7).

- [ ] **Step 1: Regression test for the already-working route** (closes [UI-3] with evidence rather than a rewrite — see Decision F6):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com', locale: 'en' } })),
  enforceRateLimit: vi.fn(async () => {}),
  shopFindFirst: vi.fn(async () => ({ id: 'shop_1', planTier: 'FREE' })),
  getModule: vi.fn(async () => ({
    id: 'mod_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', config: {} }), hydratedAt: null }],
    activeVersion: null,
  })),
  quotaEnforce: vi.fn(async () => {}),
  hydrateRecipeSpec: vi.fn(async () => ({
    adminConfig: { jsonSchema: { type: 'object', properties: {} }, uiSchema: {}, defaults: {} },
    themeEditorSettings: {},
    validationReport: { overall: 'PASS', checks: [] },
  })),
  moduleVersionUpdate: vi.fn(async () => ({})),
  jobCreate: vi.fn(async () => ({ id: 'job_1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findFirst: hoisted.shopFindFirst },
    moduleVersion: { update: hoisted.moduleVersionUpdate },
  }),
}));
vi.mock('~/services/billing/quota.service', () => ({ QuotaService: class { enforce = hoisted.quotaEnforce; } }));
vi.mock('~/services/modules/module.service', () => ({ ModuleService: class { getModule = hoisted.getModule; } }));
vi.mock('~/services/ai/llm.server', () => ({
  hydrateRecipeSpec: hoisted.hydrateRecipeSpec,
  AiProviderNotConfiguredError: class extends Error {},
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class { create = hoisted.jobCreate; start = hoisted.jobStart; succeed = hoisted.jobSucceed; fail = hoisted.jobFail; },
}));

function req(body: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(body)) fd.set(k, v);
  return new Request('https://app.test/api/ai/hydrate-module', { method: 'POST', body: fd });
}

beforeEach(() => vi.clearAllMocks());

describe('api.ai.hydrate-module — "Generate full settings" (WS-F closes [UI-3]: was already wired)', () => {
  it('hydrates, persists adminConfig, and returns ok:true with a validation report', async () => {
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req({ moduleId: 'mod_1' }) });
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.validationReport.overall).toBe('PASS');
    expect(hoisted.moduleVersionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ver_1' },
        data: expect.objectContaining({
          adminConfigSchemaJson: expect.stringContaining('"jsonSchema"'),
        }),
      }),
    );
    expect(hoisted.jobSucceed).toHaveBeenCalled();
  });

  it('returns a structured 503 with a setup link when no AI provider is configured', async () => {
    class AiProviderNotConfiguredError extends Error { code = 'AI_PROVIDER_NOT_CONFIGURED'; }
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new AiProviderNotConfiguredError('no provider'));
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req({ moduleId: 'mod_1' }) });
    expect(res.status).toBe(503);
    const payload = await res.json();
    expect(payload.setupUrl).toBe('/internal/ai-providers');
    expect(hoisted.jobFail).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run app/__tests__/hydrate-module.route.test.ts`. Expected: PASS on the first try (the route is already correct) — this is the expected outcome for a regression test on working code, not a red-then-green cycle. If it fails, the failure is real and must be root-caused (do not adjust the test to match broken behavior).

- [ ] **Step 3: Expose the schema on `modules.$moduleId.tsx`'s loader** (worktree lines ~170-187). Extend the `hydration` object:

```ts
const hydration = hydratedSource
  ? (() => {
      // ...existing validationReport parsing...
      let adminConfig: { jsonSchema: unknown; uiSchema: unknown; defaults: unknown } | null = null;
      if (hydratedSource.adminConfigSchemaJson) {
        try {
          const parsed = JSON.parse(hydratedSource.adminConfigSchemaJson) as { jsonSchema?: unknown; uiSchema?: unknown };
          const defaults = hydratedSource.adminDefaultsJson ? JSON.parse(hydratedSource.adminDefaultsJson) : {};
          if (parsed.jsonSchema) adminConfig = { jsonSchema: parsed.jsonSchema, uiSchema: parsed.uiSchema ?? {}, defaults };
        } catch {
          // malformed persisted JSON — SchemaForm mount (Task 7) falls back to no-schema state
        }
      }
      return {
        status: 'done' as const,
        hydratedAt: hydratedSource.hydratedAt?.toISOString() ?? null,
        validationReport,
        everHydrated,
        adminConfig,
      };
    })()
  : { status: 'none' as const, hydratedAt: null, validationReport: null, everHydrated: false, adminConfig: null };
```

- [ ] **Step 4: Route-level loader test** for the new field — add to a `modules-detail-loader.test.ts` (create if none exists for this loader; check first) asserting `hydration.adminConfig` is `null` when `adminConfigSchemaJson` is absent, and populated with the parsed triple when present.

- [ ] **Step 5: Run** both test files + `pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/__tests__/hydrate-module.route.test.ts apps/web/app/routes/modules.\$moduleId.tsx apps/web/app/__tests__
git commit -m "test(merchant): regression-cover 'Generate full settings' (closes [UI-3], already wired); expose adminConfig on module-detail loader"
```

---

### Task 7: Mount `SchemaForm` in the module-detail Settings tab

**Files:**
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (component + inline `action`)
- Create: `apps/web/app/routes/api.modules.$moduleId.update-config.tsx`
- Create: `apps/web/app/__tests__/update-config.route.test.ts`

**Interfaces:**
- `POST /api/modules/:moduleId/update-config` — form/JSON body `{ configJson: string }` (a full replacement of the spec's `config` branch, merchant-edited). Returns `{ ok: true, version: number } | { ok: false, error: string }` (mirror `applyFetcher`'s shape at worktree lines 649-654 so the same toast pattern works).

- [ ] **Step 1: Failing route test:**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com' } })),
  getModule: vi.fn(async () => ({
    id: 'mod_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', config: { label: 'old' } }) }],
  })),
  createNewVersion: vi.fn(async () => ({ id: 'ver_2', version: 3 })),
  log: vi.fn(async () => {}),
}));
vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class { getModule = hoisted.getModule; createNewVersion = hoisted.createNewVersion; },
}));
vi.mock('~/services/activity/activity.service', () => ({ ActivityLogService: class { log = hoisted.log; } }));

function req(configJson: string) {
  const fd = new FormData();
  fd.set('configJson', configJson);
  return new Request('https://app.test/api/modules/mod_1/update-config', { method: 'POST', body: fd });
}
beforeEach(() => vi.clearAllMocks());

describe('api.modules.$moduleId.update-config (WS-F: SchemaForm save path)', () => {
  it('merges the new config into the spec and saves as a new draft version', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req(JSON.stringify({ label: 'new' })), params: { moduleId: 'mod_1' } });
    const payload = await res.json();
    expect(payload).toMatchObject({ ok: true, version: 3 });
    const [, , spec] = hoisted.createNewVersion.mock.calls[0];
    expect(spec.config).toEqual({ label: 'new' });
    expect(spec.type).toBe('theme.section'); // type/other branches untouched
  });

  it('400s on malformed configJson', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req('not json'), params: { moduleId: 'mod_1' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** — FAIL (route not found).

- [ ] **Step 3: Implement the route** (mirror `api.modules.$moduleId.unpublish.tsx`'s structure — 405 loader, authenticate, 404 check, `ActivityLogService.log`):

```tsx
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ ok: false, error: 'Missing moduleId' }, { status: 400 });

  const form = await request.formData();
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(String(form.get('configJson') ?? '{}'));
  } catch {
    return json({ ok: false, error: 'Malformed configJson' }, { status: 400 });
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ ok: false, error: 'Module not found' }, { status: 404 });
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.versions[0];
  if (!draft) return json({ ok: false, error: 'No version to edit' }, { status: 400 });

  const spec = JSON.parse(draft.specJson) as Record<string, unknown>;
  const nextSpec = { ...spec, config };

  const version = await moduleService.createNewVersion(session.shop, moduleId, nextSpec as never);
  await new ActivityLogService().log({
    actor: 'MERCHANT', action: 'MODULE_CONFIG_UPDATED', resource: `module:${moduleId}`,
  }).catch(() => {});

  return json({ ok: true, version: version.version });
}
```

- [ ] **Step 4: Run** (PASS).

- [ ] **Step 5: Mount `SchemaForm` in the Settings tab.** In `modules.$moduleId.tsx`, add `import { SchemaForm, type JsonSchemaNode, type SectionUiHints } from '~/components/SchemaForm';`, a `configFetcher = useFetcher<{ ok?: boolean; version?: number; error?: string }>()`, and local state `const [configValue, setConfigValue] = useState<Record<string, unknown>>(() => (spec?.config as Record<string, unknown>) ?? {});`. In the Settings tab body (near the existing hydrate/fill-settings controls, worktree lines ~925-972), add — gated on `data.hydration.adminConfig` being present, matching `AddRecordModal`'s exact prop-cast pattern (`data.$storeKey.tsx:256-257`):

```tsx
{data.hydration.adminConfig ? (
  <s-section heading="Settings">
    <SchemaForm
      schema={data.hydration.adminConfig.jsonSchema as JsonSchemaNode}
      uiSchema={data.hydration.adminConfig.uiSchema as Record<string, SectionUiHints>}
      value={configValue}
      onChange={setConfigValue}
      tier="advanced"
      disabled={configFetcher.state !== 'idle'}
    />
    <s-button
      variant="primary"
      loading={configFetcher.state !== 'idle' || undefined}
      onClick={() => configFetcher.submit({ configJson: JSON.stringify(configValue) }, { method: 'post', action: `/api/modules/${moduleId}/update-config` })}
    >
      Save settings
    </s-button>
  </s-section>
) : null}
```

Add an effect mirroring `applyFetcher`'s toast pattern (worktree lines 555-567) for `configFetcher`.

- [ ] **Step 6: Run** the full test slice (`update-config.route.test.ts`, `hydrate-module.route.test.ts`) + `pnpm build` + `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/routes/api.modules.\$moduleId.update-config.tsx apps/web/app/routes/modules.\$moduleId.tsx apps/web/app/__tests__/update-config.route.test.ts
git commit -m "feat(merchant): mount SchemaForm in module-detail Settings tab, driven off hydrate's adminConfig"
```

---

### Task 8: Kill hard-coded buy-bar writes in the Builder (`generate._index.tsx`)

**Files:**
- Modify: `apps/web/app/routes/generate._index.tsx`
- Create: `apps/web/app/routes/api.generate.config-schema.tsx` (server-only schema lookup, keeps `recipe-json-schema.server.ts` off the client bundle per the binding build rule)
- Create: `apps/web/app/__tests__/generate-config-schema.route.test.ts`

**Interfaces:**
- `GET /api/generate/config-schema?type=<moduleType>` → `{ jsonSchema: JsonSchemaObject | null }` — thin wrapper around `getRecipeJsonSchemaForType`, extracting just the `config`/`style` sub-schema so the client never imports the `.server.ts` module directly (binding build rule).

- [ ] **Step 1: Failing test for the schema-lookup route:**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('~/services/ai/recipe-json-schema.server', () => ({
  getRecipeJsonSchemaForType: vi.fn((type: string) =>
    type === 'theme.section'
      ? { type: 'object', properties: { config: { type: 'object', properties: { label: { type: 'string' } } }, style: { type: 'object', properties: {} } } }
      : undefined,
  ),
}));

describe('api.generate.config-schema (WS-F: kills hard-coded buy-bar fields)', () => {
  it('returns the config+style sub-schema for a known type', async () => {
    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema?type=theme.section') });
    const payload = await res.json();
    expect(payload.jsonSchema.properties.label).toBeDefined();
  });

  it('returns null for an unknown type (caller falls back to a plain JSON textarea)', async () => {
    const { loader } = await import('~/routes/api.generate.config-schema');
    const res = await loader({ request: new Request('https://app.test/api/generate/config-schema?type=nonsense') });
    const payload = await res.json();
    expect(payload.jsonSchema).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement:**

```ts
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getRecipeJsonSchemaForType } from '~/services/ai/recipe-json-schema.server';
import type { ModuleType } from '@superapp/core';

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  const type = new URL(request.url).searchParams.get('type');
  if (!type) return json({ error: 'Missing type' }, { status: 400 });
  const full = getRecipeJsonSchemaForType(type as ModuleType);
  const configProp = (full?.properties as Record<string, unknown> | undefined)?.config;
  const styleProp = (full?.properties as Record<string, unknown> | undefined)?.style;
  if (!configProp) return json({ jsonSchema: null });
  const merged = {
    type: 'object',
    properties: { ...(configProp as { properties?: object }).properties, ...(styleProp ? { style: styleProp } : {}) },
  };
  return json({ jsonSchema: merged });
}
```

- [ ] **Step 4: Run** (PASS).

- [ ] **Step 5: Replace the hard-coded storefront settings path in `generate._index.tsx`.** Delete: `BASE_SETTINGS` (`:253-258`), `CONCEPT_PRESETS`'s hard-coded field overrides (keep the 3 concept **names**/ids used elsewhere for concept selection, drop the settings payload), `settingsMap`/`set()` (`:433`, `:452-453`), `GenControls` (`:1363-1431`), `mergeSettingsIntoRecipe`/`settingsFromRecipe` (`:324-351`/`:354-370`). Replace with: fetch `` `/api/generate/config-schema?type=${recipe.type}` `` once a concept is selected (`useEffect` keyed on `selected`), store the result, and mount `SchemaForm` with `value={recipe.config}` `onChange={(next) => updateSelectedRecipe(r => ({ ...r, config: next }))}` wherever `GenControls`/`GenConfigControls` used to render — this also **subsumes** `GenConfigControls` (`:1299-1361`), which is deleted in the same change so there is exactly one settings-editing code path for every module type, not two.

- [ ] **Step 6: Run** `pnpm build` (this is the real gate for Step 5 — JSX-only refactor, no new unit-testable logic beyond the schema-lookup route already covered in Step 1-4) + a manual check via the Claude Browser tool: load `/generate`, generate a `theme.section` concept, confirm the settings panel renders fields sourced from the schema (not the old fixed buy-bar fields) and edits round-trip into the recipe passed to `/api/preview`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/routes/api.generate.config-schema.tsx apps/web/app/routes/generate._index.tsx apps/web/app/__tests__/generate-config-schema.route.test.ts
git commit -m "fix(merchant): Builder settings panel is schema-driven for every module type (kills hard-coded buy-bar fields)"
```

---

### Task 9: Real progress bound to stream stages

**Files:**
- Modify: `apps/web/app/utils/generation-outcome.ts`
- Modify: `apps/web/app/__tests__/generation-outcome.test.ts`
- Modify: `apps/web/app/routes/generate._index.tsx`

**Interfaces:**

```ts
export type StreamEventKind = 'option' | 'ranking' | 'blueprint' | 'score' | 'option_updated' | 'error' | 'done';
/** Pure, order-independent-safe: given the set of distinct event kinds seen so
 *  far in a stream, returns which GEN_STEPS index is "current." Replaces the
 *  fake setInterval tick — every input here is a REAL SSE frame the route
 *  already parses. */
export function stepIndexForSeenEvents(seen: ReadonlySet<StreamEventKind>, totalSteps: number): number;
```

- [ ] **Step 1: Failing test** (append to `generation-outcome.test.ts`):

```ts
describe('stepIndexForSeenEvents (WS-F: real progress, was a fake setInterval)', () => {
  it('no events yet → step 0 (fetch in flight)', () => {
    expect(stepIndexForSeenEvents(new Set(), 5)).toBe(0);
  });
  it('first option arrives → advances past "understanding the request"', () => {
    expect(stepIndexForSeenEvents(new Set(['option']), 5)).toBe(2);
  });
  it('ranking arrives → validating/ranking step', () => {
    expect(stepIndexForSeenEvents(new Set(['option', 'ranking']), 5)).toBe(3);
  });
  it('stream done → complete', () => {
    expect(stepIndexForSeenEvents(new Set(['option', 'ranking', 'done']), 5)).toBe(5);
  });
  it('never regresses below a previously-reached step for a lesser event mix', () => {
    // e.g. a late 'score' event alone shouldn't rewind an already-advanced UI;
    // caller is responsible for tracking the max seen, this function is a pure
    // ceiling function over the *seen set*, so assert monotonic inputs behave.
    const a = stepIndexForSeenEvents(new Set(['option', 'ranking']), 5);
    const b = stepIndexForSeenEvents(new Set(['option', 'ranking', 'score']), 5);
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
```

- [ ] **Step 2: Run** — FAIL (not exported).

- [ ] **Step 3: Implement** in `generation-outcome.ts`:

```ts
export type StreamEventKind = 'option' | 'ranking' | 'blueprint' | 'score' | 'option_updated' | 'error' | 'done';

const STEP_ORDER: Array<{ kind: StreamEventKind; minStep: number }> = [
  { kind: 'option', minStep: 2 },
  { kind: 'ranking', minStep: 3 },
  { kind: 'score', minStep: 4 },
  { kind: 'option_updated', minStep: 4 },
  { kind: 'done', minStep: Number.MAX_SAFE_INTEGER }, // clamped to totalSteps below
];

/** Real-event-driven replacement for the old setInterval progress tick. */
export function stepIndexForSeenEvents(seen: ReadonlySet<StreamEventKind>, totalSteps: number): number {
  let step = 0;
  for (const { kind, minStep } of STEP_ORDER) {
    if (seen.has(kind)) step = Math.max(step, minStep);
  }
  return Math.min(step, totalSteps);
}
```

- [ ] **Step 4: Run** (PASS).

- [ ] **Step 5: Wire into `generate._index.tsx`.** Delete the fake-progress `useEffect` (`:660-666`). In `streamGenerate`, track `const seenEvents = new Set<StreamEventKind>();` alongside `collected`; add `seenEvents.add(ev as StreamEventKind)` inside the existing per-frame `if (payload)` block (right after the `ev` is parsed, `:578-583`), and call `setStepIdx(stepIndexForSeenEvents(seenEvents, GEN_STEPS.length))` after each mutation. Add `seenEvents.add('done')` right before the `for (;;)` loop's `if (done) break;` exits normally. Import `stepIndexForSeenEvents` and `type StreamEventKind` from `~/utils/generation-outcome`.

- [ ] **Step 6: Run** `npx vitest run app/__tests__/generation-outcome.test.ts` + `pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/utils/generation-outcome.ts apps/web/app/__tests__/generation-outcome.test.ts apps/web/app/routes/generate._index.tsx
git commit -m "fix(merchant): Builder progress bar is driven by real SSE stream events, not a fake timer"
```

---

### Task 10: AbortController for the generation stream

**Files:**
- Modify: `apps/web/app/utils/generation-outcome.ts`
- Modify: `apps/web/app/__tests__/generation-outcome.test.ts`
- Modify: `apps/web/app/routes/generate._index.tsx`

**Interfaces:**
- `nextStepAfterStream`'s input gains an `aborted: boolean` field; when `true`, the function must return a value distinct from `'batch-fallback'` (an intentional cancel must never trigger the batch-route billing retry).

- [ ] **Step 1: Failing test** (append to `generation-outcome.test.ts`):

```ts
describe('nextStepAfterStream — abort handling (WS-F: Cancel must not bill)', () => {
  it('an intentional abort never triggers batch-fallback, even with zero options collected', () => {
    const result = nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: true, aborted: true });
    expect(result).not.toBe('batch-fallback');
  });
  it('a non-aborted transport failure still falls back to batch (unchanged behavior)', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: true, aborted: false })).toBe('batch-fallback');
  });
});
```

- [ ] **Step 2: Run** — FAIL (TS error: `aborted` not in the input type, or behavior wrong if loosely typed — either way, red).

- [ ] **Step 3: Extend the type + logic** in `generation-outcome.ts`:

```ts
export interface StreamOutcomeInput {
  gotAny: boolean;
  sawErrorFrame: boolean;
  transportFailed: boolean;
  /** True when the fetch was aborted by the merchant clicking Cancel — an
   *  intentional cancel is never a transport failure to recover from, and
   *  must never trigger the batch-fallback (which would bill a second
   *  request the merchant already told us to stop). */
  aborted?: boolean;
}

export function nextStepAfterStream(o: StreamOutcomeInput): StreamNextStep {
  if (o.aborted) return 'cancelled';
  // ...existing logic unchanged...
}
```

Add `'cancelled'` to `StreamNextStep`'s union type.

- [ ] **Step 4: Run** (PASS).

- [ ] **Step 5: Wire `AbortController` into `generate._index.tsx`.** Add `const abortRef = useRef<AbortController | null>(null);` near the other refs. In `streamGenerate`, create `const controller = new AbortController(); abortRef.current = controller;` before the `fetch` call and pass `signal: controller.signal`. In the `catch` block, detect abort and pass it through:

```ts
} catch (err) {
  const aborted = err instanceof DOMException && err.name === 'AbortError';
  const next = nextStepAfterStream({ gotAny, sawErrorFrame: false, transportFailed: !aborted, aborted });
  if (next === 'batch-fallback') {
    proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
  }
  // 'cancelled': do nothing — the merchant asked to stop, no fallback, no toast.
}
```

Change `GenLoading`'s `onCancel` wiring (`:856`) from `() => navigate('/')` to `() => { abortRef.current?.abort(); navigate('/'); }`. Add a cleanup effect: `useEffect(() => () => abortRef.current?.abort(), []);` so navigating away by any route (not just the Cancel button) also aborts the in-flight request.

- [ ] **Step 6: Run** the full `generation-outcome.test.ts` + `pnpm build`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/utils/generation-outcome.ts apps/web/app/__tests__/generation-outcome.test.ts apps/web/app/routes/generate._index.tsx
git commit -m "fix(merchant): Cancel actually aborts the generation request instead of just navigating away"
```

---

### Task 11: Captures wired into module detail (D7)

**Files:**
- Modify: `apps/web/app/routes/modules.$moduleId.tsx` (loader + component)

**Interfaces:**
- Loader gains `captureCount: number` in its returned `json({...})`.

- [ ] **Step 1: Loader test** — extend/create the module-detail loader test with a case asserting `captureCount` is computed via `prisma.dataCapture.count({ where: { moduleId, shopId } })` and returned.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Add the count query** to the loader (cheap, one indexed count — `@@index([moduleId])` already exists on `DataCapture` per `schema.prisma:773-793`):

```ts
const captureCount = await prisma.dataCapture.count({ where: { moduleId, shopId: shopRow.id } });
```

Add `captureCount` to the loader's `json({...})`.

- [ ] **Step 4: Add the sidebar section** — in the Overview tab's sidebar stack (worktree lines ~870-894, after "Placement"):

```tsx
<s-section heading="Data captures">
  <s-stack gap="small-100">
    <KV k="Captured entries" v={String(data.captureCount)} />
    {data.captureCount > 0 ? (
      <s-button variant="tertiary" href={`/modules/${moduleId}/captures`}>View captures →</s-button>
    ) : (
      <s-text color="subdued">No captures yet.</s-text>
    )}
  </s-stack>
</s-section>
```

- [ ] **Step 5: Run** the loader test + `pnpm build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/routes/modules.\$moduleId.tsx apps/web/app/__tests__
git commit -m "feat(merchant): module detail links to its data captures with a count (D7 — restores link dropped in d182fdc)"
```

---

### Task 12: Publish ceremony — confirm step + view-on-storefront

**Files:**
- Modify: `apps/web/app/routes/modules.$moduleId.tsx`

**Interfaces:** None new — reuses the existing `ConfirmModal` component (already used for Delete/Unpublish, worktree lines 768-781) and the existing `session.shop` domain.

- [ ] **Step 1: Add a confirm step before publish** — mirror the Delete/Unpublish pattern exactly: add `const [pubOpen, setPubOpen] = useState(false);`, change the Publish button's `onClick` (worktree line 671) from `publish` to `() => setPubOpen(true)`, and add:

```tsx
{pubOpen && (
  <ConfirmModal open heading={mod.status === 'PUBLISHED' ? 'Republish module?' : 'Publish module?'}
    confirmLabel="Publish" onConfirm={() => { setPubOpen(false); publish(); }} onCancel={() => setPubOpen(false)}>
    {isThemeModule
      ? `This deploys the module to "${themes.find((t) => String(t.id) === selectedThemeId)?.name ?? 'the selected theme'}".`
      : 'This makes the module live for merchants and customers.'}
  </ConfirmModal>
)}
```

- [ ] **Step 2: Add "View on storefront" after a successful publish.** In the effect that handles `publishFetcher.data` (worktree lines 462-484), on success (`data.ok` and no `code === 'PUBLISH_PARTIAL_FAILURE'`) for theme-type modules, surface a link. Since the module's live URL depends on theme placement (not always resolvable to one page), scope this to what's honestly knowable: the storefront root, `` `https://${data.shop}/` `` (the shop's primary domain — always a real, safe target for any theme-type module; do not attempt to deep-link to a specific page/section, which the app cannot resolve without additional placement metadata this plan doesn't add). Render as a banner action alongside the existing embed-activation banner (worktree lines 745-755), only for `spec?.type?.startsWith('theme.')`:

```tsx
{publishSucceeded && isThemeModule && (
  <s-banner tone="success" heading="Published">
    <s-button slot="action" variant="tertiary" icon="external" href={`https://${data.shop}/`} target="_blank">
      View storefront
    </s-button>
  </s-banner>
)}
```

(`publishSucceeded` — a small piece of state set alongside the existing `embedNudge` logic in the same effect, cleared on next publish attempt or tab change.)

- [ ] **Step 3: `pnpm build`** — this task is UI-affordance only (confirm modal + a static link), consistent with WS-E's precedent of not unit-testing this class of change (WS-E Task 10 Step 4). Manually verify via the Claude Browser tool: publish a theme module on a dev store, confirm the modal appears, confirm the "View storefront" link appears post-success and opens the shop domain.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/routes/modules.\$moduleId.tsx
git commit -m "feat(merchant): publish ceremony — confirm before publish, view-on-storefront link after success"
```

---

### Task 13: `ErrorBoundary` export for `/generate`

**Files:**
- Modify: `apps/web/app/routes/generate._index.tsx`

**Interfaces:** `export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';` — same one-liner `modules.$moduleId.tsx` already uses (worktree line 1042).

- [ ] **Step 1: Add the export** at the end of `generate._index.tsx`. No new logic — `MerchantErrorBoundary` is already generic (renders `<MerchantShell polaris>` + a recovery card, doesn't depend on any loader data from the throwing route).

- [ ] **Step 2: `pnpm build`.** No unit test — this is a direct reuse of an already-tested-by-precedent shared component; the meaningful verification is the build succeeding and (post-Task 14) a manual thrown-error check.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/routes/generate._index.tsx
git commit -m "fix(merchant): /generate gets a real ErrorBoundary instead of the browser crash screen"
```

---

### Task 14: Migrate `generate._index.tsx` to Polaris (kill the legacy `MerchantShell` branch)

The largest task in this plan — a systematic rewrite, not a rearchitecture. `SchemaForm`/progress/abort/buy-bar work (Tasks 8-10, 13) already landed first specifically so this migration touches settled code, not a moving target.

**Files:**
- Modify: `apps/web/app/routes/generate._index.tsx`

**Interfaces:** `<MerchantShell fullBleed>` → `<MerchantShell polaris fullBleed>` (both props already coexist on the component's type signature — `fullBleed` and `polaris` are independent booleans per `MerchantShell.tsx:45-53`).

- [ ] **Step 1: Inventory the vendored surface before touching anything** — `grep -c 'className=' apps/web/app/routes/generate._index.tsx` (re-derive the count; do not reuse the 202 figure from investigation without re-checking, per the no-stale-numbers rule) and list every distinct vendored class family in use (`gen-*`, `field`, `row`, `t-h2`, `btn btn-plain`, etc. — `grep -oE 'className="[^"]*"' generate._index.tsx | sort -u`).

- [ ] **Step 2: Replace the shell** — `<MerchantShell fullBleed>` → `<MerchantShell polaris fullBleed>` at line 401. This alone will break most of the vendored layout (the `polaris` branch renders `<SubnavTabs />` and expects `<s-page>`-rooted content, not `.gen-shell`-classed divs) — expected; Steps 3-6 fix it up section by section rather than in one pass.

- [ ] **Step 3: Replace structural chrome first** — the local `Field` component (worktree/master ~lines 380-397, whose own comment says it exists only because "the vendored Field import is gone; this reuses the legacy field classes that the fullBleed shell still styles") becomes a thin wrapper over `<s-text-field>`/`<s-select>`/etc. per field type, OR is deleted in favor of calling the Polaris elements directly at each call site (prefer deletion — matches DESIGN.md's "Polaris web component -> merchant/polaris.tsx helper -> new helper" order; a bespoke `Field` wrapper is not on that list). Wrap top-level page content in `<s-page heading="..." inlineSize="large">` / `<s-section>` per DESIGN.md's Polaris Implementation Rules.

- [ ] **Step 4: Work through each phase's markup** (idle/prompt entry, generating/`GenLoading`, chooser/candidate grid, editor/settings panel, confirm/save) replacing `className="gen-*"` divs with `<s-stack>`/`<s-grid>`/`<s-box>`/`<s-card>` equivalents and `btn`/`btn-plain` buttons with `<s-button variant="...">`. Use the ~100 already-present `<s-*>` element usages (verified at investigation time: `s-icon`×32, `s-select`×14, `s-banner`×9, `s-text-field`×8, `s-number-field`×6, `s-button`×6, `s-badge`×5) as the pattern to extend, not a pattern to preserve alongside vendored markup.

- [ ] **Step 5: Verify no vendored imports remain** — `grep -n "~/components/superapp\|className=\"gen-\|className=\"field\|className=\"btn " apps/web/app/routes/generate._index.tsx` returns nothing.

- [ ] **Step 6: `pnpm build` + `pnpm lint`.** Then manual verification via the Claude Browser tool (no component-test precedent exists for this class of change, per Global Constraints): open `/generate`, run through prompt → generating → chooser → settings → save, at both desktop and 375px width (this also partially previews Task 16's mobile-pass scope — note any grid overflow found here for that task rather than fixing it now, to keep this task's diff reviewable).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/routes/generate._index.tsx
git commit -m "refactor(merchant): /generate renders through Polaris web components (kills the last legacy MerchantShell branch)"
```

---

### Task 15: Delete the legacy `MerchantShell` branch + relocate vendored CSS

**Files:**
- Modify: `apps/web/app/components/merchant/MerchantShell.tsx`
- Delete: `apps/web/app/components/superapp/MerchantSubnav.tsx`
- Modify: `apps/web/app/root.tsx`
- Modify: `apps/web/app/routes/internal.tsx`
- Delete: `apps/web/app/styles/superapp/generate.css`

**Interfaces:** `MerchantShell`'s `polaris?: boolean` prop is removed (the component only has one rendering path now); existing call sites that already pass `polaris` simply drop the prop (no-op removal, since it was already always `true` at every remaining call site after Task 14).

- [ ] **Step 1: Confirm nothing else calls the legacy branch** — `grep -rn "<MerchantShell" apps/web/app/routes/*.tsx | grep -v polaris` returns zero results (must be true after Task 14; this is the gate for this task, re-verify before proceeding rather than trusting Task 14's own verification).

- [ ] **Step 2: Delete the legacy branch** in `MerchantShell.tsx` — remove the `polaris ? (...) : (<><MerchantSubnav />...</>)` ternary (worktree/master lines ~107-159), keep only the `polaris` branch's content unconditionally, remove the `polaris` prop from the type signature and all call sites (`grep -rl "polaris" apps/web/app/routes/*.tsx` and strip the now-redundant prop — safe no-op since it's always `true`).

- [ ] **Step 3: Delete `MerchantSubnav.tsx`** and remove its import from `MerchantShell.tsx` and `root.tsx` (the comment at `root.tsx:159` referencing it).

- [ ] **Step 4: CSS — delete vs relocate** (Decision F5). Delete `apps/web/app/styles/superapp/generate.css` and its import in `root.tsx`. For `polaris.css`/`shell.css`/`pages.css`: move the three `import saXCss from './styles/superapp/X.css?url'` + their `links()` entries from `root.tsx` to `internal.tsx`'s `links()` export (internal admin is the only remaining consumer — re-verify with `grep -rl "className=\"page\|className=\"grid-\|className=\"m-content\"" apps/web/app/routes/*.tsx` and confirm every hit is `internal.*.tsx` before moving).

- [ ] **Step 5: `pnpm build`.** Then a manual smoke check on one internal-admin page (`/internal`) and one merchant page (`/modules`) to confirm styling didn't regress from the CSS relocation.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/components/merchant/MerchantShell.tsx apps/web/app/root.tsx apps/web/app/routes/internal.tsx
git rm apps/web/app/components/superapp/MerchantSubnav.tsx apps/web/app/styles/superapp/generate.css
git commit -m "chore(merchant): delete the legacy MerchantShell branch + MerchantSubnav; relocate shared vendored CSS to the internal layout"
```

---

### Task 16: Mobile responsive pass (`s-grid`, 375px)

**Files:**
- Modify: `apps/web/app/styles/merchant.css`
- Modify: `apps/web/app/routes/modules._index.tsx`, `apps/web/app/routes/modules.$moduleId.tsx`, `apps/web/app/routes/generate._index.tsx`, `apps/web/app/routes/_index.tsx` (as the audit in Step 1 finds necessary — this list is the known-fixed-column offenders found at investigation time; re-derive, don't assume it's exhaustive)

**Interfaces:** None new — CSS + prop-level fixes only.

- [ ] **Step 1: Audit** — `grep -rn 'gridTemplateColumns="repeat(' apps/web/app/routes/*.tsx apps/web/app/components/merchant/*.tsx` to enumerate every fixed multi-column `<s-grid>` on a merchant surface (known from investigation: `modules._index.tsx:126,148,316,397,401,425` uses 1-, 2-, and 3-column fixed grids). Before writing any fix, consult the Shopify Polaris web-components documentation (via the `shopify-plugin:shopify-polaris-app-home` skill or `mcp__shopify-dev-mcp__search_docs_chunks`) for whether `<s-grid>` accepts a responsive/breakpoint-scoped `gridTemplateColumns` value natively — use that native mechanism if it exists rather than hand-rolling `@media` CSS against `s-grid`'s shadow DOM (which may not be overridable the same way as a plain `div`).

- [ ] **Step 2: Fix each offender** — for grids that must collapse to 1 column under ~480px (any grid inside a card/list row, e.g. `modules._index.tsx:397` `repeat(3, 1fr)` product-style stat row), either use the native responsive API found in Step 1, or fall back to a `merchant.css` rule scoped by a wrapper class, e.g.:

```css
@media (max-width: 480px) {
  .sa-m-responsive-grid-3 { grid-template-columns: 1fr !important; }
  .sa-m-responsive-grid-2 { grid-template-columns: 1fr !important; }
}
```

applied by adding the matching class alongside each fixed `gridTemplateColumns` prop (`<s-grid className="sa-m-responsive-grid-3" gridTemplateColumns="repeat(3, 1fr)" ...>`).

- [ ] **Step 3: Verify at 375px** using the Claude Browser tool's `resize_window` (`preset: "mobile"`, 375×812) on each touched route (`/modules`, `/modules/:id`, `/generate`, `/`) — confirm no horizontal overflow/clipping and every touch target stays ≥ readable size. This is inherently a visual check (no unit-test precedent covers CSS layout), matching WS-E's live-probe pattern for non-unit-testable surfaces (WS-E Task 17).

- [ ] **Step 4: `pnpm build` + `pnpm lint`.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/styles/merchant.css apps/web/app/routes
git commit -m "fix(merchant): responsive s-grid pass across Modules/Module-detail/Generate/Dashboard at 375px"
```

---

### Task 17: Generate-flow server-persisted drafts — **BLOCKED-until: WS-C's job/draft-persistence interface**

This is the only task in this plan gated on another workstream. WS-C's plan does not exist yet (verified: no `docs/superpowers/plans/2026-08-24-ws-c*.md` at the time this plan was written). This task defines the **consumed interface** this plan needs so it can be dropped in the moment WS-C ships it, and gives the fallback if WS-C's shape differs.

**Files:**
- Create: `apps/web/app/services/generation/generation-job.interface.ts` (documents the consumed interface; not implemented here)
- Modify: `apps/web/app/routes/generate._index.tsx` (once unblocked)

**Consumed interface (from WS-C — names are this plan's proposal, reconcile against whatever WS-C actually ships):**

```ts
// apps/web/app/services/generation/generation-job.interface.ts
/**
 * WS-F Task 17 is BLOCKED-until WS-C ships an equivalent of this interface.
 * Do not implement server-side logic against this file — it exists to pin
 * the contract this plan was written against, so WS-F Task 17 can be
 * unblocked with a find-and-replace against WS-C's actual exports rather
 * than a redesign.
 */
export interface GenerationJobService {
  /** Enqueue a generation request; returns immediately with a job id the
   *  client polls. Replaces today's synchronous `/api/ai/create-module/stream`
   *  fetch-and-hold-the-connection-open model. */
  enqueue(input: { shopId: string; prompt: string; correlationId: string }): Promise<{ jobId: string }>;
}

export type GenerationJobStatus =
  | { status: 'queued' | 'running' }
  | { status: 'succeeded'; options: Array<{ index: number; explanation: string; recipe: Record<string, unknown> }> }
  | { status: 'failed'; code: string; message: string };

/** GET /api/jobs/:jobId/status — polled by the client. A dropped connection
 *  re-polls this endpoint (idempotent read) instead of re-submitting the
 *  generation (which would double-bill) — this is the behavior [UI-1]/[AI-4]
 *  actually need; today's SSE model can't survive a dropped connection
 *  without re-running the whole request. */
export interface GenerationJobStatusResponse extends GenerationJobStatus {
  jobId: string;
}
```

- [ ] **Step 1 (do now, unblocked): land the interface file above** as documentation/contract-pinning only — no logic. Commit it alone so the rest of this plan can ship without waiting on WS-C.

```bash
git add apps/web/app/services/generation/generation-job.interface.ts
git commit -m "docs(merchant): pin the WS-C generation-job interface this plan's draft-persistence task needs (BLOCKED-until WS-C ships it)"
```

- [ ] **Step 2 (BLOCKED-until WS-C lands its enqueue/status endpoints): replace `generate._index.tsx`'s `streamGenerate`** with: submit to WS-C's enqueue endpoint, receive `{ jobId }`, poll `GET /api/jobs/:jobId/status` on an interval (or subscribe if WS-C ships SSE/websocket instead of polling — reconcile against whatever it actually ships), and **persist the returned `jobId` to `sessionStorage`** (not `localStorage` — session-scoped is enough and avoids stale cross-tab job ids) immediately after enqueue succeeds, before any options arrive. On mount, if a `jobId` exists in `sessionStorage` and its status is still `queued`/`running`, resume polling it instead of starting a new generation — this is the actual "server-persisted draft, survives a refresh" behavior [UI-1] asks for.

- [ ] **Step 3 (BLOCKED): route-level test** for the poll-resume logic, once the real endpoint shape is known — write it against WS-C's actual `GET /api/jobs/:jobId/status` route using the shared route-test harness pattern (mock the job-status lookup, assert the client's resume decision).

- [ ] **Step 4 (BLOCKED): `pnpm build` + manual verification** — start a generation, refresh the page mid-generation, confirm it resumes rather than restarting (and does not re-bill — assert via `AiUsage` row count before/after in a manual DB check on a dev store).

- [ ] **Step 5 (BLOCKED): Commit** — `git commit -m "feat(merchant): Builder drafts survive a refresh via WS-C's server-persisted generation jobs"`.

---

## Execution order & shippability

Each task ships independently and green: **1 → 2 → 3 → 4 → 5** (five unrelated fixes, any order, all mergeable same-day) → **6 → 7** (loader plumbing, then the form that consumes it) → **8 → 9 → 10** (Builder settings, then progress, then abort — same file, this order minimizes rebase churn) → **11 → 12** (both touch `modules.$moduleId.tsx`'s Overview/publish area, land after 6-7's Settings-tab work to avoid the same-file conflict) → **13 → 14 → 15** (trivial ErrorBoundary, then the big Polaris migration, then deleting the branch it stops using — strictly sequential, 15 cannot start before 14's `grep` gate passes) → **16** (mobile pass runs against Task 14's post-migration markup, not the legacy markup it would otherwise have to redo) → **17** (Step 1 ships immediately; Steps 2-5 wait on WS-C, tracked separately, does not block this plan's Definition of Done for Tasks 1-16).

If WS-C is significantly delayed, Tasks 1-16 constitute a complete, shippable WS-F on their own — Task 17 is explicitly the one piece of the master plan's WS-F bullet ("generate-flow server-persisted drafts (rides WS-C jobs)") that cannot exist without WS-C, and this plan does not fake around that dependency.

## Out of scope (tracked elsewhere)

- `/jobs` nav restoration (`INSIGHTS_TABS`/`INSIGHTS_PATHS`/command-palette entry) and the master plan's D7 DELETE list (`/picker`, `/advanced`, `/api-usage`, `/logs`, `api.module-captures.tsx`) — WS-I (Phase 5), per Decision F4. This plan does fix the AI-cost leak that happens to live on `/jobs` (Task 1) because that's a genuine merchant-facing data leak independent of the route's reachability.
- Dashboard quick-action CTAs — investigated, does not reproduce (Decision F1). No action.
- `packages/platform-contracts/src/module-settings.ts`'s array-shaped `AdminFormSchema` (`fill-missing`/`regenerate` actions) — a different, not-currently-live contract from the record-shaped `uiSchema` this plan's SchemaForm-mount tasks actually consume (see Verified ground truth). Out of scope; note left for whichever workstream picks up specs/024's remaining fill-missing/regenerate UI work.
- WS-C's actual job/queue implementation, BullMQ worker, and the `GET /api/jobs/:jobId/status` route itself — WS-C. Task 17 only consumes it.
- Full end-to-end deadline budgeting, provider concurrency caps, funnel metrics — WS-C.
- Ops alerting on `jobs.fail`, DLQ replay — WS-G.
- `MerchantSubnav`/`INSIGHTS_TABS` duplication between `apps/web/app/components/merchant/polaris.tsx` and the (now-deleted, Task 15) `apps/web/app/components/superapp/MerchantSubnav.tsx` — resolved by Task 15 deleting the duplicate outright rather than a broader dedupe pass; no further action needed here.
- App Store submission checklist, GDPR completeness — WS-S.

## Self-Review (performed while writing)

1. **Spec coverage** against the master plan's WS-F bullet: server-persisted drafts (Task 17, correctly gated) ✓; type-aware controls / SchemaForm mount / kill buy-bar (Tasks 7, 8) ✓; "Generate full settings" wired-or-removed (Task 6 — closed as already-wired with evidence, per Decision F6) ✓; broken CTAs template-detail/dashboard/workflow-install (Tasks 2, 3; dashboard closed as non-reproducing, Decision F1) ✓; Maya disclosure (Task 4) ✓; real progress + AbortController (Tasks 9, 10) ✓; publish ceremony (Task 12) ✓; error boundary + Polaris shell for `/generate`, kills legacy branch + CSS (Tasks 13, 14, 15) ✓; mobile pass (Task 16) ✓; captures wired (Task 11) ✓; AI-cost leakage removed (Task 1) ✓; preview endpoint auth (Task 5) ✓.
2. **Placeholder scan:** every task's code is real, derived from files actually read at investigation time — no "TODO: figure out the real endpoint" gaps. The one legitimately open design choice (Task 12's "view on storefront" target, which can't deep-link to a specific placement without new metadata) is resolved explicitly in-task (shop root domain) rather than left vague.
3. **Type/interface consistency:** `SchemaForm`'s actual prop shape (`Record<string, SectionUiHints>`) is checked against what hydrate actually persists (also a loose record, per `hydrate-envelope.server.ts`) rather than assumed compatible with the unrelated array-shaped `AdminFormSchema` contract — this discrepancy is called out explicitly (Verified ground truth + Out of scope) rather than silently glossed over. `mintPreviewToken`/`verifyPreviewToken`, `stepIndexForSeenEvents`, `nextStepAfterStream`'s new `aborted` field, and `POST /api/modules/:moduleId/update-config`'s response shape are each used identically everywhere they appear across tasks.
4. **File-ownership check against sibling plans:** WS-E's Unpublish/embed/partial-failure additions to `modules.$moduleId.tsx` are read from the WS-E worktree (not master) and every line reference in this plan cites that worktree; WS-QF's `enforcePublishCap` addition to the same file's duplicate branch and its `modules._index.tsx` unmount-commit change are both named explicitly as "already landing elsewhere, do not redo" rather than silently colliding.
5. **No task invents a backend that doesn't need to exist:** Task 17 is the only place this plan proposes new server infrastructure it doesn't implement, and it's explicit that this is intentional (BLOCKED-until) rather than a plan gap.
