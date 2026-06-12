/**
 * Image-storage and platform-queue modules in this app use the platform
 * (Cloudflare-queue) event shape. Aliased to the historical local names so
 * existing imports keep working; the legacy BullMQ `WorkerEvent` remains
 * available directly from `@superapp/platform-contracts`.
 */
export {
  PlatformWorkerEventSchema as WorkerEventSchema,
  type PlatformWorkerEvent as WorkerEvent,
} from '@superapp/platform-contracts';
