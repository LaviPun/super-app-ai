import { JobPayloadByType, type JobType, type QueueName, type WorkerEvent } from '@superapp/platform-contracts';
import { createAiGenerationProcessor, StubAiGenerationAdapter, type AiGenerationAdapter } from './ai-generation.js';
import {
  createInternalAssistantProcessor,
  StubInternalAssistantAdapter,
  type InternalAssistantAdapter,
} from './internal-assistant.js';
import {
  createFlowRunProcessor,
  createWebhookProcessor,
  StubWebhookFlowAdapter,
  type WebhookFlowAdapter,
} from './webhook-flow.js';
import {
  createConnectorCallProcessor,
  createConnectorTestProcessor,
  createStubConnectorHttpClient,
  defaultConnectorHttpClient,
  StubConnectorExecutionAdapter,
  type ConnectorExecutionAdapter,
  type ConnectorHttpClient,
} from './connector-execution.js';
import type { WorkerLogger } from './logger.js';

export type WorkerJobEnvelope = {
  id: string;
  type: JobType;
  queueName: QueueName;
  payload: Record<string, unknown>;
  trace: {
    requestId?: string;
    correlationId: string;
    shopId?: string;
  };
};

export type WorkerProcessorResult = {
  status: 'SUCCESS' | 'FAILED';
  events: WorkerEvent[];
};

export type WorkerProcessor = (job: WorkerJobEnvelope) => Promise<WorkerProcessorResult>;

const migrationPhaseByType: Record<JobType, string> = {
  AI_GENERATE: 'Phase 7',
  AI_HYDRATE: 'Phase 7',
  AI_MODIFY: 'Phase 7',
  INTERNAL_TOOL_RUN: 'Phase 8',
  PUBLISH: 'Phase 11',
  CONNECTOR_TEST: 'Phase 10',
  CONNECTOR_CALL: 'Phase 10',
  FLOW_RUN: 'Phase 9',
  WEBHOOK_RECEIVED: 'Phase 9',
  THEME_ANALYZE: 'Phase 12',
  RETENTION_RUN: 'Phase 16',
};

export type ProcessorRegistryOptions = {
  logger: WorkerLogger;
  aiAdapter?: AiGenerationAdapter;
  internalAssistantAdapter?: InternalAssistantAdapter;
  internalAssistantLocalOnly?: boolean;
  webhookFlowAdapter?: WebhookFlowAdapter;
  connectorAdapter?: ConnectorExecutionAdapter;
  connectorHttpClient?: ConnectorHttpClient;
};

export function createProcessorRegistry(options: WorkerLogger | ProcessorRegistryOptions): Record<JobType, WorkerProcessor> {
  const logger = 'info' in options ? options : options.logger;
  const aiAdapter = 'info' in options ? new StubAiGenerationAdapter() : options.aiAdapter ?? new StubAiGenerationAdapter();
  const internalAssistantAdapter = 'info' in options
    ? new StubInternalAssistantAdapter()
    : options.internalAssistantAdapter ?? new StubInternalAssistantAdapter();
  const webhookFlowAdapter = 'info' in options
    ? new StubWebhookFlowAdapter()
    : options.webhookFlowAdapter ?? new StubWebhookFlowAdapter();
  const connectorAdapter = 'info' in options
    ? new StubConnectorExecutionAdapter()
    : options.connectorAdapter ?? new StubConnectorExecutionAdapter();
  const connectorHttpClient = 'info' in options
    ? createStubConnectorHttpClient()
    : options.connectorHttpClient ?? defaultConnectorHttpClient;
  const connectorOptions = {
    adapter: connectorAdapter,
    httpClient: connectorHttpClient,
    logger,
  };
  const registry = {} as Record<JobType, WorkerProcessor>;
  for (const type of Object.keys(migrationPhaseByType) as JobType[]) {
    registry[type] = createContractValidationProcessor(type, logger);
  }
  const aiProcessor = createAiGenerationProcessor({ adapter: aiAdapter, logger });
  registry.AI_GENERATE = aiProcessor;
  registry.AI_HYDRATE = aiProcessor;
  registry.AI_MODIFY = aiProcessor;
  registry.INTERNAL_TOOL_RUN = createInternalAssistantProcessor({
    adapter: internalAssistantAdapter,
    logger,
    localOnly: 'info' in options ? false : options.internalAssistantLocalOnly,
  });
  registry.WEBHOOK_RECEIVED = createWebhookProcessor({ adapter: webhookFlowAdapter, logger });
  registry.FLOW_RUN = createFlowRunProcessor({ adapter: webhookFlowAdapter, logger });
  registry.CONNECTOR_TEST = createConnectorTestProcessor(connectorOptions);
  registry.CONNECTOR_CALL = createConnectorCallProcessor(connectorOptions);
  return registry;
}

function createContractValidationProcessor(type: JobType, logger: WorkerLogger): WorkerProcessor {
  return async (job) => {
    const parsed = JobPayloadByType[type].parse(job.payload);
    const timestamp = new Date().toISOString();
    const migrationPhase = migrationPhaseByType[type];
    logger.info('validated job contract', {
      jobId: job.id,
      type,
      queueName: job.queueName,
      correlationId: job.trace.correlationId,
      migrationPhase,
    });

    return {
      status: 'SUCCESS',
      events: [
        {
          type: 'JOB_STARTED',
          jobId: job.id,
          queueName: job.queueName,
          trace: job.trace,
          timestamp,
          progress: 0,
          message: `${type} contract accepted; execution migrates in ${migrationPhase}.`,
          metadata: { migrationPhase, payloadKeys: Object.keys(parsed as Record<string, unknown>) },
        },
        {
          type: 'JOB_PROGRESS',
          jobId: job.id,
          queueName: job.queueName,
          trace: job.trace,
          timestamp: new Date().toISOString(),
          progress: 100,
          message: `${type} processor registration verified.`,
          metadata: { migrationPhase },
        },
      ],
    };
  };
}
