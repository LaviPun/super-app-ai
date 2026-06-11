import { z } from 'zod';

export const JobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStatusRecordSchema = z.object({
  jobId: z.string().min(1),
  jobType: z.string().min(1),
  queueName: z.string().min(1),
  status: JobStatusSchema,
  correlationId: z.string().min(1),
  shopId: z.string().optional(),
  updatedAt: z.string().datetime(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});

export type JobStatusRecord = z.infer<typeof JobStatusRecordSchema>;

export interface JobStatusStore {
  upsert(record: JobStatusRecord): Promise<void>;
  get(jobId: string): Promise<JobStatusRecord | undefined>;
}

export class InMemoryJobStatusStore implements JobStatusStore {
  private readonly records = new Map<string, JobStatusRecord>();

  async upsert(record: JobStatusRecord): Promise<void> {
    this.records.set(record.jobId, JobStatusRecordSchema.parse(record));
  }

  async get(jobId: string): Promise<JobStatusRecord | undefined> {
    return this.records.get(jobId);
  }

  clear(): void {
    this.records.clear();
  }
}

let defaultStore: JobStatusStore = new InMemoryJobStatusStore();

export function getJobStatusStore(): JobStatusStore {
  return defaultStore;
}

export function setJobStatusStore(store: JobStatusStore): void {
  defaultStore = store;
}

export function resetJobStatusStore(): void {
  defaultStore = new InMemoryJobStatusStore();
}
