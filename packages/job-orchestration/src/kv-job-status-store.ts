import {
  JobStatusRecord,
  JobStatusRecordSchema,
  type JobStatusStore,
} from './job-status-store.js';

/** Minimal KV surface for job status persistence (Cloudflare Workers KV). */
export type JobStatusKvNamespace = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export const DEFAULT_JOB_STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;

function jobStatusKey(jobId: string): string {
  return `job-status:${jobId}`;
}

export class KvJobStatusStore implements JobStatusStore {
  constructor(
    private readonly kv: JobStatusKvNamespace,
    private readonly ttlSeconds = DEFAULT_JOB_STATUS_TTL_SECONDS,
  ) {}

  async upsert(record: JobStatusRecord): Promise<void> {
    const parsed = JobStatusRecordSchema.parse(record);
    await this.kv.put(jobStatusKey(parsed.jobId), JSON.stringify(parsed), {
      expirationTtl: this.ttlSeconds,
    });
  }

  async get(jobId: string): Promise<JobStatusRecord | undefined> {
    const raw = await this.kv.get(jobStatusKey(jobId));
    if (!raw) return undefined;

    const parsed = JobStatusRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  }
}
