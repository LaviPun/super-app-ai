import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams, useFetcher, useRevalidator } from '@remix-run/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  StatStrip, StatusBadge, EmptyState, ConfirmModal, Desc, LearnMore, fmtNum, useViewMode, ViewToggle, type WcTone,
} from '~/components/merchant/polaris';
import { CATEGORY_ORDER, getCategoryDisplayLabel, getCategoryTone, getCategoryIcon } from '~/utils/type-label';

/* eslint-disable @typescript-eslint/no-explicit-any */

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

    const [modules, usage] = await Promise.all([
      prisma.module.findMany({
        where: { shopId: shopRow.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
          recipe: { select: { id: true, title: true } },
        },
        take: 200,
      }),
      new QuotaService().getUsageSummary(shopRow.id),
    ]);

    const published = modules.filter(m => m.status === 'PUBLISHED').length;
    const drafts = modules.filter(m => m.status === 'DRAFT').length;

    const aiLimit = usage.quotas?.aiRequestsPerMonth ?? 0;
    const aiUsed = usage.used?.aiRequests ?? 0;
    const aiLeft = aiLimit === -1 ? null : Math.max(0, aiLimit - aiUsed);

    return json({
      aiUsage: { aiLeft, aiLimit: aiLimit === -1 ? null : aiLimit },
      modules: modules.map(m => {
        // Bucket on the real library category, not a lossy type-string heuristic.
        const catLabel = getCategoryDisplayLabel(m.category);
        return {
          id: m.id,
          name: m.name,
          rawType: m.type,
          rawCategory: m.category,
          type: catLabel,
          category: catLabel,
          status: m.status,
          version: m.versions[0]?.version ?? 1,
          summary: m.summary ?? `${catLabel} module`,
          updated: timeAgo(m.updatedAt),
          blueprintId: m.recipe?.id ?? null,
          blueprintName: m.recipe?.title ?? null,
        };
      }),
      stats: { total: modules.length, published, drafts },
      loaderError: undefined as string | undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load modules.';
    return json({ aiUsage: { aiLeft: null as number | null, aiLimit: null as number | null }, modules: [] as any[], stats: { total: 0, published: 0, drafts: 0 }, loaderError: message }, { status: 500 });
  }
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

type PolarisField = HTMLElement & { value?: string; focus?: () => void };

// Reusable AI builder panel. Clicking a "Try:" chip fills the prompt box;
// generation happens on the Generate button → navigates to /generate with the
// prompt in location state.
function ModuleBuilderCard({ onClose, open, aiLeftLabel }: { onClose: () => void; open: boolean; aiLeftLabel: string }) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const taRef = useRef<PolarisField | null>(null);
  const examples = ['Sticky add-to-cart bar', 'Free-shipping progress bar', 'Back-in-stock email capture', 'Volume discount: buy 3 save 15%'];
  const addExample = (ex: string) => {
    const cur = prompt.trim();
    const next = !cur ? ex : cur.toLowerCase().includes(ex.toLowerCase()) ? cur : cur + ', ' + ex;
    setPrompt(next);
    if (taRef.current) {
      taRef.current.value = next;
      taRef.current.focus?.();
    }
  };
  const generate = () => {
    const q = prompt.trim();
    if (!q) return;
    navigate('/generate', { state: { prompt: q, type: 'ai' } });
  };
  useEffect(() => { if (open) taRef.current?.focus?.(); }, [open]);
  return (
    <s-section>
      <s-stack gap="small-100">
        <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="start">
          <s-stack gap="none">
            <s-heading>Build a module with AI</s-heading>
            <s-text tone="neutral" color="subdued">Describe what you want — generate 3 concepts to choose from.</s-text>
          </s-stack>
          <s-button variant="tertiary" icon="x" accessibilityLabel="Close builder" onClick={onClose} />
        </s-grid>
        <s-text-area
          ref={taRef as never}
          label="Module description"
          labelAccessibilityVisibility="exclusive"
          rows={2}
          placeholder="Describe a module to build — e.g. a slide-out size guide on apparel pages…"
          onInput={(e) => setPrompt(e.currentTarget.value ?? '')}
        />
        <s-stack direction="inline" gap="small-100" alignItems="center">
          <s-text tone="neutral" color="subdued">Try:</s-text>
          {examples.map((ex) => (
            <s-button key={ex} variant="tertiary" icon="plus" onClick={() => addExample(ex)}>{ex}</s-button>
          ))}
        </s-stack>
        <s-divider />
        <s-grid gridTemplateColumns="1fr auto auto" gap="small-100" alignItems="center">
          <s-text tone="neutral" color="subdued"><s-text type="strong">{aiLeftLabel}</s-text> AI credits left</s-text>
          <s-button icon="theme-template" onClick={() => ctx.go('#/app/templates')}>Templates</s-button>
          <s-button variant="primary" icon="wand" disabled={!prompt.trim() || undefined} onClick={generate}>Generate</s-button>
        </s-grid>
      </s-stack>
    </s-section>
  );
}

export default function ModulesIndex() {
  const { modules, stats, loaderError, aiUsage } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <ModulesBody modules={modules} stats={stats} loaderError={loaderError} aiUsage={aiUsage} />
    </MerchantShell>
  );
}

function ModulesBody({ modules, stats, loaderError, aiUsage }: any) {
  const ctx = useMerchantCtx();
  const [searchParams] = useSearchParams();
  const { revalidate } = useRevalidator();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [view, setView] = useViewMode('modules');
  const [del, setDel] = useState<any>(null);
  const [builderOpen, setBuilderOpen] = useState(() => searchParams.get('openBuilder') === '1');
  const searchRef = useRef<PolarisField | null>(null);
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string }>();

  // Undo-grace-window delete state. One pending delete at a time (single or
  // bulk); the affected row(s) hide optimistically so Undo can restore them.
  type Pending = { ids: string[]; names: string[] };
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedName = useRef<string | null>(null);

  // Bulk selection (list view only).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(interval); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  // Never let an undo timer fire after the component tears down.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const aiLeftLabel = aiUsage?.aiLeft == null ? '—' : fmtNum(aiUsage.aiLeft);
  const aiOfLabel = aiUsage?.aiLimit == null ? 'unlimited' : `of ${fmtNum(aiUsage.aiLimit)} / month`;

  // Commit a pending delete. Single delete reuses the existing deleteFetcher
  // (server-driven toast below); bulk fires sequential POSTs then toasts once
  // after revalidating.
  const firePending = useCallback((p: Pending) => {
    if (p.ids.length === 1) {
      deletedName.current = p.names[0] ?? null;
      deleteFetcher.submit({}, { method: 'post', action: `/api/modules/${p.ids[0]}/delete` });
      return;
    }
    void (async () => {
      let ok = 0, failed = 0;
      for (const id of p.ids) {
        try {
          const res = await fetch(`/api/modules/${id}/delete`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          if (res.ok) ok++; else failed++;
        } catch { failed++; }
      }
      revalidate();
      if (failed === 0) ctx.toast(`Deleted ${ok} module${ok === 1 ? '' : 's'}`);
      else ctx.toast(`Deleted ${ok}, ${failed} failed`, { error: true });
    })();
  }, [deleteFetcher, revalidate, ctx]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Open a 6s undo window. If one is already pending, commit it immediately
  // first, then start the new window (one pending delete at a time).
  const startPending = useCallback((p: Pending) => {
    if (pendingRef.current) firePending(pendingRef.current);
    clearTimer();
    pendingRef.current = p;
    setPending(p);
    timerRef.current = setTimeout(() => {
      const cur = pendingRef.current;
      timerRef.current = null;
      pendingRef.current = null;
      setPending(null);
      if (cur) firePending(cur);
    }, 6000);
  }, [firePending, clearTimer]);

  const undoPending = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, [clearTimer]);

  const confirmDelete = useCallback(() => {
    if (!del) return;
    startPending({ ids: [del.id], names: [del.name] });
    setDel(null);
  }, [del, startPending]);

  // Toast only once the server has answered — success and failure alike
  // (same server-driven pattern as flows._index). Single-delete path only.
  useEffect(() => {
    if (deleteFetcher.state !== 'idle' || !deleteFetcher.data) return;
    const res = deleteFetcher.data as { ok?: boolean; error?: string };
    if (res.error) ctx.toast(res.error, { error: true });
    else ctx.toast(deletedName.current ? `Deleted “${deletedName.current}”` : 'Module deleted');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.state, deleteFetcher.data]);

  const clearFilters = () => {
    setSearch(''); setType('All'); setStatus('All');
    if (searchRef.current) searchRef.current.value = '';
  };

  const pendingIds = pending ? new Set(pending.ids) : null;
  const rows = modules.filter((m: any) =>
    (type === 'All' || m.rawCategory === type) &&
    (status === 'All' || m.status === status) &&
    (m.name + m.summary + m.category).toLowerCase().includes(search.toLowerCase()) &&
    !pendingIds?.has(m.id));

  // Bulk-selection derived state + handlers (list view).
  const allSelected = rows.length > 0 && rows.every((r: any) => selected.has(r.id));
  const someSelected = rows.some((r: any) => selected.has(r.id));
  const toggleOne = (id: string, checked: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (checked) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set<string>(rows.map((r: any) => r.id)) : new Set<string>());
  const clearSelection = () => setSelected(new Set<string>());
  const confirmBulkDelete = useCallback(() => {
    const ids = Array.from(selected);
    if (ids.length === 0) { setBulkConfirm(false); return; }
    const names = ids.map((id) => modules.find((m: any) => m.id === id)?.name ?? 'module');
    startPending({ ids, names });
    setBulkConfirm(false);
    setSelected(new Set<string>());
  }, [selected, startPending, modules]);

  const filters = (
    <s-grid gridTemplateColumns="1fr auto auto auto" gap="small-100">
      <s-search-field
        ref={searchRef as never}
        label="Search modules"
        labelAccessibilityVisibility="exclusive"
        placeholder="Search modules…"
        onInput={(e) => setSearch(e.currentTarget.value ?? '')}
      />
      <s-select
        label="Type"
        labelAccessibilityVisibility="exclusive"
        value={type}
        onChange={(e) => setType(e.currentTarget.value)}
      >
        <s-option value="All">All types</s-option>
        {CATEGORY_ORDER.map((c) => (
          <s-option key={c} value={c}>{getCategoryDisplayLabel(c)}</s-option>
        ))}
      </s-select>
      <s-select
        label="Status"
        labelAccessibilityVisibility="exclusive"
        value={status}
        onChange={(e) => setStatus(e.currentTarget.value)}
      >
        <s-option value="All">All statuses</s-option>
        <s-option value="PUBLISHED">Published</s-option>
        <s-option value="DRAFT">Draft</s-option>
      </s-select>
      <ViewToggle view={view} onChange={setView} />
    </s-grid>
  );

  return (
    <s-page heading="AI Modules" inlineSize="base">
      <s-button
        slot="primary-action"
        variant="primary"
        icon="wand"
        onClick={() => setBuilderOpen((o: boolean) => !o)}
      >
        New with AI
      </s-button>
      <s-button slot="secondary-actions" icon="theme-template" onClick={() => ctx.go('#/app/templates')}>
        Browse templates
      </s-button>
      <s-stack gap="base">
      <s-paragraph color="subdued">
        Everything you’ve built — drafts, published modules, automations and integrations in one place.{' '}
        <LearnMore anchor="guide-generate" topic="generating modules" />
      </s-paragraph>
      {loaderError && <s-banner tone="critical" heading="Couldn’t load modules">{loaderError}</s-banner>}
      {builderOpen && (
        <ModuleBuilderCard open={builderOpen} onClose={() => setBuilderOpen(false)} aiLeftLabel={aiLeftLabel} />
      )}
      <StatStrip items={[
        { label: 'Total modules', value: stats.total },
        { label: 'Published', value: stats.published },
        { label: 'Drafts', value: stats.drafts },
        { label: 'AI credits left', value: aiLeftLabel, sub: aiOfLabel },
      ]} />
      <s-section padding="none">
        <s-box padding="base">
          <s-stack gap="small-100">
            {pending && (
              <s-banner
                tone="warning"
                heading={pending.ids.length === 1
                  ? `Deleting “${pending.names[0]}”…`
                  : `Deleting ${pending.ids.length} modules…`}
              >
                <s-button slot="secondary-actions" onClick={undoPending}>Undo</s-button>
              </s-banner>
            )}
            {filters}
            {rows.length === 0 ? (
              <EmptyState icon="layer" heading="No modules match"
                action={<s-button onClick={clearFilters}>Clear filters</s-button>}>
                Try adjusting your filters or generate something new.
              </EmptyState>
            ) : view === 'cards' ? (
              <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
                {rows.map((m: any) => (
                  <s-clickable key={m.id} href={`/modules/${m.id}`} border="base" borderRadius="base" padding="base">
                    <s-stack gap="small-100">
                      <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                        <s-icon type={catIcon(m.rawCategory) as never} tone="info" />
                        <StatusBadge status={m.status} />
                      </s-grid>
                      <s-stack gap="none">
                        <s-text type="strong">{m.name}</s-text>
                        {m.summary !== `${m.category} module` && (
                          <s-text tone="neutral" color="subdued">{m.summary}</s-text>
                        )}
                      </s-stack>
                      {m.blueprintName && (
                        <s-stack direction="inline">
                          <s-badge tone="info" icon="layer">{m.blueprintName}</s-badge>
                        </s-stack>
                      )}
                      <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                        <s-stack direction="inline">
                          <s-badge tone={catTone(m.rawCategory)}>{m.type}</s-badge>
                        </s-stack>
                        <s-text tone="neutral" color="subdued">v{m.version} · {m.updated}</s-text>
                      </s-grid>
                    </s-stack>
                  </s-clickable>
                ))}
              </s-grid>
            ) : (
              <s-stack gap="small-100">
              {selected.size > 0 && (
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text>{selected.size} selected</s-text>
                  <s-button tone="critical" icon="delete" onClick={() => setBulkConfirm(true)}>Delete selected</s-button>
                  <s-button variant="tertiary" onClick={clearSelection}>Clear</s-button>
                </s-stack>
              )}
              <s-table>
                <s-table-header-row>
                  <s-table-header>
                    <s-checkbox
                      label="Select all modules"
                      labelAccessibilityVisibility="exclusive"
                      checked={allSelected || undefined}
                      indeterminate={(someSelected && !allSelected) || undefined}
                      onChange={(e) => toggleAll(e.currentTarget.checked)}
                    />
                  </s-table-header>
                  <s-table-header listSlot="primary">Module</s-table-header>
                  <s-table-header listSlot="secondary">Description</s-table-header>
                  <s-table-header listSlot="inline">Type</s-table-header>
                  <s-table-header>Version</s-table-header>
                  <s-table-header listSlot="secondary">Status</s-table-header>
                  <s-table-header listSlot="kicker">Updated</s-table-header>
                  <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {rows.map((r: any) => (
                    <s-table-row key={r.id}>
                      <s-table-cell>
                        <s-checkbox
                          label={`Select ${r.name}`}
                          labelAccessibilityVisibility="exclusive"
                          checked={selected.has(r.id) || undefined}
                          onChange={(e) => toggleOne(r.id, e.currentTarget.checked)}
                        />
                      </s-table-cell>
                      <s-table-cell>
                        <s-link href={`/modules/${r.id}`}><s-text type="strong">{r.name}</s-text></s-link>
                      </s-table-cell>
                      <s-table-cell>
                        {/* Same dedup rule as the cards: a "<category> module" summary
                            adds nothing next to the Type column. */}
                        <Desc text={r.summary === `${r.category} module` ? null : r.summary} />
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge tone={catTone(r.rawCategory)}>{r.type}</s-badge>
                      </s-table-cell>
                      <s-table-cell>v{r.version}</s-table-cell>
                      <s-table-cell><StatusBadge status={r.status} /></s-table-cell>
                      <s-table-cell><s-text tone="neutral" color="subdued">{r.updated}</s-text></s-table-cell>
                      <s-table-cell>
                        <s-button
                          variant="tertiary"
                          icon="menu-horizontal"
                          accessibilityLabel={`Actions for ${r.name}`}
                          commandFor={`module-menu-${r.id}`}
                          command="--toggle"
                        />
                        <s-popover id={`module-menu-${r.id}`}>
                          <s-menu>
                            <s-button href={`/modules/${r.id}`} icon="edit">Edit</s-button>
                            <s-button href={`/modules/${r.id}`} icon="view">Preview</s-button>
                            <s-button icon="delete" tone="critical" onClick={() => setDel(r)}>Delete</s-button>
                          </s-menu>
                        </s-popover>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>
      </s-stack>
      <ConfirmModal
        open={!!del}
        heading="Delete module?"
        tone="critical"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDel(null)}
      >
        <s-paragraph>This removes “{del?.name}” and all of its versions. This cannot be undone.</s-paragraph>
      </ConfirmModal>
      <ConfirmModal
        open={bulkConfirm}
        heading={`Delete ${selected.size} module${selected.size === 1 ? '' : 's'}?`}
        tone="critical"
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
        onClose={() => setBulkConfirm(false)}
      >
        <s-paragraph>
          This removes {selected.size} module{selected.size === 1 ? '' : 's'} and all of their versions. This cannot be undone.
        </s-paragraph>
      </ConfirmModal>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
