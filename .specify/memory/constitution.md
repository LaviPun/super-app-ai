# SuperApp Platform Constitution

## Core Principles

### I. RecipeSpec-Only Merchant Surface

Merchants never deploy arbitrary code. AI and compilers output RecipeSpec JSON only. Extensions read config from metafields; no per-store compiled code.

### II. Schema at Boundaries

Validate with Zod at API, worker, and contract boundaries. Shared types live in `packages/platform-contracts` and `packages/core`; apps consume, do not fork schemas.

### III. Test-First Shipping (NON-NEGOTIABLE)

Every phase ships unit tests for new logic, happy-path and edge-case coverage, and tests that assert no secrets/PII in logs. Run package-scoped `test` and `typecheck` before merge.

### IV. SOLID Services

Keep services pure and testable. Workers handle async boundaries; Remix routes stay thin. Prefer config-driven generic extensions over bespoke store logic.

### V. Security & SSRF

Network calls use SSRF protections and allowlists. Storage credentials (R2, API keys) stay server-side. Preview HTML must reject scripts and inline handlers.

### VI. Performance & CWV

Storefront outputs must be Core Web Vitals friendly. Avoid heavy frontend dependencies in merchant-facing surfaces.

## Monorepo Structure

- `apps/web` — Remix embedded app (routes + services)
- `apps/workers` — async job processors (storage, image, future queues)
- `packages/core` — recipe schema, capability gating, module catalog
- `packages/platform-contracts` — cross-service Zod contracts and job payloads
- `extensions/*` — generic Shopify extensions reading metafields

## Phase-Based V2 Migration

Work is organized in numbered phases (see `docs/phase-plan.md`, `docs/gitbook/02-architecture/v2-migration/`). Each phase should have a Spec Kit feature directory under `specs/` aligned with phase number when applicable (e.g. `012-storage-image-worker`).

## Development Workflow

- Follow `codechange-behave.md` for any code change behavior verification.
- Follow `global-audit.md` for security and quality audits.
- Update `docs/implementation-status.md`, README, and relevant gitbook pages when shipping a phase.
- New module "templates" are added only as catalogId + schema + compiler + tests.

## Governance

This constitution guides Spec Kit artifacts (`spec.md`, `plan.md`, `tasks.md`) and all AI-assisted implementation. When `.cursorrules` or project rules conflict with a spec, escalate and amend the constitution or spec before coding.

**Version**: 1.0.0 | **Ratified**: 2026-06-12 | **Last Amended**: 2026-06-12
