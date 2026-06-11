import {
  ASSET_STORAGE_QUEUE,
  PreviewExportPayloadSchema,
  resolveImageWorkerQueue,
  type ImageWorkerPayload,
} from '@superapp/platform-contracts';
import { createJobOrchestrator } from '@superapp/job-orchestration';
import { createImageStorageProcessor } from '@superapp/workers';
import { randomUUID } from 'node:crypto';

type PreviewExportPayload = Extract<ImageWorkerPayload, { type: 'PREVIEW_EXPORT' }>;

export type SchedulePreviewExportParams = {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId?: string;
  html: string;
  recipeSpecRef?: string;
  traceId?: string;
};

export type PreviewExportEnqueueResult =
  | {
      status: 'queued';
      queueName: typeof ASSET_STORAGE_QUEUE;
      payload: PreviewExportPayload;
      jobId: string;
      executionMode: string;
    }
  | { status: 'completed'; queueName: typeof ASSET_STORAGE_QUEUE; payload: PreviewExportPayload; jobId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'invalid'; reason: string };

let previewOrchestrator: ReturnType<typeof createJobOrchestrator> | undefined;

function getPreviewOrchestrator() {
  if (!previewOrchestrator) {
    previewOrchestrator = createJobOrchestrator({
      inlineHandlers: {
        [ASSET_STORAGE_QUEUE]: async (job) => {
          const processor = createImageStorageProcessor();
          const result = await processor({
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
        },
      },
    });
  }
  return previewOrchestrator;
}

export async function schedulePreviewExport(
  params: SchedulePreviewExportParams,
): Promise<PreviewExportEnqueueResult> {
  if (process.env.PREVIEW_EXPORT_QUEUE_ENABLED !== '1') {
    return { status: 'skipped', reason: 'PREVIEW_EXPORT_QUEUE_ENABLED is not set' };
  }

  const jobId = randomUUID();
  const payloadInput = {
    type: 'PREVIEW_EXPORT' as const,
    jobId,
    shopId: params.shopId,
    moduleId: params.moduleId,
    revisionId: params.revisionId,
    traceId: params.traceId ?? jobId,
    assetId: params.assetId ?? `preview_${params.moduleId}`,
    preview: {
      contentType: 'text/html' as const,
      body: params.html,
    },
    recipeSpecRef: params.recipeSpecRef,
  };

  const parsed = PreviewExportPayloadSchema.safeParse(payloadInput);
  if (!parsed.success) {
    return { status: 'invalid', reason: 'Preview export payload failed validation' };
  }

  const queueName = resolveImageWorkerQueue(parsed.data.type);
  if (queueName !== ASSET_STORAGE_QUEUE) {
    return { status: 'invalid', reason: 'Unexpected queue mapping for PREVIEW_EXPORT' };
  }

  const orchestrator = getPreviewOrchestrator();
  const enqueueResult = await orchestrator.enqueue({
    id: jobId,
    jobType: 'PREVIEW_EXPORT',
    payload: parsed.data,
    trace: {
      correlationId: parsed.data.traceId ?? jobId,
      shopId: params.shopId,
    },
    queueName,
  });

  if (enqueueResult.status === 'invalid' || enqueueResult.status === 'skipped') {
    return enqueueResult;
  }

  if (enqueueResult.status === 'completed') {
    return {
      status: 'completed',
      queueName,
      payload: parsed.data,
      jobId,
    };
  }

  return {
    status: 'queued',
    queueName,
    payload: parsed.data,
    jobId,
    executionMode: orchestrator.executionMode,
  };
}

export function resetPreviewOrchestratorForTests() {
  previewOrchestrator = undefined;
}
