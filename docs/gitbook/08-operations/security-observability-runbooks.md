# Security, Observability, and Runbooks

## Security controls

- recipe-only AI output model (no arbitrary code deploy)
- strict schema validation at boundaries
- encrypted secrets at rest
- SSRF protection for outbound connector calls
- webhook and callback signature verification
- plan/capability gates before publish

## Logging and observability

- `ApiLog` for request traces
- `ErrorLog` for redacted error events
- `ActivityLog` for domain action trail
- `AiUsage` for token/cost accounting
- request correlation IDs for end-to-end tracing

## Reliability mechanisms

- retry/backoff for provider and flow step execution paths
- persisted job lifecycle for run visibility
- failed jobs retained for investigation/replay
- retention policies and purge workflows

## SLOs and incident response

- **SLOs:** [`slos.md`](../../slos.md)
- **Runbooks hub:** [`runbooks/index.md`](../../runbooks/index.md)
- **Typical incidents:** provider outage, webhook storm, connector failure, publish failure (see index for paths)

## Operational checklist

Before production releases:

- verify env vars and auth setup
- verify plan gates and publish path
- run tests and smoke scenarios
- verify log redaction and request tracing
- review runbook readiness for current release changes
