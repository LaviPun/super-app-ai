# Worker Job Contracts — Phase 12

Source of truth: `packages/platform-contracts/src/storage.ts`

## Queue

| Queue name | Job types |
|------------|-----------|
| `asset-storage` | `IMAGE_INGESTION`, `PREVIEW_EXPORT`, `ASSET_CLEANUP` |

## Handler boundary

**Module**: `apps/workers/src/image/image-worker.ts`  
**Method**: `ImageWorkerHandler.handle(payload: ImageWorkerPayload): Promise<ImageWorkerResult>`

## Error codes (non-exhaustive)

| Code | When |
|------|------|
| `R2_UNAVAILABLE` | R2 requested without binding |
| `SIGNED_URL_NOT_CONFIGURED` | Signed URL requested (deferred) |
| `INVALID_PREVIEW_HTML` | Script or inline handler in preview body |
| `VALIDATION_ERROR` | Zod parse failure on payload |

## Events

Each result includes `events[]` with `ImageWorkerEventSchema` entries for observability (no secrets/PII in messages).

## Integration contract (future)

Remix services enqueue via shared job registry once `jobs.ts` merge completes:

```typescript
// Pseudocode — actual API defined in platform-contracts jobs module post-merge
enqueue('asset-storage', ImageWorkerPayloadSchema.parse(payload));
```
