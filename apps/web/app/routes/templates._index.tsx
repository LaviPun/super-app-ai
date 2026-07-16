import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams, Form } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { MODULE_TEMPLATES } from '@superapp/core';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { EmptyState, type WcTone } from '~/components/merchant/polaris';
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

/* Category → Polaris badge tone / icon. `getCategoryTone` still speaks the
 * vendored palette ('magic' has no Polaris badge equivalent → 'caution'). */
const CAT_BADGE_TONE: Record<string, WcTone> = { info: 'info', success: 'success', warning: 'warning', magic: 'caution' };
function catTone(category: string): WcTone {
  return CAT_BADGE_TONE[getCategoryTone(category)] ?? 'neutral';
}
const CAT_ICON: Record<string, string> = { desktop: 'desktop', settings: 'settings', users: 'team', bolt: 'bolt', connect: 'connect', flow: 'automation' };
function catIcon(category: string): string {
  return CAT_ICON[getCategoryIcon(category)] ?? 'layer';
}

// Client-side incremental rendering: SSR + hydrating all 561 cards at once
// (each ~9 elements) blanks the embedded admin. Render one page at a time and
// grow on demand — the loader and client-side filtering stay untouched.
const PAGE_SIZE = 60;

// Round-robin templates across categories so the default "All" view opens on a
// varied first page instead of the raw library order (which front-loads one
// homogeneous Admin-UI block). Order within each category is preserved; known
// categories lead in CATEGORY_ORDER, any extras follow in first-seen order.
function interleaveByCategory<T extends { category: string }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groups.get(it.category);
    if (g) g.push(it);
    else groups.set(it.category, [it]);
  }
  const cats = [
    ...CATEGORY_ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)),
  ];
  const result: T[] = [];
  for (let i = 0, added = true; added; i++) {
    added = false;
    for (const c of cats) {
      const row = groups.get(c)![i];
      if (row !== undefined) { result.push(row); added = true; }
    }
  }
  return result;
}

export default function TemplatesIndex() {
  const { templates } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <TemplatesBody templates={templates} />
    </MerchantShell>
  );
}

function TemplatesBody({ templates }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Legacy deep-link ?type=Flow maps to the raw FLOW bucket.
  const initial = searchParams.get('type') === 'Flow' ? 'FLOW' : 'All';
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState(initial);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const searchRef = useRef<(HTMLElement & { value?: string }) | null>(null);
  const cats = ['All', ...CATEGORY_ORDER];

  // A new filter result is a fresh list — collapse back to the first page.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, cat]);

  const clearFilters = () => {
    setSearch(''); setCat('All');
    if (searchRef.current) searchRef.current.value = '';
  };

  const filtered = templates.filter((t: any) =>
    (cat === 'All' || t.category === cat) &&
    (t.name + t.desc + t.tags.join(' ')).toLowerCase().includes(search.toLowerCase()));
  // Default "All" view interleaves categories for variety; filtered views keep library order.
  const rows = cat === 'All' ? interleaveByCategory(filtered) : filtered;

  return (
    <s-page heading="Templates" inlineSize="base">
      <s-button slot="primary-action" variant="primary" icon="wand" onClick={() => ctx.go('#/app/modules')}>
        Start from scratch
      </s-button>
      <s-paragraph color="subdued">
        Proven starting points. Pick one, tweak it in the builder, then publish — no code.
      </s-paragraph>
      <s-section>
        <s-stack gap="small-100">
          <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
            <s-search-field
              ref={searchRef as never}
              label="Search templates"
              labelAccessibilityVisibility="exclusive"
              placeholder="Search templates…"
              onInput={(e) => setSearch(e.currentTarget.value ?? '')}
            />
            <s-text tone="neutral" color="subdued">{rows.length} of {templates.length}</s-text>
          </s-grid>
          <s-stack direction="inline" gap="small-100">
            {cats.map((c) => (
              <s-button
                key={c}
                variant={cat === c ? 'primary' : undefined}
                onClick={() => setCat(c)}
              >
                {c === 'All' ? 'All' : getCategoryDisplayLabel(c)}
              </s-button>
            ))}
          </s-stack>
        </s-stack>
      </s-section>
      {rows.length === 0 ? (
        <s-section>
          <EmptyState icon="theme-template" heading="No templates match"
            action={<s-button onClick={clearFilters}>Clear filters</s-button>}>
            Try a different category or search term.
          </EmptyState>
        </s-section>
      ) : (
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
          {rows.slice(0, visibleCount).map((t: any) => (
            // Native CSS containment: the browser skips layout/paint for cards
            // scrolled far off-screen (this 3-wide grid runs to 561 cards). The
            // wrapper div carries it because s-box does not accept a `style`
            // prop per its typings. contain-intrinsic-size reserves each card's
            // ~340px height so the scrollbar stays stable.
            <div
              key={t.id}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '340px' } as React.CSSProperties}
            >
              <s-box border="base" borderRadius="base" background="base" overflow="hidden">
                <TplThumb id={t.id} category={t.category} />
                <s-box padding="base">
                  <s-stack gap="small-100">
                    <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                      <s-text type="strong">{t.name}</s-text>
                      <s-badge tone={catTone(t.category)}>{getCategoryDisplayLabel(t.category)}</s-badge>
                    </s-grid>
                    <s-text tone="neutral" color="subdued">{t.desc}</s-text>
                    <s-grid gridTemplateColumns="1fr 1fr" gap="small-100">
                      <s-button inlineSize="fill" onClick={() => navigate(`/templates/${encodeURIComponent(t.id)}`)}>
                        Open
                      </s-button>
                      <Form method="post" action="/api/modules/from-template">
                        <input type="hidden" name="templateId" value={t.id} />
                        <s-button type="submit" variant="primary" icon="wand" inlineSize="fill">Use template</s-button>
                      </Form>
                    </s-grid>
                  </s-stack>
                </s-box>
              </s-box>
            </div>
          ))}
        </s-grid>
      )}
      {rows.length > visibleCount && (
        <s-stack alignItems="center" padding="base">
          <s-button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            {`Show more (${rows.length - visibleCount} remaining)`}
          </s-button>
        </s-stack>
      )}
    </s-page>
  );
}

// Module-level cache so switching categories/search (which remounts cards)
// doesn't re-fetch a preview we already rendered once this session.
const previewCache = new Map<string, { html: string } | { error: true }>();
// The gallery holds up to ~560 templates; an unbounded cache of full preview
// documents is a slow memory leak. Cap it FIFO — misses just refetch.
const PREVIEW_CACHE_MAX = 150;
const previewInFlight = new Set<string>();
function cachePreview(id: string, value: { html: string } | { error: true }) {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  previewCache.set(id, value);
}

// Scaled-preview mechanics, formerly the vendored `.tpl-thumb` / `.tpl-thumb-frame`
// CSS classes — inlined so the card has no dependency on the vendored stylesheet.
// The iframe renders at 4× and is scaled down to fit the 96px-tall strip.
const THUMB_BOX: React.CSSProperties = {
  height: 96,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden',
  background: '#F6F6F7',
};
const THUMB_FRAME: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '400%',
  height: 384,
  transform: 'scale(0.25)',
  transformOrigin: 'top left',
  border: 0,
  pointerEvents: 'none',
  background: '#fff',
};

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
      const known = previewCache.get(id);
      if (known) {
        if ('html' in known) setHtml(known.html);
        else setFailed(true);
        return;
      }
      if (previewInFlight.has(id)) return;
      previewInFlight.add(id);
      fetch(`/api/templates/${encodeURIComponent(id)}/preview`)
        .then((r) => r.json())
        .then((d: { html?: string; error?: string }) => {
          previewInFlight.delete(id);
          if (cancelled) return;
          if (typeof d?.html === 'string') {
            cachePreview(id, { html: d.html });
            setHtml(d.html);
          } else {
            cachePreview(id, { error: true });
            setFailed(true);
          }
        })
        .catch(() => { previewInFlight.delete(id); if (!cancelled) { cachePreview(id, { error: true }); setFailed(true); } });
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [id, html, failed]);

  return (
    <div ref={ref} style={THUMB_BOX}>
      {html && !failed ? (
        <iframe title={`Preview of ${id}`} style={THUMB_FRAME} srcDoc={html} sandbox="allow-same-origin" scrolling="no" tabIndex={-1} loading="lazy" />
      ) : (
        <s-icon type={catIcon(category) as never} tone="neutral" />
      )}
    </div>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
