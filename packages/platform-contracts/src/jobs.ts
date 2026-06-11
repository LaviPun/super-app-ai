import { z } from 'zod';
import {
  ImageWorkerJobTypeSchema,
  ImageWorkerPayloadSchema,
  type ImageWorkerPayload,
} from './storage';

export const ASSET_STORAGE_QUEUE = 'asset-storage' as const;

export type AssetStorageQueueName = typeof ASSET_STORAGE_QUEUE;

export const ImageWorkerJobType = ImageWorkerJobTypeSchema;
export type ImageWorkerJobType = z.infer<typeof ImageWorkerJobTypeSchema>;

export const IMAGE_WORKER_JOB_TYPES = ImageWorkerJobTypeSchema.options;

export const IMAGE_WORKER_QUEUE_BY_TYPE: Record<ImageWorkerJobType, AssetStorageQueueName> = {
  IMAGE_INGESTION: ASSET_STORAGE_QUEUE,
  PREVIEW_EXPORT: ASSET_STORAGE_QUEUE,
  ASSET_CLEANUP: ASSET_STORAGE_QUEUE,
};

export const ASSET_STORAGE_JOB_REGISTRY = {
  queue: ASSET_STORAGE_QUEUE,
  jobTypes: IMAGE_WORKER_JOB_TYPES,
  queueByType: IMAGE_WORKER_QUEUE_BY_TYPE,
} as const;

export function resolveImageWorkerQueue(jobType: ImageWorkerJobType): AssetStorageQueueName {
  return IMAGE_WORKER_QUEUE_BY_TYPE[jobType];
}

export function parseImageWorkerPayload(payload: unknown): ImageWorkerPayload {
  return ImageWorkerPayloadSchema.parse(payload);
}

export function safeParseImageWorkerPayload(payload: unknown) {
  return ImageWorkerPayloadSchema.safeParse(payload);
}

export function isImageWorkerJobType(value: string): value is ImageWorkerJobType {
  return ImageWorkerJobTypeSchema.safeParse(value).success;
}
