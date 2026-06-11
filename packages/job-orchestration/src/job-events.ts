import { WorkerEventSchema, type WorkerEvent } from '@superapp/platform-contracts';

export type JobEvent = WorkerEvent;

export function parseJobEvent(value: unknown): JobEvent {
  return WorkerEventSchema.parse(value);
}

export function createJobEvent(input: Omit<JobEvent, 'timestamp'> & { timestamp?: string }): JobEvent {
  return WorkerEventSchema.parse({
    ...input,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}

export class JobEventCollector {
  private readonly events: JobEvent[] = [];

  push(event: JobEvent): void {
    this.events.push(event);
  }

  list(): JobEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events.length = 0;
  }
}
