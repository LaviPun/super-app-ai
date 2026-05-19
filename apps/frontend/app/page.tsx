import { fetchApiHealth } from '@/lib/api-client';
import { V2RouteShell } from '@/components/V2RouteShell';
import { internalRoutes, merchantRoutes } from '@/routes/legacy-route-map';

export default async function HomePage() {
  const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  let healthLabel = 'API offline';
  let healthClass = 'status-warn';
  try {
    const health = await fetchApiHealth({ baseUrl: apiBase });
    healthLabel = `${health.service} v${health.version}`;
    healthClass = 'status-ok';
  } catch {
    healthLabel = 'API offline (start @superapp/api locally)';
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Next.js embedded foundation</p>
        <h1>SuperApp Platform V2</h1>
        <p>
          Migration-ready shell mirroring the existing Remix merchant and internal admin surfaces.
          Data mutations stay behind Fastify contracts; no backend platform logic lives in Next routes.
        </p>
      </section>

      <section className="status-grid" aria-label="Platform status">
        <div className="status-card">
          <p className="status-label">Fastify health</p>
          <p className={`status-value ${healthClass}`}>{healthLabel}</p>
        </div>
        <div className="status-card">
          <p className="status-label">API base</p>
          <p className="status-value">{apiBase}</p>
        </div>
        <div className="status-card">
          <p className="status-label">Route parity source</p>
          <p className="status-value">apps/web/app/routes</p>
        </div>
      </section>

      <V2RouteShell
        title="Merchant embedded surfaces"
        subtitle="Mirrors the Remix embedded app nav in apps/web/app/root.tsx."
        routes={merchantRoutes}
      />
      <V2RouteShell
        title="Internal admin surfaces"
        subtitle="Mirrors the Remix /internal operator frame groups: Overview, Monitoring, Data, Configuration."
        routes={internalRoutes}
      />
    </>
  );
}
