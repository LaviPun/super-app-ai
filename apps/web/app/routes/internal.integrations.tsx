import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { INTEGRATION_TILES, type IntegrationCategory } from '~/components/admin/integration-tiles';
import { IntegrationIcon } from '~/components/admin/integration-icon';
import { PageHead, Card, CardHead, EmptyState, Badge } from '~/components/admin/page-kit';

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  AI_PROVIDER: 'AI providers',
  OPS_SERVICE: 'Ops services',
};

const CATEGORIES: IntegrationCategory[] = ['AI_PROVIDER', 'OPS_SERVICE'];

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({ tiles: INTEGRATION_TILES });
}

export default function IntegrationsHub() {
  const { tiles } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHead
        title="Integrations"
        sub="Every external service this app talks to — AI providers and ops tooling — as a marketplace-style tile, with masked credentials and a real test-connection check."
      />
      {CATEGORIES.map((cat) => {
        const inCategory = tiles.filter((t) => t.category === cat);
        return (
          <Card key={cat} style={{ marginBottom: 16 }}>
            <CardHead title={CATEGORY_LABEL[cat]} />
            <div className="card-pad">
              {inCategory.length === 0 ? (
                <EmptyState icon="connect" title="No tiles yet">
                  This category has no wired integrations yet.
                </EmptyState>
              ) : (
                <div className="grid grid-2">
                  {inCategory.map((tile) => (
                    <div key={tile.id} className="card card-pad">
                      <div className="row spread" style={{ marginBottom: 10 }}>
                        <div className="row-3">
                          <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)' }}>
                            <IntegrationIcon slug={tile.simpleIconSlug} size={19} />
                          </span>
                          <span className="t-strong">{tile.label}</span>
                        </div>
                        <Badge tone="info">{tile.configKind === 'DB' ? 'Configured here' : 'Env + test'}</Badge>
                      </div>
                      <p className="t-xs t-muted">{tile.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
