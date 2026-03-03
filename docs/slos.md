# Service Level Objectives (SLOs) — SuperApp

SLOs define the measurable reliability targets for the app. Each SLO includes:
- **Target** — the numeric goal
- **Error budget** — how much failure is acceptable per 30-day window
- **Measurement query** — SQL against the `ApiLog` / `Job` / `AiUsage` tables, or OTel metric
- **Alert threshold** — when to page (burn rate > 2× for SEV-2; burn rate > 10× for SEV-1)

---

## SLO 1 — Module Publish Success Rate

**Goal:** Merchant publish attempts succeed.

| Metric | Target |
|---|---|
| Publish success rate | ≥ 99.5% over 30 days |
| Error budget | 0.5% = ~216 failed publishes per 100 publishes/day |

**Measurement:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / COUNT(*) AS success_rate_pct,
  COUNT(*) FILTER (WHERE status = 'FAILED')                      AS failed,
  COUNT(*)                                                        AS total
FROM Job
WHERE type = 'PUBLISH'
  AND createdAt > NOW() - INTERVAL '30 days';
```

**OTel span:** `POST /api/publish` — span duration + status code.

**Alert:** Page if success rate drops below 98% over any 1-hour window.

---

## SLO 2 — Publish Latency (P95)

**Goal:** Merchants are not left waiting.

| Metric | Target |
|---|---|
| Publish P95 latency | < 10 s |
| Publish P99 latency | < 30 s |

**Measurement:**
```sql
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY durationMs) AS p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY durationMs) AS p99_ms,
  AVG(durationMs) AS avg_ms
FROM ApiLog
WHERE path LIKE '%/api/publish%'
  AND success = true
  AND createdAt > NOW() - INTERVAL '7 days';
```

**OTel span:** `POST /api/publish` — histogram.

---

## SLO 3 — AI Module Generation Success Rate

**Goal:** AI generation reliably produces valid modules.

| Metric | Target |
|---|---|
| AI generate success rate | ≥ 95% over 30 days |
| Schema-valid rate (evals) | ≥ 99% on golden-prompt regression suite |

**Measurement (live traffic):**
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'SUCCESS') * 100.0 / COUNT(*) AS success_rate_pct,
  COUNT(*) FILTER (WHERE status = 'FAILED')                      AS failed
FROM Job
WHERE type = 'AI_GENERATE'
  AND createdAt > NOW() - INTERVAL '30 days';
```

**Measurement (regression suite, runs in CI):**
```bash
pnpm --filter web evals
# Reports: schemaValidRate, compilerSuccessRate, nonDestructiveRate
# Thresholds: EVAL_THRESHOLD_SCHEMA=0.90, EVAL_THRESHOLD_COMPILER=0.90, EVAL_THRESHOLD_ND=1.0
```

**Alert:** Page if live success rate drops below 90% over 1 hour.

---

## SLO 4 — Webhook Processing Latency (P95)

**Goal:** Automation flows run close to real-time.

| Metric | Target |
|---|---|
| Webhook → flow start P95 | < 30 s |
| Flow step execution P95 | < 10 s per step |

**Measurement:**
```sql
-- Flow step latency
SELECT
  step,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY durationMs) AS p95_ms,
  COUNT(*) FILTER (WHERE status = 'FAILED')                 AS failures
FROM FlowStepLog
WHERE createdAt > NOW() - INTERVAL '7 days'
GROUP BY step
ORDER BY p95_ms DESC;

-- Overall flow run latency
SELECT
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY durationMs) AS p95_ms
FROM ApiLog
WHERE path LIKE '%/api/flow%' AND success = true
  AND createdAt > NOW() - INTERVAL '7 days';
```

---

## SLO 5 — API Availability

**Goal:** The app is available when merchants need it.

| Metric | Target |
|---|---|
| HTTP 2xx/3xx response rate (all merchant routes) | ≥ 99.9% over 30 days |
| Downtime budget | < 43 minutes/month |

**Measurement:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status < 500) * 100.0 / COUNT(*) AS availability_pct,
  COUNT(*) FILTER (WHERE status >= 500)                    AS server_errors
FROM ApiLog
WHERE actor = 'MERCHANT'
  AND createdAt > NOW() - INTERVAL '30 days';
```

**OTel:** `http.server.request.duration` histogram — filter `http.response.status_code >= 500`.

---

## SLO 6 — Error Rate

**Goal:** Unexpected server errors are rare.

| Metric | Target |
|---|---|
| Unhandled server error rate | < 0.5% of all merchant requests |

**Measurement:**
```sql
SELECT
  COUNT(*) FILTER (WHERE level = 'ERROR') * 100.0 / NULLIF(COUNT(*), 0) AS error_rate_pct,
  COUNT(*) FILTER (WHERE level = 'ERROR')                                 AS errors,
  COUNT(*)                                                                 AS total_logged
FROM ErrorLog
WHERE createdAt > NOW() - INTERVAL '30 days';
```

---

## SLO Review cadence

| Review | Frequency |
|---|---|
| SLO burn rate check | Daily (automated alert) |
| Error budget review | Weekly (engineering sync) |
| SLO target revision | Quarterly |

---

## Error budget policy

| Burn rate | Action |
|---|---|
| > 10× for 5 min | SEV-1 page; follow relevant runbook immediately |
| > 2× for 1 hour | SEV-2 ticket; fix within SLO response window |
| < 2× | No page; track in weekly review |

---

## Dashboard setup (Grafana / Honeycomb / Datadog)

All metrics are available via two sources:

1. **SQL queries** — run against the Prisma-managed database (tables: `ApiLog`, `Job`, `FlowStepLog`, `ErrorLog`).
2. **OTel traces** — when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, span data flows to your configured backend.

Recommended panels:
- Publish success rate (30-day rolling)
- AI generate success rate (30-day rolling)
- P95 publish latency (7-day rolling)
- P95 webhook-to-flow latency (7-day rolling)
- Error rate by route (7-day rolling)
- Active provider + model usage (by `AiUsage.providerId`)
