import { createJobEvent } from '@superapp/job-orchestration';
import type { JobEnvelope, PlatformQueueName, WorkerEvent } from '@superapp/platform-contracts';
import type { JobHandlerResult } from '@superapp/job-orchestration';
import { emitWorkerTelemetry } from '../telemetry/worker-telemetry.js';

export function workerEvents(
  job: JobEnvelope,
  queueName: PlatformQueueName,
  events: Array<Omit<WorkerEvent, 'timestamp'> & { timestamp?: string }>,
): WorkerEvent[] {
  const parsed = events.map((event) =>
    createJobEvent({
      ...event,
      jobId: event.jobId ?? job.id,
      queueName: event.queueName ?? queueName,
      trace: event.trace ?? job.trace,
    }),
  );
  for (const event of parsed) {
    emitWorkerTelemetry(event);
  }
  return parsed;
}

export function successResult(
  job: JobEnvelope,
  queueName: PlatformQueueName,
  result: unknown,
  message: string,
  progress = 100,
): JobHandlerResult {
  return {
    status: 'SUCCESS',
    result,
    events: workerEvents(job, queueName, [
      {
        type: 'JOB_STARTED',
        jobId: job.id,
        queueName,
        trace: job.trace,
        progress: 0,
        message: `${message} started`,
      },
      {
        type: 'JOB_COMPLETED',
        jobId: job.id,
        queueName,
        trace: job.trace,
        progress,
        message,
      },
    ]),
  };
}

export function failureResult(
  job: JobEnvelope,
  queueName: PlatformQueueName,
  error: { code: string; message: string },
  message: string,
): JobHandlerResult {
  return {
    status: 'FAILED',
    result: { error },
    events: workerEvents(job, queueName, [
      {
        type: 'JOB_FAILED',
        jobId: job.id,
        queueName,
        trace: job.trace,
        progress: 100,
        message,
        metadata: { code: error.code },
      },
    ]),
  };
}
