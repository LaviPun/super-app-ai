# Durable Scheduler + Flow build-vs-lean DECISION (R3.5)

**Phase #4 · Piece: timed/cron automation (subscription dunning, back-in-stock fan-out,
review-request sequences, loyalty expiry).**
**Substrate:** flat-pin `RecipeSpec.config` + live `generate._index.tsx` builder + `FlowRunnerService`
(the linear runner). The control-pack composer and `moduleSystemVersion` are PRUNED — this design does
not resurrect them.
**Author:** senior code architect · **Date:** 2026-07-03 · **HEAD:** `a948f1c` (feat/superapp-redesign)

> Read alongside: `specs/028-recipe-vocabulary/research/reality/flow-automation.md`,
> `.../synthesis/gap-analysis.md` (R3.5 / M6), `.../research/shopify-editions-spring-2026.md` §1h.

---

## 0. TL;DR — the DECISION

**Recommend option A+ (a scoped hybrid), NOT pure A, B, or C.**

The framing "wire the DAG engine (A) vs lean on Shopify Flow (B) vs build own-cron (C)" has a false
premise: **a working own-cron already ships and is live** — `FlowSchedule` rows + `ScheduleService.claimDue()`
(compare-and-swap claim) + the `api.cron.tsx` sweep firing the `SCHEDULED` trigger through
`FlowRunnerService` (`schedule.service.ts:72-101`, `api.cron.tsx:69-91`). So C is *partly done*. What it
**cannot** express is the thing every composite in M6 actually needs: a **relative, per-entity wait**
("14 days after *this* signup", "3 days after *this* order ships"). A cron row is *absolute* wall-clock
recurrence; it has no per-run memory of "which customer, resume when."

The **durable-wait** primitive that expresses relative waits **is already built and DB-ready**:
`WorkflowEngineService.startRun/resumeRun` park a long top-level `wait` as `WorkflowRun.status='WAITING'`
with `resumeAt`/`resumeNodeId`/`workflowJson` persisted, and there is an index `@@index([status, resumeAt])`
purpose-built for a resume sweep (`workflow-engine.service.ts:404-443`, `schema.prisma:602-629`). The
**only** missing pieces are: (1) `resumeDueWorkflowRuns` is a code comment, not a function
(`workflow-engine.service.ts:426`); (2) `api.cron.tsx` has no resume sweep; (3) nothing on the *live
authoring path* (flat-pin `flow.automation` specs) ever creates a `WorkflowRun` — the linear runner has no
`WAIT`/`DELAY` step kind, so parked runs never come into existence in production.

**The scoped hybrid (A+):**
1. Add a **`DELAY` step kind** to the flat-pin `flow.automation` recipe schema + linear runner. When the
   runner hits a `DELAY` longer than an inline threshold, it **parks** the *remaining steps* into a
   `WorkflowRun` (reusing the built durable table + resume machinery) instead of blocking.
2. Implement **`resumeDueWorkflowRuns()`** on `WorkflowEngineService` (bounded, claim-and-swap, per-shop
   auth resolver).
3. Add a **resume sweep** to `api.cron.tsx` right after `claimDue()`.
4. **Keep** the existing `FlowSchedule` cron for *absolute* recurrence (loyalty-expiry nightly sweeps,
   digest emails) — it is live and correct; do not rip it out.

We do **not** lean on Shopify Flow (B) as the *scheduler of record*: Spring-26 Flow gained a code editor +
ShopifyQL + version history (`shopify-editions-spring-2026.md:57`) but **Flow still has no first-class
durable "wait N days then continue *this* run" primitive our modules can author and own**, and delegating
scheduling to Flow means our generated modules' timed behavior lives outside our recipe/preview/publish
loop (un-inspectable, un-previewable, not versioned with the module). Flow stays a **best-effort
notification sink** exactly as today (`emitFlowTriggerSafe`), not the engine.

---

## 1. Current state (file:line)

### 1a. What IS live (do not rebuild)
| Capability | Evidence | Note |
|---|---|---|
| Absolute cron scheduler | `schedule.service.ts:72-101` (`claimDue` CAS-claim), `api.cron.tsx:69-91` | Fires `SCHEDULED` trigger → `FlowRunnerService.runForTrigger`. **Live.** |
| Cron 5-field parser + `computeNextRun` | `schedule.service.ts:104-189` | UTC, supports lists/ranges/steps. Reuse for absolute recurrence. |
| Schedule CRUD | `schedule.service.ts:13-69`; UI `flows._index.tsx:199-224`; API `api.agent.schedules.tsx:54-63` | Create/list/toggle/remove `FlowSchedule`. |
| Linear flow runner | `flow-runner.service.ts:87-223` | 9 live step kinds; per-step retry (`MAX_STEP_RETRIES=2` `:28`), CONDITION branch (`MAX_CONDITION_DEPTH=3` `:77`). |
| Cron secret auth + rate-limit | `api.cron.tsx:42-67` | `X-Cron-Secret`, constant-time compare, per-IP rate limit. |
| DLQ drain hook slot | `api.cron.tsx:93-99` | Currently only drains metaobject-cleanup jobs; DLQ replay not wired (out of scope here). |

### 1b. What is BUILT-NOT-WIRED (the durable-wait we harvest)
| Primitive | Evidence | Gap |
|---|---|---|
| `WorkflowEngineService.startRun` durable park | `workflow-engine.service.ts:112-130`, `404-443` | Throws `WaitParkSignal` for a top-level `wait > inlineThreshold`; `finalizeRun` persists `WAITING` + `resumeAt` + `resumeNodeId` + `workflowJson` (`:659-672`). **Tested** (`workflow-durable-wait.test.ts:81-97`). Zero prod callers. |
| `WorkflowEngineService.resumeRun` | `workflow-engine.service.ts:137-217` | Rebuilds workflow+ctx from snapshot, settles wait node, continues from `next`. `MAX_RESUMES=100` guard (`:26,155-160`). **Tested** (`:99-112`). Called only by tests. |
| DB columns for park/resume | `schema.prisma:602-629` | `workflowJson`, `resumeAt`, `resumeNodeId`, `resumeCount`, and `@@index([status, resumeAt])`. **Already migrated** (baseline `20260702000000_baseline`). No new migration needed for the resume sweep. |
| `resumeDueWorkflowRuns` | `workflow-engine.service.ts:426` (comment only) | **Does not exist as a function.** This spec creates it. |
| `flowAutomationToWorkflow` compiler | `flow-compile.ts:86-120` | Compiles legacy `{trigger,steps[]}` → canonical `Workflow`. Called only by `flow-compile.test.ts`. Does **not** emit `wait` nodes today (no legacy `DELAY` step to map). |

### 1c. The precise hole
- Live linear runner has **no** `DELAY`/`WAIT` step (`flow-runner.service.ts:255-393` switch has 9 kinds, none delays).
- Recipe schema `flow.automation.config.steps` (`recipe.ts:484-548`) discriminated union has **no** `DELAY` member.
- `api.cron.tsx` has **no** resume sweep (grep `resume` = none).
- Net: relative per-entity waits ("dunning day 3 / day 7 / day 14", "review request 5 days post-delivery",
  "back-in-stock: notify, then 24h reminder") are **inexpressible** on the live path today.

---

## 2. Target shape (exact types + example)

### 2a. New recipe step kind — `DELAY` (additive discriminated-union member)
Add to `flow.automation.config.steps` union in `packages/core/src/recipe.ts` (after the `CONDITION`
member, `recipe.ts:540-547`):

```ts
z.object({
  kind: z.literal('DELAY'),
  // Exactly one of the two modes. `duration` = relative wait from when the step is reached.
  // `until` = an ISO-8601 instant or a {{dot.path}} into the trigger event resolving to one.
  mode: z.enum(['duration', 'until']).default('duration'),
  // duration mode: bounded 1 minute … 90 days (dunning/loyalty horizon).
  durationMs: z.number().int().min(60_000).max(90 * 24 * 3600_000).optional(),
  // until mode: literal ISO string or "{{order.fulfillment.estimated_delivery_at}}" style ref.
  until: z.string().max(200).optional(),
}).refine(
  (s) => (s.mode === 'duration' ? s.durationMs != null : s.until != null),
  { message: 'DELAY requires durationMs (duration mode) or until (until mode)' },
),
```

`FLOW_AUTOMATION_TRIGGERS` is unchanged — a `DELAY`-bearing flow can hang off **any** existing trigger
(order.created → wait 3d → email; a nightly `SCHEDULED` sweep → per-row wait). No new trigger enum.

### 2b. Runner-side step type
Extend `FlowStep` in `flow-runner.service.ts:40-74`:

```ts
type FlowStep = {
  kind: string;
  // … existing fields …
  // DELAY step
  mode?: 'duration' | 'until';
  durationMs?: number;
  until?: string;
};
```

### 2c. The park boundary — reuse the durable `WorkflowRun`, do NOT invent a new table
When the linear runner reaches a `DELAY` whose remaining wait exceeds `DELAY_INLINE_THRESHOLD_MS`
(reuse `60_000`, matching the engine's `DEFAULT_INLINE_THRESHOLD_MS` `:28`), it compiles the
**remaining steps** (index `stepIdx+1 …`) into a minimal canonical `Workflow` via a new helper
`parkRemainderAsWorkflow`, calls `WorkflowEngineService.startRun` with a synthetic `wait` head node, and
returns — the run persists as `WorkflowRun.status='WAITING'`. This means:
- **One durable substrate**, not two. The park/resume/snapshot/`MAX_RESUMES` machinery is reused verbatim.
- The `WorkflowRun` row carries `tenantId = shopId`, `resumeAt`, and `workflowJson` (the compiled
  remainder) — everything the resume sweep needs, self-contained.

Compiled remainder shape (built by `parkRemainderAsWorkflow(shopId, flowId, remainingSteps, event, resumeAt)`):

```ts
// head is a durable wait that immediately parks; body = the remaining legacy steps as action nodes.
{
  id: padId(flowId), version: 1, name: `${flowName} (delayed)`, status: 'active',
  tenantId: shopId,
  trigger: { type: 'schedule', provider: 'superapp', event: 'delay.resume' },
  variables: { __event: event },                 // trigger payload snapshotted for {{refs}}
  nodes: [
    { id: 'wait', type: 'wait', name: 'DELAY',
      wait: { mode: 'until', until: resumeAt.toISOString(), inlineThresholdMs: 0 } }, // 0 ⇒ always parks
    ...remainingSteps.mapped(),                   // via existing stepToAction() in flow-compile.ts:49
    { id: 'end', type: 'end', name: 'Done' },
  ],
  edges: [ { from: 'wait', to: firstBodyId, label: 'next' }, /* chain */, { from: lastBodyId, to: 'end', label: 'next' } ],
  settings: { timezone: 'UTC', maxRunSeconds: 900, errorPolicy: 'continue_on_error' },
}
```

> `inlineThresholdMs: 0` forces the engine to park immediately on `startRun` (it re-checks `remaining > threshold && depth === 0`, `:424`). The `resumeAt` we computed in the linear runner is the single source of truth; the engine just re-parks against it.

### 2d. `resumeDueWorkflowRuns` — new method on `WorkflowEngineService`

```ts
/**
 * Cron resume sweep. Claims WAITING runs whose resumeAt is due (CAS to avoid
 * double-resume across concurrent ticks), resumes each with a per-tenant auth
 * resolver, and returns a per-run outcome. Bounded by `limit`.
 */
async resumeDueWorkflowRuns(opts: {
  now?: Date;
  limit?: number;
  authResolverFor: (tenantId: string) => (provider: string) => Promise<AuthContext>;
}): Promise<Array<{ runId: string; tenantId: string; status: RunStatus; error?: string }>> {
  const prisma = getPrisma();
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 25;

  const due = await prisma.workflowRun.findMany({
    where: { status: 'WAITING', resumeAt: { lte: now } },
    orderBy: { resumeAt: 'asc' },
    take: limit,
  });

  const out: Array<{ runId: string; tenantId: string; status: RunStatus; error?: string }> = [];
  for (const row of due) {
    // CAS claim: flip WAITING→RUNNING only if resumeAt is still what we read.
    // A concurrent tick that already claimed it loses (count 0) and is skipped.
    const claim = await prisma.workflowRun.updateMany({
      where: { id: row.id, status: 'WAITING', resumeAt: row.resumeAt },
      data: { status: 'RUNNING' },
    });
    if (claim.count !== 1) continue;

    try {
      const res = await this.resumeRun(row.id, opts.authResolverFor(row.tenantId));
      out.push({ runId: row.id, tenantId: row.tenantId, status: res.status as RunStatus, error: res.error });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await prisma.workflowRun.update({ where: { id: row.id }, data: { status: 'FAILED', endedAt: new Date(), error } }).catch(() => {});
      out.push({ runId: row.id, tenantId: row.tenantId, status: 'FAILED', error });
    }
  }
  return out;
}
```

> Note: `resumeRun` (`:180-183`) already flips `WAITING→RUNNING` internally, but it does so *without* a
> resumeAt guard, so a bare `resumeRun` from two concurrent ticks could both proceed. The CAS in the sweep
> is the double-resume guard. `resumeRun`'s own "not parked" check (`:146-148`) is the second line of
> defence: whichever tick claims first moves the row out of `WAITING`, so the loser's `resumeRun` returns
> `'run is not parked'` harmlessly even if the CAS were removed. Keep both.

### 2e. Example — subscription dunning (author-side flat-pin spec)

```jsonc
{
  "type": "flow.automation",
  "name": "Dunning — failed payment recovery",
  "config": {
    "trigger": "SHOPIFY_WEBHOOK_ORDER_CREATED",  // or a subscription-billing-failed webhook once subscribed
    "steps": [
      { "kind": "SEND_EMAIL_NOTIFICATION", "to": "{{customer.email}}", "subject": "Payment issue", "body": "…retry…" },
      { "kind": "DELAY", "mode": "duration", "durationMs": 259200000 },        // 3 days
      { "kind": "SEND_EMAIL_NOTIFICATION", "to": "{{customer.email}}", "subject": "Reminder", "body": "…" },
      { "kind": "DELAY", "mode": "duration", "durationMs": 604800000 },        // 7 days
      { "kind": "TAG_CUSTOMER", "tag": "dunning-lapsed" }
    ]
  }
}
```

Runtime: email fires inline; the runner hits the first `DELAY`, parks steps 3-5 as a `WorkflowRun`
(`resumeAt = now+3d`); cron resumes at day 3 → email fires → hits second `DELAY`, **re-parks** steps 5
(`resumeAt = now+7d`); cron resumes at day 10 → tags customer. Two `WorkflowRun` rows, both self-contained.

---

## 3. Files to change

| # | File | Change |
|---|---|---|
| F1 | `packages/core/src/recipe.ts:540-548` | Add the `DELAY` discriminated-union member (§2a). **Additive** — existing specs still parse. |
| F2 | `packages/core/src/allowed-values.ts` | (Optional) export `FLOW_DELAY_MODES = ['duration','until']` for the builder dropdown; no trigger-enum change. |
| F3 | `apps/web/app/services/flows/flow-runner.service.ts:40-74` | Extend `FlowStep` with `mode/durationMs/until` (§2b). |
| F4 | `apps/web/app/services/flows/flow-runner.service.ts:196-223` (`executeFlow`) | On `step.kind==='DELAY'`: compute `resumeAt`; if `remaining ≤ threshold` sleep inline (bounded); else **park remainder** via `WorkflowEngineService.startRun` and `return { parked: true, resumeAt, remaining: N }` — stop iterating. (§4.) |
| F5 | `apps/web/app/services/flows/flow-compile.ts:49-79` (`stepToAction`) | Add `case 'DELAY': return null` (already the default) — but add a sibling exported `remainingStepsToNodes()` reused by the park helper so mapping logic isn't duplicated. |
| F6 | **NEW** `apps/web/app/services/flows/flow-park.ts` | `parkRemainderAsWorkflow(...)` builder (§2c) + `computeResumeAt(step, event)` (duration/until, with `{{ref}}` resolution reusing `readPath` from `flow-runner.service.ts:457`). |
| F7 | `apps/web/app/services/workflows/workflow-engine.service.ts` | Add `resumeDueWorkflowRuns` (§2d). Replace the stale comment at `:426`. |
| F8 | `apps/web/app/routes/api.cron.tsx:91` (after `claimDue` loop) | Add the resume sweep block (§5). |
| F9 | `apps/web/app/services/flows/schedule.service.ts` **or new `auth-resolver.server.ts`** | Add `buildShopAuthResolver(tenantId)` → resolves `shopify`/`slack`/`email`/`http`/`superapp` providers from `ConnectorToken` + env (the sweep needs real per-shop auth, unlike the test stub). |
| F10 | `apps/web/app/components/FlowBuilder.tsx` | Add a "Delay" step option (duration picker: minutes/hours/days) so merchants author `DELAY` in the live builder. |
| F11 | `apps/web/app/routes/flows._index.tsx` (loader stats) | Add a **"Waiting (N)"** count from `WorkflowRun where status='WAITING'` — closes the §9b overclaim honestly (the tile now becomes real). |

**No Prisma migration required** — `WorkflowRun` already has every column + the `[status, resumeAt]` index.

---

## 4. Generation wiring

The authoring path is flat-pin `RecipeSpec.config` + the live `generate._index.tsx` builder + `SchemaForm`
(the composer is pruned). `DELAY` plugs in additively:

1. **Prompt / classifier.** `flow.automation` generation already emits `{trigger, steps[]}`. Add `DELAY`
   to the step-kind vocabulary in the generation prompt so "email them, wait 3 days, remind" produces a
   `DELAY` step instead of silently dropping the wait. Ground the durationMs bounds (1min…90d) in the
   prompt so the model emits millisecond integers, not prose ("3 days").
2. **Zod gate.** `RecipeSpecSchema` (F1) validates `DELAY` at parse time — the deterministic compiler and
   `RecipeService.parse` reject malformed delays (missing `durationMs`/`until`) before publish. No new
   compiler case needed: `flow.automation` compiles to a stored spec that the runner interprets at
   trigger time (it is not an extension that emits a metaobject).
3. **Preview.** `PreviewService` renders `flow.automation` deterministically as a step list. Add a
   "⏳ wait 3 days" affordance for `DELAY` steps so the preview truthfully shows the timeline. No AI
   preview HTML (honor the pruned `previewHtmlJson`).
4. **Builder.** F10 gives merchants a Delay step in `FlowBuilder.tsx` with a duration picker; it writes the
   same flat-pin shape the generator emits — generator and hand-authoring converge on one schema.

---

## 5. Runtime / compile / render / publish wiring (make-or-break)

### 5a. Park at the linear runner (`executeFlow`, F4)
Insert before the normal `executeStepWithRetry` dispatch:

```ts
if (step.kind === 'DELAY') {
  const resumeAt = computeResumeAt(step, event);          // flow-park.ts
  const remainingMs = resumeAt.getTime() - Date.now();
  const remainderSteps = spec.config.steps.slice(stepIdx + 1);

  if (remainingMs <= DELAY_INLINE_THRESHOLD_MS) {
    // short wait: sleep inline, bounded, then continue the loop
    if (remainingMs > 0) await sleep(Math.min(remainingMs, DELAY_INLINE_THRESHOLD_MS));
    await writeStepLog(prisma, jobId, shopId, stepIdx, 'DELAY', 'SUCCESS', 0);
    continue;
  }

  if (remainderSteps.length === 0) {              // delay is the last step → nothing to resume
    await writeStepLog(prisma, jobId, shopId, stepIdx, 'DELAY', 'SUCCESS', 0);
    return;
  }

  // Park the remainder as a durable WorkflowRun (reuses the built engine).
  const wf = parkRemainderAsWorkflow({ shopId: shopId!, flowId: /* from spec meta */, flowName: spec.name,
    remainderSteps, event, resumeAt });
  const runId = `flowpark_${jobId}_${stepIdx}`;
  await new WorkflowEngineService().startRun(wf, {}, {
    tenantId: shopId!, runId,
    authResolver: buildShopAuthResolver(shopId!),
  }); // returns WAITING; row persisted with resumeAt + workflowJson
  await writeStepLog(prisma, jobId, shopId, stepIdx, 'DELAY', 'SUCCESS', 0, { parkedRunId: runId, resumeAt });
  return;   // stop the linear run; the parked WorkflowRun owns the rest
}
```

Key correctness points:
- **Idempotent runId** (`flowpark_${jobId}_${stepIdx}`) — a webhook redelivery that re-runs the same flow
  produces the same runId; `startRun`'s `workflowRun.create` throws on the unique id, which we catch as
  "already parked" (add a try/catch that swallows the `P2002` unique-violation → treat as parked).
- **shopId is required** to park. Webhook + manual paths pass a real `shopId`; the `SCHEDULED` cron path
  passes `shopRow?.id` (`flow-runner.service.ts:103-104`) — present. Guard: if `shopId` is missing, fail
  the step loudly (never silently drop the delay).
- **Admin context is dropped at park time.** The parked remainder resumes via the engine's connector
  registry + `buildShopAuthResolver`, **not** the webhook's `admin`. Shopify-touching steps
  (`TAG_ORDER`/`TAG_CUSTOMER`/`ADD_ORDER_NOTE`) in the remainder therefore run through the
  `shopify.connector` using the stored offline `accessToken` (`ConnectorToken`/`Shop.accessToken`), which
  is correct for delayed execution (the request-scoped admin is long gone by day 3). **This is the single
  biggest wiring subtlety — see Risks R1.**

### 5b. Resume sweep in cron (F8, after `api.cron.tsx:91`)

```ts
let resumeSweep: Array<{ runId: string; tenantId: string; status: string; error?: string }> = [];
try {
  resumeSweep = await new WorkflowEngineService().resumeDueWorkflowRuns({
    limit: 25,
    authResolverFor: (tenantId) => buildShopAuthResolver(tenantId),
  });
} catch (err) {
  logger.warn('[api.cron] workflow resume sweep failed', safeErrorMeta(err));
}
// … add `resumeSweep` to the returned json (:121)
```

- Runs **every cron tick** (same cadence as `claimDue`). Cron cadence sets the resume granularity —
  document "delays resolve to the nearest cron tick (recommend ≤5 min)".
- Bounded `limit: 25` per tick; due backlog drains across ticks (`orderBy: resumeAt asc`).
- **CAS-claimed** (§2d) so overlapping ticks never double-resume.
- Timezone: `resumeAt` is a UTC `DateTime`; `computeResumeAt` produces UTC — no TZ ambiguity.

### 5c. `buildShopAuthResolver` (F9)
```ts
export function buildShopAuthResolver(tenantId /* shopId */: string) {
  return async (provider: string): Promise<AuthContext> => {
    switch (provider) {
      case 'shopify': { const t = await loadShopToken(tenantId); return { type: 'shopify', shopDomain: t.shopDomain, accessToken: t.accessToken }; }
      case 'slack':   return { type: 'none' };                              // webhook URL carried in step inputs
      case 'email':   return { type: 'api_key', apiKey: process.env.EMAIL_API_KEY ?? '' };
      case 'http': case 'superapp': default: return { type: 'none' };
    }
  };
}
```
Mirrors the linear runner's existing per-step auth (`flow-runner.service.ts:305-345`) so a delayed step
behaves identically to an inline one.

### 5d. Publish
No publish-surface change. `flow.automation` "publishes" by setting `Module.status='PUBLISHED'` +
`activeVersionId`; the runner already only fans out to PUBLISHED flows (`flow-runner.service.ts:91`).
A parked `WorkflowRun` snapshots `workflowJson` at park time (`:668`), so **editing or unpublishing the
source module after a run is parked does not corrupt the in-flight run** — it completes on the graph it
started with. (Trade-off documented in R3.)

---

## 6. Back-compat

- **Recipe schema (F1)** is a new union member — every existing `flow.automation` spec still parses
  unchanged; no data migration.
- **Runner (F4)** adds a new `if` branch; the 9 existing step kinds are untouched. A spec with no `DELAY`
  step runs exactly as before (never touches the engine).
- **`FlowSchedule` cron stays.** Absolute recurrence (nightly loyalty-expiry sweep, weekly digest) keeps
  using `SCHEDULED` + `claimDue`. `DELAY` is *additive* — for relative per-entity waits. A common composite
  pattern combines both: a nightly `SCHEDULED` flow that, per matched row, fans out a `DELAY` chain.
- **Engine unchanged for existing callers.** `resumeDueWorkflowRuns` is new; `startRun`/`resumeRun`
  signatures are untouched. The tests at `workflow-durable-wait.test.ts` continue to pass.
- **No Prisma migration.** Columns + index already exist (`schema.prisma:613-627`).
- **DLQ / rate-limit tables** (still zero-caller) are **out of scope** — this piece does not wire or delete
  them (honesty discipline: they remain an explicit follow-up, not faked).

---

## 7. Test plan

**Unit — recipe (F1)** `packages/core/src/__tests__/recipe.flow-delay.test.ts`
- `DELAY duration` parses; `durationMs` below 60_000 or above 90d rejects.
- `DELAY until` parses with ISO / `{{ref}}`; `duration` mode without `durationMs` rejects; `until` mode
  without `until` rejects.
- An existing 9-step spec with no DELAY still parses (back-compat).

**Unit — park helper (F6)** `apps/web/app/__tests__/flow-park.test.ts`
- `computeResumeAt` duration → `now+durationMs`; until (ISO) → that instant; until (`{{ref}}`) resolves
  from event; invalid `until` throws.
- `parkRemainderAsWorkflow` emits a `wait` head with `inlineThresholdMs:0`, chains remainder steps to
  `end`, snapshots `event` into `variables`.

**Unit — engine sweep (F7)** extend `apps/web/app/__tests__/workflow-durable-wait.test.ts`
- `resumeDueWorkflowRuns` picks up a WAITING run past `resumeAt`, skips a future one.
- CAS: two concurrent sweeps → run resumes exactly once (second sees count 0 / "not parked").
- A resume that re-parks (chained DELAY) leaves a fresh WAITING row with a later `resumeAt`.
- `MAX_RESUMES` overflow → FAILED (already covered by engine; assert via sweep path).
- Unknown/corrupt snapshot → FAILED, not thrown (`:149-171`).

**Integration — linear runner park (F4)** `apps/web/app/__tests__/flow-runner-delay.test.ts` (mock prisma/engine)
- Flow `[email, DELAY 3d, tag]`: email runs inline; a `WorkflowRun` is created WAITING with `resumeAt≈now+3d`
  and the remainder (`tag`) in `workflowJson`; the linear run **returns** (tag NOT run inline).
- Short delay (`durationMs < threshold`) → sleeps inline, no park, tag runs in the same pass.
- DELAY as last step → no park, run completes.
- Redelivery with same `jobId/stepIdx` → unique-violation swallowed, no duplicate park.
- Missing `shopId` → step fails loudly (no silent drop).

**Integration — cron (F8)** extend `apps/web/app/__tests__/api.cron.retention.test.ts` or new `api.cron.resume.test.ts`
- Cron tick calls `resumeDueWorkflowRuns`; response json includes `resumeSweep`.
- Sweep failure is caught (warn), does not 500 the whole cron.

**E2E-ish (manual QA checklist)**
- Author a dunning flow in the builder with a Delay step; publish; trigger; observe a WAITING row in
  `flows._index` "Waiting (N)" tile; fast-forward `resumeAt` (or set a 1-min delay + ≤1-min cron); confirm
  remainder fires and the row goes SUCCEEDED.

**Regression gate:** the existing `workflow-safety.test.ts`, `workflow-engine.test.ts`,
`flow-compile.test.ts` must stay green (engine internals unchanged).

---

## 8. Risks + decisions the human must make

### Risks
- **R1 (make-or-break) — auth context at resume time.** A parked remainder loses the request-scoped
  Shopify `admin`; Shopify-touching steps must resume via the **offline** token in
  `ConnectorToken`/`Shop.accessToken` through `shopify.connector`. If the offline token is missing/expired
  (app uninstalled, scope revoked), those steps fail. Mitigation: (a) `buildShopAuthResolver` loads the
  offline token; (b) the `app/uninstalled` webhook already cancels schedules (`shopify-metaobject-cleanup.job.ts:72`)
  — extend it to also mark that shop's WAITING `WorkflowRun`s CANCELLED so we don't resume into a dead
  shop. **Add F12: cancel WAITING runs on uninstall.**
- **R2 — cron cadence = resume granularity.** A day-3 delay resolves at the first tick after `resumeAt`.
  Fine for dunning/reviews (day-granularity); document that sub-minute precision is not offered. If the
  external cron only fires hourly, delays round up to the hour.
- **R3 — snapshot staleness.** `workflowJson` is frozen at park time; editing the source flow does not
  affect in-flight parked runs. This is *correct* (deterministic resume) but may surprise a merchant who
  "fixed" a flow and expects parked runs to pick up the fix. Document; optionally expose "cancel & restart"
  in the Waiting tile.
- **R4 — unbounded parked backlog.** A high-volume trigger (every order → 14-day DELAY) can accumulate many
  WAITING rows. `limit:25`/tick drains slowly under burst. Mitigation: raise `limit`, or add a per-shop
  WAITING cap with a spawned follow-up for backpressure. Not blocking for the composites' expected volume.
- **R5 — clock skew / long `maxRunSeconds`.** The resumed remainder still runs under the engine's
  900s `maxRunSeconds`; a remainder that itself contains a long inline sleep could TIMED_OUT. Mitigation:
  the park helper only inlines sub-threshold waits; any long wait in the remainder re-parks (already the
  engine's behavior).

### DECISIONS the human must make
1. **Confirm A+ (scoped hybrid) over pure B (lean on Shopify Flow).** The recommendation: **own the
   scheduler** because timed behavior must live inside the module's recipe/preview/publish/version loop.
   Spring-26 Flow ergonomics don't change this — Flow has no author-ownable durable "wait N days on *this*
   entity then continue" our generator can emit and preview. **If the human overrides toward B**, the
   fallback is: emit a Shopify Flow trigger at each step and let a merchant-built Flow do the waiting —
   but then our generated dunning/review sequences are not self-contained and not previewable, which
   contradicts the phase quality bar. Recommend A+.
2. **Cron cadence.** Pick the external cron interval (recommend **≤5 min**) — it sets delay granularity.
   Document in `setup-deploy`/CLAUDE.md.
3. **Uninstall policy (R1).** Confirm F12: cancel WAITING `WorkflowRun`s on `app/uninstalled` (recommend
   yes — avoids resuming into a dead shop).
4. **Scope boundary — DLQ + rate-limit stay unwired.** This piece deliberately does **not** wire
   `DeadLetterService`/`recordAdminThrottle` (still zero-caller). Confirm they remain an explicit
   follow-up, not part of R3.5.
5. **`until`-mode `{{ref}}` surface.** Decide whether v1 ships only `duration` mode (simpler, covers
   dunning/loyalty/review-sequences) and defers `until` (event-relative, e.g. "1 day before renewal") to a
   follow-up. Recommend **duration-only in v1** to shrink the resolution/validation surface; add `until`
   when a composite needs it.

---

## Appendix — why not each pure option
- **Pure A (wire the full DAG engine as the live runner):** biggest blast radius — replaces the working
  linear runner, re-homes 9 live step kinds, risks the whole live flow path for a feature (durable wait)
  we can harvest surgically. Rejected in favor of *reusing the engine only for the parked remainder*.
- **Pure B (lean on Shopify Flow):** loses self-containment/preview/versioning of generated timed modules;
  Flow has no author-ownable per-entity durable wait. Kept as a best-effort notification sink only.
- **Pure C (build a new own-cron):** duplicates the durable table + resume logic that already exists and
  is tested; would ignore the built `WorkflowRun` park/resume. The absolute-cron half of C already ships
  and is retained.
