import type { JobType, WorkerEvent } from '@superapp/platform-contracts';

export type SimulatedJobScenario = {
  jobId: string;
  jobType: JobType;
  events: WorkerEvent[];
};

function event(
  jobId: string,
  queueName: WorkerEvent['queueName'],
  correlationId: string,
  type: WorkerEvent['type'],
  message: string,
  progress?: number,
  metadata?: Record<string, unknown>,
): WorkerEvent {
  return {
    type,
    jobId,
    queueName,
    trace: { correlationId },
    timestamp: new Date().toISOString(),
    progress,
    message,
    metadata,
  };
}

export const simulatedAssistantScenario: SimulatedJobScenario = {
  jobId: 'job_demo_assistant',
  jobType: 'INTERNAL_TOOL_RUN',
  events: [
    event('job_demo_assistant', 'internal-tool-run', 'corr-demo', 'JOB_QUEUED', 'Queued tool run', 0),
    event('job_demo_assistant', 'internal-tool-run', 'corr-demo', 'JOB_STARTED', 'Running local tool adapter', 20),
    event('job_demo_assistant', 'internal-tool-run', 'corr-demo', 'JOB_PROGRESS', 'Streaming partial output', 65),
    event('job_demo_assistant', 'internal-tool-run', 'corr-demo', 'JOB_COMPLETED', 'Tool run complete', 100),
  ],
};

export const simulatedPublishScenario: SimulatedJobScenario = {
  jobId: 'job_demo_publish',
  jobType: 'PUBLISH',
  events: [
    event('job_demo_publish', 'publish-execution', 'corr-demo', 'JOB_QUEUED', 'Publish queued', 0, { phase: 'queued' }),
    event('job_demo_publish', 'publish-execution', 'corr-demo', 'JOB_STARTED', 'Applying theme assets', 35, { phase: 'applying' }),
    event('job_demo_publish', 'publish-execution', 'corr-demo', 'JOB_PROGRESS', 'Verifying storefront metafields', 80, { phase: 'verifying' }),
    event('job_demo_publish', 'publish-execution', 'corr-demo', 'JOB_COMPLETED', 'Published to Shopify', 100, { phase: 'published' }),
  ],
};

export const simulatedConnectorScenario: SimulatedJobScenario = {
  jobId: 'job_demo_connector',
  jobType: 'CONNECTOR_TEST',
  events: [
    event('job_demo_connector', 'connector-execution', 'corr-demo', 'JOB_QUEUED', 'Connector test queued', 0, { phase: 'queued' }),
    event('job_demo_connector', 'connector-execution', 'corr-demo', 'JOB_STARTED', 'Connecting to endpoint', 40, { phase: 'connecting' }),
    event('job_demo_connector', 'connector-execution', 'corr-demo', 'JOB_COMPLETED', 'Connector responded 200', 100, { phase: 'succeeded' }),
  ],
};
