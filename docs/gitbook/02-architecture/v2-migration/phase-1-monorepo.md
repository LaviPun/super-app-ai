# Platform V2 — Phase 1 Monorepo Scaffolding

**Status:** Complete (with Phases 2–4 building on this layout)  
**Plan reference:** [platform-v2-migration-plan.md](../platform-v2-migration-plan.md) § Phase 1

## Created packages

| Path | Package name | Role |
|------|--------------|------|
| `apps/frontend` | `@superapp/frontend` | Next.js embedded shell (expanded Phase 4) |
| `apps/api` | `@superapp/api` | Fastify gateway (expanded Phase 3) |
| `apps/workers` | `@superapp/workers` | BullMQ worker process bootstrap |
| `packages/platform-contracts` | `@superapp/platform-contracts` | Shared Zod contracts (Phase 2) |

## Boundary rules

1. **`apps/web` unchanged** for merchant behavior in Phase 1.
2. New apps **must not** import from `apps/web`.
3. Shared types flow through `@superapp/platform-contracts` and `@superapp/core`.
4. Each app has its own `package.json`, `tsconfig.json`, Vitest config, and `build` script.

## Phase 1 test gate (per app)

```bash
pnpm --filter @superapp/api typecheck && pnpm --filter @superapp/api test && pnpm --filter @superapp/api build
pnpm --filter @superapp/workers typecheck && pnpm --filter @superapp/workers test && pnpm --filter @superapp/workers build
pnpm --filter @superapp/frontend typecheck && pnpm --filter @superapp/frontend test && pnpm --filter @superapp/frontend build
```

## Phase completion notes (2026-05-19)

| Package | typecheck | test | build |
|---------|-----------|------|-------|
| `@superapp/platform-contracts` | ✅ | ✅ 6 tests | ✅ |
| `@superapp/api` | ✅ | ✅ 3 tests | ✅ |
| `@superapp/workers` | ✅ | ✅ 1 test | ✅ |
| `@superapp/frontend` | ✅ | ✅ 1 test | ✅ Next 15.5 |
| `web` (legacy regression) | — | ✅ 476 passed | ❌ pre-existing |

Legacy `web build` failure unchanged (not in Phase 0–4 scope).

## Next phase

**Phase 5 — Job orchestration and BullMQ:** `JobStore`, `JobQueue`, `JobOrchestrator`, Redis config, inline vs queue execution modes. See migration plan § Phase 5.
