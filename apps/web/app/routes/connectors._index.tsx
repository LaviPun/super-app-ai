import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ConnectorService, type ConnectorAuth } from '~/services/connectors/connector.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Badge, StatusBadge, Banner, Card, PageHead, FilterBar, DataTable, EmptyState,
  Menu, Modal, Field, Input, Select, ConfirmDialog, MonoChip, StatusDot, useTableState, titleCase,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  const connectors = shopRow
    ? await prisma.connector.findMany({
        where: { shopId: shopRow.id },
        orderBy: { createdAt: 'desc' },
        include: { endpoints: { select: { id: true } } },
      })
    : [];

  const tested = connectors.filter(c => c.lastTestedAt).length;

  // Latest real test outcome per connector, read from completed CONNECTOR_TEST
  // job rows (their `result` stores the actual HTTP status of the test call).
  const testJobs = shopRow
    ? await prisma.job.findMany({
        where: { shopId: shopRow.id, type: 'CONNECTOR_TEST', status: { in: ['SUCCESS', 'FAILED'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { payload: true, result: true, status: true, finishedAt: true, createdAt: true },
      })
    : [];
  const lastTestByConnector: Record<string, { httpStatus: number | null; ok: boolean; at: string }> = {};
  for (const j of testJobs) {
    let connectorId = '';
    try { connectorId = String((JSON.parse(j.payload ?? '{}') as Record<string, unknown>)?.connectorId ?? ''); } catch { /* skip malformed payload */ }
    if (!connectorId || lastTestByConnector[connectorId]) continue;
    let httpStatus: number | null = null;
    try {
      const r = JSON.parse(j.result ?? 'null') as { status?: unknown } | null;
      if (r && typeof r.status === 'number') httpStatus = r.status;
    } catch { /* no parseable result */ }
    lastTestByConnector[connectorId] = {
      httpStatus,
      ok: j.status === 'SUCCESS' && (httpStatus == null || httpStatus < 400),
      at: (j.finishedAt ?? j.createdAt).toISOString(),
    };
  }

  return json({
    connectors: connectors.map(c => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      authType: c.authType,
      lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
      hasSampleResponse: Boolean(c.sampleResponseJson),
      endpointCount: c.endpoints.length,
      lastTest: lastTestByConnector[c.id] ?? null,
    })),
    stats: { total: connectors.length, tested },
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
    const authType = String(form.get('authType') ?? 'API_KEY');

    if (!name || !baseUrl) return json({ error: 'Name and Base URL are required' }, { status: 400 });

    let auth: ConnectorAuth;
    if (authType === 'API_KEY') {
      const headerName = String(form.get('headerName') ?? '').trim() || 'X-Api-Key';
      auth = { type: 'API_KEY', headerName, apiKey: String(form.get('apiKey') ?? '').trim() };
    } else if (authType === 'BASIC') {
      const username = String(form.get('username') ?? '').trim();
      const password = String(form.get('password') ?? '');
      if (!username) return json({ error: 'Username is required for Basic auth' }, { status: 400 });
      auth = { type: 'BASIC', username, password };
    } else if (authType === 'OAUTH2') {
      const bearerToken = String(form.get('bearerToken') ?? '').trim();
      if (!bearerToken) return json({ error: 'Bearer token is required for OAuth 2.0' }, { status: 400 });
      auth = { type: 'OAUTH2', bearerToken };
    } else {
      return json({ error: `Unknown auth type: ${authType}` }, { status: 400 });
    }

    const svc = new ConnectorService();
    try {
      await svc.create({ shopDomain: session.shop, name, baseUrl, allowlistDomains: [], auth });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create connector';
      return json({ error: message }, { status: 400 });
    }
    await activity.log({ actor: 'MERCHANT', action: 'CONNECTOR_CREATED', shopId: shopRow?.id, details: { name, baseUrl } });
    return json({ ok: true });
  }

  if (intent === 'delete') {
    const id = String(form.get('connectorId') ?? '');
    if (!id) return json({ error: 'Missing connectorId' }, { status: 400 });
    if (!shopRow) return json({ error: 'Shop not found' }, { status: 400 });
    const { count } = await prisma.connector.deleteMany({ where: { id, shopId: shopRow.id } });
    if (count === 0) return json({ error: 'Connector not found' }, { status: 404 });
    await activity.log({ actor: 'MERCHANT', action: 'CONNECTOR_DELETED', shopId: shopRow.id, resource: `connector:${id}` });
    return json({ ok: true });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

function authDisplay(t: string): string {
  if (t === 'API_KEY') return 'API key';
  if (t === 'BASIC') return 'Basic auth';
  if (t === 'OAUTH2' || t === 'OAUTH') return 'OAuth 2.0';
  return titleCase(t);
}
function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.round(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function ConnectorsIndex() {
  const { connectors, stats } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <ConnectorsBody connectors={connectors} stats={stats} />
    </MerchantShell>
  );
}

function ConnectorsBody({ connectors }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const ts = useTableState();
  const { revalidate } = useRevalidator();
  const [modal, setModal] = useState(false);
  const [del, setDel] = useState<any>(null);
  const [auth, setAuth] = useState('API_KEY');
  const createFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const testFetcher = useFetcher<{ ok?: boolean; error?: string; result?: { status: number } | null }>();

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  // Create: close the modal + toast only once the server confirms.
  useEffect(() => {
    if (createFetcher.state !== 'idle' || !createFetcher.data) return;
    if (createFetcher.data.ok) {
      setModal(false);
      ctx.toast('Connector created');
    }
    // Errors stay visible as a banner inside the modal.
  }, [createFetcher.state, createFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete: toast from the server result.
  useEffect(() => {
    if (deleteFetcher.state !== 'idle' || !deleteFetcher.data) return;
    if (deleteFetcher.data.ok) ctx.toast('Connector deleted');
    else if (deleteFetcher.data.error) ctx.toast(deleteFetcher.data.error, { error: true });
  }, [deleteFetcher.state, deleteFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Test connection: report the real HTTP status returned by the server.
  useEffect(() => {
    if (testFetcher.state !== 'idle' || !testFetcher.data) return;
    const d = testFetcher.data;
    if (d.ok && d.result && typeof d.result.status === 'number') {
      const s = d.result.status;
      ctx.toast(`Test ${s < 400 ? 'passed' : 'failed'} · HTTP ${s}`, s < 400 ? undefined : { error: true });
    } else if (d.error) {
      ctx.toast(d.error, { error: true });
    }
  }, [testFetcher.state, testFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Design rows: connectors mapped to the design shape; status derived from the
  // last real test outcome (persisted CONNECTOR_TEST job results).
  const rows = connectors
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      auth: c.authType,
      endpoints: c.endpointCount,
      lastTested: timeAgo(c.lastTest?.at ?? c.lastTestedAt),
      lastStatus: c.lastTest?.httpStatus ?? null,
      lastOk: c.lastTest ? c.lastTest.ok : Boolean(c.lastTestedAt),
      everTested: Boolean(c.lastTest || c.lastTestedAt),
      status: c.lastTest ? (c.lastTest.ok ? 'CONNECTED' : 'ERROR') : c.lastTestedAt ? 'CONNECTED' : 'NEW',
    }))
    .filter((c: any) => (c.name + c.baseUrl).toLowerCase().includes(ts.search.toLowerCase()));

  const testConnector = (r: any) => {
    testFetcher.submit({ connectorId: r.id, path: '/', method: 'GET' }, { method: 'post', action: '/api/connectors/test', encType: 'application/json' });
    ctx.toast(`Testing ${r.name}…`);
  };
  const conMenu = (r: any) => [
    { icon: 'play', label: 'Test connection', onClick: () => testConnector(r) },
    { icon: 'edit', label: 'Edit', onClick: () => navigate(`/connectors/${r.id}?tab=settings`) },
    { divider: true },
    { icon: 'trash', label: 'Delete', tone: 'critical', onClick: () => setDel(r) },
  ];

  const submitCreate = (formEl: HTMLFormElement) => {
    const fd = new FormData(formEl);
    fd.set('intent', 'create');
    createFetcher.submit(fd, { method: 'post' });
    // Modal stays open until the server confirms (see createFetcher effect).
  };
  const confirmDelete = () => {
    if (!del) return;
    deleteFetcher.submit({ intent: 'delete', connectorId: del.id }, { method: 'post' });
    setDel(null);
  };

  return (
    <div className="page">
      <PageHead
        title="Connectors"
        sub="Connect external APIs, test them in the built-in request console, then use them in flows and modules."
        actions={<Btn variant="primary" icon="plus" onClick={() => setModal(true)}>Add connector</Btn>}
      />
      {del && (
        <ConfirmDialog title="Delete connector?" tone="critical" confirmLabel="Delete" icon="trash"
          message={`This removes “${del.name}” and its saved endpoints. Flows and modules that use it will stop working.`}
          onConfirm={confirmDelete} onClose={() => setDel(null)} />
      )}
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search connectors…" results={rows.length} />
        {rows.length === 0 ? (
          <EmptyState icon="connect" title="No connectors yet"
            action={<Btn variant="primary" icon="plus" onClick={() => setModal(true)}>Add your first connector</Btn>}>
            Connect Klaviyo, Slack, your WMS, or any REST API.
          </EmptyState>
        ) : (
          <DataTable rowKey="id" onRowClick={(r: any) => navigate(`/connectors/${r.id}`)} columns={[
            { key: 'name', label: 'Connector', render: (r: any) => (
              <div className="row-3">
                <span className="tile-ico" style={{ width: 30, height: 30, background: 'var(--p-surface-secondary)' }}><Icon name="connect" size={15} /></span>
                <span className="cell-strong">{r.name}</span>
              </div>
            ) },
            { key: 'baseUrl', label: 'Base URL', render: (r: any) => <MonoChip>{r.baseUrl}</MonoChip> },
            { key: 'auth', label: 'Auth', render: (r: any) => <Badge>{authDisplay(r.auth)}</Badge> },
            { key: 'endpoints', label: 'Endpoints', num: true },
            { key: 'lastStatus', label: 'Last test', render: (r: any) => (
              <span className="row-2"><StatusDot ok={r.everTested && r.lastOk} /><span className="cell-sub">{r.everTested ? (r.lastStatus != null ? `${r.lastStatus} · ${r.lastTested}` : `tested ${r.lastTested}`) : 'untested'}</span></span>
            ) },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'act', label: '', render: (r: any) => (
              <div className="dt-actions"><Menu trigger={<button className="btn btn-icon btn-sm btn-plain"><Icon name="dotsH" size={16} /></button>} items={conMenu(r)} /></div>
            ) },
          ]} rows={rows} />
        )}
      </Card>
      {modal && (
        <Modal title="Add connector" sub="Connect an external REST API" onClose={() => setModal(false)}
          footer={(
            <>
              <span className="grow" />
              <Btn onClick={() => setModal(false)}>Cancel</Btn>
              <Btn variant="primary" loading={createFetcher.state !== 'idle'} onClick={(e: any) => submitCreate(e.target.closest('.modal-overlay').querySelector('form'))}>Create connector</Btn>
            </>
          )}>
          <form>
            <div className="stack-4">
              {createFetcher.state === 'idle' && createFetcher.data?.error && (
                <Banner tone="critical">{createFetcher.data.error}</Banner>
              )}
              <Field label="Name" help="A friendly label, e.g. “Klaviyo”"><Input name="name" placeholder="My API" autoFocus /></Field>
              <Field label="Base URL"><Input name="baseUrl" mono placeholder="https://api.example.com/v1" /></Field>
              <Field label="Authentication">
                <Select
                  name="authType"
                  options={[{ value: 'API_KEY', label: 'API Key' }, { value: 'BASIC', label: 'Basic auth' }, { value: 'OAUTH2', label: 'OAuth 2.0' }]}
                  value={auth}
                  onChange={(e: any) => setAuth(e.target.value)}
                />
              </Field>
              {auth === 'API_KEY' && (
                <>
                  <Field label="API key" help="Encrypted at rest — never shown again"><Input name="apiKey" type="password" placeholder="••••••••••••" /></Field>
                  <Field label="Header name" optional help="Header used to send the API key"><Input name="headerName" mono placeholder="X-Api-Key" /></Field>
                </>
              )}
              {auth === 'BASIC' && (
                <>
                  <Field label="Username"><Input name="username" placeholder="user" /></Field>
                  <Field label="Password" help="Encrypted at rest — never shown again"><Input name="password" type="password" placeholder="••••••••••••" /></Field>
                </>
              )}
              {auth === 'OAUTH2' && (
                <Field label="Bearer token" help="Encrypted at rest — never shown again"><Input name="bearerToken" type="password" placeholder="••••••••••••" /></Field>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
