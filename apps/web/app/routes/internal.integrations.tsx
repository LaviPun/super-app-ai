import { json } from '@remix-run/node';
import { useEffect } from 'react';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { captureMessage } from '~/services/observability/sentry.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { INTEGRATION_TILES, type IntegrationCategory } from '~/components/admin/integration-tiles';
import { IntegrationIcon } from '~/components/admin/integration-icon';
import { useAdminCtx, PageHead, Card, CardHead, EmptyState, Badge, Btn, KV, formatRelativeTime } from '~/components/admin/page-kit';

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  AI_PROVIDER: 'AI providers',
  OPS_SERVICE: 'Ops services',
};

const CATEGORIES: IntegrationCategory[] = ['AI_PROVIDER', 'OPS_SERVICE'];

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const appSettings = await prisma.appSettings.findUnique({
    where: { id: 'singleton' },
    select: { sentryLastTestedAt: true },
  });
  return json({
    tiles: INTEGRATION_TILES,
    sentry: {
      configured: Boolean(process.env.SENTRY_DSN),
      lastTestedAt: appSettings?.sentryLastTestedAt ? appSettings.sentryLastTestedAt.toISOString() : null,
    },
  });
}

type ActionResult = { ok: true; message: string } | { error: string };

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const activity = new ActivityLogService();

  if (intent === 'testSentry') {
    // Never throws — sentry.server.ts falls back to a console log when SENTRY_DSN is unset.
    captureMessage('SuperApp ops: Sentry test event', 'info', { source: 'internal-integrations-hub' });
    const configured = Boolean(process.env.SENTRY_DSN);
    const prisma = getPrisma();
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', sentryLastTestedAt: new Date() },
      update: { sentryLastTestedAt: new Date() },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'OPS_INTEGRATION_TESTED', resource: 'integration:sentry', details: { configured } });
    return json<ActionResult>({
      ok: true,
      message: configured ? 'Test event sent to Sentry' : 'SENTRY_DSN is not set — event was only logged to the server console',
    });
  }

  return json<ActionResult>({ error: `Unknown intent: ${intent}` }, { status: 400 });
}

/** Submit an intent to this route's action; toast the server's response (error styling on failure). */
function useIntentSubmit() {
  const ctx = useAdminCtx();
  const fetcher = useFetcher<ActionResult>();
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if ('error' in fetcher.data) ctx.toast(fetcher.data.error, true);
    else ctx.toast(fetcher.data.message);
  }, [fetcher.state, fetcher.data, ctx]);

  const submit = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fetcher.submit(fd, { method: 'post' });
  };
  return { submit, busy: fetcher.state !== 'idle' };
}

function SentryTileBody({ configured, lastTestedAt, onTest, busy }: { configured: boolean; lastTestedAt: string | null; onTest: () => void; busy: boolean }) {
  return (
    <>
      <KV
        rows={[
          ['Status', <Badge key="s" tone={configured ? 'success' : 'warning'} dot>{configured ? 'Configured (env)' : 'Not configured'}</Badge>],
          ['Last test event', lastTestedAt ? formatRelativeTime(lastTestedAt) : 'never'],
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <Btn size="sm" onClick={onTest} loading={busy}>
          Send test event
        </Btn>
      </div>
    </>
  );
}

export default function IntegrationsHub() {
  const { tiles, sentry } = useLoaderData<typeof loader>();
  const ops = useIntentSubmit();
  const testSentry = () => ops.submit({ intent: 'testSentry' });

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
                      <p className="t-xs t-muted" style={{ marginBottom: 10 }}>{tile.description}</p>
                      {tile.id === 'sentry' ? (
                        <SentryTileBody configured={sentry.configured} lastTestedAt={sentry.lastTestedAt} onTest={testSentry} busy={ops.busy} />
                      ) : null}
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
