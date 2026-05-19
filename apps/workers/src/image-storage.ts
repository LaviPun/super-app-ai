import { ImageWorkerPayloadSchema } from '@superapp/platform-contracts';
import { ImageWorkerHandler } from './image/image-worker.js';
import { createStorageAdapter, type CreateStorageAdapterOptions } from './storage/storage-adapter-factory.js';
import type { StorageAdapter } from './storage/storage-adapter.js';
import type { WorkerEvent } from './worker-events.js';

export type ImageStorageJobEnvelope = {
  id: string;
  queueName: string;
  payload: unknown;
  trace: {
    requestId?: string;
    correlationId: string;
    shopId?: string;
  };
};

export type ImageStorageProcessorResult = {
  status: 'SUCCESS' | 'FAILED';
  events: WorkerEvent[];
  result?: unknown;
};

export type ImageStorageProcessorOptions = {
  storage?: StorageAdapter;
  storageAdapterOptions?: CreateStorageAdapterOptions;
  now?: () => Date;
};

const queueByPayloadType: Record<string, string> = {
  IMAGE_INGESTION: 'asset-storage',
  PREVIEW_EXPORT: 'asset-storage',
  ASSET_CLEANUP: 'asset-storage',
};

export function createImageStorageProcessor(options: ImageStorageProcessorOptions = {}) {
  const storage =
    options.storage ?? createStorageAdapter(options.storageAdapterOptions ?? {});
  const handler = new ImageWorkerHandler({ storage, now: options.now });

  return async (job: ImageStorageJobEnvelope): Promise<ImageStorageProcessorResult> => {
    const parsed = ImageWorkerPayloadSchema.safeParse(mergeJobEnvelope(job));
    const queueName =
      job.queueName ||
      (parsed.success ? queueByPayloadType[parsed.data.type] : undefined) ||
      'asset-storage';

    const started = workerEvent(job, queueName, 'JOB_STARTED', 5, 'Image storage job started');

    if (!parsed.success) {
      return {
        status: 'FAILED',
        events: [
          started,
          workerEvent(job, queueName, 'JOB_FAILED', 100, 'Image storage payload is invalid.', {
            issues: parsed.error.flatten(),
          }),
        ],
      };
    }

    const validated = workerEvent(
      job,
      queueName,
      'JOB_PROGRESS',
      20,
      `${parsed.data.type} payload validated`,
    );

    const workerResult = await handler.handle(parsed.data);
    const succeeded = workerResult.status === 'succeeded';

    if (!succeeded) {
      return {
        status: 'FAILED',
        result: workerResult,
        events: [
          started,
          validated,
          workerEvent(job, queueName, 'JOB_FAILED', 100, workerResult.error?.message ?? 'Image storage job failed.', {
            code: workerResult.error?.code,
            workerEvents: workerResult.events,
          }),
        ],
      };
    }

    return {
      status: 'SUCCESS',
      result: workerResult,
      events: [
        started,
        validated,
        workerEvent(job, queueName, 'JOB_PROGRESS', 90, `${parsed.data.type} storage adapter completed`, {
          assetIds: workerResult.assets.map((asset) => asset.id),
          deletedStorageKeys: workerResult.deletedStorageKeys,
        }),
        workerEvent(job, queueName, 'JOB_COMPLETED', 100, `${parsed.data.type} completed`, {
          assetIds: workerResult.assets.map((asset) => asset.id),
          deletedStorageKeys: workerResult.deletedStorageKeys,
        }),
      ],
    };
  };
}

function mergeJobEnvelope(job: ImageStorageJobEnvelope): unknown {
  if (!job.payload || typeof job.payload !== 'object') {
    return { jobId: job.id };
  }

  const payload = job.payload as Record<string, unknown>;
  return {
    ...payload,
    jobId: typeof payload.jobId === 'string' ? payload.jobId : job.id,
  };
}

function workerEvent(
  job: ImageStorageJobEnvelope,
  queueName: string,
  type: WorkerEvent['type'],
  progress: number,
  message: string,
  metadata?: Record<string, unknown>,
): WorkerEvent {
  return {
    type,
    jobId: job.id,
    queueName,
    trace: job.trace,
    timestamp: new Date().toISOString(),
    progress,
    message,
    metadata,
  };
}
