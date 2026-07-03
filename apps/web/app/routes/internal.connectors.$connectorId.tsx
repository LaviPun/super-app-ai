import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminOps,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Field,
  Input,
  Select,
  Tabs,
  EmptyState,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

function rel(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export async function loader({ request, params }: { request: Request; params: { connectorId?: string } }) {
  await requireInternalAdmin(request);
  const id = params.connectorId;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const c = await prisma.connector.findUnique({
    where: { id },
    include: {
      shop: { select: { shopDomain: true } },
      endpoints: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!c) throw NOT_FOUND;

  const epStatuses = c.endpoints.map((e) => e.lastStatus).filter((s): s is number => s != null);
  const anyError = epStatuses.some((s) => s >= 400);
  const tested = Boolean(c.lastTestedAt) || c.endpoints.some((e) => e.lastTestedAt);
  const status = anyError ? 'ERROR' : tested ? 'CONNECTED' : 'NEW';
  const allowlist = c.allowlistDomains
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return json({
    connector: {
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      store: c.shop.shopDomain.split('.')[0] ?? c.shop.shopDomain,
      storeId: c.shopId,
      auth: c.authType,
      endpoints: c.endpoints.length,
      status,
      allowlist: allowlist.join(', '),
      allowlistCount: allowlist.length,
      lastTested: c.lastTestedAt ? rel(new Date(c.lastTestedAt).toISOString()) : 'Never',
    },
    endpoints: c.endpoints.map((e) => ({
      id: e.id,
      name: e.name,
      path: e.path,
      method: e.method,
      lastStatus: e.lastStatus ?? '—',
      lastTested: e.lastTestedAt ? rel(new Date(e.lastTestedAt).toISOString()) : '—',
    })),
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const METHOD_TONE: Record<string, any> = { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'critical' };

export default function AdminConnectorDetail() {
  const { connector: c, endpoints } = useLoaderData<typeof loader>();
  const ops = useAdminOps();
  const [tab, setTab] = useState('endpoints');
  const [baseUrl, setBaseUrl] = useState(c.baseUrl);
  const [authType, setAuthType] = useState(c.auth);
  const [allowlist, setAllowlist] = useState(c.allowlist);
  const [credential, setCredential] = useState('');

  const runTest = () => ops.run('connector_test', { id: c.id, resource: c.name, message: 'Testing ' + c.name });

  const saveConfig = () => {
    const extra: Record<string, string> = { baseUrl: baseUrl.trim(), allowlistDomains: allowlist.trim() };
    const cred = credential.trim();
    if (cred) {
      extra.authType = authType;
      if (authType === 'API_KEY') extra.apiKey = cred;
      else if (authType === 'OAUTH2') extra.bearerToken = cred;
      else if (authType === 'BASIC') extra.password = cred;
    }
    ops.run('connector_save', { id: c.id, resource: c.name, message: 'Saving ' + c.name, extra });
  };

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/connectors', label: 'Connectors' }}
        title={c.name}
        badge={<StatusBadge value={c.status} />}
        sub={
          <span className="row-2">
            <MonoChip>{c.baseUrl}</MonoChip>
            {c.storeId && (
              <>
                <span className="t-muted">·</span>
                <StoreLink name={c.store} id={c.storeId} />
              </>
            )}
          </span>
        }
        actions={
          <Btn variant="primary" icon="refresh" onClick={runTest}>
            Test connection
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Endpoints" value={c.endpoints} icon="code" tone="info" />
        <StatTile label="Auth" value={c.auth.replace('_', ' ')} icon="shield" tone="success" />
        <StatTile label="Last tested" value={c.lastTested} icon={c.lastTested === 'Never' ? 'clock' : 'check'} tone={c.lastTested === 'Never' ? 'info' : 'success'} />
        <StatTile label="Allowlist" value={c.allowlistCount + (c.allowlistCount === 1 ? ' host' : ' hosts')} sub={c.allowlist || '—'} icon="globe" tone="info" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'endpoints', label: 'Endpoints', badge: endpoints.length },
            { id: 'tests', label: 'Test history' },
            { id: 'config', label: 'Config' },
          ]}
        />
      </Card>
      {tab === 'endpoints' && (
        <Card>
          {endpoints.length ? (
            <DataTable
              rowKey="id"
              columns={[
                { key: 'method', label: 'Method', render: (r: any) => <Badge tone={METHOD_TONE[r.method]}>{r.method}</Badge> },
                { key: 'name', label: 'Endpoint', render: (r: any) => <span className="cell-strong">{r.name}</span> },
                { key: 'path', label: 'Path', render: (r: any) => <MonoChip>{r.path}</MonoChip> },
                { key: 'lastStatus', label: 'Last status', render: (r: any) => <span className={'http-code http-' + String(r.lastStatus)[0]}>{r.lastStatus}</span> },
                { key: 'lastTested', label: 'Tested', render: (r: any) => <span className="cell-sub">{r.lastTested}</span> },
                {
                  key: 'act',
                  label: '',
                  render: (r: any) => (
                    <div className="dt-actions">
                      <Btn size="sm" className="btn-plain" icon="play" onClick={() => ops.run('connector_test', { id: c.id, resource: r.path, message: r.method + ' ' + r.path, extra: { path: r.path, method: r.method } })}>
                        Call
                      </Btn>
                    </div>
                  ),
                },
              ]}
              rows={endpoints}
            />
          ) : (
            <EmptyState icon="code" title="No endpoints">
              This connector has no allow-listed endpoints yet.
            </EmptyState>
          )}
        </Card>
      )}
      {tab === 'tests' && (
        <Card>
          <EmptyState icon="refresh" title="No test history retained">
            {c.lastTested === 'Never'
              ? 'This connector has not been tested yet. Use “Test connection” to make a live call.'
              : 'Per-test history is not stored — only the most recent test time (' + c.lastTested + ') is kept. Run a test to record a fresh call.'}
          </EmptyState>
        </Card>
      )}
      {tab === 'config' && (
        <Card pad>
          <div className="stack-5" style={{ maxWidth: 540 }}>
            <Field label="Base URL">
              <Input mono value={baseUrl} onChange={(e: any) => setBaseUrl(e.target.value)} />
            </Field>
            <Field label="Auth type">
              <Select options={['API_KEY', 'BASIC', 'OAUTH2']} value={authType} onChange={(e: any) => setAuthType(e.target.value)} />
            </Field>
            <Field label="Domain allowlist" help="Only these hosts can be called from flows (SSRF guard). Comma-separated.">
              <Input mono value={allowlist} onChange={(e: any) => setAllowlist(e.target.value)} />
            </Field>
            <Field label="Credential" help="Encrypted at rest. Leave blank to keep current.">
              <Input type="password" placeholder="•••••••••• (unchanged)" value={credential} onChange={(e: any) => setCredential(e.target.value)} />
            </Field>
            <div>
              <Btn variant="primary" onClick={saveConfig}>
                Save config
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
