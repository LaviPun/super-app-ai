import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  useAdminOps,
  StoreLink,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Tabs,
  KV,
  ConfirmDialog,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  await requireInternalAdmin(request);
  const id = params.moduleId;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const m = await prisma.module.findUnique({
    where: { id },
    include: {
      shop: { select: { shopDomain: true } },
      activeVersion: { select: { specJson: true, version: true } },
      versions: { orderBy: { version: 'desc' } },
      _count: { select: { moduleInstances: true } },
    },
  });
  if (!m) throw NOT_FOUND;

  const sourceJob = m.sourceJobId
    ? await prisma.job.findUnique({ where: { id: m.sourceJobId }, select: { correlationId: true } })
    : null;

  const specRaw = m.activeVersion?.specJson ?? m.versions[0]?.specJson ?? null;
  let spec: string | null = null;
  if (specRaw) {
    try {
      spec = JSON.stringify(JSON.parse(specRaw), null, 2);
    } catch {
      spec = specRaw;
    }
  }

  return json({
    module: {
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      status: m.status,
      version: m.activeVersion?.version ?? m.versions[0]?.version ?? 1,
      source: m.sourceType ?? '—',
      updated: formatRelativeTime(new Date(m.updatedAt).toISOString()),
      summary: m.summary ?? '',
      store: m.shop.shopDomain.split('.')[0] ?? m.shop.shopDomain,
      storeId: m.shopId,
      instances: m._count.moduleInstances,
    },
    versions: m.versions.map((v) => ({
      version: v.version,
      status: v.status,
      active: v.id === m.activeVersionId,
      diff: v.diffSummary ?? 'Revision v' + v.version,
      created: formatRelativeTime(new Date(v.createdAt).toISOString()),
    })),
    spec,
    traceCorrelationId: sourceJob?.correlationId ?? null,
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const SOURCE_TONE: Record<string, any> = { template: 'info', recipe: 'success', scratch: undefined, image: 'magic' };

export default function AdminModuleDetail() {
  const { module: m, versions, spec, traceCorrelationId } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ops = useAdminOps();
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState<any>(null);

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/modules', label: 'Modules' }}
        title={m.name}
        badge={
          <span className="row-2">
            <StatusBadge value={m.status} />
            <Badge>{m.type}</Badge>
          </span>
        }
        sub={
          <span className="row-2">
            <MonoChip>{m.id}</MonoChip>
            <span className="t-muted">·</span>
            <StoreLink name={m.store} id={m.storeId} />
          </span>
        }
        actions={
          <>
            <Btn icon="code" onClick={() => ctx.go('#/admin/recipe-edit/' + m.id)}>
              Edit recipe
            </Btn>
            {m.status === 'DRAFT' ? (
              <Btn variant="primary" icon="rocket" onClick={() => ops.run('publish', { id: m.id, resource: m.name, message: 'Publishing ' + m.name })}>
                Publish
              </Btn>
            ) : traceCorrelationId ? (
              <Btn variant="primary" icon="transfer" onClick={() => ctx.go('#/admin/trace/' + traceCorrelationId)}>
                View trace
              </Btn>
            ) : null}
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Version" value={'v' + m.version} sub={versions.length + ' revisions'} icon="layers" tone="info" />
        <StatTile label="Live instances" value={m.instances} sub="on storefront" icon="store" tone="success" />
        <StatTile label="Type" value={m.type} icon="code" tone="info" />
        <StatTile label="Source" value={titleCase(m.source)} sub={m.category} icon="template" tone="info" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'recipe', label: 'RecipeSpec' },
            { id: 'versions', label: 'Versions', badge: versions.length },
          ]}
        />
      </Card>
      {tab === 'overview' && (
        <div className="col-main">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Details
            </div>
            <KV
              rows={[
                ['Module ID', <MonoChip key="id">{m.id}</MonoChip>],
                ['Store', <StoreLink key="s" name={m.store} id={m.storeId} />],
                ['Type', <Badge key="t">{m.type}</Badge>],
                ['Category', m.category],
                ['Status', <StatusBadge key="st" value={m.status} />],
                ['Current version', 'v' + m.version],
                ['Source', <Badge key="sr" tone={SOURCE_TONE[m.source]}>{titleCase(m.source)}</Badge>],
                ['Last updated', m.updated],
              ]}
            />
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 8 }}>
              Summary
            </div>
            <p className="t-sm" style={{ color: 'var(--p-text-secondary)' }}>
              {m.summary || 'No summary provided.'}
            </p>
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="t-h3" style={{ marginBottom: 8 }}>
              Related
            </div>
            <div className="stack-2">
              <a href={'/internal/stores/' + m.storeId} className="related-link">
                <Icon name="store" size={16} />
                <span className="grow">Owning store · {m.store}</span>
                <Icon name="chevronRight" size={15} className="t-muted" />
              </a>
              {traceCorrelationId ? (
                <a href={'/internal/trace/' + traceCorrelationId} className="related-link">
                  <Icon name="transfer" size={16} />
                  <span className="grow">Generation trace</span>
                  <Icon name="chevronRight" size={15} className="t-muted" />
                </a>
              ) : null}
              <a href={'/internal/recipe-edit/' + m.id} className="related-link">
                <Icon name="code" size={16} />
                <span className="grow">Open in Recipe editor</span>
                <Icon name="chevronRight" size={15} className="t-muted" />
              </a>
            </div>
          </Card>
        </div>
      )}
      {tab === 'recipe' && (
        <Card pad>
          <div className="row spread" style={{ marginBottom: 4 }}>
            <div className="row-2">
              <div className="t-h3">RecipeSpec</div>
              <Badge tone="warning">Staff only</Badge>
            </div>
            <Btn size="sm" icon="code" onClick={() => ctx.go('#/admin/recipe-edit/' + m.id)}>
              Edit
            </Btn>
          </div>
          <p className="t-xs t-muted" style={{ marginBottom: 12 }}>
            Internal blueprint that defines how this module is generated. Hidden from the merchant — they only ever see the rendered result.
          </p>
          {spec ? (
            <pre className="code-block">{spec}</pre>
          ) : (
            <span className="t-muted t-sm">No RecipeSpec is stored for this module yet.</span>
          )}
        </Card>
      )}
      {tab === 'versions' && (
        <Card>
          <DataTable
            rowKey="version"
            columns={[
              {
                key: 'version',
                label: 'Version',
                render: (r: any) => (
                  <span className="cell-strong">
                    v{r.version}
                    {r.active ? (
                      <Badge tone="success">
                        Active
                      </Badge>
                    ) : null}
                  </span>
                ),
              },
              { key: 'diff', label: 'Change', render: (r: any) => <span className="cell-sub">{r.diff}</span> },
              { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
              { key: 'created', label: 'Created', render: (r: any) => <span className="cell-sub">{r.created}</span> },
              {
                key: 'act',
                label: '',
                render: (r: any) => (
                  <div className="dt-actions">
                    {!r.active && (
                      <Btn
                        size="sm"
                        className="btn-plain"
                        icon="replay"
                        onClick={() =>
                          setConfirm({
                            title: 'Roll back to v' + r.version + '?',
                            message: 'Make v' + r.version + ' the active revision of ' + m.name + '. The current version is preserved in history.',
                            confirmLabel: 'Roll back',
                            tone: 'primary',
                            icon: 'replay',
                            onConfirm: () => ops.run('rollback', { id: m.id, resource: m.name, message: 'Rolling back ' + m.name + ' to v' + r.version, extra: { version: String(r.version) } }),
                          })
                        }
                      >
                        Roll back
                      </Btn>
                    )}
                  </div>
                ),
              },
            ]}
            rows={versions}
          />
        </Card>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
