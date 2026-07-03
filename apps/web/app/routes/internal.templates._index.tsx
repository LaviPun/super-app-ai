import { json } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  MODULE_TEMPLATES,
  WORKFLOW_TEMPLATES,
  getTemplateInstallability,
} from '@superapp/core';
import {
  Btn,
  Badge,
  Card,
  Tabs,
  DataTable,
  PageHead,
  FilterBar,
  useTableState,
} from '~/components/admin/page-kit';

const TEMPLATES_SHOP_ID = '__templates__';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);

  return json({
    moduleTemplates: MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: t.type,
      tags: t.tags ?? [],
      installable: getTemplateInstallability(t).ok,
    })),
    flowTemplates: WORKFLOW_TEMPLATES.map(w => ({
      id: w.metadata.templateId,
      name: w.metadata.name,
      description: w.metadata.description,
      categories: w.metadata.category,
      tags: w.metadata.tags,
      connectors: w.metadata.requiresConnectors.map(c => c.provider),
    })),
  });
}

export default function AdminTemplates() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const ts = useTableState();
  const [tab, setTab] = useState('module');

  const moduleRows = data.moduleTemplates
    .map((t) => ({ id: t.id, name: t.name, category: t.category, tags: t.tags, installable: t.installable, desc: t.description ?? '' }))
    .filter((t) => (t.name + (t.tags || []).join(' ')).toLowerCase().includes(ts.search.toLowerCase()));

  const flowRows = data.flowTemplates.filter(
    (t) => (t.name + (t.tags || []).join(' ') + (t.categories || []).join(' ')).toLowerCase().includes(ts.search.toLowerCase()),
  );

  const activeCount = tab === 'flow' ? flowRows.length : moduleRows.length;

  return (
    <div className="page">
      <PageHead
        title="Templates"
        sub="Module and flow templates merchants can start from. Edit the underlying RecipeSpec in Recipe edit."
      />
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'module', label: 'Module templates', badge: data.moduleTemplates.length },
            { id: 'flow', label: 'Flow templates', badge: data.flowTemplates.length },
          ]}
        />
      </Card>
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search templates…" results={activeCount} />
        {tab === 'flow' ? (
          <DataTable
            rowKey="id"
            columns={[
              {
                key: 'name',
                label: 'Flow template',
                render: (r: any) => (
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub">{r.description}</span>
                  </div>
                ),
              },
              {
                key: 'categories',
                label: 'Category',
                render: (r: any) => (
                  <div className="row-1 row-wrap">
                    {(r.categories || []).map((c: string) => (
                      <Badge key={c}>{c}</Badge>
                    ))}
                  </div>
                ),
              },
              {
                key: 'connectors',
                label: 'Connectors',
                render: (r: any) => (
                  <div className="row-1 row-wrap">
                    {(r.connectors || []).map((c: string) => (
                      <span key={c} className="tag" style={{ height: 22 }}>
                        {c}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                key: 'tags',
                label: 'Tags',
                render: (r: any) => (
                  <div className="row-1 row-wrap">
                    {(r.tags || []).map((t: string) => (
                      <span key={t} className="tag" style={{ height: 22 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                ),
              },
            ]}
            rows={flowRows}
          />
        ) : (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => navigate('/internal/templates/' + r.id)}
            columns={[
              {
                key: 'name',
                label: 'Template',
                render: (r: any) => (
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub">{r.desc}</span>
                  </div>
                ),
              },
              { key: 'category', label: 'Category', render: (r: any) => <Badge>{r.category}</Badge> },
              {
                key: 'tags',
                label: 'Tags',
                render: (r: any) => (
                  <div className="row-1 row-wrap">
                    {(r.tags || []).map((t: string) => (
                      <span key={t} className="tag" style={{ height: 22 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                key: 'installable',
                label: 'Status',
                render: (r: any) => (
                  <Badge tone={r.installable ? 'success' : 'warning'}>{r.installable ? 'Ready' : 'Needs setup'}</Badge>
                ),
              },
              {
                key: 'act',
                label: '',
                render: (r: any) => (
                  <div className="dt-actions">
                    <Btn
                      size="sm"
                      icon="code"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        navigate('/internal/recipe-edit?shopId=' + encodeURIComponent(TEMPLATES_SHOP_ID) + '&moduleId=' + encodeURIComponent(r.id));
                      }}
                    >
                      Edit recipe
                    </Btn>
                    <Btn
                      size="sm"
                      icon="eye"
                      className="btn-plain"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        window.open('/internal/templates/' + encodeURIComponent(r.id) + '/preview', '_blank');
                      }}
                    />
                  </div>
                ),
              },
            ]}
            rows={moduleRows}
          />
        )}
      </Card>
    </div>
  );
}
