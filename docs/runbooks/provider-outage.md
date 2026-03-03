# Runbook: AI Provider Outage

**Severity:** SEV-2 (AI generation unavailable) → SEV-3 (one provider down, fallback active)
**Triggers:** Spike in `ErrorLog` AI errors, `AiUsage` shows request failures, merchants report "Module generation failed"

---

## 1. Detect

Signs:
- Merchants get errors from "Generate Module" form
- `ErrorLog` shows `AI provider HTTP 5xx` or connection timeout errors
- `AiUsage` shows `requestCount` entries with no corresponding module creation
- `/internal/jobs` shows `FAILED` jobs of type `AI_GENERATE`

Automated detection query:
```sql
SELECT provider, COUNT(*) AS failures
FROM ErrorLog
WHERE message LIKE '%AI provider%'
  AND createdAt > NOW() - INTERVAL '15 minutes'
GROUP BY provider
ORDER BY failures DESC;
```

---

## 2. Triage

### Step 1 — Identify which provider is failing

```
1. Go to /internal/api-logs
2. Filter: path contains 'openai.com' or 'anthropic.com' or custom base URL
3. Look for status=5xx or status=0 (timeout) entries
```

```sql
SELECT meta->>'provider' AS provider,
       meta->>'model' AS model,
       status,
       COUNT(*) AS count
FROM ApiLog
WHERE actor = 'INTERNAL'
  AND path LIKE '%/v1/%'
  AND success = false
  AND createdAt > NOW() - INTERVAL '30 minutes'
GROUP BY provider, model, status
ORDER BY count DESC;
```

### Step 2 — Check provider status pages

| Provider | Status page |
|---|---|
| OpenAI | https://status.openai.com |
| Anthropic | https://status.anthropic.com |
| Azure OpenAI | https://azure.status.microsoft.com |
| Custom / self-hosted | Check your deployment |

### Step 3 — Confirm scope (all shops or one shop)

```sql
-- Is the failure isolated to one shop's custom provider?
SELECT s.shopDomain, COUNT(*) AS failures
FROM ErrorLog e
JOIN Shop s ON s.id = e.shopId
WHERE e.message LIKE '%AI provider%'
  AND e.createdAt > NOW() - INTERVAL '30 minutes'
GROUP BY s.shopDomain
ORDER BY failures DESC;
```

---

## 3. Contain

### Immediate: switch the global active provider

```
1. Go to /internal/ai-providers
2. Find an alternative active provider (different vendor)
3. Click "Set as global active"
4. Verify: trigger a test generation for a low-risk module type
```

### If no backup provider exists:
```
1. Set the active provider to null (disables AI generation globally)
2. Merchants see: "AI generation temporarily unavailable" from QuotaService
3. Publish and rollback still work
```

### Per-shop override (if a shop has a custom provider configured):
```
1. Go to /internal/stores
2. Find the affected shop
3. Set "AI provider override" to the working global provider
4. Save
```

---

## 4. Fix

| Root cause | Fix |
|---|---|
| Provider status incident | Wait for provider recovery; switch back after |
| API key expired / rotated | Update key in /internal/ai-providers for the affected provider |
| Model deprecated | Change model name in provider config (e.g. `gpt-4` → `gpt-4o`) |
| Custom endpoint misconfigured | Check baseUrl, headers in provider config |
| Rate limit on provider account | Upgrade plan with provider or reduce `aiRequestsPerMonth` quota |

### Verify recovery

```bash
# Run the evals harness against the restored provider
pnpm --filter web evals
# Expect: schemaValidRate ≥ 0.90, compilerSuccessRate ≥ 0.90
```

---

## 5. Post-mortem checklist

- [ ] How long was generation unavailable?
- [ ] Were merchants notified proactively?
- [ ] Was the fallback provider switch done within SLO (1 hour for SEV-2)?
- [ ] Was the provider outage caused by our usage patterns (prompt too long, quota exceeded)?
- [ ] Should we add a second fallback provider to ensure HA?
- [ ] Update provider retry settings if timeouts need adjustment (`timeoutMs` in `ai-http.server.ts`)
