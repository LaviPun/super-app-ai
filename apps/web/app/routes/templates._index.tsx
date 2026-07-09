import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams, Form } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { MODULE_TEMPLATES } from '@superapp/core';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Badge, Card, PageHead, FilterBar, EmptyState, useTableState } from '~/components/superapp';
import { CATEGORY_ORDER, getCategoryDisplayLabel, getCategoryTone, getCategoryIcon } from '~/utils/type-label';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  // Emit the raw library category so the UI can bucket templates by their true
  // taxonomy (STOREFRONT_UI, ADMIN_UI, CUSTOMER_ACCOUNT, FUNCTION, INTEGRATION,
  // FLOW) instead of a lossy heuristic that dumped everything into "Storefront UI".
  const templates = (MODULE_TEMPLATES as any[]).map((t) => ({
    id: t.id,
    name: t.name,
    desc: t.description ?? '',
    category: t.category,
    tags: t.tags ?? [],
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
  // Legacy deep-link ?type=Flow maps to the raw FLOW bucket.
  const initial = searchParams.get('type') === 'Flow' ? 'FLOW' : 'All';
  const [cat, setCat] = useState(initial);
  const cats = ['All', ...CATEGORY_ORDER];

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
          <button
            key={c}
            type="button"
            className="pill"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c === 'All' ? 'All' : getCategoryDisplayLabel(c)}
          </button>
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
              <TplThumb id={t.id} category={t.category} />
              <div className="stack-1" style={{ padding: '12px 14px 0' }}>
                <div className="row spread">
                  <div className="t-strong">{t.name}</div>
                  <Badge tone={getCategoryTone(t.category)}>{getCategoryDisplayLabel(t.category)}</Badge>
                </div>
                <div className="t-sm t-muted">{t.desc}</div>
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

// Module-level cache so switching categories/search (which remounts cards)
// doesn't re-fetch a preview we already rendered once this session.
const previewCache = new Map<string, { html: string } | { error: true }>();

/**
 * Real per-template preview thumbnail. Renders the actual `PreviewService`
 * output for this template (via /api/templates/:id/preview — the merchant-
 * safe counterpart of the internal-only preview route) instead of a static
 * category-colored placeholder, so different templates in the same category
 * visibly render differently. With up to 518 templates in the gallery, each
 * card only fetches its preview once it scrolls into view.
 */
function TplThumb({ id, category }: { id: string; category: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cached = previewCache.get(id);
  const [html, setHtml] = useState<string | null>(cached && 'html' in cached ? cached.html : null);
  const [failed, setFailed] = useState(!!(cached && 'error' in cached));

  useEffect(() => {
    if (html || failed) return; // already resolved (cache hit or previous fetch)
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fetch(`/api/templates/${encodeURIComponent(id)}/preview`)
        .then((r) => r.json())
        .then((d: { html?: string; error?: string }) => {
          if (cancelled) return;
          if (typeof d?.html === 'string') {
            previewCache.set(id, { html: d.html });
            setHtml(d.html);
          } else {
            previewCache.set(id, { error: true });
            setFailed(true);
          }
        })
        .catch(() => { if (!cancelled) { previewCache.set(id, { error: true }); setFailed(true); } });
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [id, html, failed]);

  return (
    <div
      ref={ref}
      className="tpl-thumb"
      style={{ background: `var(--p-${getCategoryTone(category)}-bg)`, color: `var(--p-${getCategoryTone(category)})` }}
    >
      {html ? (
        <iframe title={`Preview of ${id}`} className="tpl-thumb-frame" srcDoc={html} sandbox="allow-same-origin" scrolling="no" tabIndex={-1} />
      ) : (
        <Icon name={getCategoryIcon(category)} size={30} />
      )}
    </div>
  );
}
