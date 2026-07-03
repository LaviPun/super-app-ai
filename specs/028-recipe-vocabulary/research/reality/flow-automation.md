# Reality Audit — Flow Automation Engine

**Subsystem:** Flow automation engine (WorkflowEngineService DAG vs live FlowRunnerService linear path)
**Doc under audit:** `docs/flow-automation.md`
**Re-audit date:** 2026-07-03 · **Branch:** feat/027-unified-builder · **HEAD:** 4f056da (prior audit: feat/superapp-redesign @ a948f1c)
**Method:** Re-traced the live path (webhook route → runner; cron → runner) at current HEAD and re-searched for callers of every "reliability" primitive. Distinguished "a file/type exists" from "runs on the default path."

---

## Re-audit delta (2026-07-03, HEAD 4f056da)

The subsystem is **materially unchanged** since a948f1c. The only relevant change is a **webhook route consolidation** (the two DELETED files were re-homed into the single `webhooks.tsx`, not removed as functionality). No commit in the 50c67ac…4f056da range touches the DAG engine, cron, DLQ, rate-limit, or the topic dispatcher; the shipped work is builder/generate/preview/`admin.discountUi`, none of which is a flow-automation caller.

| # | Prior finding | Status | Current file:line evidence |
|---|---|---|---|
| 1 | `WorkflowEngineService` (DAG) is built+tested but has **zero production callers** | **STILL-OPEN** | Only tests import it (`workflow-safety.test.ts:35/58`, `workflow-durable-wait.test.ts:82/100/115/124/137`, `workflow-engine.test.ts:52`) + 2 doc-comments (`shopify-flow-bridge.ts:13`, `flow-compile.ts:9`). No route references it (`apps/web/app/routes` grep = NONE). |
| 2 | Live path = legacy linear `FlowRunnerService` (real email/slack, cron, retry) | **STILL-OPEN (by design; already-executed)** | `webhooks.tsx:31-33` and `api.cron.tsx:70/86` both call `new FlowRunnerService().runForTrigger`. 9 live step kinds (see body §10). |
| 3 | `FLOW_ENGINE_V2` flag / compiler unification does not exist | **STILL-OPEN** | `grep FLOW_ENGINE_V2\|isFlowEngineV2\|flowEngineV2` across `*.ts/*.tsx/*.toml` = **0 hits**. `flowAutomationToWorkflow` still called only by `flow-compile.test.ts`. |
| 4 | `resumeDueWorkflowRuns` is a **comment, not a function**; cron has no resume sweep | **STILL-OPEN** | `resumeDueWorkflowRuns` appears exactly once, as a code comment: `workflow-engine.service.ts:426`. `api.cron.tsx` grep for `resume/WorkflowRun/DeadLetter/WAITING` = NONE. |
| 5 | `/webhooks` hardcodes 2 flow topics; no generic `topicToTrigger` dispatcher | **STILL-OPEN** | `webhooks.tsx:19` gates on `'orders/create' \|\| 'products/update'` only → `SHOPIFY_WEBHOOK_ORDER_CREATED` / `SHOPIFY_WEBHOOK_PRODUCT_UPDATED` (`:27-30`). No `topicToTrigger`/`shopify-webhook-topics` import anywhere in `apps/web` (grep = NONE). |
| 5b | `shopify.app.toml` subscribes only a fixed set (not "every granted topic") | **STILL-OPEN (unchanged)** | `shopify.app.toml:27-41` subscribes exactly `app/uninstalled`, `app/scopes_update`, `orders/create`, `products/update` (+ 3 GDPR compliance topics `:15-25`). **toml unchanged since a948f1c** (`git diff a948f1c HEAD -- shopify.app.toml` = empty). |
| 6 | `DeadLetterService.record`/replay has zero callers; `FlowDeadLetter` stays empty | **STILL-OPEN** | `grep DeadLetterService\|replayDeadLetters` excl. own file = **NONE**. `flow-runner.service.ts:132` still only a comment ("A separate cron or admin UI can pick up FAILED FLOW_RUN jobs"). |
| 7 | `recordAdminThrottle` has zero callers; `ShopApiRateLimit` stays empty | **STILL-OPEN** | `grep recordAdminThrottle` excl. own file = **NONE**. |
| 8 | Engine safety caps real but engine-only (off live path) | **STILL-OPEN (unchanged)** | Caps in `workflow-engine.service.ts` (tested by `workflow-safety.test.ts`); live path uses `MAX_STEP_RETRIES=2` (`flow-runner.service.ts:28`) / `MAX_CONDITION_DEPTH=3` (`:77`). |
| 9 | §9b "Waiting (parked)" tile is an overclaim — no such tile | **STILL-OPEN** | `flows._index.tsx` grep `parked/WAITING/waiting` = NONE; success loop only buckets `SUCCEEDED`/`FAILED`/`TIMED_OUT` (`:109-110`). |
| 10 | Live path reaches only a subset of connectors; `order.routeToLocation` + `datastore.query` engine-only | **STILL-OPEN (unchanged)** | 9 live step kinds; `routeToLocation`/`datastore.query` are **not** step kinds (`flow-runner.service.ts` grep = NONE). |

**NEW / CHANGED findings this pass:**

- **N1 — Webhook route CONSOLIDATION (CHANGED, not a regression).** The two deleted files `webhooks.app.scopes_update.tsx` and `webhooks.app.uninstalled.tsx` were **not removed as behavior** — their handlers were **inlined into the single `webhooks.tsx` action**: `app/uninstalled` at `webhooks.tsx:53-82` (session delete, subscription CANCEL, metaobject-cleanup job enqueue, activity log), `app/scopes_update` at `:84-100` (activity log). The toml already routed both topics to `uri = "/webhooks"` (`shopify.app.toml:28-33`), so routing is intact. **Net effect on the DAG-engine question: none** — this is a lifecycle/plumbing refactor into the same linear-runner route; it does **not** move any topic onto `topicToTrigger` or the engine. The `/webhooks` route is still a hand-written switch over 4 topics, exactly as before.
- **N2 — `flow-runner.service.ts` (+7/-2) is unrelated to the engine.** The diff adds (a) a **paused-flow guard** in `runFlowById` — `if (flow.status !== 'PUBLISHED') throw` (`flow-runner.service.ts:154`), aligning targeted runs with `runForTrigger`'s PUBLISHED-only fan-out; and (b) a Slack `step.webhookUrl` field taking precedence over `step.url`/`SLACK_WEBHOOK_URL` (`:47`, `:325`). **Nothing wires toward the DAG engine.**
- **N3 — No new DAG wiring anywhere.** The shipped commits (streaming preview, config-driven settings, real-module preview render, `admin.discountUi` target, 026 preflight in validation tab) are builder/generate-surface changes. `apps/web/app/routes` grep for `WorkflowEngineService\|flowAutomationToWorkflow\|startRun` = **NONE**. The engine gained no caller.

---

## Claim-by-claim (current state, HEAD 4f056da)

### 1. `WorkflowEngineService` (DAG engine) is the canonical/live engine
- **Claim:** Doc §1/§8 — "make the DAG engine canonical"; §8 self-corrects to "BUILT & TESTED (engine level)" but legacy runner is "the **only** engine on the live path." (`docs/flow-automation.md:13-26`, `139-143`)
- **Reality:** `WorkflowEngineService` (`apps/web/app/services/workflows/workflow-engine.service.ts:62`) imported/instantiated **only** by tests + named in two doc-comments. **Zero production callers** at HEAD.
- **wired = built-not-wired** · **verdict = partial** · **action = wire-up vs prune (still open)**

### 2. Live path = legacy linear `{trigger, steps[]}` runner
- **Claim:** §8 — legacy runner is the only live engine (`docs/flow-automation.md:140`).
- **Reality:** **Confirmed.** `FlowRunnerService.runForTrigger` (`flow-runner.service.ts:88`) iterates published `flow.automation` modules, runs steps **linearly** with per-step retry (`MAX_STEP_RETRIES=2` `:28`, backoff) + `CONDITION` branch (`MAX_CONDITION_DEPTH=3` `:77`). `runFlowById` at `:144` now paused-flow-guarded (`:154`). Live callers: `webhooks.tsx:33` and `api.cron.tsx:86` (`SCHEDULED` via `ScheduleService.claimDue()` `:72`).
- **wired = live** · **verdict = already-executed** · **action = keep**

### 3. `FLOW_ENGINE_V2` flag / compiler unification (`flowAutomationToWorkflow`)
- **Claim:** §9 (labeled "DESIGN, NOT YET IMPLEMENTED") — compiler + flag would delegate the live runner to the engine (`docs/flow-automation.md:151-163`).
- **Reality:** **Confirmed absent.** `FLOW_ENGINE_V2`/`isFlowEngineV2`/`flowEngineV2` = **0 hits**. `flowAutomationToWorkflow` (`flow-compile.ts`) called only from `flow-compile.test.ts`. `FlowRunnerService` never references `WorkflowEngineService`.
- **wired = built-not-wired (compiler) / absent (flag)** · **verdict = partial** · **action = wire-up or prune**

### 4. Durable-wait park + `resumeDueWorkflowRuns` cron sweep
- **Claim:** §8 — durable-wait park BUILT & TESTED; "Not yet wired: `api.cron.tsx` does not call a `resumeDueWorkflowRuns` sweep" (`docs/flow-automation.md:141`, `148`).
- **Reality:** **Confirmed.** Park + `resumeRun` exist (engine); `resumeRun` called only in `workflow-durable-wait.test.ts`. `resumeDueWorkflowRuns` is **not a function** — single occurrence is a comment at `workflow-engine.service.ts:426`. `api.cron.tsx` has no resume sweep. Engine-parked waits **never auto-resume in production**.
- **wired = built-not-wired (park) / absent (`resumeDueWorkflowRuns`)** · **verdict = partial** · **action = wire-up or document-honestly**

### 5. Generic `/webhooks` dispatcher via `topicToTrigger` + full topic catalog (§9a)
- **Claim:** §9a — `/webhooks` is a "generic dispatcher"; toml "subscribes every topic whose scope is granted"; single source `shopify-webhook-topics.ts` (`docs/flow-automation.md:165-186`). §8 note contradicts: two hardcoded topics (`:141`).
- **Reality:** §8 note wins. `webhooks.tsx:19-33` hardcodes `orders/create`/`products/update` → 2 triggers; `app/uninstalled` (`:53`) and `app/scopes_update` (`:84`) handled inline as lifecycle (NEW: consolidated from the two deleted route files). No `topicToTrigger`/`shopify-webhook-topics` import in `apps/web`. `shopify.app.toml:15-41` subscribes only 4 flow/lifecycle topics + 3 GDPR compliance — **not** "every granted topic." (`topicToTrigger` in `packages/core` exercised only by core tests + the separate `apps/workers/src/webhook-flow.ts`, which is not the live Remix path.)
- **wired = stub (catalog exists, live route ignores it)** · **verdict = partial** · **action = document-honestly (reconcile §9a with §8)**

### 6. Dead-letter queue (`DeadLetterService` / `FlowDeadLetter`) (§9c)
- **Claim:** §9c — failed runs dead-lettered; cron `replayDeadLetters` replays via `runFlowById` (`docs/flow-automation.md:207-211`). §8: zero callers (`:141`).
- **Reality:** §8 wins. `DeadLetterService` has full methods but **no production caller** (grep excl. own file = NONE). `flow-runner.service.ts:132` catch leaves only a comment. No `replayDeadLetters` function. `FlowDeadLetter` stays empty.
- **wired = built-not-wired** · **verdict = not-required (as built)** · **action = wire-up or prune**

### 7. Shopify rate-limit tracking (`recordAdminThrottle` / `ShopApiRateLimit`) (§9c)
- **Claim:** §9c — every Admin call records `throttleStatus` into `ShopApiRateLimit` (`docs/flow-automation.md:200-206`). §8: zero callers (`:141`).
- **Reality:** §8 wins. `recordAdminThrottle` has **zero callers** (grep excl. own file = NONE). Connector never calls it. `ShopApiRateLimit` never written. (`metaobject.service.ts` still reads `throttleStatus` inline for its own backoff but does not persist.)
- **wired = built-not-wired** · **verdict = not-required (as built)** · **action = wire-up or prune**

### 8. Engine safety caps (`MAX_NODE_EXECUTIONS` / `MAX_RECURSION_DEPTH` / `MAX_RESUMES`) (§9c)
- **Claim/Reality:** Real in engine + `workflow-safety.test.ts`, but engine is off the live path; live path uses `MAX_STEP_RETRIES`/`MAX_CONDITION_DEPTH` (`flow-runner.service.ts:28`, `:77`).
- **wired = built-not-wired (engine-only)** · **verdict = not-required (for live path)** · **action = keep**

### 9. Admin surfacing — "Waiting (parked)" tile (§9b)
- **Claim:** §9b — Flows hub has a "Waiting (parked)" tile from `WorkflowRun` (`docs/flow-automation.md:192-194`).
- **Reality:** **Overclaim, false.** `flows._index.tsx` reads `WorkflowRun` and computes 7d counts + success rate (`:69`, `:104-116`) but has **no parked/waiting tile** (grep = NONE; buckets only `SUCCEEDED`/`FAILED`/`TIMED_OUT` `:109-110`). §8 note itself admits "no 'parked' tile" (`:141`), contradicting §9b.
- **wired = absent** · **verdict = not-required** · **action = document-honestly (delete §9b tile claim)**

### 10. Connectors / order routing / module I/O (§4–§6)
- **Claim:** Rich connector surface incl. `order.routeToLocation`, `superapp.datastore` I/O (`docs/flow-automation.md:72-124`).
- **Reality:** Engine resolves all connectors. Live `FlowRunnerService` step kinds (9): `HTTP_REQUEST`, `SEND_HTTP_REQUEST`, `TAG_ORDER`, `TAG_CUSTOMER`, `ADD_ORDER_NOTE`, `SEND_EMAIL_NOTIFICATION`, `SEND_SLACK_MESSAGE`, `WRITE_TO_STORE`, `CONDITION`. **`order.routeToLocation` and `datastore.query` are NOT live step kinds** (grep = NONE) — engine-only. Write-side module I/O (`WRITE_TO_STORE` `:359`) is live.
- **wired = live (subset) / built-not-wired (order routing, datastore.query)** · **verdict = partial** · **action = document-honestly / wire-up**

---

## Bottom line
Re-audit at HEAD 4f056da confirms the flow subsystem is **unchanged on the reliability axis**: the linear `FlowRunnerService` is still the sole live engine, the DAG `WorkflowEngineService` still has zero production callers, `FLOW_ENGINE_V2` is still 0 hits, `resumeDueWorkflowRuns` is still a comment not a function, `/webhooks` still hardcodes just `orders/create`+`products/update` (the two DELETED lifecycle route files were merely consolidated into `webhooks.tsx:53-100`, not wired to any dispatcher), and `DeadLetterService`/`recordAdminThrottle` still have zero callers — **0 of 10 prior findings fixed; all 10 remain open**, the only delta being a neutral webhook-route consolidation refactor.
