import type { V2RouteShell } from '../routes/legacy-route-map';

export function MigrationSurfacePage({ route }: { route: V2RouteShell }) {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Migration-ready surface</p>
        <h1>{route.label}</h1>
        <p>{route.description}</p>
      </section>
      <section className="status-grid" aria-label={`${route.label} migration boundary`}>
        <div className="status-card">
          <p className="status-label">Legacy Remix source</p>
          <p className="status-value">{route.legacyRoutes.join(', ')}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Fastify contract boundary</p>
          <p className="status-value">{route.apiBoundary}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Implementation state</p>
          <p className="status-value status-warn">Route shell, no legacy behavior cutover</p>
        </div>
      </section>
    </>
  );
}
