import { AsyncJobUxShowcase } from '@/components/AsyncJobUxShowcase';
import { MigrationSurfacePage } from '@/components/MigrationSurfacePage';
import { getV2RouteShell } from '@/routes/legacy-route-map';

export default function InternalDataPage() {
  return (
    <>
      <MigrationSurfacePage route={getV2RouteShell('internal', 'Data')} />
      <section className="route-shell" aria-labelledby="internal-jobs-async-title">
        <div className="route-shell__header">
          <p className="eyebrow">Job admin parity</p>
          <h2 id="internal-jobs-async-title">Operator queue visibility</h2>
          <p>
            Mirrors Remix <code>internal.jobs</code> live/replay queues with the same async phases merchants see on
            generation, publish, flow, and connector tests.
          </p>
        </div>
      </section>
      <AsyncJobUxShowcase />
    </>
  );
}
