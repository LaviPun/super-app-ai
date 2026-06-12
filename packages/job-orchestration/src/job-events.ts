import { PlatformWorkerEventSchema, type PlatformWorkerEvent } from '@superapp/platform-contracts';

export type JobEvent = PlatformWorkerEvent;

export function parseJobEvent(value: unknown): JobEvent {
  return PlatformWorkerEventSchema.parse(value);
}

export function createJobEvent(input: Omit<JobEvent, 'timestamp'> & { timestamp?: string }): JobEvent {
  return PlatformWorkerEventSchema.parse({
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
