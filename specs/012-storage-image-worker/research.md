# Research: Phase 12 — Storage & Image Worker

## Decision: Local-first storage adapter with optional R2

**Rationale**: Developers run workers without Cloudflare bindings; production injects R2 at deploy time. Factory selects adapter from env/binding presence.

**Alternatives considered**:
- Prisma BYTEA blobs — rejected (DB bloat, poor CDN path)
- S3-only adapter — rejected (platform standard is R2 for Workers alignment)
- Single adapter interface — chosen (local + R2 implement same `StorageAdapter`)

## Decision: Discriminated union job payloads in platform-contracts

**Rationale**: Phase 9–11 may own `jobs.ts` routing; storage schemas stay isolated in `storage.ts` for clean merge.

**Alternatives considered**:
- Inline payloads in worker only — rejected (violates schema-at-boundaries)
- GraphQL-style single payload — rejected (weaker validation for job types)

## Decision: Preview HTML safety gate before persist

**Rationale**: Constitution V — block `<script>`, inline event handlers before writing preview artifacts.

**Alternatives considered**:
- DOMPurify in worker — deferred (add if HTML complexity grows)
- Regex-only scan — chosen for MVP with explicit test cases

## Decision: Signed URLs out of scope for Phase 12

**Rationale**: Requires API proxy + CDN policy; stub `SIGNED_URL_NOT_CONFIGURED` only.

**Alternatives considered**:
- Direct R2 presigned in worker — rejected for this phase (credential exposure risk in logs/errors)

## Decision: Spec Kit feature dir `012-storage-image-worker`

**Rationale**: Aligns with V2 phase numbering in `docs/phase-plan.md` and gitbook migration docs.
