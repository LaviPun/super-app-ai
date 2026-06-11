import type { ApiEnv } from '../../env.js';
import { createInMemoryRepositoryJobStore, InMemoryJobStore, type JobStore } from './job-store.js';
import { JobOrchestrator } from './job-orchestrator.js';
import { BullMqJobQueue } from '../queue/bullmq-job-queue.js';
import { InMemoryJobQueue, type JobQueue } from '../queue/job-queue.js';
import { InMemoryJobEventStream, type JobEventStream } from '../events/job-event-stream.js';

export type JobSystem = {
  store: JobStore;
  queue: JobQueue;
  events: JobEventStream;
  orchestrator: JobOrchestrator;
};

export function createJobSystem(env: ApiEnv): JobSystem {
  const store = env.JOB_STORE_PROVIDER === 'repository'
    ? createInMemoryRepositoryJobStore()
    : new InMemoryJobStore();
  const queue = env.QUEUE_PROVIDER === 'bullmq'
    ? new BullMqJobQueue(env)
    : new InMemoryJobQueue();
  const events = new InMemoryJobEventStream();

  return {
    store,
    queue,
    events,
    orchestrator: new JobOrchestrator({ env, store, queue }),
  };
}
