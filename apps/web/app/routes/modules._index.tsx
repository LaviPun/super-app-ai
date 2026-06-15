import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Badge, StatusBadge, Card, PageHead, FilterBar, StatTile, DataTable,
  EmptyState, Menu, ConfirmDialog, useTableState, titleCase,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TYPE_ICON: Record<string, string> = { 'Storefront UI': 'desktop', 'Function': 'bolt', 'Integration': 'connect', 'Flow': 'flow', 'Data store': 'database' };
const TYPE_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };
const DESIGN_TYPES = ['Storefront UI', 'Function', 'Integration', 'Flow', 'Data store'];

// Map a real Prisma module type token → design display type.
function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  try {
    const prisma = getPrisma();
    let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (!shopRow) {
      shopRow = await prisma.shop.create({
        data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
      });
    }

    const modules = await prisma.module.findMany({
      where: { shopId: shopRow.id },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      take: 200,
    });

    const published = modules.filter(m => m.status === 'PUBLISHED').length;
    const drafts = modules.filter(m => m.status === 'DRAFT').length;

    return json({
      modules: modules.map(m => ({
        id: m.id,
        name: m.name,
        rawType: m.type,
        type: designType(m.type),
        category: getCategoryDisplay(m.category),
        status: m.status,
        version: m.versions[0]?.version ?? 1,
        summary: m.summary ?? `${designType(m.type)} module`,
        updated: timeAgo(m.updatedAt),
      })),
      stats: { total: modules.length, published, drafts },
      loaderError: undefined as string | undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load modules.';
    return json({ modules: [] as any[], stats: { total: 0, published: 0, drafts: 0 }, loaderError: message }, { status: 500 });
  }
}

function getCategoryDisplay(c: string): string {
  return titleCase(String(c || 'General').replace(/_/g, ' ').toLowerCase());
}
function timeAgo(d: Date | string): string {
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// Reusable AI builder card. Clicking a "Try:" chip fills the prompt box;
// generation happens on the Generate button → navigates to /generate with the
// prompt in location state.
function ModuleBuilderCard({ onClose, open, aiLeftLabel }: { onClose: () => void; open: boolean; aiLeftLabel: string }) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const examples = ['Sticky add-to-cart bar', 'Free-shipping progress bar', 'Back-in-stock email capture', 'Volume discount: buy 3 save 15%'];
  const addExample = (ex: string) => {
    setPrompt((p) => {
      const cur = p.trim();
      if (!cur) return ex;
      if (cur.toLowerCase().includes(ex.toLowerCase())) return cur;
      return cur + ', ' + ex;
    });
    if (taRef.current) taRef.current.focus();
  };
  const generate = () => {
    const q = prompt.trim();
    if (!q) return;
    navigate('/generate', { state: { prompt: q, type: 'ai' } });
  };
  useEffect(() => { if (open && taRef.current) taRef.current.focus(); }, [open]);
  return (
    <Card className="home-builder mb-card">
      <div className="mb-card-head">
        <span className="tile-ico" style={{ background: 'var(--p-magic-bg)', color: 'var(--p-magic)', width: 34, height: 34, flex: 'none' }}>
          <Icon name="magic" size={18} />
        </span>
        <div className="stack" style={{ gap: 1, flex: 1, minWidth: 0 }}>
          <span className="t-strong">Build a module with AI</span>
          <span className="t-xs t-muted">Describe what you want — generate 3 concepts to choose from.</span>
        </div>
        {onClose && <button className="mb-close" onClick={onClose} title="Close"><Icon name="x" size={16} /></button>}
      </div>
      <textarea ref={taRef} className="input home-builder-input mb-textarea" rows={2}
        placeholder="Describe a module to build — e.g. a slide-out size guide on apparel pages…"
        value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="home-builder-chips">
        <span className="t-xs t-muted">Try:</span>
        {examples.map((ex) => (
          <button key={ex} className="example-chip" onClick={() => addExample(ex)}><Icon name="plus" size={12} />{ex}</button>
        ))}
      </div>
      <div className="mb-card-foot">
        <span className="row-2 t-xs t-muted"><Icon name="info" size={13} /><b>{aiLeftLabel}</b> AI credits left</span>
        <span className="grow" />
        <Btn icon="template" onClick={() => ctx.go('#/app/templates')}>Templates</Btn>
        <Btn variant="magic" icon="magic" onClick={generate} disabled={!prompt.trim()}>Generate</Btn>
      </div>
    </Card>
  );
}

export default function ModulesIndex() {
  const { modules, stats, loaderError } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <ModulesBody modules={modules} stats={stats} loaderError={loaderError} />
    </MerchantShell>
  );
}

function ModulesBody({ modules, stats, loaderError }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ts = useTableState();
  const { revalidate } = useRevalidator();
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [del, setDel] = useState<any>(null);
  const [builderOpen, setBuilderOpen] = useState(() => searchParams.get('openBuilder') === '1');
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  const aiLeftLabel = '1,138';

  const moduleMenu = (r: any) => [
    { icon: 'edit', label: 'Edit', onClick: () => navigate(`/modules/${r.id}`) },
    { icon: 'eye', label: 'Preview', onClick: () => navigate(`/modules/${r.id}`) },
    { icon: 'copy', label: 'Duplicate', onClick: () => ctx.toast(`Duplicated “${r.name}”`) },
    { divider: true },
    { icon: 'trash', label: 'Delete', tone: 'critical', onClick: () => setDel(r) },
  ];

  const confirmDelete = useCallback(() => {
    if (!del) return;
    deleteFetcher.submit({}, { method: 'post', action: `/api/modules/${del.id}/delete` });
    ctx.toast(`Deleted “${del.name}”`);
    setDel(null);
  }, [del, deleteFetcher, ctx]);

  const rows = modules.filter((m: any) =>
    (type === 'All' || m.type === type) &&
    (status === 'All' || m.status === status) &&
    (m.name + m.summary + m.category).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="AI Modules"
        sub="Everything you’ve built — drafts, published modules, automations and integrations in one place."
        actions={(
          <>
            <Btn icon="template" onClick={() => ctx.go('#/app/templates')}>Browse templates</Btn>
            <Btn variant="magic" icon="magic" aria-expanded={builderOpen} onClick={() => setBuilderOpen((o) => !o)}>New with AI</Btn>
          </>
        )}
      />
      {loaderError && <div style={{ marginBottom: 16 }}><Card pad>{loaderError}</Card></div>}
      {builderOpen && (
        <div className="mb-reveal">
          <ModuleBuilderCard open={builderOpen} onClose={() => setBuilderOpen(false)} aiLeftLabel={aiLeftLabel} />
        </div>
      )}
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Total modules" value={stats.total} icon="layers" tone="info" />
        <StatTile label="Published" value={stats.published} icon="rocket" tone="success" />
        <StatTile label="Drafts" value={stats.drafts} icon="edit" tone="warning" />
        <StatTile label="AI credits left" value={aiLeftLabel} sub="of 1,500 / month" icon="magic" tone="magic" />
      </div>
      <Card>
        <FilterBar
          search={ts.search} onSearch={ts.setSearch} placeholder="Search modules…"
          filters={[
            { options: ['All'].concat(DESIGN_TYPES), value: type, onChange: setType },
            { options: ['All', 'PUBLISHED', 'DRAFT'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
          ]}
          results={rows.length}
          right={(
            <div className="seg">
              <button aria-selected={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" size={15} /></button>
              <button aria-selected={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={15} /></button>
            </div>
          )}
        />
        {rows.length === 0 ? (
          <EmptyState icon="layers" title="No modules match"
            action={<Btn onClick={() => { ts.setSearch(''); setType('All'); setStatus('All'); }}>Clear filters</Btn>}>
            Try adjusting your filters or generate something new.
          </EmptyState>
        ) : view === 'list' ? (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => navigate(`/modules/${r.id}`)}
            columns={[
              { key: 'name', label: 'Module', render: (r: any) => (
                <div className="row-3">
                  <span className="tile-ico" style={{ width: 30, height: 30, background: `var(--p-${TYPE_COLOR[r.type]}-bg)`, color: `var(--p-${TYPE_COLOR[r.type]})` }}>
                    <Icon name={TYPE_ICON[r.type] ?? 'layers'} size={15} />
                  </span>
                  <div className="stack" style={{ gap: 1 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub t-trunc" style={{ maxWidth: 320 }}>{r.summary}</span>
                  </div>
                </div>
              ) },
              { key: 'type', label: 'Type', render: (r: any) => <Badge tone={TYPE_COLOR[r.type]}>{r.type}</Badge> },
              { key: 'category', label: 'Category' },
              { key: 'version', label: 'Version', render: (r: any) => 'v' + r.version },
              { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
              { key: 'updated', label: 'Updated', render: (r: any) => <span className="cell-sub">{r.updated}</span> },
              { key: 'act', label: '', render: (r: any) => (
                <div className="dt-actions">
                  <Menu trigger={<button className="btn btn-icon btn-sm btn-plain"><Icon name="dotsH" size={16} /></button>} items={moduleMenu(r)} />
                </div>
              ) },
            ]}
            rows={rows}
          />
        ) : (
          <div className="grid grid-3" style={{ padding: 16 }}>
            {rows.map((m: any) => (
              <a key={m.id} href={`/modules/${m.id}`} className="card module-card"
                onClick={(e) => { e.preventDefault(); navigate(`/modules/${m.id}`); }}>
                <div className="module-card-top" style={{ background: `var(--p-${TYPE_COLOR[m.type]}-bg)` }}>
                  <span style={{ color: `var(--p-${TYPE_COLOR[m.type]})` }}><Icon name={TYPE_ICON[m.type] ?? 'layers'} size={26} /></span>
                  <StatusBadge value={m.status} />
                </div>
                <div className="stack-1" style={{ padding: 14 }}>
                  <div className="t-strong">{m.name}</div>
                  <div className="t-sm t-muted t-trunc">{m.summary}</div>
                  <div className="row spread" style={{ marginTop: 8 }}>
                    <Badge tone={TYPE_COLOR[m.type]}>{m.type}</Badge>
                    <span className="t-xs t-muted">v{m.version} · {m.updated}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </Card>
      {del && (
        <ConfirmDialog
          title="Delete module?" tone="critical" confirmLabel="Delete" icon="trash"
          message={`This removes “${del.name}” and all of its versions. This cannot be undone.`}
          onConfirm={confirmDelete} onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}
