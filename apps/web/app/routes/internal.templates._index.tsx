import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  MODULE_TEMPLATES,
  getTemplateReadiness,
  getTemplateInstallability,
} from '@superapp/core';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Tabs,
  Icon,
  KV,
  Modal,
  ConfirmDialog,
  DataTable,
  PageHead,
  FilterBar,
  useTableState,
  fmtNum,
  TEMPLATES,
  CATEGORIES,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const workflowCount = await prisma.workflowDef.count();

  return json({
    moduleTemplates: MODULE_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      type: t.type,
      tags: t.tags ?? [],
      readiness: getTemplateReadiness(t),
      installability: getTemplateInstallability(t),
    })),
    workflowCount,
  });
}

export default function AdminTemplates() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [tab, setTab] = useState('module');
  const [newT, setNewT] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);

  const ROWS: any[] = data.moduleTemplates.length
    ? data.moduleTemplates.map((t) => ({ id: t.id, name: t.name, category: t.category, tags: t.tags, uses: 0, desc: t.description ?? '' }))
    : TEMPLATES;
  const rows = ROWS.filter((t) => (t.name + (t.tags || []).join(' ')).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Templates"
        sub="Module and flow templates merchants can start from. Edit the underlying RecipeSpec in Recipe edit."
        actions={
          <Btn variant="primary" icon="plus" onClick={() => setNewT(true)}>
            New template
          </Btn>
        }
      />
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'module', label: 'Module templates', badge: ROWS.length },
            { id: 'flow', label: 'Flow templates', badge: data.workflowCount },
          ]}
        />
      </Card>
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search templates…" results={rows.length} />
        <DataTable
          rowKey="id"
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
            { key: 'uses', label: 'Stores using', num: true, render: (r: any) => fmtNum(r.uses) },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" icon="code" onClick={() => ctx.go('#/admin/recipe-edit')}>
                    Edit recipe
                  </Btn>
                  <Btn size="sm" icon="eye" className="btn-plain" onClick={() => setPreview(r)} />
                  <Btn
                    size="sm"
                    icon="trash"
                    className="btn-plain-critical"
                    onClick={() =>
                      setConfirm({
                        title: 'Delete template',
                        message: 'Delete the “' + r.name + '” template? Stores already using it keep their copy; new stores can no longer start from it.',
                        confirmLabel: 'Delete template',
                        tone: 'critical',
                        icon: 'trash',
                        onConfirm: () => ctx.toast(r.name + ' deleted'),
                      })
                    }
                  />
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
      {newT && <NewTemplateModal onClose={() => setNewT(false)} />}
      {preview && (
        <Modal
          title={preview.name}
          sub={preview.category + ' template'}
          size="lg"
          onClose={() => setPreview(null)}
          footer={
            <>
              <span className="grow" />
              <Btn onClick={() => setPreview(null)}>Close</Btn>
              <Btn
                variant="primary"
                icon="code"
                onClick={() => {
                  setPreview(null);
                  ctx.go('#/admin/recipe-edit');
                }}
              >
                Edit recipe
              </Btn>
            </>
          }
        >
          <div className="stack-4">
            <div className="tpl-thumb" style={{ background: 'var(--p-surface-secondary)', borderRadius: 12, height: 150 }}>
              <Icon name="template" size={40} className="t-muted" />
            </div>
            <div className="t-sm">{preview.desc}</div>
            <KV
              rows={[
                ['Category', <Badge key="c">{preview.category}</Badge>],
                ['Stores using', fmtNum(preview.uses)],
                [
                  'Tags',
                  <div key="t" className="row-1 row-wrap">
                    {(preview.tags || []).map((t: string) => (
                      <span key={t} className="tag" style={{ height: 22 }}>
                        {t}
                      </span>
                    ))}
                  </div>,
                ],
              ]}
            />
          </div>
        </Modal>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const ctx = useAdminCtx();
  const [f, setF] = useState({ name: '', category: CATEGORIES[0] ? CATEGORIES[0].display : 'Storefront UI', tags: '', desc: '' });
  const set = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const create = () => {
    ctx.toast('Template created');
    onClose();
    ctx.go('#/admin/recipe-edit');
  };
  return (
    <Modal
      title="New template"
      sub="Create a starter merchants can build from."
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={create}>
            Create & edit recipe
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <Field label="Template name">
          <Input value={f.name} onChange={(e: any) => set('name', e.target.value)} placeholder="Free Shipping Bar" autoFocus />
        </Field>
        <div className="grid grid-2">
          <Field label="Category">
            <Select options={CATEGORIES.map((c) => c.display)} value={f.category} onChange={(e: any) => set('category', e.target.value)} />
          </Field>
          <Field label="Tags" help="Comma-separated">
            <Input value={f.tags} onChange={(e: any) => set('tags', e.target.value)} placeholder="conversion, cart" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={f.desc} onChange={(e: any) => set('desc', e.target.value)} placeholder="What does this template do?" />
        </Field>
      </div>
    </Modal>
  );
}

