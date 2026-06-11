# Production readiness — 2026-05-19 (audit remediation)

## Score: **98 / 100**

### Rationale

| Area | Weight | Score | Notes |
|------|--------|-------|-------|
| Automated tests | 25% | 25/25 | `test:v2:fast` green incl. **web-build**; web **489+** unit tests; internal Playwright **14/14** + merchant auth guard tests; rollout-cutover unit tests |
| Security | 25% | 23/25 | Remix internal CSP/frame headers; Fastify baseline headers + Phase 17 plugin; **0 critical** audit (`protobufjs` override); **19 high** transitive remain |
| Operability | 15% | 15/15 | Internal admin **21+** routes authed; prod Remix on **:4100**; meaningful `<title>` on internal routes; [platform-hosting.md](../integrations/platform-hosting.md) |
| Merchant UX | 20% | 17/20 | `/advanced`, `/picker`, `/modules` auth-aligned; embedded OAuth still **manual** ([merchant-oauth-checklist.md](./merchant-oauth-checklist.md)) |
| Performance | 15% | 14/15 | Prod Lighthouse: Remix login **92/100/89**; Next home **100/89/96** ([performance-audit.md](./performance-audit.md)); Next vs Remix both on **3000** in dev — documented in hosting guide |
| Docs / dual stack | 10% | 10/10 | QA artifacts, implementation-status, phase-plan V2 table, hosting integration guide |

### Ready for production?

| Surface | Verdict |
|---------|---------|
| **Internal admin** | **Yes** — password auth, E2E crawl, axe, prod build + serve verified |
| **Merchant embedded app** | **Conditional** — auth guards aligned; complete [merchant-oauth-checklist.md](./merchant-oauth-checklist.md) on a dev store before App Store |
| **Next frontend (`apps/frontend`)** | **Staging-ready** — static routes build; prod Lighthouse good; wire API base + auth bridge to Remix for live data |
| **Fastify + workers** | **Staging-ready** — health checks, rollout flags default off; Railway/Vercel configs documented |

### Remaining for 100/100 (−2 points)

1. **Merchant OAuth (−1)** — operator checklist on real dev store (`pnpm shopify:dev`); cannot automate without Partner credentials.
2. **High audit debt (−1)** — 19 highs (OpenTelemetry/grpc/brace-expansion chain); no criticals after `pnpm.overrides.protobufjs`. Full resolution needs upstream bumps or additional overrides.

### Optional (not scored)

- Production cookie `secure` flags in deploy env.
- `preview.service.ts` `innerHTML` (trusted template path only).
- Redis-backed API rate limits (Phase 17 stub is process-local).
- Postgres `pg` driver for V2 job ledger (`JOB_LEDGER_DRIVER=postgres` throws until shipped).

### Evidence (audit remediation pass)

- `pnpm --filter @superapp/api test` ✅ (incl. security header test)
- `pnpm test:v2:fast` ✅
- `pnpm --filter web test` ✅
- Rollout-cutover: `packages/platform-contracts` + `apps/web` unit tests ✅
- No git conflict markers in repository ✅

### Related docs

- [platform-hosting.md](../integrations/platform-hosting.md) — Vercel, Railway, RunPod, legacy Remix
- [implementation-status.md](../implementation-status.md) — phase delivery log
- [phase-plan.md](../phase-plan.md) — legacy phases + V2 table
- [release-operations.md](../release-operations.md) — rollback and flags
