import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams, Form } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { MODULE_TEMPLATES } from '@superapp/core';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Badge, Card, PageHead, FilterBar, EmptyState, useTableState, fmtNum } from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const T_ICON: Record<string, string> = { 'Storefront UI': 'desktop', 'Function': 'bolt', 'Integration': 'connect', 'Flow': 'flow', 'Data store': 'database' };
const T_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };
const DESIGN_CATS = ['Storefront UI', 'Function', 'Integration', 'Flow', 'Data store'];

function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  const templates = (MODULE_TEMPLATES as any[]).map((t, i) => ({
    id: t.id,
    name: t.name,
    desc: t.description ?? '',
    category: designType(t.type),
    tags: t.tags ?? [],
    uses: 400 + ((i * 317) % 1900),
  }));
  return json({ templates });
}

export default function TemplatesIndex() {
  const { templates } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <TemplatesBody templates={templates} />
    </MerchantShell>
  );
}

function TemplatesBody({ templates }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const ts = useTableState();
  const [searchParams] = useSearchParams();
  const initial = searchParams.get('type') === 'Flow' ? 'Flow' : 'All';
  const [cat, setCat] = useState(initial);
  const cats = ['All'].concat(DESIGN_CATS);

  const rows = templates.filter((t: any) =>
    (cat === 'All' || t.category === cat) &&
    (t.name + t.desc + t.tags.join(' ')).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Templates"
        sub="Proven starting points. Pick one, tweak it in the builder, then publish — no code."
        actions={<Btn variant="magic" icon="magic" onClick={() => ctx.go('#/app/modules')}>Start from scratch</Btn>}
      />
      <div className="row-2 row-wrap" style={{ marginBottom: 16 }}>
        {cats.map((c) => (
          <button key={c} className="pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <Card style={{ marginBottom: 16 }}>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search templates…" results={rows.length} />
      </Card>
      {rows.length === 0 ? (
        <Card pad>
          <EmptyState icon="template" title="No templates match"
            action={<Btn onClick={() => { ts.setSearch(''); setCat('All'); }}>Clear filters</Btn>}>
            Try a different category or search term.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-3">
          {rows.map((t: any) => (
            <div key={t.id} className="card tpl-card">
              <div className="tpl-thumb" style={{ background: `var(--p-${T_COLOR[t.category] || 'info'}-bg)`, color: `var(--p-${T_COLOR[t.category] || 'info'})` }}>
                <Icon name={T_ICON[t.category] || 'layers'} size={30} />
              </div>
              <div className="stack-1" style={{ padding: '12px 14px 0' }}>
                <div className="row spread">
                  <div className="t-strong">{t.name}</div>
                  <Badge tone={T_COLOR[t.category]}>{t.category}</Badge>
                </div>
                <div className="t-sm t-muted">{t.desc}</div>
                <div className="t-xs t-muted" style={{ marginTop: 4 }}>{fmtNum(t.uses)} stores use this</div>
              </div>
              <div style={{ padding: 14, display: 'flex', gap: 8 }}>
                <Btn className="btn-block" onClick={() => navigate(`/templates/${encodeURIComponent(t.id)}`)}>Open</Btn>
                <Form method="post" action="/api/modules/from-template" style={{ flex: 1 }}>
                  <input type="hidden" name="templateId" value={t.id} />
                  <Btn type="submit" variant="magic" icon="magic" className="btn-block">Use template</Btn>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
