# Tasks: Phase 13 — Preview Sandbox

**Input**: [spec.md](./spec.md), [platform-v2-migration-plan.md](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)

**Status on master**: Shipped (2026-06-12)

## Phase checklist

- [x] T001 Review Phase 13 acceptance criteria in migration plan
- [x] T002 Add preview envelope contracts in `packages/platform-contracts/src/preview.ts`
- [x] T003 Add Fastify preview routes (`/v1/preview/.../envelope`, `/content`)
- [x] T004 Add Next.js preview sandbox shell (`apps/frontend/app/preview/...`)
- [x] T005 Add gitbook page under `docs/gitbook/02-architecture/v2-migration/phase-13-preview-sandbox.md`
- [x] T006 Update [`000-platform-v2-master/spec.md`](../000-platform-v2-master/spec.md) matrix row to Shipped

## Verification

- [x] T007 `pnpm test` for affected packages
- [x] T008 Typecheck affected packages
