/**
 * Image-storage modules in this app use the platform (Cloudflare-queue) event
 * shape. Aliased to the historical local names so ported imports keep
 * working; the legacy BullMQ `WorkerEvent` remains available directly from
 * `@superapp/platform-contracts`.
 *
 * Ported from apps/workers/src/worker-events.ts (V2 salvage, D2/C5).
 */
export {
  PlatformWorkerEventSchema as WorkerEventSchema,
  type PlatformWorkerEvent as WorkerEvent,
} from '@superapp/platform-contracts';
