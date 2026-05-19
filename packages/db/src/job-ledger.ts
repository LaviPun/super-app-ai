import {
  JobPayloadByType,
  JobRecordSchema,
  JobTypeQueueName,
  type EnqueueJobRequest,
  type JobRecord,
  type JobStatus,
  type JobType,
  type QueueName,
  type TraceContext,
} from '@superapp/platform-contracts';

export type JobLedgerCreateInput = {
  type: JobType;
  queueName: QueueName;
  status: JobStatus;
  payload: Record<string, unknown>;
  trace: TraceContext;
  idempotencyKey?: string;
};

export type JobLedgerUpdateInput = {
  status?: JobStatus;
  attempts?: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type JobLedgerRecord = JobRecord & {
  attempts: number;
  result?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export interface JobLedgerRepository {
  create(input: JobLedgerCreateInput): Promise<JobLedgerRecord>;
  findById(id: string): Promise<JobLedgerRecord | null>;
  findByIdempotencyKey(idempotencyKey: string): Promise<JobLedgerRecord | null>;
  update(id: string, input: JobLedgerUpdateInput): Promise<JobLedgerRecord>;
}

export type CreateJobLedgerResult = {
  record: JobLedgerRecord;
  deduped: boolean;
};

export async function createQueuedJob(
  repository: JobLedgerRepository,
  request: EnqueueJobRequest,
): Promise<CreateJobLedgerResult> {
  if (request.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey(request.idempotencyKey);
    if (existing) return { record: existing, deduped: true };
  }

  const parsedPayload = JobPayloadByType[request.type].parse(request.payload) as Record<string, unknown>;
  const record = await repository.create({
    type: request.type,
    queueName: JobTypeQueueName[request.type],
    status: 'QUEUED',
    payload: parsedPayload,
    trace: request.trace,
    idempotencyKey: request.idempotencyKey,
  });

  return { record, deduped: false };
}

export class InMemoryJobLedgerRepository implements JobLedgerRepository {
  private readonly records = new Map<string, JobLedgerRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private nextId = 1;

  async create(input: JobLedgerCreateInput): Promise<JobLedgerRecord> {
    const now = new Date().toISOString();
    const record: JobLedgerRecord = {
      id: `job_${String(this.nextId++).padStart(6, '0')}`,
      type: input.type,
      queueName: input.queueName,
      status: input.status,
      payload: input.payload,
      trace: input.trace,
      idempotencyKey: input.idempotencyKey,
      attempts: 0,
      result: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const parsed = parseJobLedgerRecord(record);
    this.records.set(parsed.id, parsed);
    if (parsed.idempotencyKey) this.idempotencyIndex.set(parsed.idempotencyKey, parsed.id);
    return parsed;
  }

  async findById(id: string): Promise<JobLedgerRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<JobLedgerRecord | null> {
    const id = this.idempotencyIndex.get(idempotencyKey);
    return id ? this.findById(id) : null;
  }

  async update(id: string, input: JobLedgerUpdateInput): Promise<JobLedgerRecord> {
    const existing = this.records.get(id);
    if (!existing) throw new Error(`Job ledger record not found: ${id}`);
    const updated = parseJobLedgerRecord({
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    });
    this.records.set(id, updated);
    return updated;
  }
}

function parseJobLedgerRecord(record: JobLedgerRecord): JobLedgerRecord {
  const base = JobRecordSchema.parse(record);
  return {
    ...base,
    attempts: record.attempts,
    result: record.result ?? null,
    error: record.error ?? null,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
  };
}
