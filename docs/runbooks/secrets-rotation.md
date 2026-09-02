# Secrets Rotation

Value-blind by design: this runbook names secrets, never prints values. The
authoritative env registry is `apps/web/app/env.server.ts` (Zod schema; prod
boot fails fast on missing required vars) + `apps/web/.env.example`.

## ⚠ Known dead key — OWNER ACTION (as of 2026-09-02)

The `ANTHROPIC_API_KEY` set on the Railway services is a **revoked** key: the
env-fallback path silently carries a dead credential, and anything that falls
back to it fails at call time instead of config time.

1. Railway dashboard → superapp → production → `web` → Variables → replace
   `ANTHROPIC_API_KEY` with a fresh key from console.anthropic.com (or DELETE
   the variable if the DB-configured `AiProvider` rows are the only intended
   path — deleting is honest; a dead key is not). Repeat for `worker`.
2. Also remove the revoked key from any GitHub repo secret of the same name
   (used only by the nightly eval flywheel's optional live tier).
3. Redeploy both services; confirm `/internal/ai-providers` test buttons pass.

## Rotation matrix (where each secret lives, what rotation touches)

| Secret | Lives in | Rotate by | Blast radius |
|---|---|---|---|
| `SHOPIFY_API_SECRET` | Railway (web, worker), GH secret (build) | Partners dashboard → rotate → update everywhere → redeploy | All OAuth + webhook HMAC — coordinate; old sessions survive, in-flight webhooks may 401 briefly |
| `ENCRYPTION_KEY` | Railway | **Do not casually rotate** — it decrypts every `*Enc` column (provider keys, Slack webhook, SMTP). Rotation requires a re-encryption migration; treat as a project, not a runbook step | All encrypted-at-rest config |
| `DATABASE_URL` / `REDIS_URL` | Railway (injected refs) | Railway dashboard credential rotation on the Postgres/Redis service | Full app restart |
| `CRON_SECRET` | Railway + GH secret | Generate new → set BOTH (Railway first, then GH) → next tick verifies; also used by `/healthz/deep` + smoke workflow | Cron ticks 401 during the mismatch window |
| `INTERNAL_ADMIN_PASSWORD` / `INTERNAL_ADMIN_SESSION_SECRET` | Railway | Set new → redeploy; all internal sessions invalidate | Internal admin logins |
| AI provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) | Railway env AND/OR `AiProvider` rows (encrypted, via /internal/ai-providers) | Prefer rotating in `/internal/ai-providers` (no redeploy); env keys need a redeploy | Generation fallback chain |
| `DATABASE_BACKUP_URL` | GH secret | Railway Postgres TCP-proxy string; prefer a read-only role | Nightly backups only |
| `SENTRY_DSN`, monitor API keys | Railway env / AppSettings (encrypted) | Provider dashboard → update → redeploy or /internal/integrations | Observability only |

## Rules

- Never echo a secret into a shell command line that gets logged; use the
  Railway/GitHub dashboards or `railway variable set` in a private terminal.
- After ANY rotation: `curl /healthz`, then the relevant integration's test
  button in `/internal/integrations`, then check `ErrorLog` for auth errors.
- A leaked secret is an incident, not a rotation: rotate immediately, then
  audit `ApiLog`/provider dashboards for misuse during the exposure window.
