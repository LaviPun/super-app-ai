import { AsyncJobProgressDemo } from '@/components/AsyncJobProgressDemo';
import { getV2RouteShell } from '@/routes/legacy-route-map';
import { simulatedAssistantScenario } from '@/lib/simulated-job-events';

const assistantStates = [
  {
    label: 'Session state',
    value: 'V2 persistence boundary',
    detail: 'Sessions and redacted messages move behind @superapp/db before Remix cutover.',
  },
  {
    label: 'Execution mode',
    value: 'Queued tool run',
    detail: 'Long internal tool work uses INTERNAL_TOOL_RUN instead of merchant AI queues.',
  },
  {
    label: 'Local-only policy',
    value: 'Enforced before adapter execution',
    detail: 'modalRemote jobs are rejected while INTERNAL_AI_LOCAL_ONLY is enabled.',
  },
  {
    label: 'Streaming',
    value: 'Fastify SSE boundary',
    detail: 'Progress and completion events stream from /v1/internal/assistant/jobs/:jobId/events.',
  },
];

export default function InternalAiAssistantPage() {
  const route = getV2RouteShell('internal', 'AI Assistant');

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Internal assistant migration</p>
        <h1>{route.label}</h1>
        <p>{route.description}</p>
      </section>

      <section className="status-grid" aria-label="Internal assistant V2 boundaries">
        {assistantStates.map((state) => (
          <div className="status-card" key={state.label}>
            <p className="status-label">{state.label}</p>
            <p className="status-value">{state.value}</p>
            <p>{state.detail}</p>
          </div>
        ))}
      </section>

      <AsyncJobProgressDemo
        scenario={simulatedAssistantScenario}
        mode="simulate"
        eventsPath="/v1/internal/assistant/jobs/job_demo_assistant/events"
        statusPath="/v1/internal/assistant/jobs/job_demo_assistant"
      />

      <section className="route-shell" aria-labelledby="assistant-boundaries-title">
        <div className="route-shell__header">
          <p className="eyebrow">Legacy parity</p>
          <h2 id="assistant-boundaries-title">Remix surface mapping</h2>
          <p>
            This shell mirrors the existing internal assistant page structure without moving traffic off Remix yet.
          </p>
        </div>
        <dl className="boundary-list">
          <dt>Legacy Remix route(s)</dt>
          <dd>{route.legacyRoutes.join(', ')}</dd>
          <dt>Fastify/API boundary</dt>
          <dd>{route.apiBoundary}</dd>
          <dt>Cutover state</dt>
          <dd>
            Async progress UI and SSE client are wired for INTERNAL_TOOL_RUN; chat persistence and streamed model
            execution remain behind migration gates.
          </dd>
        </dl>
      </section>
    </>
  );
}
