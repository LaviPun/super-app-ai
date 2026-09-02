# SuperApp Runbooks — Index

Runbooks for the most common incident types. Each runbook follows the same
structure: **Detect → Triage → Contain → Fix → Post-mortem**.

---

## Incident severity ladder

| Severity | Description | Response time | Example |
|---|---|---|---|
| **SEV-1** | Storefront broken or data loss risk | 15 min | Published module breaks checkout for all orders |
| **SEV-2** | Feature unavailable, no storefront impact | 1 hour | AI generation failing for all shops |
| **SEV-3** | Degraded UX, workaround exists | 4 hours | Slow preview, one provider down, rate limits elevated |
| **SEV-4** | Minor issue / cosmetic / single shop | Next business day | Connector test returning wrong sample format |

---

## Runbook list

| Runbook | Trigger | Severity range |
|---|---|---|
| [Deploy + rollback](./deploy-and-rollback.md) | Deploy failed / bad build cut over / red master | SEV-1 – SEV-3 |
| [Postgres down](./db-down.md) | `/healthz` 503 with `db: fail` | SEV-1 |
| [Restore from backup](./restore-from-backup.md) | Data loss / corrupt DB | SEV-1 |
| [Publish failure](./publish-failure.md) | Job table: `FAILED` / `PUBLISH` | SEV-1 – SEV-2 |
| [Redis down](./redis-down.md) | `/healthz` 503 with `redis: fail` | SEV-2 |
| [Provider outage](./provider-outage.md) | AI generation errors spike / provider dead / credits exhausted | SEV-2 – SEV-3 |
| [Webhook storm](./webhook-storm.md) | `WebhookEvent` insert rate spike / webhook backlog | SEV-2 – SEV-3 |
| [Connector failure](./connector-failure.md) | Connector test / flow sync failures | SEV-3 – SEV-4 |
| [Cron not ticking](./cron-not-ticking.md) | `/healthz/deep` `cronHeartbeat` warn/fail; no `CRON_TICK` activity rows; scheduled sweeps not running | SEV-2 – SEV-3 |
| [Secrets rotation](./secrets-rotation.md) | Rotation need / leaked or dead key (see its dead-`ANTHROPIC_API_KEY` owner action) | — |

**Top-5 failure modes → runbook:** deploy failed → deploy-and-rollback · db
down → db-down · redis down → redis-down · AI provider dead/credit-exhausted →
provider-outage · webhook backlog → webhook-storm.

**On-call reality (solo founder):** there is no rotation — alerting must reach
one phone. The alert path is `OpsAlertService` (Sentry + Slack + email once
keys are configured in `/internal/integrations`), the cron ops-health sweep
(every 5 min from the worker's in-process scheduler; banner in the internal
admin even with no keys), and GitHub
issues from the backup/smoke/restore-verify workflows. Response times in the
severity ladder above are aspirations for waking hours; the containment
designs (previous deploy keeps serving, jobs queue rather than drop, additive
migrations) are what make overnight gaps survivable.

---

## First responder checklist (any incident)

```
1. Identify shop: grab shopDomain from the report or error log
2. Get requestId / jobId from the error message shown to the merchant
3. Check ErrorLog:  SELECT * FROM ErrorLog WHERE shopId = '...' ORDER BY createdAt DESC LIMIT 20
4. Check ApiLog:   SELECT * FROM ApiLog WHERE shopId = '...' ORDER BY createdAt DESC LIMIT 20
5. Check Jobs:     SELECT * FROM Job  WHERE shopId = '...' ORDER BY createdAt DESC LIMIT 10
6. Open the relevant runbook below
7. Share requestId + summary with the merchant ("We're investigating — ref: <requestId>")
```

---

## Key internal admin links

| Page | URL |
|---|---|
| Jobs + DLQ | `/internal/jobs` |
| Error logs | `/internal/logs` |
| API logs | `/internal/api-logs` |
| AI providers | `/internal/ai-providers` |
| Stores | `/internal/stores` |
| Usage / costs | `/internal/usage` |
