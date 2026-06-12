/// <reference types="@cloudflare/workers-types" />
import type { JobHandler } from '@superapp/job-orchestration';
import { ASSET_STORAGE_QUEUE, type PlatformQueueName } from '@superapp/platform-contracts';
import {
  createImageStorageProcessor,
  createStorageAdapter,
  createWorkerHandlers,
  type CreateStorageAdapterOptions,
} from '@superapp/workers';

export type InlineHandlerEnv = {
  LOCAL_STORAGE_PATH?: string;
  ASSETS?: R2Bucket;
  R2_BUCKET_NAME?: string;
};

export function resolveStorageAdapterOptions(env: InlineHandlerEnv): CreateStorageAdapterOptions {
  if (env.ASSETS) {
    return {
      provider: 'r2',
      r2Bucket: env.ASSETS,
      r2BucketName: env.R2_BUCKET_NAME ?? 'superapp-assets',
    };
  }

  return {
    provider: 'local',
    localRoot: env.LOCAL_STORAGE_PATH,
  };
}

export function createApiInlineHandlers(
  env: InlineHandlerEnv = process.env,
): Partial<Record<PlatformQueueName, JobHandler>> {
  const storageOptions = resolveStorageAdapterOptions(env);
  const imageProcessor = createImageStorageProcessor({ storageAdapterOptions: storageOptions });

  return {
    [ASSET_STORAGE_QUEUE]: async (job) => {
      const result = await imageProcessor({
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
    ...createWorkerHandlers(),
  };
}

export function createPreviewStorage(env: InlineHandlerEnv = process.env) {
  return createStorageAdapter(resolveStorageAdapterOptions(env));
}
