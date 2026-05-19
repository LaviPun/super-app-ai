import { Worker } from 'bullmq';
import type { QueueName } from '@superapp/platform-contracts';
import { createWorkerBootstrapState } from './bootstrap.js';
import type { WorkerEnv } from './env.js';
import { consoleWorkerLogger, type WorkerLogger } from './logger.js';
import { createProcessorRegistry, type WorkerJobEnvelope } from './processors.js';

type BullWorker = Pick<Worker, 'close'>;

export type WorkerRuntimeOptions = {
  env: WorkerEnv;
  logger?: WorkerLogger;
  processors?: ReturnType<typeof createProcessorRegistry>;
  workerFactory?: (queueName: QueueName, processor: (job: { id?: string; name: string; data: unknown }) => Promise<unknown>) => BullWorker;
};

export type WorkerRuntimeState = {
  started: boolean;
  queues: QueueName[];
  stop(): Promise<void>;
};

export function createWorkerRuntime(options: WorkerRuntimeOptions): WorkerRuntimeState {
  const logger = options.logger ?? consoleWorkerLogger;
  const bootstrap = createWorkerBootstrapState(options.env.WORKER_SERVICE_VERSION);
  const processors = options.processors ?? createProcessorRegistry(logger);
  const workers: BullWorker[] = [];

  const workerFactory = options.workerFactory ?? ((queueName, processor) => {
    if (!options.env.QUEUE_REDIS_URL) {
      throw new Error('QUEUE_REDIS_URL is required for BullMQ worker runtime');
    }
    return new Worker(queueName, processor, {
      connection: { url: options.env.QUEUE_REDIS_URL },
      prefix: options.env.QUEUE_PREFIX,
      concurrency: options.env.WORKER_CONCURRENCY,
    });
  });

  for (const registration of bootstrap.registrations) {
    const processor = processors[registration.type];
    const worker = workerFactory(registration.queueName, async (job) => {
      return processor({
        id: job.id ?? `${registration.type}:unknown`,
        type: registration.type,
        queueName: registration.queueName,
        ...parseJobData(job.data),
      });
    });
    workers.push(worker);
  }

  logger.info('worker runtime started', {
    queues: bootstrap.queues,
    registrations: bootstrap.registrations.length,
    provider: options.env.QUEUE_PROVIDER,
  });

  return {
    started: true,
    queues: bootstrap.queues,
    async stop() {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Worker shutdown timed out')), options.env.WORKER_SHUTDOWN_TIMEOUT_MS);
      });
      await Promise.race([
        Promise.all(workers.map((worker) => worker.close())),
        timeout,
      ]);
      logger.info('worker runtime stopped', { workers: workers.length });
    },
  };
}

function parseJobData(data: unknown): Omit<WorkerJobEnvelope, 'id' | 'type' | 'queueName'> {
  if (!data || typeof data !== 'object') {
    throw new Error('Worker job data must be an object');
  }
  const record = data as {
    payload?: unknown;
    trace?: unknown;
  };
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) {
    throw new Error('Worker job payload must be an object');
  }
  if (!record.trace || typeof record.trace !== 'object') {
    throw new Error('Worker job trace must be an object');
  }
  const trace = record.trace as { requestId?: unknown; correlationId?: unknown; shopId?: unknown };
  if (typeof trace.correlationId !== 'string' || trace.correlationId.length === 0) {
    throw new Error('Worker job trace.correlationId is required');
  }
  return {
    payload: record.payload as Record<string, unknown>,
    trace: {
      requestId: typeof trace.requestId === 'string' ? trace.requestId : undefined,
      correlationId: trace.correlationId,
      shopId: typeof trace.shopId === 'string' ? trace.shopId : undefined,
    },
  };
}
