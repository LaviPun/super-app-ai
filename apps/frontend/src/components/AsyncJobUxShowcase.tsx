'use client';

import { AsyncJobProgressDemo } from '@/components/AsyncJobProgressDemo';
import {
  simulatedAssistantScenario,
  simulatedConnectorScenario,
  simulatedPublishScenario,
} from '@/lib/simulated-job-events';

export function AsyncJobUxShowcase() {
  return (
    <section className="async-job-showcase" aria-label="Async job UX demos" data-testid="async-job-ux-showcase">
      <div className="route-shell__header">
        <p className="eyebrow">Phase 19 async UX</p>
        <h2>Queued work visibility</h2>
        <p>
          Progress panels subscribe to Fastify <code>WorkerEvent</code> streams (SSE with polling fallback) and map
          contract states to operator-friendly phases aligned with Remix <code>internal.jobs</code>.
        </p>
      </div>
      <div className="async-job-showcase__grid">
        <AsyncJobProgressDemo scenario={simulatedAssistantScenario} mode="simulate" />
        <AsyncJobProgressDemo scenario={simulatedPublishScenario} mode="simulate" />
        <AsyncJobProgressDemo scenario={simulatedConnectorScenario} mode="simulate" />
      </div>
    </section>
  );
}
