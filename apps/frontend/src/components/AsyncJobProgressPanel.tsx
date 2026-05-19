'use client';

import type { JobStatus, JobType, WorkerEvent } from '@superapp/platform-contracts';
import { resolveAsyncUxSnapshot, type AsyncUxSnapshot } from '@/lib/async-job-states';
import type { JobEventsTransport } from '@/lib/job-events-client';

export type AsyncJobProgressPanelProps = {
  jobType: JobType;
  jobId: string;
  status: JobStatus;
  events: WorkerEvent[];
  transport?: JobEventsTransport;
  onRetry?: () => void;
  onCancel?: () => void;
};

function toneClass(tone: AsyncUxSnapshot['tone']): string {
  switch (tone) {
    case 'success':
      return 'async-job__badge async-job__badge--success';
    case 'critical':
      return 'async-job__badge async-job__badge--critical';
    case 'warning':
      return 'async-job__badge async-job__badge--warning';
    case 'progress':
      return 'async-job__badge async-job__badge--progress';
    default:
      return 'async-job__badge';
  }
}

export function AsyncJobProgressPanel({
  jobType,
  jobId,
  status,
  events,
  transport = 'idle',
  onRetry,
  onCancel,
}: AsyncJobProgressPanelProps) {
  const lastEvent = events.at(-1);
  const snapshot = resolveAsyncUxSnapshot(jobType, status, lastEvent);

  return (
    <section className="async-job" aria-label="Async job progress" data-testid="async-job-progress-panel">
      <div className="async-job__header">
        <div>
          <p className="eyebrow">Async job</p>
          <h2 className="async-job__title">{snapshot.label}</h2>
          <p className="async-job__meta">
            <span data-testid="async-job-id">{jobId}</span>
            <span aria-hidden="true"> · </span>
            <span data-testid="async-job-transport">{transport === 'idle' ? 'simulated' : transport}</span>
          </p>
        </div>
        <span className={toneClass(snapshot.tone)} data-testid="async-job-phase">
          {snapshot.phase}
        </span>
      </div>

      <div className="async-job__progress" aria-label="Progress">
        <div
          className="async-job__progress-bar"
          style={{ width: `${snapshot.progress ?? (snapshot.tone === 'success' ? 100 : snapshot.tone === 'neutral' ? 8 : 42)}%` }}
          data-testid="async-job-progress-bar"
        />
      </div>

      {snapshot.detail ? <p className="async-job__detail">{snapshot.detail}</p> : null}

      <ol className="async-job__timeline" data-testid="async-job-timeline">
        {events.map((event) => (
          <li key={`${event.type}-${event.timestamp}`}>
            <span className="async-job__event-type">{event.type}</span>
            <span>{event.message ?? '—'}</span>
            {typeof event.progress === 'number' ? <span className="async-job__event-progress">{event.progress}%</span> : null}
          </li>
        ))}
      </ol>

      <div className="async-job__actions">
        <button
          type="button"
          className="async-job__button"
          disabled={!snapshot.canRetry}
          onClick={onRetry}
          data-testid="async-job-retry"
        >
          Retry
        </button>
        <button
          type="button"
          className="async-job__button async-job__button--secondary"
          disabled={!snapshot.canCancel}
          onClick={onCancel}
          data-testid="async-job-cancel"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
