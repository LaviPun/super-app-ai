'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobStatus, JobType, WorkerEvent } from '@superapp/platform-contracts';
import { AsyncJobProgressPanel } from '@/components/AsyncJobProgressPanel';
import {
  latestJobStatus,
  mergeWorkerEvents,
  subscribeJobEvents,
  type JobEventsTransport,
} from '@/lib/job-events-client';
import { isTerminalJobStatus } from '@/lib/async-job-states';
import type { SimulatedJobScenario } from '@/lib/simulated-job-events';

export type AsyncJobProgressDemoProps = {
  scenario: SimulatedJobScenario;
  mode?: 'simulate' | 'live';
  apiBaseUrl?: string;
  eventsPath?: string;
  statusPath?: string;
};

function statusFromEvents(events: WorkerEvent[], fallback: JobStatus): JobStatus {
  return latestJobStatus(events, fallback);
}

export function AsyncJobProgressDemo({
  scenario,
  mode = 'simulate',
  apiBaseUrl,
  eventsPath,
  statusPath,
}: AsyncJobProgressDemoProps) {
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [transport, setTransport] = useState<JobEventsTransport>('idle');
  const [status, setStatus] = useState<JobStatus>('QUEUED');

  const paths = useMemo(
    () => ({
      eventsPath: eventsPath ?? `/v1/jobs/${scenario.jobId}/events`,
      statusPath: statusPath ?? `/v1/jobs/${scenario.jobId}`,
    }),
    [scenario.jobId, statusPath, eventsPath],
  );

  const replaySimulation = useCallback(() => {
    setTransport('idle');
    setEvents([]);
    setStatus('QUEUED');
    let index = 0;
    const timer = setInterval(() => {
      const next = scenario.events[index];
      if (!next) {
        clearInterval(timer);
        return;
      }
      setEvents((current) => mergeWorkerEvents(current, [next]));
      setStatus(statusFromEvents(scenario.events.slice(0, index + 1), 'QUEUED'));
      index += 1;
    }, 650);
    return () => clearInterval(timer);
  }, [scenario.events]);

  useEffect(() => {
    if (mode === 'simulate') {
      return replaySimulation();
    }
    if (!apiBaseUrl) return undefined;
    const subscription = subscribeJobEvents(
      {
        baseUrl: apiBaseUrl,
        jobId: scenario.jobId,
        eventsPath: paths.eventsPath,
        statusPath: paths.statusPath,
      },
      {
        onEvent: (event) => {
          setEvents((current) => {
            const merged = mergeWorkerEvents(current, [event]);
            setStatus(latestJobStatus(merged, 'RUNNING'));
            return merged;
          });
        },
        onStatus: (job) => {
          setStatus(job.status);
          if (job.events?.length) {
            setEvents((current) => mergeWorkerEvents(current, job.events ?? []));
          }
        },
        onTransport: setTransport,
      },
    );
    return () => subscription.close();
  }, [apiBaseUrl, mode, paths.eventsPath, paths.statusPath, replaySimulation, scenario.jobId]);

  const effectiveStatus = statusFromEvents(events, status);

  return (
    <div className="async-job-demo" data-testid={`async-job-demo-${scenario.jobType.toLowerCase()}`}>
      <AsyncJobProgressPanel
        jobType={scenario.jobType as JobType}
        jobId={scenario.jobId}
        status={effectiveStatus}
        events={events}
        transport={transport}
        onRetry={replaySimulation}
        onCancel={() => setStatus('CANCELLED')}
      />
      <p className="async-job-demo__hint" data-testid="async-job-demo-hint">
        {mode === 'simulate'
          ? 'Simulated SSE timeline for local UX review (Playwright-safe).'
          : isTerminalJobStatus(effectiveStatus)
            ? 'Live Fastify job stream reached a terminal state.'
            : 'Listening for Fastify SSE with polling fallback.'}
      </p>
    </div>
  );
}

