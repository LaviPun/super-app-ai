import {
  ASSET_STORAGE_QUEUE,
  PreviewExportPayloadSchema,
  resolveImageWorkerQueue,
  type ImageWorkerPayload,
} from '@superapp/platform-contracts';
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
  | { status: 'queued'; queueName: typeof ASSET_STORAGE_QUEUE; payload: PreviewExportPayload }
  | { status: 'skipped'; reason: string }
  | { status: 'invalid'; reason: string };

/**
 * Validates and stages a PREVIEW_EXPORT worker payload.
 * BullMQ / worker consumer wiring lands with Phase 9–11 queue merge; until then this is a no-op stub.
 */
export async function schedulePreviewExport(
  params: SchedulePreviewExportParams,
): Promise<PreviewExportEnqueueResult> {
  if (process.env.PREVIEW_EXPORT_QUEUE_ENABLED !== '1') {
    return { status: 'skipped', reason: 'PREVIEW_EXPORT_QUEUE_ENABLED is not set' };
  }

  const payloadInput = {
    type: 'PREVIEW_EXPORT' as const,
    jobId: randomUUID(),
    shopId: params.shopId,
    moduleId: params.moduleId,
    revisionId: params.revisionId,
    traceId: params.traceId,
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

  // TODO(phase-9-11-merge): enqueue on BullMQ `asset-storage` and persist job row via shared registry.
  return { status: 'queued', queueName, payload: parsed.data };
}
