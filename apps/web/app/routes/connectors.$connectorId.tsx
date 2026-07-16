import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FetcherWithComponents } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  ConfirmModal, EmptyState, KV, MonoChip, StatusBadge, Tabs, titleCase, useCustomEvent, type WcTone,
} from '~/components/merchant/polaris';

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

const METHOD_COLOR: Record<string, WcTone> = { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'critical' };

const MONO_PRE: CSSProperties = {
  margin: 0, maxHeight: 360, overflow: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
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
    <MerchantShell polaris>
      <ConnectorDetailBody />
    </MerchantShell>
  );
}

function ConnectorDetailBody() {
  const { connector, endpoints } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const updateFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher();

  const [tab, setTab] = useState('tester');
  // The connectors list deep-links to `?tab=settings` for its Edit action —
  // settings now live in the edit modal, so that link opens it directly.
  const [editOpen, setEditOpen] = useState(
    () => typeof window !== 'undefined' && /tab=settings/.test(window.location.search),
  );
  const [delC, setDelC] = useState(false);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/');
  const [headersText, setHeadersText] = useState('Authorization: Bearer ••••••••\nContent-Type: application/json');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testError, setTestError] = useState('');
  const [sending, setSending] = useState(false);

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

  const tabs = [
    { id: 'tester', label: 'API tester' },
    { id: 'endpoints', label: `Saved endpoints (${endpoints.length})` },
  ];

  return (
    <s-page heading={connector.name} inlineSize="base">
      <s-button slot="primary-action" icon="edit" onClick={() => setEditOpen(true)}>Edit connector</s-button>
      <s-button slot="secondary-actions" tone="critical" icon="delete" onClick={() => setDelC(true)}>Delete</s-button>

      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-button variant="tertiary" icon="arrow-left" onClick={() => ctx.go('#/app/connectors')}>Connectors</s-button>
        <StatusBadge status={connector.lastTestedAt ? 'CONNECTED' : 'NEW'} />
        <MonoChip>{connector.baseUrl}</MonoChip>
        <s-text color="subdued">{authDisplay(connector.authType)}</s-text>
      </s-stack>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'tester' && (
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-stack gap="base">
            <s-section>
              <s-stack gap="small-100">
                <s-grid gridTemplateColumns="auto 1fr auto" gap="small-100" alignItems="end">
                  <s-select label="Method" labelAccessibilityVisibility="exclusive" value={method} onChange={(e) => setMethod(e.currentTarget.value)}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((x) => <s-option key={x} value={x}>{x}</s-option>)}
                  </s-select>
                  <s-text-field label="Path" labelAccessibilityVisibility="exclusive" value={path} onInput={(e) => setPath(e.currentTarget.value ?? '')} />
                  <s-button variant="primary" icon="send" onClick={send} loading={sending || undefined}>{sending ? 'Sending' : 'Send'}</s-button>
                </s-grid>
                <Tabs tabs={[{ id: 'headers', label: 'Headers' }, { id: 'body', label: 'Body' }]} value="headers" onChange={() => {}} />
                <s-text-area
                  label="Request headers"
                  labelAccessibilityVisibility="exclusive"
                  rows={4}
                  value={headersText}
                  onInput={(e) => setHeadersText(e.currentTarget.value ?? '')}
                />
              </s-stack>
            </s-section>
            {testError && <s-banner tone="critical">{testError}</s-banner>}
            {testResult && (
              <s-banner
                tone={testResult.status < 400 ? 'success' : 'critical'}
                heading={`${testResult.status} ${testResult.status < 400 ? 'OK' : 'Error'} — live test`}
              >
                <s-stack gap="small-100">
                  <pre style={MONO_PRE}>{testResult.bodyPreview || '{}'}</pre>
                  <s-stack direction="inline">
                    <s-button icon="plus" onClick={() => ctx.toast('Saved as endpoint')}>Save as endpoint</s-button>
                  </s-stack>
                </s-stack>
              </s-banner>
            )}
          </s-stack>
          <s-stack gap="base">
            <s-section heading="Connection">
              <KV rows={[
                ['Base URL', <MonoChip key="b">{connector.baseUrl}</MonoChip>],
                ['Auth', authDisplay(connector.authType)],
                ['Endpoints', endpoints.length],
                ['Last test', connector.lastTestedAt ? timeAgo(connector.lastTestedAt) : 'untested'],
              ]} />
            </s-section>
            <s-section heading="Tips">
              <s-text color="subdued">Test a request, then “Save as endpoint” to reuse it inside flows and AI-generated modules.</s-text>
            </s-section>
          </s-stack>
        </s-grid>
      )}

      {tab === 'endpoints' && (
        <s-section padding="none">
          {endpoints.length === 0 ? (
            <EmptyState icon="connect" heading="No saved endpoints yet">
              Test a request and save it.
            </EmptyState>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Name</s-table-header>
                <s-table-header listSlot="inline">Method</s-table-header>
                <s-table-header>Path</s-table-header>
                <s-table-header listSlot="kicker">Last tested</s-table-header>
                <s-table-header> </s-table-header>
              </s-table-header-row>
              <s-table-body>
                {endpoints.map((r: any) => (
                  <s-table-row key={r.id}>
                    <s-table-cell><s-text type="strong">{r.name}</s-text></s-table-cell>
                    <s-table-cell><s-badge tone={METHOD_COLOR[r.method] ?? 'neutral'}>{r.method}</s-badge></s-table-cell>
                    <s-table-cell><MonoChip>{r.path}</MonoChip></s-table-cell>
                    <s-table-cell><s-text color="subdued">{timeAgo(r.lastTestedAt)}</s-text></s-table-cell>
                    <s-table-cell><s-button>Load</s-button></s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      )}

      {editOpen && (
        <EditConnectorModal connector={connector} fetcher={updateFetcher} onClose={() => setEditOpen(false)} />
      )}

      {delC && (
        <ConfirmModal
          open
          heading="Delete connector?"
          tone="critical"
          confirmLabel="Delete"
          loading={deleteFetcher.state !== 'idle'}
          onConfirm={() => {
            // Real delete via the /connectors action (shop-scoped); its redirect
            // navigates back to the list.
            deleteFetcher.submit(
              { intent: 'delete', connectorId: connector.id },
              { method: 'post', action: '/connectors' },
            );
          }}
          onClose={() => setDelC(false)}
        >
          <s-paragraph>{`This removes “${connector.name}” and its saved endpoints. This cannot be undone.`}</s-paragraph>
        </ConfirmModal>
      )}
    </s-page>
  );
}

/**
 * Edit-connector form modal (connectors._index pattern: fields live in a
 * fetcher.Form, the primary action submits through a form ref). The update API
 * takes a JSON body, so the form's values are read via FormData and submitted
 * with `encType: 'application/json'` — the server contract is unchanged.
 */
function EditConnectorModal({
  connector, fetcher, onClose,
}: {
  connector: { id: string; name: string; baseUrl: string; authType: string };
  fetcher: FetcherWithComponents<{ ok?: boolean; error?: string }>;
  onClose: () => void;
}) {
  const ctx = useMerchantCtx();
  const modalRef = useRef<HTMLElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fetcher.submit(
      { name: String(fd.get('name') ?? ''), baseUrl: String(fd.get('baseUrl') ?? '') },
      { method: 'POST', action: `/api/connectors/${connector.id}/update`, encType: 'application/json' },
    );
    ctx.toast('Connector saved');
    onClose();
  };

  return (
    <s-modal ref={modalRef as never} heading="Edit connector">
      <fetcher.Form method="post" ref={formRef}>
        <s-stack gap="base">
          {fetcher.state === 'idle' && fetcher.data?.error && (
            <s-banner tone="critical">{fetcher.data.error}</s-banner>
          )}
          <s-text-field label="Connector name" name="name" value={connector.name} />
          <s-url-field label="Base URL" name="baseUrl" value={connector.baseUrl} />
          <s-select label="Authentication" value={connector.authType} onChange={() => {}}>
            <s-option value="API_KEY">API Key</s-option>
            <s-option value="BASIC">Basic auth</s-option>
            <s-option value="OAUTH2">OAuth 2.0</s-option>
          </s-select>
          <s-password-field label="API key" placeholder="••••••••" details="Encrypted at rest — leave blank to keep current" />
        </s-stack>
      </fetcher.Form>
      <s-button slot="primary-action" variant="primary" loading={fetcher.state !== 'idle' || undefined} onClick={submit}>
        Save changes
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
