# Flow Automation

This is the authoritative description of the `flow.automation` module type: what
runs a merchant's flow today, what the graph-based `WorkflowEngineService`
actually does versus what it was designed to do, and where the two systems do
and don't connect. Every claim below cites the file (and, where useful, the
line) that backs it, current as of `master@c201150` (this branch's base) plus
this batch's own commits. If this doc and the code ever disagree, the code is
right — file an issue rather than trusting prose. **Last verified: 2026-08-27.**

There is no "industry-grade DAG engine" marketing claim in this doc anymore.
The DAG engine (`WorkflowEngineService`) is real, tested, and live-wired for
three specific things (§2); the full "compile every flow into the graph and
run it there" unification described in an earlier draft of this doc is still
just a design (§2's "Not implemented" list). Read §5 before trusting any
"(wired)"/"live" phrasing elsewhere in this file.

Source of truth:
- `apps/web/app/services/flows/flow-runner.service.ts` — `FlowRunnerService` (the live linear runner)
- `apps/web/app/services/flows/flow-compile.ts` — legacy step ↔ canonical node mapping
- `apps/web/app/services/flows/flow-park.ts` — DELAY-step durable-park compiler
- `apps/web/app/services/workflows/workflow-engine.service.ts` — `WorkflowEngineService` (the DAG engine)
- `apps/web/app/services/workflows/expression-evaluator.ts` — the expression language
- `apps/web/app/services/workflows/connectors/` — connector implementations
- `apps/web/app/routes/webhooks.tsx`, `apps/web/app/routes/api.cron.tsx` — live trigger dispatch
- `packages/core/src/flow-catalog.ts` — Shopify's own Flow reference catalog (§3)
- `packages/core/src/shopify-webhook-topics.ts` — SuperApp's webhook-topic↔trigger registry
- `apps/web/app/services/recipes/compiler/flow.automation.ts` — what publish writes

Related docs: `docs/generation.md` (RecipeSpec/compiler output contract, `flow.automation` deployability), `docs/publishing.md` (what a publish writes to Shopify).

---

## 1. What `flow.automation` does today (steps, triggers, visual builder)

A merchant authors a flow as `{ trigger, steps[] }` (`RecipeSpec` type
`flow.automation`) in the visual builder (`flows.build.$flowId.tsx`). Publishing
it writes the definition verbatim to a `superapp_flow` shop metafield
(`compileFlowAutomation`, `flow.automation.ts:43-60`) — a real, inspectable
deploy artifact, though the runner doesn't actually need the metafield to
execute; it reads the module's active-version `specJson` directly.

### Step kinds

`FlowRunnerService.executeStep` (`flow-runner.service.ts:355-489`) is a
hand-written `if (step.kind === ...)` chain that handles exactly these kinds
live: `CONDITION` (nested then/else branches, retried individually per nested
step, capped at `MAX_CONDITION_DEPTH`), `HTTP_REQUEST` (via `ConnectorService.test`),
`SEND_HTTP_REQUEST`, `TAG_ORDER`, `SEND_EMAIL_NOTIFICATION` (real send via the
email connector, throws loudly if `EMAIL_API_KEY` is unset), `SEND_SLACK_MESSAGE`,
`TAG_CUSTOMER`, `ADD_ORDER_NOTE`, `ROUTE_ORDER`, and `WRITE_TO_STORE` (writes a
record via `DataStoreService`, auto-enabling the target store if it isn't
yet). `DELAY` is handled one level up, before the retry wrapper (§2). **Any
other `step.kind` now throws `Unknown flow step kind: <kind>`**
(`flow-runner.service.ts:512`) instead of silently skipping — fixed by #20
(2026-08-27, commit `7d68b21`; see below).

**Fixed (#20, 2026-08-27): `ROUTE_ORDER` no longer silently no-ops.**
`FlowRunnerService.executeStep` previously had no `ROUTE_ORDER` branch, so it
fell through to a silent `{ skipped: true }` — a step that reported SUCCESS
on every run without ever routing an order, violating D8 (no silent
failures). `flow-runner.service.ts:495` now has a real `ROUTE_ORDER` branch:
it looks up the order's fulfillment orders then calls `fulfillmentOrderMove`,
using the same `admin.graphql` pattern the runner's sibling order steps
(`tagOrder`/`addOrderNote`) already use — genuinely executing, or throwing
loudly on misconfiguration/userErrors, instead of relying on the
`WorkflowEngineService`/`flow-compile.ts` machinery that was never reachable
from the live linear runner. **`ROUTE_ORDER` still isn't reachable through
any authoring path** — it's not in `FlowBuilder`'s step catalog or the
RecipeSpec Zod schema — so the fix closes the silent-success trap for
if/when it becomes authorable, rather than making it authorable today.

Each retryable step gets `MAX_STEP_RETRIES = 2` attempts with exponential
backoff (`STEP_BACKOFF_BASE_MS = 500`, `flow-runner.service.ts:31-32,325-353`);
`CONDITION` itself is not retried (its nested steps already are — retrying the
whole branch would re-run already-succeeded side effects).

### Triggers

The `Trigger` union (`flow-runner.service.ts:16-29`): `MANUAL`, `SCHEDULED`,
five `SHOPIFY_WEBHOOK_*` variants (order/product/customer/fulfillment/draft-order/collection
created/updated), and five `SUPERAPP_*` internal events (module published,
connector synced, data record created, workflow completed/failed — the last
two are emitted by `FlowRunnerService` itself after each run, best-effort, via
`emitFlowTriggerSafe`).

**Live webhook dispatch is a hand-written map, wider than before but still not
the shared registry.** `routes/webhooks.tsx`'s `TOPIC_TO_TRIGGER`
(`webhooks.tsx:27-37`) now covers six Shopify topics: `orders/create`,
`products/update`, `customers/create`, `collections/create`,
`fulfillments/create`, `draft_orders/create`. Of those, only the first four are
actually declared in `shopify.app.toml`'s `[[webhooks.subscriptions]]`
(`shopify.app.toml:73-103` plus 3 GDPR compliance topics) — `fulfillments/create`
and `draft_orders/create` are wired in code but **inert**: Shopify never
delivers them because neither the topic subscription nor its scope
(`read_fulfillments`/`read_draft_orders`) is declared. The route's own comment
says this plainly. `packages/core/src/shopify-webhook-topics.ts`'s
`topicToTrigger()` — the generic, full-catalog registry — still has **zero**
callers anywhere in `apps/web`; `/webhooks` continues to use its own smaller
hand-written map instead.

### Visual flow builder

`flows.build.$flowId.tsx`'s loader feeds `FlowBuilder` the full trigger catalog
from `shopify-webhook-topics.ts`, grouped by category, with live scope status
per topic (queries the shop's actual `webhookSubscriptions` via
`webhook-subscriptions.service.ts` and marks each `✓ (active)` / available /
`— needs scope X`; falls back to "unknown" (shows all) if the lookup
fails). It also exposes the Route-Order action and data-store linking
(`WRITE_TO_STORE` picks a real store key). The flows hub (`flows._index.tsx`)
now blends both legacy `FLOW_RUN` job stats and `WorkflowRun` stats into one
7-day run-count/success-rate figure (`flows._index.tsx:77-110`) — reflecting
that some runs now genuinely happen via `WorkflowRun` (§2) — but there is still
no "Waiting (parked)" tile; `WorkflowRun.status='WAITING'` rows aren't counted
toward either success or failure and aren't otherwise surfaced.

---

## 2. The graph-based Workflow Engine — actual wiring, honestly

### The model (`packages/core/src/workflow.ts`)

A `Workflow` is a typed DAG: a `trigger`, `nodes[]`, `edges[]`, `settings`.

| Node type | Purpose | Out-edges |
|---|---|---|
| `action` | Call a connector operation | `next` (+ `error`) |
| `condition` | Boolean branch | `true`, `false` |
| `switch` | Multi-way branch | `case:<value>`, `default` |
| `transform` | Compute + assign vars | `next` |
| `loop` | For-each over an array | `loop` (body), `next` |
| `parallel` | Fan-out / join | `branch` (×N), `next` |
| `wait` / `delay` | Pause (durable-capable) | `next` |
| `end` | Terminate the branch | — |

`workflow-validator.ts` enforces required edges per node type plus
dangling/orphan/cycle/end-edge checks. The executor
(`workflow-engine.service.ts`) does recursive sub-graph execution — a
loop/parallel body is the owned sub-graph, partitioned without back-edges so
the DAG stays acyclic.

### Expression language (`expression-evaluator.ts`)

Safe (no `eval`), value-returning: refs/templates (`{$ref:...}`, `{$tmpl:...}`),
logic/compare, arithmetic, string, array, date, and util (`coalesce`, `if`,
`toString`/`toNumber`/`toBoolean`) operators. Used in conditions, guards,
`switchOn.on`, `wait.until`, and `transform.assign`.

### Connectors (`services/workflows/connectors/`)

| Provider | Key operations |
|---|---|
| `shopify` | `order.addTags`, `order.addNote`, `order.routeToLocation`, `order.cancel`, `customer.addTags`, `customer.updateNote`, `product.updateStatus`, `inventory.adjust`, `metafield.set` |
| `http` | `request` (SSRF-guarded) |
| `email` / `slack` | `send` |
| `storage` | record I/O |
| `superapp` | `datastore.createRecord`, `datastore.query` |

### What is actually wired live, as of 2026-08-27

**Real, tested, three live callers of `WorkflowEngineService`:**
1. **`flow.automation` DELAY steps** (the "R3.5 durable scheduler", commit
   `cd08725` + `9e304c7`): when `FlowRunnerService.executeFlow` hits a `DELAY`
   step whose wait exceeds `DELAY_INLINE_THRESHOLD_MS`, it compiles only the
   *remaining* steps into a minimal canonical `Workflow` (`parkRemainderAsWorkflow`,
   `flow-park.ts:70-115`, via the shared `remainingStepsToNodes` helper) headed
   by a durable `wait` node, and hands it to `WorkflowEngineService.startRun`
   (`flow-runner.service.ts:311-315`) with an idempotent `runId` (a redelivery
   that re-parks swallows the resulting unique-constraint error rather than
   double-parking). `WorkflowRun.status` flips to `'WAITING'` with `resumeAt`.
2. **`api.cron.tsx`'s resume sweep**: every cron tick calls
   `new WorkflowEngineService().resumeDueWorkflowRuns({ limit: 25, ... })`
   (`api.cron.tsx:131-134`) — genuinely resumes due `WAITING` runs, wrapped in
   its own try/catch so a sweep failure never fails the whole tick.
3. **Two other, unrelated live callers** confirmed by grep, for context on how
   real the engine itself is: `services/messaging/messaging-runner.service.ts`
   (`messaging.campaign` scheduled sends) and
   `services/composites/subscription-advancement.server.ts` (the subscription
   composite) both also construct `WorkflowEngineService` directly. Their
   behavior is out of scope for this doc — see `docs/generation.md` — but their
   existence confirms the engine is exercised by more than test files.

**Not implemented — no unification of the full flow onto the graph.**
`flowAutomationToWorkflow` (`flow-compile.ts:143-177`), which would compile an
*entire* legacy flow (not just a DELAY's remainder) into a canonical
`Workflow`, has **zero callers** outside its own file and
`flow-compile.test.ts` — confirmed by repo-wide grep. There is **no**
`FLOW_ENGINE_V2` flag, `isFlowEngineV2Enabled()`, or any symbol by that name
anywhere in `apps/web`/`packages/core` (also confirmed by grep) — that name
does not describe anything that exists in this codebase. Concretely: a live
flow never gets loop/switch/parallel/branching control flow, because the only
thing that ever reaches `WorkflowEngineService` from a live flow is the
single-node "remainder after a DELAY" mini-graph in item 1 above. The DAG
engine's loop/switch/parallel node types are real, built, and covered by
`workflow-engine.test.ts`/`workflow-safety.test.ts` — but unreachable from a
flow authored through the normal step-based builder UI.

### Reliability primitives — mixed reality

- **Retry:** per-action `RetryPolicy` on the engine (max attempts,
  fixed/exponential backoff, jitter, `retryOn`, honors `Retry-After`) — real,
  engine-level. The *linear* runner has its own separate, simpler retry
  (`MAX_STEP_RETRIES = 2`, §1) that does not go through this policy.
- **Idempotency:** per-step deterministic key (`tenant::workflow::version::run::node`)
  on the engine; the DELAY-park path additionally uses a deterministic `runId`
  (`flowpark_<jobId>_<stepIdx>`) so a webhook redelivery never double-parks.
- **Safety caps** (`workflow-engine.service.ts:21-25`): `MAX_NODE_EXECUTIONS = 10_000`,
  `MAX_RECURSION_DEPTH = 64`, `MAX_RESUMES = 100` — all confirmed at those exact
  values, all real (thrown as `SAFETY_LIMIT` errors at the cited lines).
- **Shopify API rate-limit tracking** (`services/shopify/rate-limit.service.ts`):
  `recordAdminThrottle` still has **zero callers** — confirmed by grep, unchanged
  from the prior audit. The `ShopApiRateLimit` table stays empty; `/api-usage`
  shows an empty state.
- **Dead-letter queue — now genuinely wired, but only for a sibling system.**
  `DeadLetterService.record`/`replayDeadLetters` (`services/flows/dead-letter.service.ts`)
  now has real callers — but they're in `services/integration/http-sync-runner.service.ts`
  (the `integration.httpSync` connector), not in `flow-runner.service.ts`.
  `HttpSyncRunnerService` dead-letters a failed sync dispatch and
  `api.cron.tsx` replays due dead letters (`http-sync-runner.service.ts:189-237`).
  **`flow-runner.service.ts` itself still has no `DeadLetterService` import or
  call** — a failed `flow.automation` step still just fails the `FLOW_RUN` job
  and leaves a comment; there is no automatic DLQ/replay for flow step
  failures specifically. Don't read "DLQ is wired" as "flow steps get DLQ'd."

---

## 3. Flow Catalog (`packages/core/src/flow-catalog.ts`)

This is a **separate, unused reference dataset** — do not confuse it with
`shopify-webhook-topics.ts` (§1), which the flow builder actually consumes.
`flow-catalog.ts` is a hand-curated transcription of *Shopify's own* Flow
reference documentation (triggers, condition operators/data types, actions,
connectors — cited sources are Shopify's public Flow help-center pages,
in the file's header comment). It exports typed arrays
(`FLOW_TRIGGERS`, `FLOW_CONDITION_OPERATORS`, `FLOW_ACTIONS`, `FLOW_CONNECTORS`)
and lookup helpers (`getTriggersByCategory`, `getActionsBySource`, etc.).

**It has zero consumers in `apps/web`.** Repo-wide search confirms it is
re-exported from `packages/core/src/index.ts` and covered by its own
`flow-catalog.test.ts`, but nothing in the flow builder, the Shopify Flow
extensions, or any route imports it. It reads as prep work for a future
"author against Shopify's own Flow vocabulary" feature (e.g. richer
authoring hints in `flows.build.$flowId.tsx`, or validation that a claimed
Flow-extension action matches Shopify's real action list) that has not been
built yet.

---

## 4. Shopify Flow extensions (app-as-connector)

Two integration directions, both shipped as extensions:
1. **App-provided triggers** — `extensions/superapp-flow-trigger-*` (module
   published, connector synced, data record created, workflow completed/failed)
   start merchant Flow workflows.
2. **App-provided actions** — `extensions/superapp-flow-action-*` (send HTTP,
   send notification, tag order, write to store) are callable inside merchant
   Flow workflows; Shopify calls back into the app at runtime.

`shopify-flow-bridge.ts` documents the delegation contract and is what
`FlowRunnerService.runForTrigger`/`runFlowById` call (best-effort,
non-blocking) to notify Shopify Flow when a SuperApp workflow completes or
fails (`FLOW_TRIGGER_TOPICS.WORKFLOW_COMPLETED`/`WORKFLOW_FAILED`,
`flow-runner.service.ts:129-145,189-206`). SuperApp's own engine (§1-§2) is the
primary system; the Flow extensions are the Shopify-side touchpoint for
merchants who build in Flow instead.

All Shopify mutations these paths use were validated against Admin API
2026-04 via the Shopify dev MCP.

---

## 5. Known gaps — honest status, dated 2026-08-27

- ~~**`ROUTE_ORDER` silently no-ops on the live path.**~~ **Fixed by #20
  (2026-08-27, commit `7d68b21`)** — see §1. `FlowRunnerService.executeStep`
  now has a real `ROUTE_ORDER` handler that calls `fulfillmentOrderMove`
  directly, and the generic fallthrough throws on any unrecognized step kind
  instead of silently skipping. `ROUTE_ORDER` itself remains unauthorable
  (not in `FlowBuilder`'s catalog or the RecipeSpec schema) — that part of the
  gap is unchanged, only the silent-success trap is closed.
- **No `FLOW_ENGINE_V2` unification.** Confirmed absent by grep. Loop, switch,
  and parallel node types exist and are tested at the engine level but are
  unreachable from any flow authored in the normal builder — the only live
  bridge to the engine is the single-node DELAY-remainder park (§2).
- **`topicToTrigger()` (the generic webhook-topic registry) still has zero
  callers** in `apps/web` — `/webhooks` uses its own smaller hand-written map,
  now covering six topics (two of which are inert — declared in code, not in
  `shopify.app.toml`).
- **`flow-catalog.ts` is unused** (§3) — a Shopify-reference dataset with no
  consumers.
- **`recordAdminThrottle` still has zero callers** — the rate-limit table stays
  empty; `/api-usage` is an empty state for this data.
- **DLQ is real but scoped to `integration.httpSync`, not `flow.automation`** —
  don't extrapolate "dead-letter queue is wired" to mean flow step failures
  get retried automatically; they don't.
- **The flows hub has no "Waiting (parked)" tile.** A durable-waiting run is
  invisible in the hub's stats beyond not counting toward success or failure.

What genuinely changed for the better since the last pass (2026-07): the
DELAY/durable-scheduler wiring (§2 item 1-2) is real and shipped, `flow.automation`
is now correctly classified `deployable` (not `needs_runtime`) in
`packages/core/src/extension-eligibility.ts` — confirmed via `docs/generation.md`'s
own audit — the live webhook surface grew from two topics to four real
ones (plus two inert ones declared but not subscribed), and `ROUTE_ORDER`'s
silent no-op (above) is fixed.

---

## 6. Verify

```bash
# core: schema + validator (loop/switch/parallel) + webhook topic registry + flow catalog
pnpm --filter @superapp/core test

# web: engine control flow, durable wait park/resume, expressions, connectors,
#      legacy->canonical compile, DELAY-remainder park
cd apps/web && pnpm exec vitest run \
  app/__tests__/workflow-engine.test.ts app/__tests__/workflow-durable-wait.test.ts \
  app/__tests__/workflow-safety.test.ts app/__tests__/expression-evaluator.test.ts \
  app/__tests__/workflow-connectors.test.ts app/__tests__/flow-compile.test.ts \
  app/__tests__/flow-park.test.ts app/__tests__/flow-runner-route-order.test.ts

# config: validate the webhook topics + scopes against Admin 2026-04
shopify app config validate --json
```
