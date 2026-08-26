# Security audit summary — 2026-05-19

## Trust boundaries (verified in code review)

| Boundary | Mechanism | Status |
|----------|-----------|--------|
| LLM → deploy | `RecipeSpec` Zod schema + compiler only | Strong |
| Outbound HTTP | `assertSafeTargetUrl` + connector allowlists (`ssrf.server.ts`) | Present |
| Secrets in logs | `redact.server.ts`, Sentry scrubbing | Present |
| Preview artifacts | CSP `script-src 'none'`, sandbox iframe, `previewShellResponse` | Improved this pass |
| Internal admin | Cookie session + `requireInternalAdmin`, constant-time password compare | Present |

## Dependency audit

`pnpm audit` (2026-05-19 continuation): **37** issues — **0 critical**, **19 high**, **18 moderate.

- **Mitigation:** root `pnpm.overrides.protobufjs: ">=8.0.1"` removes critical protobufjs advisory path.
- **Remaining highs:** OpenTelemetry → `@grpc/grpc-js`, `brace-expansion`, and other transitive chains — track upgrades; document accepted risk per advisory if no patch without major bump.

## Findings

### Resolved — DOM `innerHTML` for delete forms

`connectors._index.tsx` and `flows._index.tsx` now use hidden Remix `<Form>` + `requestSubmit()` (no `innerHTML`).

### Medium — Preview demo script `innerHTML`

`preview.service.ts` sets `innerHTML` for in-preview action log UI; content is derived from compiled spec strings (schema-bounded). Lower risk than arbitrary merchant HTML.

### Resolved — Merchant routes without session

`/advanced`, `/picker`, and `/modules` (unauthenticated) return **410** (or auth redirect codes). `/modules` authenticates before DB access so auth `Response` is not converted to HTTP 500.

### Blocker — Full embedded auth testing

Shopify OAuth + iframe session not available in headless CI without dev store credentials. API/agent routes were not fuzzed this pass.

## AI / prompt injection

- Module generator constrained to RecipeSpec JSON (workspace rules).
- `llm-code-execution-guard.test.ts` and prompt audit tests present.
- Internal prompt router uses schema-validated decisions.

## Secrets in repo

- `.env` gitignored; only `.env.example` tracked.
- No live API keys found in tracked source (spot check + gitignore).

## CSRF / cookies

- Remix POST routes use session cookies; Shopify app uses `@shopify/shopify-app-remix` session storage.
- Internal admin: HttpOnly session via `internalSessionStorage` (verify `secure`/`sameSite` in production deploy config — not changed this pass).
