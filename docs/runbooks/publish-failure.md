# Runbook: Publish Failure

**Severity:** SEV-1 (storefront impact) → SEV-2 (module unavailable)
**Triggers:** Merchant reports "Publish failed", Job status = `FAILED` with `type = PUBLISH`

---

## 1. Detect

Signs of this incident:
- Merchant gets error banner: "Publish failed"
- `/internal/jobs` shows `FAILED` jobs of type `PUBLISH`
- `ErrorLog` contains errors from `PublishService` or Shopify Theme/Metafield API

Automated alert query (run periodically or set as a cron alert):
```sql
SELECT shopId, COUNT(*) AS failures
FROM Job
WHERE type = 'PUBLISH'
  AND status = 'FAILED'
  AND createdAt > NOW() - INTERVAL '1 hour'
GROUP BY shopId
ORDER BY failures DESC;
```

---

## 2. Triage

### Step 1 — Get the job and request context

```
1. Go to /internal/jobs, filter type=PUBLISH, status=FAILED
2. Note the jobId, shopId, createdAt, and payload (contains moduleId, version, themeId)
3. Get the requestId from the matching ApiLog entry:
   SELECT requestId FROM ApiLog
   WHERE shopId = '<shopId>' AND path LIKE '%publish%'
   ORDER BY createdAt DESC LIMIT 5;
```

### Step 2 — Read the error

```sql
SELECT message, stack, meta FROM ErrorLog
WHERE shopId = '<shopId>'
ORDER BY createdAt DESC
LIMIT 10;
```

### Step 3 — Identify the root cause

| Error message pattern | Cause | Severity |
|---|---|---|
| `"themeId missing"` | Merchant published without selecting a theme | SEV-3 |
| `"Module not found"` | Module was deleted between draft and publish | SEV-3 |
| `"Shopify API HTTP 422"` | Invalid asset key or value rejected by Shopify | SEV-2 |
| `"Shopify API HTTP 429"` | Shopify REST rate limit hit | SEV-3 |
| `"Shopify API HTTP 5xx"` | Shopify backend error | SEV-2 (check status.shopify.com) |
| `"Capability not allowed"` | Shop on wrong plan for this module type | SEV-3 |
| `"Non-destructive check failed"` | Compiled ops contain unsafe operations — **block** | SEV-1 |

---

## 3. Contain

### For SEV-1 (non-destructive violation)
```
1. DO NOT retry the publish
2. Roll back immediately: POST /api/rollback { moduleId, version: <previous> }
3. If storefront is broken, ask merchant to use /admin/themes to revert
4. Escalate to engineering — review compiler output for the failing RecipeSpec
```

### For Shopify API 429 (rate limit)
```
1. Wait 60 seconds — Shopify REST API recovers automatically
2. Merchant can retry from /modules/<id> using the Publish button
3. If persistent: check AiUsage — are there too many parallel publish operations?
   SELECT COUNT(*) FROM Job WHERE type='PUBLISH' AND status='RUNNING' AND shopId='<id>';
```

### For Shopify 5xx
```
1. Check https://status.shopify.com
2. Retry is safe — publish operations are idempotent (THEME_ASSET_UPSERT replaces)
3. Advise merchant to retry in 5 minutes
```

---

## 4. Fix

| Root cause | Fix |
|---|---|
| Wrong themeId | Merchant selects correct theme in preview/publish UI |
| Module spec invalid | Regenerate module with AI; previous spec may have had bad content |
| Shopify rate limit | Automatic recovery; no action needed |
| Non-destructive violation | Review and fix the compiler rule; regenerate the module |
| Plan mismatch | Merchant upgrades plan or uses a different module type |

### Manual rollback (admin)
```
POST /api/rollback
{ "moduleId": "<id>", "version": <last-good-version-number> }
Authorization: Shopify session
```

---

## 5. Post-mortem checklist

- [ ] Was the error logged with a `requestId`?
- [ ] Was the merchant notified with a clear message referencing the requestId?
- [ ] Did the non-destructive check catch the issue, or did it slip through?
- [ ] If Shopify-side: file issue at partners.shopify.com with the requestId
- [ ] Update the compiler or schema if a new unsafe pattern was discovered
