import type { JobHandler } from '@superapp/job-orchestration';
import {
  ASSET_STORAGE_QUEUE,
  JobEnvelopeSchema,
  PLATFORM_QUEUES,
  type JobEnvelope,
  type PlatformQueueName,
} from '@superapp/platform-contracts';
import { createWorkerHandlers } from './handlers/worker-handlers.js';
import {
  createImageStorageProcessor,
} from './image-storage.js';
import type { CreateStorageAdapterOptions } from './storage/storage-adapter-factory.js';

export type PlatformQueueDispatcherOptions = {
  storageAdapterOptions?: CreateStorageAdapterOptions;
};

export function createPlatformQueueHandlers(
  options: PlatformQueueDispatcherOptions = {},
): Record<PlatformQueueName, JobHandler> {
  const imageProcessor = createImageStorageProcessor({
    storageAdapterOptions: options.storageAdapterOptions,
  });

  const assetStorageHandler: JobHandler = async (job) => {
    const result = await imageProcessor({
      id: job.id,
      queueName: job.queueName,
      payload: job.payload,
      trace: job.trace,
    });
    return {
      status: result.status,
      result: result.result,
      events: result.events,
    };
  };

  const scaffoldHandlers = createWorkerHandlers();

  const handlers = {} as Record<PlatformQueueName, JobHandler>;
  for (const queueName of PLATFORM_QUEUES) {
    if (queueName === ASSET_STORAGE_QUEUE) {
      handlers[queueName] = assetStorageHandler;
    } else {
      const handler = scaffoldHandlers[queueName];
      if (!handler) {
        throw new Error(`No handler registered for queue ${queueName}`);
      }
      handlers[queueName] = handler;
    }
  }

  return handlers;
}

export async function dispatchPlatformQueueJob(
  envelope: JobEnvelope,
  handlers: Partial<Record<PlatformQueueName, JobHandler>>,
): Promise<void> {
  const handler = handlers[envelope.queueName];
  if (!handler) {
    throw new Error(`No handler registered for queue ${envelope.queueName}`);
  }

  const result = await handler(envelope);
  if (result.status === 'FAILED') {
    throw new Error(
      typeof result.result === 'object' && result.result && 'error' in result.result
        ? String((result.result as { error?: { message?: string } }).error?.message)
        : 'Worker job failed',
    );
  }
}

export function parseQueueMessageBody(body: unknown): JobEnvelope | undefined {
  const direct = JobEnvelopeSchema.safeParse(body);
  if (direct.success) {
    return direct.data;
  }

  const legacy = body as {
    id?: string;
    queueName?: string;
    payload?: unknown;
    trace?: JobEnvelope['trace'];
    jobType?: JobEnvelope['jobType'];
  };

  if (!legacy.id || !legacy.queueName) {
    return undefined;
  }

  const envelope = JobEnvelopeSchema.safeParse({
    id: legacy.id,
    queueName: legacy.queueName,
    jobType: legacy.jobType ?? 'IMAGE_INGESTION',
    payload: legacy.payload,
    trace: legacy.trace ?? { correlationId: legacy.id },
  });

  return envelope.success ? envelope.data : undefined;
}
