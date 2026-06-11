# Implementation Plan: Phase 4 — Next.js Embedded Frontend Skeleton

**Branch**: TBD | **Date**: 2026-06-12 | **Spec**: [spec.md](./spec.md)

## Summary

apps/frontend App Router, Shopify shell, Polaris, typed Fastify client; no backend logic in Next API routes.

## Technical context

- **Canonical architecture**: [`platform-v2-migration-plan.md`](../../docs/gitbook/02-architecture/platform-v2-migration-plan.md)
- **ADR**: [`ADR-001-platform-v2-architecture.md`](../../docs/gitbook/02-architecture/v2-migration/ADR-001-platform-v2-architecture.md)
- **Dependencies**: Prior V2 phases per migration plan ordering.

## Next steps

1. Set `export SPECIFY_FEATURE=004-next-frontend`
2. Run `/speckit-plan` to expand this stub with concrete file paths and package layout.
3. Run `/speckit-tasks` for dependency-ordered checklist.
4. Run `/speckit-implement` when ready to code.

## Constitution check

Align with [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md): Zod at boundaries, SOLID services, no merchant code deployment.
