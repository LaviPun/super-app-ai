# Flow Automation — Architecture, Engine & Connectors

> Industry-grade workflow automation (n8n / Shopify Flow class): a typed DAG engine
> with control flow (loop / switch / parallel / wait), a rich expression language,
> retry/idempotency, our own order routing, and module I/O linking. This doc is the
> single source of truth — it records the audit that motivated the rebuild, the
> architecture, and how to author + run flows.

## 1. Audit (what existed, and the gap)

There were **two parallel systems**, and the weaker one was live:

| | `WorkflowEngineService` (canonical) | `FlowRunnerService` (legacy) |
|---|---|---|
| Model | Typed DAG (`workflow.ts`): nodes + edges, expression tree, retry/backoff, error edges, idempotency, per-step persistence | Linear `{trigger, steps[]}` runner |
| Control flow | (added) loop / switch / parallel / wait | none |
| Wired to | only the Shopify Flow bridge (dormant) | **live** — order/product webhooks, cron schedules, `api.flow.run` |
| Connectors | shopify/http/slack/email/storage/superapp | inline step kinds |

Gaps vs industry level: no loops/branching/parallelism on the live path; thin
executable Shopify surface (4 ops); **no order routing**; non-durable in-process
`delay`; comparisons-only expressions; module I/O not linkable.

**Resolution:** make the DAG engine canonical and industry-grade, then **unify** the
live path onto it via a compiler (legacy `{steps}` → canonical `Workflow`), behind
an opt-in flag so existing order webhooks stay on the proven path until migrated.

## 2. Workflow model (`packages/core/src/workflow.ts`)

A `Workflow` is a typed DAG: a `trigger`, `nodes[]`, `edges[]`, and `settings`.

**Node types**
| Type | Purpose | Key fields | Out-edges |
|---|---|---|---|
| `action` | Call a connector operation | `action: {provider, operation, inputs, retry?, timeoutMs, idempotencyKey?, outputs?}` | `next` (+ `error`) |
| `condition` | Boolean branch | `condition: Expression` | `true`, `false` |
| `switch` | Multi-way branch | `switchOn: {on}` | `case:<value>`, `default` |
| `transform` | Compute + assign vars | `transform: {assign}` | `next` |
| `loop` | For-each over an array | `loop: {items, itemVar, indexVar, maxIterations, mode, concurrency}` | `loop` (body), `next` |
| `parallel` | Fan-out / join | `parallel: {join: all\|race, maxConcurrency}` | `branch` (×N), `next` |
| `wait` | Pause (durable-capable) | `wait: {mode, durationMs\|until, inlineThresholdMs}` | `next` |
| `delay` | Legacy alias of wait | `delay: {...}` | `next` |
| `end` | Terminate the branch | — | none |

**Edges** carry a `label`: `next`, `true`/`false`, `error`, `case:<value>`,
`default`, `loop`, `branch`. The validator (`workflow-validator.ts`) enforces the
required edges per node type (e.g. a `switch` needs ≥1 `case:*`/`default`; a `loop`
needs a `loop` body edge; a `parallel` needs ≥1 `branch`), plus dangling/orphan/
cycle/end-edge checks.

### How control flow runs (`workflow-engine.service.ts`)
The executor is **recursive sub-graph execution**, not a single pointer:
- `executeFrom(start, boundary)` walks until it leaves the owned node set.
- A loop/parallel body is the **owned sub-graph** = `reachable(body edge) \ reachable(next edge)`. This partitions the body from the post-loop continuation **without back-edges**, so the DAG stays acyclic and the validator can reason about it.
- `loop` binds `itemVar`/`indexVar` per iteration (serial or bounded-parallel); `parallel` runs each `branch` sub-graph with `Promise`-pooled concurrency then joins (`all`/`race`).

## 3. Expression language (`expression-evaluator.ts`)

Safe (no `eval`), value-returning. Used in conditions, guards, `switchOn.on`,
`wait.until`, and `transform.assign` (and embeddable anywhere via `{op, args}`).

- **Refs/templates:** `{$ref:"$.trigger.payload.order.total"}` (supports `[i]` indexing), `{$tmpl:"Order {{$.trigger.payload.name}}"}`.
- **Logic/compare:** `and or not eq neq gt gte lt lte in contains exists`.
- **Arithmetic:** `add subtract multiply divide modulo abs round min max sum`.
- **String:** `concat lower upper trim replace split substring startsWith endsWith length`.
- **Array:** `at slice join first last includes length`.
- **Date:** `now parseDate addDays addHours diffDays isBefore isAfter formatDate`.
- **Util:** `coalesce if toString toNumber toBoolean`.

Example transform: `{ assign: { final: { op: 'multiply', args: [{$ref:'$.trigger.payload.total'}, 0.9] } } }`.

## 4. Connectors (`services/workflows/connectors/`)

Each implements `manifest() / validate() / invoke()` (`connector-sdk.ts`).
The engine resolves auth per provider, applies retry/backoff, and records steps.

| Provider | Key operations |
|---|---|
| `shopify` | `order.addTags`, `order.addNote`, **`order.routeToLocation`** (order routing), `order.cancel`, `customer.addTags`, `customer.updateNote`, `product.updateStatus`, `inventory.adjust`, `metafield.set` |
| `http` | `request` (SSRF-guarded) |
| `email` / `slack` | `send` |
| `storage` | record I/O |
| `superapp` | **`datastore.createRecord`**, **`datastore.query`** (module I/O) |

All Shopify mutations were validated against **Admin API 2026-04** via the Shopify
dev MCP (`fulfillmentOrderMove`, `orderCancel`, `productUpdate(product:)`,
`customerUpdate`, `inventoryAdjustQuantities`).

## 5. Order routing (our own)

Shopify exposes **no order-routing Function template** in the CLI (verified against
`shopify app generate extension`'s supported list), so the `functions.orderRoutingLocationRule`
module type stays `needs_runtime`. Instead we ship **our own order routing as a flow
action**: `shopify/order.routeToLocation` resolves the order's fulfillment order and
calls `fulfillmentOrderMove(id, newLocationId)`. A flow decides the destination with
full expression logic (country, inventory, priority, B2B, etc.), e.g.:

```
trigger order.created
 → switch on {$ref:$.trigger.payload.shipping_address.country_code}
   case:US  → action shopify.order.routeToLocation { newLocationId: <US warehouse> }
   case:DE  → action shopify.order.routeToLocation { newLocationId: <EU warehouse> }
   default  → action shopify.order.routeToLocation { newLocationId: <default> }
```

When Shopify later exposes an order-routing Function template, it slots in via the
same scaffold→manifest path as the other Functions (see docs/audit-module-combinations.md).

## 6. Module I/O linking

The `superapp` connector lets a flow treat any module's typed data store
(`DataStoreService`) as a source or a sink — so module output can feed a flow and a
flow can write into another module:

```
trigger superapp.data.record_created   (a "reviews" module wrote a record)
 → action superapp.datastore.query     { storeKey: module_<reviewsId> }
 → loop over records
     → condition rating >= 4
        true → action superapp.datastore.createRecord { storeKey: module_<loyaltyId>, payload: {...} }
```

Record writes go through `createRecord`, so they're validated against the sink
store's typed schema when one is declared.

## 7. Shopify Flow touchpoints

Two integration directions (both shipped as extensions):
1. **App-provided triggers** — `extensions/superapp-flow-trigger-*` (module published, connector synced, data record created, workflow completed/failed) start merchant Flow workflows.
2. **App-provided actions** — `extensions/superapp-flow-action-*` (send HTTP, send notification, tag order, write to store) are callable inside merchant Flow workflows; Shopify calls back into the app at runtime.

`shopify-flow-bridge.ts` documents the delegation contract. Our **own** engine
(sections 2–6) is the primary system; the Flow extensions are the Shopify-side
touchpoint for merchants who build in Flow.

## 8. Reliability

- **Retry:** per-action `RetryPolicy` (max attempts, fixed/exponential backoff, jitter, `retryOn`); honors `Retry-After`.
- **Idempotency:** per-step deterministic key (`tenant::workflow::version::run::node`) or an expression-derived key.
- **Errors:** per-node `onError` (`fail_run` / `continue` / `route_to_error_edge`) or workflow `errorPolicy`.
- **Durability (wired):** a top-level `wait`/`delay` longer than its per-node `inlineThresholdMs` (default 60s) **parks** the run instead of sleeping: the engine throws a `WaitParkSignal`, `finalizeRun` persists `WorkflowRun.status='WAITING'` + `resumeAt` + `resumeNodeId` + the **compiled graph** (`workflowJson`, so resume is self-contained even if the source module changes). The cron endpoint (`api.cron.tsx → resumeDueWorkflowRuns`) loads every `WAITING` run with `resumeAt ≤ now`, rebuilds the context, settles the wait node, and continues from its `next` edge with the shop's stored Admin token. Multi-day waits survive process restarts. Waits nested in a loop/parallel branch sleep inline (bounded) to keep the recursion sound. Covered by `app/__tests__/workflow-durable-wait.test.ts`.
- **Persistence:** every step → `WorkflowRunStep`; the run → `WorkflowRun` (context + compiled-graph snapshot).

## 9. Unifying the live path (default-on)

`flowAutomationToWorkflow` (`services/flows/flow-compile.ts`) compiles a legacy
`flow.automation` `{trigger, steps[]}` into a canonical `Workflow` (each step → a
connector action, trigger → a typed event/schedule). `FlowRunnerService.runForTrigger`
runs via `WorkflowEngineService` **by default** (`isFlowEngineV2Enabled()` defaults
**true**); the legacy linear runner is retained as an escape hatch — set
**`FLOW_ENGINE_V2=0`** to fall back per environment/shop. The strong engine is the
live path: control flow, retries, idempotency, durable waits, order routing, module I/O.

## 9a. Webhook trigger catalog ("select a trigger and start working")

Single source of truth: **`packages/core/src/shopify-webhook-topics.ts`** maps every
Shopify Admin webhook **topic** (`orders/create`, `fulfillment_orders/order_routing_complete`,
`returns/request`, …) → a canonical trigger id (`shopify.order.created`) + required
**scope** + category + reference fields + legacy enum. Three consumers:

1. **`shopify.app.toml`** subscribes every topic whose scope is granted (the always-on
   set) → all route to `/webhooks`. Validated with `shopify app config validate` (✅).
   Added commerce read-scopes: fulfillments, inventory, draft_orders, returns,
   fulfillment_orders (merchant/assigned/third-party), discounts, price_rules, locations.
2. **`/webhooks` generic dispatcher** (`routes/webhooks.tsx`): any incoming topic →
   `topicToTrigger()` → idempotency → `runForTrigger(trigger)`. Add a topic to the
   registry + toml and it fires — no new route.
3. **Flow builder trigger picker** (`flows.build.$flowId.tsx` loader → `FlowBuilder`):
   the full catalog, grouped by category, with scope status ("needs scope X" for
   un-granted topics). Order routing is both a trigger (`fulfillment_orders/order_routing_complete`)
   and an action (Route Order to Location).

`normalizeTrigger()` reconciles canonical ids ⇄ legacy enums ⇄ raw topics so a flow
matches whatever form it stored. Topics needing un-granted scopes (subscriptions) stay
in the catalog and are surfaced as "enable scope X", never hidden.

## 9b. Admin surfacing

- **Flows hub** (`flows._index.tsx`): real trigger labels, real run counts (7d), a
  **Waiting (parked)** tile (durable-wait visibility), and a real success rate — all from
  `WorkflowRun`.
- **Flow builder**: full trigger catalog + Route-Order action + data-store linking
  (`WRITE_TO_STORE` picks a real store key).
- **Module detail** (`modules.$moduleId.tsx`): a deployability banner from the eligibility
  model (Deployable / config-deploys-runtime-pending / takes-effect-on-Plus + missing scopes).

## 9c. Reliability & safety (rate limits, DLQ, loop guards)

- **Shopify API rate-limit tracking** (`services/shopify/rate-limit.service.ts`): every
  Admin call through the Shopify connector records `extensions.cost.throttleStatus`
  (currentlyAvailable / maximumAvailable / restoreRate) + `actualQueryCost` into
  `ShopApiRateLimit` (best-effort, never throws into the call). Exposed live at
  **`/api-usage`** (real data, empty state until the first call) for the API-limit
  threshold dashboard. `RateLimitService.backoffMs` gives proactive throttle backoff;
  the connector already honors 429 `Retry-After`.
- **Dead-letter queue** (`services/flows/dead-letter.service.ts` + `FlowDeadLetter`):
  a flow run that fails after in-run retries is dead-lettered (keyed to its flow). Cron
  (`replayDeadLetters`) replays PENDING entries with **bounded** exponential backoff via
  `runFlowById` (re-runs only that flow, never re-fires siblings); after `maxAttempts`
  it is **DISCARDED** — no infinite loop. Replay state lives in the row.
- **Engine safety caps** (`workflow-engine.service.ts`): `MAX_NODE_EXECUTIONS` (10k per
  run) stops a runaway/pathological loop with `SAFETY_LIMIT`; `MAX_RECURSION_DEPTH` (64)
  bounds nested loop/parallel sub-graphs; `MAX_RESUMES` (100, via `WorkflowRun.resumeCount`)
  is the durable-wait re-park guard so a never-arriving `wait until` can't resume forever.
  The DAG is acyclic (no back-edges), so these are belt-and-suspenders against regressions.
- **Dynamic webhook verification** (`services/shopify/webhook-subscriptions.service.ts`):
  the flow builder queries the shop's **live** `webhookSubscriptions` and marks each
  trigger `✓ … (active)` / available / `— needs scope X` — verified before showing,
  never a static guess. Falls back to "unknown" (shows all) if the lookup fails.

## 10. POS status — DEPLOYABLE

`pos.extension` is now **deployable** (`extensions/superapp-pos-block`). POS UI
extensions can't read Storefront metaobjects, so the runtime uses **App Authentication
+ the Session API**: the POS block calls `shopify.session.getSessionToken()` and fetches
**`/api/pos/config`** (`routes/api.pos.config.tsx`, verified via
`authenticate.public.pos`), which reads the shop's published `pos.extension` config from
the DB (`services/pos/pos-config.server.ts`). No metaobject is needed (POS can't read
them). Eligibility flipped to `runtimeShipped: true`; the only remaining `needs_runtime`
type is `functions.orderRoutingLocationRule` (no CLI template yet — built as a flow action).

## 11. Verify

```bash
# core: schema + validator (loop/switch/parallel) + webhook topic registry
pnpm --filter @superapp/core test
# web: engine control flow, durable wait park/resume, expressions, connectors
#      (order routing + module I/O), legacy→canonical compile
cd apps/web && pnpm exec vitest run \
  app/__tests__/workflow-engine.test.ts app/__tests__/workflow-durable-wait.test.ts \
  app/__tests__/expression-evaluator.test.ts app/__tests__/workflow-connectors.test.ts \
  app/__tests__/flow-compile.test.ts
# config: validate the webhook topics + scopes against Admin 2026-04
shopify app config validate --json
```
