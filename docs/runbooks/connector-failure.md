# Runbook: Connector Failure

**Severity:** SEV-3 (integration sync broken) → SEV-4 (single shop, workaround available)
**Triggers:** Connector test returning errors, flow steps using connector failing, SSRF block alerts

---

## 1. Detect

Signs:
- Merchant reports "Connector test failed" in the Connectors UI
- Flow steps of kind `CONNECTOR_CALL` are failing in `FlowStepLog`
- `ApiLog` shows `path LIKE '%/connector%'` entries with `success = false`
- `ErrorLog` contains SSRF block errors: `"Host is not allowlisted"` or `"Private network hosts are blocked"`

Detection queries:
```sql
-- Connector call failures in the last hour
SELECT shopId, path, status, COUNT(*) AS failures
FROM ApiLog
WHERE path LIKE '%/connector%'
  AND success = false
  AND createdAt > NOW() - INTERVAL '1 hour'
GROUP BY shopId, path, status
ORDER BY failures DESC;

-- SSRF attempts (security alert)
SELECT shopId, message, createdAt
FROM ErrorLog
WHERE (message LIKE '%allowlisted%' OR message LIKE '%Private network%' OR message LIKE '%Only https%')
ORDER BY createdAt DESC
LIMIT 20;
```

---

## 2. Triage

### Step 2a — SSRF block (security incident)

**This is a security event.** A connector attempted to reach a private/non-allowlisted host.

```
1. Identify the connector: check ErrorLog shopId + meta for connectorId
2. Check the connector's baseUrl and allowlistDomains in the DB:
   SELECT id, name, baseUrl, allowlistDomains FROM Connector WHERE id = '<id>';
3. Determine: misconfiguration or deliberate abuse?
   - Misconfiguration: merchant entered a local IP or internal hostname by mistake
   - Deliberate: suspicious baseUrl like 169.254.169.254 (AWS metadata), 10.x.x.x, etc.
4. If deliberate: escalate, disable the connector, review the shop for other suspicious activity
```

### Step 2b — External API error (4xx / 5xx from target)

```sql
SELECT meta FROM ApiLog
WHERE path LIKE '%/connector%' AND success = false
ORDER BY createdAt DESC LIMIT 5;
-- Look at meta.responseBodySha256 — if meta is available check status field
```

| Status code | Likely cause |
|---|---|
| 401 / 403 | API key expired, rotated, or wrong permissions |
| 404 | Endpoint path wrong; API version changed |
| 429 | Rate limited by the external API |
| 5xx | External service outage |
| Timeout | External API slow; 10 s timeout hit |

### Step 2c — Flow step failures

```sql
SELECT step, kind, status, error, durationMs
FROM FlowStepLog
WHERE shopId = '<shopId>'
  AND status = 'FAILED'
ORDER BY createdAt DESC
LIMIT 10;
```

---

## 3. Contain

### For SSRF block (security)
```
1. Disable the connector immediately:
   UPDATE Connector SET allowlistDomains = '' WHERE id = '<connectorId>';
   (empty allowlist causes all tests to fail safely)
2. Notify the merchant that the connector has been suspended pending review
3. Investigate the shop's other connectors for similar patterns
```

### For 401 / API key expired
```
1. Merchant must update the connector secret:
   - Go to /connectors
   - Delete and recreate the connector with the new API key
   (Secrets are encrypted with AES-256-GCM; no admin can retrieve the raw key)
2. Test the connector from the UI after update
```

### For external 5xx / timeout
```
1. Check the external service status page
2. Flows will retry (up to 2× with exponential backoff) — check FlowStepLog for retry attempts
3. If persistent: advise merchant to temporarily disable flows using this connector
```

---

## 4. Fix

| Root cause | Fix |
|---|---|
| SSRF violation (misconfiguration) | Merchant corrects baseUrl; review allowlistDomains |
| SSRF violation (abuse) | Disable connector + shop review + escalate |
| Expired API key | Merchant recreates connector with new credentials |
| Wrong endpoint path | Merchant updates the path in the flow step config |
| External service outage | Wait for recovery; flows retry automatically |
| Timeout (slow API) | Increase `timeoutMs` in `ConnectorService.test()` (default: 10 000 ms) |

---

## 5. Post-mortem checklist

- [ ] Was the SSRF block logged and acted on within SLO?
- [ ] Did the merchant have a clear error message explaining what went wrong?
- [ ] Are secret rotation instructions in the merchant docs (`docs/app.md`)?
- [ ] Should the allowlist validation be tightened (add DNS resolution check)?
- [ ] Was the flow retry logic sufficient, or did the merchant need manual intervention?
