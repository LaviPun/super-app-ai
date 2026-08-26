# Platform V2 — Phase 9 Webhook And Flow Workers

**Status:** Local/testable ingress and worker foundations complete; production cutover blocked by live Shopify runtime wiring, durable webhook audit persistence, and V2 flow persistence  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 9

## Legacy source paths inspected

- `apps/web/app/routes/webhooks.tsx`
- `apps/web/app/routes/webhooks.orders.create.tsx`
- `apps/web/app/routes/webhooks.products.update.tsx`
- `apps/web/app/routes/api.flow.run.tsx`
- `apps/web/app/services/flows/flow-runner.service.ts`
- `apps/web/app/services/flows/idempotency.server.ts`

Legacy webhook handlers authenticate through Remix Shopify helpers and then synchronously call `FlowRunnerService.runForTrigger`. V2 moves the durable work behind `WEBHOOK_RECEIVED` and `FLOW_RUN`.

## Local V2 slice implemented

| Area | Implementation |
|------|----------------|
| Webhook ingress | `POST /v1/webhooks/shopify` accepts Shopify headers, preserves raw JSON body for HMAC verification, dedupes by deterministic idempotency key, enqueues `WEBHOOK_RECEIVED`, and returns `202` quickly |
| Flow run ingress | `POST /v1/flows/run` enqueues manual/scheduled/webhook-triggered `FLOW_RUN` jobs with replay metadata |
| Worker boundary | `WebhookFlowAdapter`, `createWebhookProcessor`, `createFlowRunProcessor`, and topic-to-trigger mapping for legacy flow triggers |
| Replay | `FLOW_RUN` supports `replayOfJobId` in the payload and replay enqueue requests are idempotent by default |
| Schedule semantics | `FlowRunPayloadSchema` explicitly includes `SCHEDULED`; scheduled flows no longer need fake `MANUAL` semantics in V2 contracts |
| Shared contract edit | `FlowTriggerSchema` now covers the legacy flow trigger set; `WebhookReceivedPayloadSchema` includes `receivedAt` for trace/audit joins |
| Tests | API dedupe, Shopify header/HMAC, replay idempotency, scheduled trigger, worker adapter, trigger mapping, and failed-flow replayability tests |

## Production cutover blockers

- Webhook receipts/audits need the Phase 15 SQL persistence implementation.
- Flow step logs and replay UI need V2 data models before replacing Remix `FlowRunnerService`.
- Live Redis/BullMQ is still required to verify queue-to-worker execution outside mocks.

## Safety notes

- Fastify handlers enqueue only; no long flow execution is added to request handlers.
- External connector/network execution remains deferred to Phase 10.
- No Remix behavior was changed.
- No Phase 8 internal assistant files were edited; the only shared file edit was the platform job contract.
