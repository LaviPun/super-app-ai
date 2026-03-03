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
| [Publish failure](./publish-failure.md) | Job table: `FAILED` / `PUBLISH` | SEV-1 – SEV-2 |
| [Provider outage](./provider-outage.md) | AI generation errors spike | SEV-2 – SEV-3 |
| [Webhook storm](./webhook-storm.md) | `WebhookEvent` insert rate spike | SEV-2 – SEV-3 |
| [Connector failure](./connector-failure.md) | Connector test / flow sync failures | SEV-3 – SEV-4 |

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
