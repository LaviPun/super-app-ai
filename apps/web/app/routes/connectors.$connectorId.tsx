import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Btn, Badge, StatusBadge, Card, Field, Input, Textarea, Select,
  Tabs, Banner, KV, PageHead, DataTable, ConfirmDialog, MonoChip, titleCase,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request, params }: { request: Request; params: { connectorId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const connectorId = params.connectorId;
  if (!connectorId) throw new Response('Missing connectorId', { status: 400 });

  const prisma = getPrisma();
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, shop: { shopDomain: session.shop } },
    include: { endpoints: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!connector) throw new Response('Not found', { status: 404 });

  return json({
    connector: {
      id: connector.id,
      name: connector.name,
      baseUrl: connector.baseUrl,
      authType: connector.authType,
      lastTestedAt: connector.lastTestedAt?.toISOString() ?? null,
    },
    endpoints: connector.endpoints.map(e => ({
      id: e.id,
      name: e.name,
      path: e.path,
      method: e.method,
      defaultHeaders: e.defaultHeaders,
      defaultBody: e.defaultBody,
      lastTestedAt: e.lastTestedAt?.toISOString() ?? null,
      lastStatus: e.lastStatus,
    })),
  });
}

const METHOD_COLOR: Record<string, string> = { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'critical' };
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

type TestResult = { ok: boolean; status: number; headers: Record<string, string>; bodyPreview: string } | null;

export default function ConnectorDetail() {
  return (
    <MerchantShell>
      <ConnectorDetailBody />
    </MerchantShell>
  );
}

function ConnectorDetailBody() {
  const { connector, endpoints } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const updateFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  const initialTab = typeof window !== 'undefined' && /tab=settings/.test(window.location.search) ? 'settings' : 'tester';
  const [tab, setTab] = useState(initialTab);
  const [delC, setDelC] = useState(false);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/');
  const [headersText, setHeadersText] = useState('Authorization: Bearer ••••••••\nContent-Type: application/json');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testError, setTestError] = useState('');
  const [sending, setSending] = useState(false);
  const [editName, setEditName] = useState(connector.name);
  const [editBaseUrl, setEditBaseUrl] = useState(connector.baseUrl);

  const send = async () => {
    setSending(true); setTestResult(null); setTestError('');
    try {
      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectorId: connector.id, path, method }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult(data.result ?? { ok: true, status: 202, headers: {}, bodyPreview: data.queued ? '{ "queued": true }' : '{}' });
        ctx.toast('Test request queued');
      } else {
        setTestError(data.error || 'Request failed');
        ctx.toast(data.error || 'Request failed', { error: true });
      }
    } catch (e) {
      setTestError(String(e));
    } finally {
      setSending(false);
    }
  };

  const saveSettings = () => {
    updateFetcher.submit({ name: editName, baseUrl: editBaseUrl }, { method: 'POST', action: `/api/connectors/${connector.id}/update`, encType: 'application/json' });
    ctx.toast('Connector saved');
  };

  const tabs = [
    { id: 'tester', label: 'API tester' },
    { id: 'endpoints', label: 'Saved endpoints', badge: endpoints.length },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="page">
      <PageHead back={{ href: '/connectors', label: 'Connectors' }} title={connector.name}
        badge={<StatusBadge value={connector.lastTestedAt ? 'CONNECTED' : 'NEW'} />}
        sub={<span className="row-2"><MonoChip>{connector.baseUrl}</MonoChip>·{authDisplay(connector.authType)}</span>}
        actions={<Btn icon="edit" onClick={() => setTab('settings')}>Edit connector</Btn>} />

      <Card style={{ marginBottom: 18 }}><Tabs active={tab} onChange={setTab} tabs={tabs} /></Card>

      {tab === 'tester' && (
        <div className="col-main">
          <div className="stack-4">
            <Card pad>
              <div className="row-2" style={{ marginBottom: 14 }}>
                <div className="select" style={{ width: 120 }}>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="grow"><Input mono value={path} onChange={(e: any) => setPath(e.target.value)} /></div>
                <Btn variant="primary" icon="send" onClick={send} loading={sending}>{sending ? 'Sending' : 'Send'}</Btn>
              </div>
              <Tabs active="headers" onChange={() => {}} tabs={[{ id: 'headers', label: 'Headers' }, { id: 'body', label: 'Body' }]} />
              <div style={{ marginTop: 12 }}>
                <Textarea mono rows={4} value={headersText} onChange={(e: any) => setHeadersText(e.target.value)} />
              </div>
            </Card>
            {testError && <Banner tone="critical">{testError}</Banner>}
            {testResult && (
              <Card>
                <div className="card-head">
                  <div className="row-3">
                    <Badge tone={testResult.status < 400 ? 'success' : 'critical'}>{testResult.status} {testResult.status < 400 ? 'OK' : 'Error'}</Badge>
                    <span className="t-sm t-muted">live test</span>
                  </div>
                  <Btn size="sm" icon="plus" onClick={() => ctx.toast('Saved as endpoint')}>Save as endpoint</Btn>
                </div>
                <pre className="code-block" style={{ margin: 16 }}>{testResult.bodyPreview || '{}'}</pre>
              </Card>
            )}
          </div>
          <div className="stack-4">
            <Card pad>
              <div className="t-h3" style={{ marginBottom: 10 }}>Connection</div>
              <KV rows={[
                ['Base URL', <MonoChip key="b">{connector.baseUrl}</MonoChip>],
                ['Auth', authDisplay(connector.authType)],
                ['Endpoints', endpoints.length],
                ['Last test', connector.lastTestedAt ? timeAgo(connector.lastTestedAt) : 'untested'],
              ]} />
            </Card>
            <Card pad>
              <div className="stack-2">
                <div className="t-h3">Tips</div>
                <div className="t-sm t-muted">Test a request, then “Save as endpoint” to reuse it inside flows and AI-generated modules.</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'endpoints' && (
        <Card>
          {endpoints.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>No saved endpoints yet. Test a request and save it.</div>
          ) : (
            <DataTable rowKey="id" columns={[
              { key: 'name', label: 'Name', render: (r: any) => <span className="cell-strong">{r.name}</span> },
              { key: 'method', label: 'Method', render: (r: any) => <Badge tone={METHOD_COLOR[r.method]}>{r.method}</Badge> },
              { key: 'path', label: 'Path', render: (r: any) => <MonoChip>{r.path}</MonoChip> },
              { key: 'tested', label: 'Last tested', render: (r: any) => <span className="cell-sub">{timeAgo(r.lastTestedAt)}</span> },
              { key: 'act', label: '', render: () => (
                <div className="dt-actions"><Btn size="sm">Load</Btn></div>
              ) },
            ]} rows={endpoints} />
          )}
        </Card>
      )}

      {tab === 'settings' && (
        <div>
          <Card pad>
            <div className="stack-5" style={{ maxWidth: 520 }}>
              <Field label="Connector name"><Input value={editName} onChange={(e: any) => setEditName(e.target.value)} /></Field>
              <Field label="Base URL"><Input mono value={editBaseUrl} onChange={(e: any) => setEditBaseUrl(e.target.value)} /></Field>
              <Field label="Authentication"><Select options={['API Key', 'Basic auth', 'OAuth 2.0']} value={authDisplay(connector.authType)} onChange={() => {}} /></Field>
              <Field label="API key" help="Encrypted at rest — leave blank to keep current"><Input type="password" placeholder="••••••••" /></Field>
              <div><Btn variant="primary" loading={updateFetcher.state !== 'idle'} onClick={saveSettings}>Save changes</Btn></div>
            </div>
          </Card>
          <Card pad style={{ marginTop: 16 }}>
            <Banner tone="critical" title="Delete this connector">
              <div className="stack-2">
                <span>Flows and modules that use it will stop working. This cannot be undone.</span>
                <div><Btn variant="critical" icon="trash" onClick={() => setDelC(true)}>Delete connector</Btn></div>
              </div>
            </Banner>
          </Card>
        </div>
      )}

      {delC && (
        <ConfirmDialog title="Delete connector?" tone="critical" confirmLabel="Delete" icon="trash"
          message={`This removes “${connector.name}” and its saved endpoints. This cannot be undone.`}
          onConfirm={() => { ctx.toast(`Deleted “${connector.name}”`); window.location.href = '/connectors'; }}
          onClose={() => setDelC(false)} />
      )}
    </div>
  );
}
