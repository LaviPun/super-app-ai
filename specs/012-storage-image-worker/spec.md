# Feature Specification: Phase 12 — Storage & Image Worker

**Feature Branch**: `012-storage-image-worker`

**Created**: 2026-06-12

**Status:** Shipped (worktree 2026-06-12); BullMQ enqueue + inline processing live on `master`

**Input**: Phase 12 of Platform V2 migration — offload generated/reference images and RecipeSpec preview artifacts from Prisma to a worker boundary with pluggable storage (local dev, R2 production).

**Related docs**: `docs/gitbook/02-architecture/v2-migration/phase-12-storage-image-worker.md`, `docs/phase-plan.md` § Phase 12

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store generated images outside the database (Priority: P1)

When the platform produces or receives image bytes (AI-generated assets, reference uploads), operators and downstream jobs need durable storage without bloating Prisma or exposing storage credentials to merchants.

**Why this priority**: Unblocks scalable asset handling for all later phases (previews, theme analysis, storefront delivery).

**Independent Test**: Enqueue `IMAGE_INGESTION` with valid payload; verify object exists at returned storage key via local adapter; unit tests in `apps/workers` pass.

**Acceptance Scenarios**:

1. **Given** valid image bytes and metadata in an `IMAGE_INGESTION` job, **When** the image worker processes the job, **Then** the asset is stored and a structured result (storage key, metadata) is returned.
2. **Given** local storage is configured, **When** no R2 binding is present, **Then** the local adapter is used by default without merchant-visible errors.
3. **Given** R2 is requested without a binding, **When** storage adapter is created, **Then** the system fails with `R2_UNAVAILABLE` server-side only (never surfaced to merchants).

---

### User Story 2 - Export RecipeSpec preview artifacts (Priority: P2)

Merchants preview module output before publish; preview HTML/JSON must be persisted as artifacts for audit, sharing, and async regeneration without re-running the full Remix path on every request.

**Why this priority**: Separates preview persistence from web request lifecycle; required before wiring Remix to enqueue exports.

**Independent Test**: Enqueue `PREVIEW_EXPORT` with RecipeSpec-safe preview content; verify stored artifact and rejection of unsafe HTML.

**Acceptance Scenarios**:

1. **Given** preview HTML derived from RecipeSpec (no scripts), **When** `PREVIEW_EXPORT` runs, **Then** artifact is stored and retrievable by storage key.
2. **Given** preview HTML containing `<script>` or inline event handlers, **When** validation runs, **Then** the job fails safely without storing malicious content.

---

### User Story 3 - Clean up stored assets (Priority: P3)

When modules are unpublished or assets are superseded, stored objects must be deleted to control cost and comply with retention expectations.

**Why this priority**: Operational hygiene; depends on ingest/export being in place first.

**Independent Test**: Store an object, enqueue `ASSET_CLEANUP` with its key, verify object no longer exists.

**Acceptance Scenarios**:

1. **Given** a known storage key, **When** `ASSET_CLEANUP` runs, **Then** the object is removed from the active storage provider.
2. **Given** a missing or already-deleted key, **When** cleanup runs, **Then** the worker completes without leaking secrets in logs.

---

### Edge Cases

- Missing or corrupt image bytes on ingestion → structured job failure, no partial writes.
- Oversized payloads → bounded by worker/queue policy (document limits in plan phase).
- Concurrent ingest + cleanup on same key → last-writer wins; cleanup after ingest must not resurrect deleted assets.
- Signed URL requests before API proxy exists → `SIGNED_URL_NOT_CONFIGURED` (deferred to later phase).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST define Zod-validated storage and worker contracts in `packages/platform-contracts` (metadata, payloads, events, results).
- **FR-002**: System MUST support `IMAGE_INGESTION`, `PREVIEW_EXPORT`, and `ASSET_CLEANUP` job types on the `asset-storage` queue.
- **FR-003**: System MUST provide a storage adapter factory with local (default) and R2 (binding-injected) implementations.
- **FR-004**: System MUST process jobs through an `ImageWorkerHandler` boundary that emits `JOB_*` lifecycle events.
- **FR-005**: System MUST reject unsafe preview HTML (scripts, inline handlers) before persistence.
- **FR-006**: System MUST keep R2 credentials and signing logic server-side; merchants never receive raw bucket credentials.
- **FR-007**: System MUST ship unit tests for contracts, adapters, and worker handler (happy path + edge cases).
- **FR-008**: System MUST NOT deploy arbitrary merchant code; RecipeSpec JSON remains the only merchant-authored executable surface.

### Key Entities

- **StoredAsset**: Logical asset with storage key, content type, size, provenance metadata, tenant/shop scope.
- **PreviewArtifact**: RecipeSpec-linked preview export (HTML/JSON) with safety validation gate.
- **StorageJobPayload**: Discriminated union by `type` (`IMAGE_INGESTION` | `PREVIEW_EXPORT` | `ASSET_CLEANUP`).
- **WorkerJobEvent**: Lifecycle events (`JOB_STARTED`, `JOB_COMPLETED`, `JOB_FAILED`) for observability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `pnpm --filter @superapp/platform-contracts test` and `typecheck` pass in CI.
- **SC-002**: `pnpm --filter @superapp/workers test` and `typecheck` pass in CI.
- **SC-003**: All three job types are test-covered with at least one happy-path and one failure/edge test each.
- **SC-004**: No secrets or PII appear in worker logs during test runs.
- **SC-005**: Merge to main registers job types in shared `platform-contracts` job registry without breaking Phase 9–11 processors.

## Assumptions

- BullMQ queue wiring is provided by `@superapp/job-orchestration` and `@superapp/workers` worker runtime.
- Remix preview generation calls `schedulePreviewExport()` when `PREVIEW_EXPORT_QUEUE_ENABLED=1`; inline mode processes immediately; queue mode enqueues to `asset-storage` when Redis is configured.
- `THEME_ANALYZE` reuses storage adapters in a future phase; not part of this spec's MVP.
- Signed URL / API proxy delivery remains Phase 18+ (documented stub only).

## Out of Scope (Phase 12)

- Merchant-facing signed URL generation and CDN proxy routes.
- Full production R2 deployment wiring (binding injection path is implemented; ops config is later).
- Rewriting Phase 9–11 worker processors or `jobs.ts` routing (merge-time registration only).
