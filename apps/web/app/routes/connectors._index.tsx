import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import type { FetcherWithComponents } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ConnectorService, type ConnectorAuth } from '~/services/connectors/connector.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  ConfirmModal, EmptyState, MonoChip, StatusBadge, titleCase, useCustomEvent,
} from '~/components/merchant/polaris';

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
    <MerchantShell polaris>
      <ConnectorsBody connectors={connectors} stats={stats} />
    </MerchantShell>
  );
}

function ConnectorsBody({ connectors }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { revalidate } = useRevalidator();
  const [modal, setModal] = useState(false);
  const [del, setDel] = useState<any>(null);
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
    .filter((c: any) => (c.name + c.baseUrl).toLowerCase().includes(search.toLowerCase()));

  const testConnector = (r: any) => {
    testFetcher.submit({ connectorId: r.id, path: '/', method: 'GET' }, { method: 'post', action: '/api/connectors/test', encType: 'application/json' });
    ctx.toast(`Testing ${r.name}…`);
  };
  const confirmDelete = () => {
    if (!del) return;
    deleteFetcher.submit({ intent: 'delete', connectorId: del.id }, { method: 'post' });
    setDel(null);
  };

  return (
    <s-page heading="Connectors" inlineSize="base">
      <s-button slot="primary-action" variant="primary" icon="plus" onClick={() => setModal(true)}>
        Add connector
      </s-button>
      <s-paragraph color="subdued">
        Connect external APIs, test them in the built-in request console, then use them in flows and modules.
      </s-paragraph>
      {connectors.length === 0 ? (
        <s-section>
          <EmptyState icon="connect" heading="No connectors yet"
            action={<s-button variant="primary" icon="plus" onClick={() => setModal(true)}>Add your first connector</s-button>}>
            Connect Klaviyo, Slack, your WMS, or any REST API.
          </EmptyState>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-search-field
                label="Search connectors"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search connectors…"
                onInput={(e) => setSearch(e.currentTarget.value ?? '')}
              />
              <s-text color="subdued">{rows.length} result{rows.length === 1 ? '' : 's'}</s-text>
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Connector</s-table-header>
              <s-table-header>Base URL</s-table-header>
              <s-table-header>Auth</s-table-header>
              <s-table-header>Endpoints</s-table-header>
              <s-table-header listSlot="kicker">Last test</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header> </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r: any) => (
                <s-table-row key={r.id} clickDelegate={`con-link-${r.id}`}>
                  <s-table-cell>
                    <s-link id={`con-link-${r.id}`} onClick={() => navigate(`/connectors/${r.id}`)}>
                      <s-text type="strong">{r.name}</s-text>
                    </s-link>
                  </s-table-cell>
                  <s-table-cell><MonoChip>{r.baseUrl}</MonoChip></s-table-cell>
                  <s-table-cell><s-badge>{authDisplay(r.auth)}</s-badge></s-table-cell>
                  <s-table-cell>{r.endpoints}</s-table-cell>
                  <s-table-cell>
                    {r.everTested ? (
                      <s-text tone={r.lastOk ? undefined : 'critical'} color={r.lastOk ? 'subdued' : undefined}>
                        {r.lastStatus != null ? `${r.lastStatus} · ${r.lastTested}` : `tested ${r.lastTested}`}
                      </s-text>
                    ) : (
                      <s-text color="subdued">untested</s-text>
                    )}
                  </s-table-cell>
                  <s-table-cell><StatusBadge status={r.status} /></s-table-cell>
                  <s-table-cell>
                    <s-button
                      variant="tertiary"
                      icon="menu-horizontal"
                      accessibilityLabel={`Actions for ${r.name}`}
                      commandFor={`con-menu-${r.id}`}
                    />
                    <s-menu id={`con-menu-${r.id}`} accessibilityLabel="Connector actions">
                      <s-button icon="play" onClick={() => testConnector(r)}>Test connection</s-button>
                      <s-button icon="edit" onClick={() => navigate(`/connectors/${r.id}?tab=settings`)}>Edit</s-button>
                      <s-button icon="delete" tone="critical" onClick={() => setDel(r)}>Delete</s-button>
                    </s-menu>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {rows.length === 0 && (
            <EmptyState heading="Nothing here">No connectors match your search.</EmptyState>
          )}
        </s-section>
      )}
      {del && (
        <ConfirmModal
          open
          heading="Delete connector?"
          tone="critical"
          confirmLabel="Delete"
          loading={deleteFetcher.state !== 'idle'}
          onConfirm={confirmDelete}
          onClose={() => setDel(null)}
        >
          <s-paragraph>
            {`This removes “${del.name}” and its saved endpoints. Flows and modules that use it will stop working.`}
          </s-paragraph>
        </ConfirmModal>
      )}
      {modal && <CreateConnectorModal fetcher={createFetcher} onClose={() => setModal(false)} />}
    </s-page>
  );
}

/**
 * Create-connector form modal. Submission goes through a React ref on the
 * fetcher form — no DOM-structure queries — so the primary action can live in
 * the modal's `primary-action` slot while the fields stay inside the form.
 */
function CreateConnectorModal({ fetcher, onClose }: { fetcher: FetcherWithComponents<{ ok?: boolean; error?: string }>; onClose: () => void }) {
  const modalRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [auth, setAuth] = useState('API_KEY');

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  const submit = () => {
    if (formRef.current) fetcher.submit(formRef.current);
    // Modal stays open until the server confirms (see the createFetcher effect).
  };

  return (
    <s-modal ref={modalRef as never} heading="Add connector">
      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="create" />
        <s-stack gap="base">
          <s-text color="subdued">Connect an external REST API.</s-text>
          {fetcher.state === 'idle' && fetcher.data?.error && (
            <s-banner tone="critical">{fetcher.data.error}</s-banner>
          )}
          <s-text-field label="Name" name="name" placeholder="My API" details="A friendly label, e.g. “Klaviyo”" />
          <s-url-field label="Base URL" name="baseUrl" placeholder="https://api.example.com/v1" />
          <s-select label="Authentication" name="authType" value={auth} onChange={(e) => setAuth(e.currentTarget.value)}>
            <s-option value="API_KEY">API Key</s-option>
            <s-option value="BASIC">Basic auth</s-option>
            <s-option value="OAUTH2">OAuth 2.0</s-option>
          </s-select>
          {auth === 'API_KEY' && (
            <>
              <s-password-field label="API key" name="apiKey" placeholder="••••••••••••" details="Encrypted at rest — never shown again" />
              <s-text-field label="Header name (optional)" name="headerName" placeholder="X-Api-Key" details="Header used to send the API key" />
            </>
          )}
          {auth === 'BASIC' && (
            <>
              <s-text-field label="Username" name="username" placeholder="user" />
              <s-password-field label="Password" name="password" placeholder="••••••••••••" details="Encrypted at rest — never shown again" />
            </>
          )}
          {auth === 'OAUTH2' && (
            <s-password-field label="Bearer token" name="bearerToken" placeholder="••••••••••••" details="Encrypted at rest — never shown again" />
          )}
        </s-stack>
      </fetcher.Form>
      <s-button slot="primary-action" variant="primary" loading={fetcher.state !== 'idle' || undefined} onClick={submit}>
        Create connector
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
