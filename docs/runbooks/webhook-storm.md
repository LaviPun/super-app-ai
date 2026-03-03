# Runbook: Webhook Storm

**Severity:** SEV-2 (flow execution delayed / DLQ growing) → SEV-3 (idempotency contains blast)
**Triggers:** High `WebhookEvent` insert rate, many `FLOW_RUN` jobs in `QUEUED`/`RUNNING`, Shopify webhook retry spikes

---

## 1. Detect

Signs:
- `WebhookEvent` table growing rapidly
- `Job` table has many `FLOW_RUN` entries in `QUEUED` or `RUNNING` state
- Average flow execution latency increasing above SLO (target: P95 < 30 s)
- Merchants reporting delayed automations or duplicate actions

Detection queries:
```sql
-- Events arriving in the last 5 minutes by topic
SELECT shopDomain, topic, COUNT(*) AS count
FROM WebhookEvent
WHERE createdAt > NOW() - INTERVAL '5 minutes'
GROUP BY shopDomain, topic
ORDER BY count DESC;

-- Queue depth
SELECT status, COUNT(*) AS count
FROM Job
WHERE type = 'FLOW_RUN'
  AND createdAt > NOW() - INTERVAL '10 minutes'
GROUP BY status;
```

---

## 2. Triage

### Step 1 — Determine if legitimate or malicious

**Legitimate storm** (flash sale, bulk order import, inventory sync):
```sql
-- All recent events for the storm shop
SELECT topic, COUNT(*) AS events, MIN(createdAt) AS first, MAX(createdAt) AS last
FROM WebhookEvent
WHERE shopDomain = '<storm-shop>'
  AND createdAt > NOW() - INTERVAL '1 hour'
GROUP BY topic;
```

**Signs it's legitimate:** Events map to real Shopify activity (high order volume, bulk product update).

**Signs it's malicious / misconfigured:**
- Unusual topics not registered in the app
- Same `eventId` arriving multiple times from different IPs (replay attack)
- Rate far exceeding normal peak (10× or more)

### Step 2 — Verify idempotency is protecting

```sql
-- Duplicate deliveries silently dropped (same eventId seen multiple times)
SELECT shopDomain, topic, eventId, COUNT(*) AS deliveries
FROM WebhookEvent
WHERE createdAt > NOW() - INTERVAL '30 minutes'
GROUP BY shopDomain, topic, eventId
HAVING COUNT(*) > 1;
```

If this query returns rows — idempotency is **working** (duplicates are recorded but not re-processed).

---

## 3. Contain

### Idempotency is active — no immediate action needed for duplicates

The `checkAndMarkWebhookEvent()` call at the top of every webhook handler ensures exactly-once flow execution. Duplicate deliveries return `HTTP 200` without triggering a new `FLOW_RUN`.

### If queue depth is causing SLO breach

```
1. Check: how many FLOW_RUN jobs are RUNNING simultaneously for the shop?
   SELECT COUNT(*) FROM Job WHERE shopId='<id>' AND type='FLOW_RUN' AND status='RUNNING';

2. FlowRunnerService processes steps sequentially per shop — this naturally throttles.
   No action needed for normal storm; flows will drain.

3. If DLQ growing (FAILED jobs): check ErrorLog for the specific step failure.
   This is likely a downstream API (connector) being slow, not the webhook volume.
```

### For malicious or misconfigured replay attack

```
1. Identify the shopDomain sending the storm
2. Verify HMAC: Shopify signs every webhook with X-Shopify-Hmac-Sha256
   — shopify.authenticate.webhook() validates this; invalid HMACs return 401
3. If a legitimate shop is sending bad data, contact them directly
4. If needed, temporarily drop events for one shop by adding a shop-level block:
   — Add shopId to a block list checked at the start of webhook handlers
```

---

## 4. Fix

| Root cause | Fix |
|---|---|
| Flash sale / bulk import (legitimate) | No fix needed; idempotency handles duplicates; flows drain naturally |
| Shopify retrying due to slow responses | Ensure webhook handlers return 200 quickly (before flow execution); move execution to a background job |
| Misconfigured merchant webhook | Contact merchant; de-register duplicate webhook subscriptions |
| Bug in flow logic causing infinite trigger loop | Identify the flow, disable it in the DB, fix the step logic |

### Emergency: pause all flows for a shop

```sql
-- Disable all active flow schedules for a shop
UPDATE FlowSchedule
SET isActive = false
WHERE shopId = '<shopId>';
```

---

## 5. Post-mortem checklist

- [ ] Did idempotency prevent duplicate processing? (verify `WebhookEvent` unique constraint)
- [ ] Were flows completing within SLO during the storm?
- [ ] Does `FlowRunnerService` need per-shop concurrency limits?
- [ ] Should we add webhook topic-level rate limiting?
- [ ] Update `implementation-status.md` if new webhook types need idempotency guards
