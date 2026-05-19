import Link from 'next/link';
import type { V2RouteShell } from '../routes/legacy-route-map';

export function V2RouteShell({
  title,
  subtitle,
  routes,
}: {
  title: string;
  subtitle: string;
  routes: V2RouteShell[];
}) {
  return (
    <section className="route-shell" aria-labelledby={`${title.toLowerCase().replace(/\s+/g, '-')}-title`}>
      <div className="route-shell__header">
        <p className="eyebrow">Platform V2 route parity</p>
        <h2 id={`${title.toLowerCase().replace(/\s+/g, '-')}-title`}>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className="route-grid">
        {routes.map((route) => (
          <article className="route-card" key={route.href}>
            <div>
              <h3>
                <Link href={route.href}>{route.label}</Link>
              </h3>
              <p>{route.description}</p>
            </div>
            <dl>
              <dt>Legacy Remix route(s)</dt>
              <dd>{route.legacyRoutes.join(', ')}</dd>
              <dt>Fastify/API boundary</dt>
              <dd>{route.apiBoundary}</dd>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
