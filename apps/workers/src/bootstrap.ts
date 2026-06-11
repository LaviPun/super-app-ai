import { JobTypeQueueName, JobTypeSchema, QueueNameSchema, type JobType, type QueueName } from '@superapp/platform-contracts';

export const WORKER_SERVICE_VERSION = '0.1.0';

/** Queue names aligned with Platform V2 migration plan §6.2 */
export const QUEUE_NAMES = QueueNameSchema.options;

export type WorkerJobRegistration = {
  type: JobType;
  queueName: QueueName;
};

export type WorkerBootstrapState = {
  version: string;
  queues: QueueName[];
  supportedJobTypes: JobType[];
  registrations: WorkerJobRegistration[];
};

export function createWorkerBootstrapState(version = WORKER_SERVICE_VERSION): WorkerBootstrapState {
  const supportedJobTypes = JobTypeSchema.options;
  return {
    version,
    queues: [...QUEUE_NAMES],
    supportedJobTypes,
    registrations: supportedJobTypes.map((type) => ({
      type,
      queueName: JobTypeQueueName[type],
    })),
  };
}
