import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOB_STATUS_TTL_SECONDS,
  KvJobStatusStore,
  type JobStatusKvNamespace,
} from '../kv-job-status-store.js';

function createMockKv(): JobStatusKvNamespace & {
  records: Map<string, string>;
  ttlByKey: Map<string, number | undefined>;
} {
  const records = new Map<string, string>();
  const ttlByKey = new Map<string, number | undefined>();

  return {
    records,
    ttlByKey,
    async get(key: string) {
      return records.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      records.set(key, value);
      ttlByKey.set(key, options?.expirationTtl);
    },
  };
}

describe('KvJobStatusStore', () => {
  it('stores and retrieves job status with TTL', async () => {
    const kv = createMockKv();
    const store = new KvJobStatusStore(kv);

    await store.upsert({
      jobId: 'job_kv_1',
      jobType: 'AI_GENERATE',
      queueName: 'ai-generation',
      status: 'SUCCESS',
      correlationId: 'corr_1',
      updatedAt: new Date().toISOString(),
    });

    const record = await store.get('job_kv_1');
    expect(record?.status).toBe('SUCCESS');
    expect(kv.ttlByKey.get('job-status:job_kv_1')).toBe(DEFAULT_JOB_STATUS_TTL_SECONDS);
  });

  it('returns undefined for missing keys', async () => {
    const store = new KvJobStatusStore(createMockKv());
    expect(await store.get('missing')).toBeUndefined();
  });
});
