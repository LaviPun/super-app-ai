# Data Model: Phase 12 — Storage & Image Worker

## StoredAsset (GeneratedAssetMetadata)

Logical asset record returned after successful ingest or export.

| Field | Type | Rules |
|-------|------|-------|
| id | string | min 1 |
| shopId | string | tenant scope |
| moduleId | string | module scope |
| revisionId | string? | optional revision |
| kind | enum | `image_reference`, `generated_mock`, `exported_preview`, etc. |
| storage | StorageObjectRef | provider, bucket, key, size, contentType, visibility |
| checksumSha256 | string | 64-char hex |
| recipeSpecRef | string? | link to RecipeSpec artifact |
| createdAt | ISO datetime | |
| metadata | record | string/number/boolean values |

## StorageObjectRef

| Field | Type | Notes |
|-------|------|-------|
| provider | `local` \| `r2` | |
| bucket | string | logical bucket name |
| key | string | object key path |
| sizeBytes | int ≥ 0 | |
| contentType | string | |
| visibility | `private` \| `signed` \| `public-read` | signed URL fields optional |

## StorageJobPayload (ImageWorkerPayload)

Discriminated union on `type`:

### IMAGE_INGESTION

- Base: jobId, shopId, moduleId, revisionId?, traceId?
- assetId, source: { contentType (image/*), bytesBase64, filename? }

### PREVIEW_EXPORT

- Base fields + assetId
- preview: { contentType: text/html \| application/json, body }
- recipeSpecRef?

### ASSET_CLEANUP

- Base fields + storageKeys: string[] (min 1)

## WorkerJobEvent (ImageWorkerEvent)

Lifecycle: queued → processing → succeeded | failed

Emitted by handler; included in `ImageWorkerResult.events`.

## ImageWorkerResult

| Field | Purpose |
|-------|---------|
| jobId | correlation |
| status | succeeded \| failed |
| assets | stored metadata on success |
| deletedStorageKeys | cleanup confirmation |
| error | { code, message } on failure |
| events | audit trail |

## State transitions

```text
IMAGE_INGESTION:  validate → store bytes → return GeneratedAssetMetadata
PREVIEW_EXPORT:   validate HTML safety → store body → return metadata
ASSET_CLEANUP:    delete keys → return deletedStorageKeys (idempotent on missing)
```
