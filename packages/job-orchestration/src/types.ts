import type { JobEnvelope, PlatformJobType, PlatformQueueName } from '@superapp/platform-contracts';

export type JobHandlerResult = {
  status: 'SUCCESS' | 'FAILED';
  result?: unknown;
  events?: unknown[];
};

export type JobHandler = (job: JobEnvelope) => Promise<JobHandlerResult>;

export type EnqueueJobInput = {
  id: string;
  queueName: PlatformQueueName;
  jobType: PlatformJobType;
  payload: unknown;
  trace: JobEnvelope['trace'];
};

export type EnqueueJobResult =
  | { status: 'queued'; queueName: PlatformQueueName; jobId: string }
  | { status: 'completed'; queueName: PlatformQueueName; jobId: string; handlerResult: JobHandlerResult }
  | { status: 'skipped'; reason: string }
  | { status: 'invalid'; reason: string };

export interface JobQueueAdapter {
  enqueue(input: EnqueueJobInput): Promise<{ queueName: PlatformQueueName; jobId: string }>;
  close(): Promise<void>;
}
