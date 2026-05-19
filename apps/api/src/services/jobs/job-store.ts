import { InMemoryJobLedgerRepository, createQueuedJob, type JobLedgerRepository, type JobLedgerRecord } from '@superapp/db';
import type { EnqueueJobRequest, JobRecord, JobStatus, QueueName } from '@superapp/platform-contracts';

export type CreateJobInput = {
  request: EnqueueJobRequest;
  queueName: QueueName;
};

export type CreateJobResult = {
  record: JobRecord;
  deduped: boolean;
};

export interface JobStore {
  createQueued(input: CreateJobInput): Promise<CreateJobResult>;
  updateStatus(jobId: string, status: JobStatus): Promise<JobRecord>;
  get(jobId: string): Promise<JobRecord | null>;
  getByIdempotencyKey(idempotencyKey: string): Promise<JobRecord | null>;
}

export class RepositoryJobStore implements JobStore {
  constructor(private readonly repository: JobLedgerRepository) {}

  async createQueued(input: CreateJobInput): Promise<CreateJobResult> {
    const { record, deduped } = await createQueuedJob(this.repository, input.request);
    return { record: toJobRecord(record), deduped };
  }

  async updateStatus(jobId: string, status: JobStatus): Promise<JobRecord> {
    return toJobRecord(await this.repository.update(jobId, { status }));
  }

  async get(jobId: string): Promise<JobRecord | null> {
    const record = await this.repository.findById(jobId);
    return record ? toJobRecord(record) : null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<JobRecord | null> {
    const record = await this.repository.findByIdempotencyKey(idempotencyKey);
    return record ? toJobRecord(record) : null;
  }
}

export function createInMemoryRepositoryJobStore(): RepositoryJobStore {
  return new RepositoryJobStore(new InMemoryJobLedgerRepository());
}

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private nextId = 1;

  async createQueued(input: CreateJobInput): Promise<CreateJobResult> {
    const { request, queueName } = input;
    if (request.idempotencyKey) {
      const existing = await this.getByIdempotencyKey(request.idempotencyKey);
      if (existing) return { record: existing, deduped: true };
    }

    const now = new Date().toISOString();
    const record: JobRecord = {
      id: `job_${String(this.nextId++).padStart(6, '0')}`,
      type: request.type,
      queueName,
      status: 'QUEUED',
      payload: request.payload,
      trace: request.trace,
      idempotencyKey: request.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(record.id, record);
    if (record.idempotencyKey) this.idempotencyIndex.set(record.idempotencyKey, record.id);
    return { record, deduped: false };
  }

  async updateStatus(jobId: string, status: JobStatus): Promise<JobRecord> {
    const existing = await this.get(jobId);
    if (!existing) throw new Error(`Job not found: ${jobId}`);
    const updated: JobRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async get(jobId: string): Promise<JobRecord | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<JobRecord | null> {
    const jobId = this.idempotencyIndex.get(idempotencyKey);
    return jobId ? this.get(jobId) : null;
  }
}

function toJobRecord(record: JobLedgerRecord): JobRecord {
  return {
    id: record.id,
    type: record.type,
    queueName: record.queueName,
    status: record.status,
    payload: record.payload,
    trace: record.trace,
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
