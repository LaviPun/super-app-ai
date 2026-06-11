import type { JobHandler } from '@superapp/job-orchestration';
import type { PlatformQueueName } from '@superapp/platform-contracts';

function scaffoldHandler(queueName: PlatformQueueName, label: string): JobHandler {
  return async (job) => ({
    status: 'SUCCESS',
    result: {
      scaffold: true,
      queueName,
      label,
      jobId: job.id,
      jobType: job.jobType,
    },
    events: [
      {
        type: 'JOB_COMPLETED',
        jobId: job.id,
        queueName,
        trace: job.trace,
        timestamp: new Date().toISOString(),
        progress: 100,
        message: `${label} scaffold handler completed`,
      },
    ],
  });
}

export function createScaffoldWorkerHandlers(): Partial<Record<PlatformQueueName, JobHandler>> {
  return {
    'ai-generation': scaffoldHandler('ai-generation', 'AI generation worker'),
    flow: scaffoldHandler('flow', 'Flow worker'),
    connector: scaffoldHandler('connector', 'Connector worker'),
    publish: scaffoldHandler('publish', 'Publish worker'),
    webhook: scaffoldHandler('webhook', 'Webhook worker'),
    retention: scaffoldHandler('retention', 'Retention worker'),
  };
}
