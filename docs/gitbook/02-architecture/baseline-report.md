# Platform V2 — Baseline Report (Phase 0)

Captured before any V2 behavior or monorepo scaffolding changes to production Remix paths.

## Git snapshot

| Field | Value |
|-------|-------|
| Branch | `vr/v2` |
| Commit SHA | `1b0df9d6442d1f60eb14975edda8f0eccba2907c` |
| Commit message | `v1: ignore local Playwright auth and test output.` |
| Captured | 2026-05-19 (Asia/Kolkata) |
| Authoritative plan | [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) |

## Baseline check results

Commands run from repo root unless noted.

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| Install | `pnpm install --frozen-lockfile` | **PASS** | Lockfile up to date; 7 workspace packages |
| Prisma validate | `pnpm --filter web exec prisma validate` | **PASS** | SQLite provider; schema valid |
| Typecheck | `pnpm --filter web typecheck` | **PASS** | `tsc --noEmit` clean |
| Lint | `pnpm --filter web lint` | **PASS** | 89 warnings, under `--max-warnings 100` |
| Unit tests | `pnpm --filter web test` | **PASS** | 476 passed, 16 skipped (live evals), 57 files |
| Production build | `pnpm --filter web build` | **FAIL** | Remix Vite: `internal.ai-assistant.probe.tsx` imports `~/env.server` in a route export visible to client bundle |
| AI evals | `pnpm evals` | **FAIL** | Forbidden-surface gate 50.0% (5/10) vs threshold 90.0%; other gates 100% |

### Build failure detail

```
[commonjs--resolver] Server-only module referenced by client
  '~/env.server' imported by route 'app/routes/internal.ai-assistant.probe.tsx'
```

**Impact:** Production `remix vite:build` blocked. Dev/test paths still run. Not fixed in Phase 0 (no Remix behavior changes).

### Evals failure detail

Stub LLM eval suite: discount/shipping/payment/validation/flow-order prompts fail forbidden-surface gate (function/checkout surfaces not rejected by stub). Schema, compiler, non-destructive, and allowed-values gates all pass at 100%.

## Summary counts

| Artifact | Count |
|----------|------:|
| Remix route modules | 117 |
| Service modules (`apps/web/app/services`) | 115 |
| Prisma models | 39 |
| Sync job ledger call sites (create → start → work inline) | 12 |
| Direct `prisma.job.create` (no JobService) | 2 |

## Phase 0 acceptance

- No Remix production behavior changes in this phase.
- Known baseline failures documented (build, evals).
- Inventories and ADR linked from [SUMMARY.md](../../SUMMARY.md).

## Re-run commands

```bash
pnpm install --frozen-lockfile
pnpm --filter web exec prisma validate
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm evals
```
