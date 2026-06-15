import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Field,
  Input,
  Select,
  Tabs,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  fmtMs,
  CONNECTORS,
  connectorEndpoints,
  connectorTests,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { connectorId?: string } }) {
  await requireInternalAdmin(request);
  const c = CONNECTORS.find((x) => x.id === params.connectorId) ?? CONNECTORS[0];
  return json({ connector: c, endpoints: connectorEndpoints(c), tests: connectorTests(c) });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const METHOD_TONE: Record<string, any> = { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'critical' };

export default function AdminConnectorDetail() {
  const { connector: c, endpoints, tests } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('endpoints');
  const runTest = () => ctx.toast('Connection OK — 200');

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
        <StatTile label="Last status" value={c.lastStatus} sub={c.lastTested} icon={c.lastStatus < 300 ? 'check' : 'alert'} tone={c.lastStatus < 300 ? 'success' : 'critical'} />
        <StatTile label="Allowlist" value="1 host" sub={c.allowlist} icon="globe" tone="info" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'endpoints', label: 'Endpoints', badge: endpoints.length },
            { id: 'tests', label: 'Test history', badge: tests.length },
            { id: 'config', label: 'Config' },
          ]}
        />
      </Card>
      {tab === 'endpoints' && (
        <Card>
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
                    <Btn size="sm" className="btn-plain" icon="play" onClick={() => ctx.toast(r.method + ' ' + r.path + ' → 200 OK')}>
                      Call
                    </Btn>
                  </div>
                ),
              },
            ]}
            rows={endpoints}
          />
        </Card>
      )}
      {tab === 'tests' && (
        <Card>
          <DataTable
            rowKey="id"
            columns={[
              { key: 'status', label: 'Result', render: (r: any) => <span className={'http-code http-' + String(r.status)[0]}>{r.status}</span> },
              { key: 'endpoint', label: 'Endpoint', render: (r: any) => <span className="cell-sub">{r.endpoint}</span> },
              { key: 'durationMs', label: 'Duration', num: true, render: (r: any) => <span className="t-num">{fmtMs(r.durationMs)}</span> },
              { key: 'when', label: 'When', render: (r: any) => <span className="cell-sub">{r.when}</span> },
            ]}
            rows={tests}
          />
        </Card>
      )}
      {tab === 'config' && (
        <Card pad>
          <div className="stack-5" style={{ maxWidth: 540 }}>
            <Field label="Base URL">
              <Input mono defaultValue={c.baseUrl} />
            </Field>
            <Field label="Auth type">
              <Select options={['API_KEY', 'BASIC', 'OAUTH2']} value={c.auth} onChange={() => ctx.toast('Auth type updated')} />
            </Field>
            <Field label="Domain allowlist" help="Only these hosts can be called from flows (SSRF guard).">
              <Input mono defaultValue={c.allowlist} />
            </Field>
            <Field label="Credential" help="Encrypted at rest. Leave blank to keep current.">
              <Input type="password" placeholder="•••••••••• (unchanged)" />
            </Field>
            <div>
              <Btn variant="primary" onClick={() => ctx.toast('Connector saved')}>
                Save config
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
