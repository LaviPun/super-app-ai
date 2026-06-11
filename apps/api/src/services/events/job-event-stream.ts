import type { WorkerEvent } from '@superapp/platform-contracts';

export interface JobEventStream {
  publish(event: WorkerEvent): Promise<void>;
  list(jobId: string): Promise<WorkerEvent[]>;
  subscribe(jobId: string, listener: (event: WorkerEvent) => void): () => void;
}

export class InMemoryJobEventStream implements JobEventStream {
  private readonly events = new Map<string, WorkerEvent[]>();
  private readonly listeners = new Map<string, Set<(event: WorkerEvent) => void>>();

  async publish(event: WorkerEvent): Promise<void> {
    const existing = this.events.get(event.jobId) ?? [];
    existing.push(event);
    this.events.set(event.jobId, existing);
    for (const listener of this.listeners.get(event.jobId) ?? []) {
      listener(event);
    }
  }

  async list(jobId: string): Promise<WorkerEvent[]> {
    return [...(this.events.get(jobId) ?? [])];
  }

  subscribe(jobId: string, listener: (event: WorkerEvent) => void): () => void {
    const set = this.listeners.get(jobId) ?? new Set<(event: WorkerEvent) => void>();
    set.add(listener);
    this.listeners.set(jobId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }
}
