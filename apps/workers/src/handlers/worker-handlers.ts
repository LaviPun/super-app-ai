import type { PlatformQueueName } from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { createAiGenerationHandler } from './ai-generation-handler.js';
import { createConnectorHandler } from './connector-handler.js';
import { createFlowHandler } from './flow-handler.js';
import { createPublishHandler } from './publish-handler.js';
import { createWebhookHandler } from './webhook-handler.js';
import { successResult } from './handler-utils.js';

function retentionHandler(): JobHandler {
  return async (job) =>
    successResult(job, 'retention', { retained: true }, 'Retention scaffold completed');
}

export function createWorkerHandlers(): Partial<Record<PlatformQueueName, JobHandler>> {
  return {
    'ai-generation': createAiGenerationHandler(),
    webhook: createWebhookHandler(),
    flow: createFlowHandler(),
    connector: createConnectorHandler(),
    publish: createPublishHandler(),
    retention: retentionHandler(),
  };
}

/** @deprecated Use createWorkerHandlers */
export function createScaffoldWorkerHandlers(): Partial<Record<PlatformQueueName, JobHandler>> {
  return createWorkerHandlers();
}
