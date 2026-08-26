# Platform V2 — Phase 16 Observability And Product Analytics

**Status:** Local/testable work complete; production OTel/Sentry/PostHog backends blocked on deployment wiring  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 16

## Implemented foundation

| Area | Implementation |
|------|----------------|
| Shared package | `packages/observability` — redaction, W3C trace propagation, structured logging, Sentry capture shapes, PostHog browser/server boundaries |
| Trace contracts | `TraceContextSchema` extended with optional `traceparent` / `tracestate` in `@superapp/platform-contracts` |
| API plugin | `apps/api/src/plugins/observability.ts` extracts inbound trace headers, echoes them on responses, merges trace into job enqueue, and shapes Sentry captures on errors |
| Worker runtime | `apps/workers` uses `@superapp/observability` logger + `runWithObservabilityContext` around processors and preserves queue trace fields |
| Product analytics boundary | Browser allowlist + server-only property guards documented in `packages/observability/src/posthog.ts` |

## Trace propagation

Inbound API requests may include:

- `x-request-id`
- `x-correlation-id`
- `traceparent`
- `tracestate`

`POST /v1/jobs` merges the request trace context with the client-provided `trace` envelope before enqueue. BullMQ payloads carry the serialized trace object to workers, which rehydrate observability context before processor execution.

## PostHog separation

| Surface | Allowed examples | Blocked examples |
|---------|------------------|------------------|
| Browser (`apps/frontend`) | `route`, `moduleCatalogId`, `planTier`, `experimentKey` | `shopDomain`, `prompt`, `payload`, tokens, email |
| Server (`apps/api`, `apps/workers`, Remix) | queue/job/provider operational metrics | n/a — still must pass through redaction helpers before export |

Browser events should use `filterBrowserPostHogProperties()`; server events must never be initialized with the public PostHog project key in merchant bundles.

## Runtime configuration

Local/test defaults require no external observability backends:

```bash
NODE_ENV=test
```

Optional production hooks (not required for Phase 16 local gates):

```bash
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_SERVICE_NAME=superapp-api
POSTHOG_API_KEY=            # server only
NEXT_PUBLIC_POSTHOG_KEY=    # browser only, non-secret project key
```

## Verification

```bash
pnpm --filter @superapp/observability test
pnpm --filter @superapp/platform-contracts test
pnpm --filter @superapp/api test
pnpm --filter @superapp/workers test
```

Latest gate results are tracked in `docs/implementation-status.md`.

## Blockers

- Production NodeSDK / OTLP exporter wiring remains in `apps/web` only; V2 API/workers use portable trace carrier fields without auto-instrumentation yet.
- Internal queue/job/trace dashboards and PostHog project setup are deployment tasks (Phase 18).
- Legacy Remix observability helpers under `apps/web/app/services/observability/` remain the production path until V2 cutover.

## Merge risks

- Touches shared `TraceContextSchema` in `@superapp/platform-contracts` — coordinate with any branch adding queue trace fields.
- API job route now merges inbound request trace context — clients sending partial trace objects inherit server headers by design.
