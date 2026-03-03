# Internal Developer Admin Dashboard

This dashboard is for the **app owner** (your team), not merchants.
It is protected by `INTERNAL_ADMIN_PASSWORD` and an optional SSO (OIDC) flow.

---

## Features

- Configure AI providers (OpenAI / Anthropic / Azure OpenAI / Custom OpenAI-compatible)
- Set the global active provider; override per store
- View AI usage and approximate costs (30-day window)
- View error logs (auto-redacted — no secrets/PII)
- View API logs with requestId correlation
- View installed stores and basic stats
- View and monitor background jobs (AI generation, publish, connector tests, flow runs, theme analysis)
- Per-step flow execution logs for debugging automations

---

## Routes

| Route | Purpose |
|---|---|
| `/internal/login` | Password or SSO login |
| `/internal` | Dashboard home (store count, error count, AI calls 24h) |
| `/internal/ai-providers` | Add/activate AI providers + set model pricing |
| `/internal/usage` | AI usage + costs (last 30 days) |
| `/internal/logs` | Error logs (auto-redacted) |
| `/internal/api-logs` | API access logs with actor, path, status, duration, requestId |
| `/internal/jobs` | Background job list (QUEUED/RUNNING/SUCCESS/FAILED) |
| `/internal/stores` | Installed stores; set per-store AI provider override |
| `/internal/sso/start` | Initiates OIDC SSO flow |
| `/internal/sso/callback` | OIDC callback handler |
| `/internal/logout` | Clears internal admin session |

---

## Security

- Protected via `INTERNAL_ADMIN_PASSWORD` + HttpOnly session cookie.
- Supports OIDC SSO (Google OAuth, Okta, etc.) via `INTERNAL_SSO_*` env vars.
- In production: add IP allowlist + MFA in front of `/internal/*`.

---

## SSO setup

Set these env vars to enable SSO login on the `/internal/login` page:

```
INTERNAL_SSO_ISSUER=https://accounts.google.com
INTERNAL_SSO_CLIENT_ID=your-oauth-client-id
INTERNAL_SSO_CLIENT_SECRET=your-oauth-client-secret
INTERNAL_SSO_REDIRECT_URI=https://your-app.example.com/internal/sso/callback
```

---

## AI provider management

Use `/internal/ai-providers` to:
1. Add a provider (name, type, API key, base URL, default model)
2. Set it as the global active provider
3. Set per-store overrides via `/internal/stores`
4. Add model pricing (cents per 1M tokens) for accurate cost tracking

### Provider types supported
- `OPENAI` — uses `/v1/responses` API with `json_schema` strict mode
- `ANTHROPIC` — uses Messages API with structured output
- `AZURE_OPENAI` — OpenAI-compatible with Azure base URL
- `CUSTOM` — any OpenAI-compatible endpoint (tries `/v1/responses`, falls back to `/v1/chat/completions`)

---

## Jobs and DLQ

The `/internal/jobs` page shows all background tasks.
Failed jobs (`status=FAILED`) are the **dead-letter queue (DLQ)** — they persist for investigation.
To replay a failed flow: `POST /api/flow/run` with the shop's event data.

Flow jobs also produce per-step logs (`FlowStepLog`) for granular debugging.

---

## API Logs

`/internal/api-logs` shows all significant API calls:
- Actor: `MERCHANT | INTERNAL | WEBHOOK | APP_PROXY`
- Path, method, status, duration
- `requestId` — matches the `x-request-id` response header for client correlation
- Shop domain

---

## Provider HTTP clients

Provider calls:
- Use structured JSON schema output enforcement (`zodToJsonSchema` → sent as `json_schema`)
- Log request/response metadata (status, duration, provider request ID, SHA-256 body hashes)
- Raw prompts/outputs are **not** persisted in logs by default
- Retry 429/5xx with exponential backoff; non-retryable 4xx errors fail immediately

---

## Model pricing

Use `/internal/ai-providers` to add per-model pricing (cents per 1M tokens).
Cost is computed per AI call and stored in `AiUsage.costCents`.

Example (GPT-4o pricing):
- Input: `250` cents / 1M tokens
- Output: `1000` cents / 1M tokens
