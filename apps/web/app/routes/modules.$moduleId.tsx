import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useSearchParams, useRevalidator } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { BlueprintService } from '~/services/blueprints/blueprint.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { PreviewService } from '~/services/preview/preview.service';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';
import { MODULE_CATALOG, isCapabilityAllowed, getExtensionEligibility } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { ThemeService } from '~/services/shopify/theme.service';
import type { Capability, DeployTarget, RecipeSpec } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  ConfirmModal, EmptyState, KV, StatusBadge, Tabs, useCustomEvent, type WcTone,
} from '~/components/merchant/polaris';
import { getCategoryDisplayLabel, getCategoryTone } from '~/utils/type-label';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Real placement description derived from the module's spec + raw category — no hardcoded copy.
function placementText(spec: any, category: string): string {
  const type = String(spec?.type ?? '');
  if (type.startsWith('theme.')) {
    const enabled = spec?.placement?.enabled_on?.templates as string[] | undefined;
    const disabled = spec?.placement?.disabled_on?.templates as string[] | undefined;
    if (enabled?.length) return `Shown as a theme section on the ${enabled.join(', ')} template${enabled.length > 1 ? 's' : ''}.`;
    if (disabled?.length) return `Shown as a theme section on all templates except ${disabled.join(', ')}.`;
    return 'Published as a section in your Online Store theme — position it in the theme editor.';
  }
  if (type.startsWith('checkout.')) return 'Runs inside Shopify checkout.';
  if (type.startsWith('proxy.')) return 'Rendered on your storefront through the app proxy.';
  switch (category) {
    case 'FUNCTION': return 'Runs automatically during checkout as a Shopify Function — no storefront placement.';
    case 'FLOW': return 'Runs in the background when its trigger fires — no storefront placement.';
    case 'INTEGRATION': return 'Connects to an external service — no storefront placement.';
    case 'ADMIN_UI': return 'Appears in the Shopify admin — no storefront placement.';
    case 'CUSTOMER_ACCOUNT': return 'Shown in the customer account area.';
    default: return 'Rendered on your storefront.';
  }
}

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) throw new Response('Missing moduleId', { status: 400 });

  const ms = new ModuleService();
  const mod = await ms.getModule(session.shop, moduleId);
  if (!mod) throw new Response('Not found', { status: 404 });

  const caps = new CapabilityService();
  let planTier = await caps.getPlanTier(session.shop);
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);

  // Blueprint membership: when this module belongs to a Recipe group, surface its
  // siblings so the merchant sees it is one part of a coordinated set.
  let blueprint: { id: string; name: string; moduleCount: number; draftCount: number; members: { id: string; name: string; type: string; status: string }[] } | null = null;
  if (mod.recipeId) {
    const bp = await new BlueprintService().getBlueprint(session.shop, mod.recipeId);
    if (bp && bp.modules.length > 1) {
      blueprint = {
        id: bp.id,
        name: bp.title,
        moduleCount: bp.modules.length,
        draftCount: bp.modules.filter((x) => x.status === 'DRAFT').length,
        members: bp.modules.map((x) => ({ id: x.id, name: x.name, type: x.type, status: x.status })),
      };
    }
  }

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const spec = draft ? new RecipeService().parse(draft.specJson) : null;

  // Real "Export spec": ?export=spec downloads the current draft spec as JSON.
  if (new URL(request.url).searchParams.get('export') === 'spec' && draft) {
    let pretty = draft.specJson;
    try { pretty = JSON.stringify(JSON.parse(draft.specJson), null, 2); } catch { /* keep raw */ }
    const fname = `${mod.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'module'}-spec.json`;
    return new Response(pretty, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fname}"`,
      },
    });
  }

  const blockedCapabilities = spec
    ? (spec.requires ?? []).filter(c => !isCapabilityAllowed(planTier, c as Capability))
    : [];
  const blockReasons = blockedCapabilities.map(c => caps.explainCapabilityGate(c) ?? String(c));

  const catalog = spec
    ? MODULE_CATALOG.find(x => x.catalogId === spec.type || x.catalogId.startsWith(`${spec.type}.`))
    : null;

  const compiled = spec
    ? (() => {
        try {
          const typedTarget: DeployTarget = String(spec.type).startsWith('theme.')
            ? { kind: 'THEME', themeId: '0', moduleId: mod.id }
            : { kind: 'PLATFORM', moduleId: mod.id };
          return compileRecipe(spec, typedTarget);
        } catch (e) {
          return { error: String(e) };
        }
      })()
    : null;

  const versions = mod.versions.map(v => ({
    id: v.id,
    version: v.version,
    status: v.status,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    isActive: mod.activeVersionId === v.id,
  }));

  // If the current DRAFT has no hydration data, fall back to the most recently hydrated version.
  // This prevents "generate full settings" from re-appearing after a save creates a new draft.
  const hydratedSource = draft?.hydratedAt
    ? draft
    : (mod.versions as Array<{ hydratedAt: Date | null; adminConfigSchemaJson: string | null; adminDefaultsJson?: string | null; validationReportJson: string | null }>)
        .find(v => v.hydratedAt != null) ?? null;

  // Preview: prefer AI-generated previewHtmlJson, fall back to static PreviewService
  let previewHtml: string | null = null;
  let previewJson: unknown | null = null;
  if (draft?.previewHtmlJson) {
    previewHtml = draft.previewHtmlJson;
  } else if (spec) {
    // Inherit the merchant's live-theme fonts so the preview matches the storefront.
    const aesthetic = await loadStoreAesthetic(mod.shopId).catch(() => null);
    const result = new PreviewService().render(spec, { themeFonts: aesthetic?.typography });
    if (result.kind === 'HTML') {
      previewHtml = result.html;
    } else {
      previewJson = result.json;
    }
  }

  let themes: { id: number; name: string; role: string }[] = [];
  if (spec && String(spec.type).startsWith('theme.')) {
    try {
      const themeService = new ThemeService(admin);
      const raw = await themeService.listThemes();
      themes = raw
        .map(t => ({ id: Number(t.id), name: (t.name ?? '').toString(), role: (t.role ?? '').toString().toLowerCase() }))
        .filter(t => Number.isFinite(t.id) && t.id > 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[modules.$moduleId] Theme list fetch failed:', msg);
      }
    }
  }

  const publishedVersion = mod.versions.find(v => v.status === 'PUBLISHED') ?? mod.activeVersion ?? null;
  const publishedThemeId = publishedVersion?.targetThemeId ?? null;

  // everHydrated: true if any version has hydration data (used client-side to skip auto-trigger)
  const everHydrated = (mod.versions as Array<{ hydratedAt: Date | null }>).some(v => v.hydratedAt != null);

  const hydration = hydratedSource
    ? (() => {
        let validationReport: { overall: string; checks: { id: string; severity: string; status: string; description: string; howToFix?: string }[]; notes?: string[] } | null = null;
        if (hydratedSource.validationReportJson) {
          try {
            validationReport = JSON.parse(hydratedSource.validationReportJson) as typeof validationReport;
          } catch {
            // ignore invalid JSON
          }
        }
        return {
          status: 'done' as const,
          hydratedAt: hydratedSource.hydratedAt?.toISOString() ?? null,
          validationReport,
          everHydrated,
        };
      })()
    : { status: 'none' as const, hydratedAt: null, validationReport: null, everHydrated: false };

  // Internal notes live inside the draft spec JSON (no dedicated column) so the
  // Settings-tab notes field can persist without a schema migration.
  let internalNotes = '';
  if (draft?.specJson) {
    try { internalNotes = String((JSON.parse(draft.specJson) as Record<string, unknown>).internalNotes ?? ''); } catch { /* ignore */ }
  }

  // How this module deploys (runtime surface + plan requirement). Functions
  // don't assert shipped-ness here (depends on the deployed-function manifest).
  const deployment = (() => {
    try {
      const el = getExtensionEligibility((spec as { type?: string } | null)?.type as never ?? (mod as { type: string }).type as never);
      return {
        runtime: el.runtime,
        note: el.note,
        requiresPlan: el.requiresPlan ?? null,
        runtimeShipped: el.runtime === 'function' ? null : el.runtimeShipped,
      };
    } catch { return null; }
  })();

  return json({ moduleId, shop: session.shop, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId, hydration, blueprint, internalNotes, deployment });
}

const RUNTIME_LABEL: Record<string, string> = {
  theme: 'Theme app extension',
  'checkout-ui': 'Checkout UI extension',
  'customer-account-ui': 'Customer account extension',
  'admin-ui': 'Admin UI extension',
  flow: 'Shopify Flow',
  'web-pixel': 'Web Pixel',
  'pos-ui': 'POS UI extension',
  'app-proxy': 'App proxy (always available)',
  function: 'Shopify Function',
  'agentic-feed': 'Agentic product feed',
  composite: 'Composite (uses other modules)',
};

/**
 * Route-owned mutations: duplicate (create a draft copy), rename (Module.name +
 * draft spec name), delete. All return JSON so the UI can toast from the server
 * response.
 */
export async function action({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const form = await request.formData();
  const intent = String(form.get('intent') ?? '').trim();

  const ms = new ModuleService();
  const mod = await ms.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  if (intent === 'duplicate') {
    const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
    if (!draft) return json({ error: 'No version to duplicate' }, { status: 400 });
    let spec: RecipeSpec;
    try {
      spec = new RecipeService().parse(draft.specJson);
    } catch (e) {
      return json({ error: `Module spec is invalid: ${String(e)}` }, { status: 422 });
    }
    const name = `${mod.name} (copy)`.slice(0, 80);
    const copy = await ms.createDraft(session.shop, { ...spec, name });
    await new ActivityLogService().log({
      actor: 'MERCHANT',
      action: 'MODULE_DUPLICATED',
      resource: `module:${copy.id}`,
      shopId: mod.shopId,
      details: { sourceModuleId: mod.id, name, type: mod.type },
    }).catch(() => { /* non-fatal */ });
    return json({ ok: true, intent: 'duplicate', id: copy.id, name });
  }

  if (intent === 'rename') {
    const name = String(form.get('name') ?? '').trim().slice(0, 80);
    if (!name) return json({ error: 'Module name is required' }, { status: 400 });
    const prisma = getPrisma();
    await prisma.module.update({ where: { id: mod.id }, data: { name } });
    // Keep the draft spec's name in sync so the recipe matches what merchants see.
    const draft = mod.versions.find(v => v.status === 'DRAFT');
    if (draft) {
      try {
        const s = JSON.parse(draft.specJson) as Record<string, unknown>;
        s.name = name;
        await prisma.moduleVersion.update({ where: { id: draft.id }, data: { specJson: JSON.stringify(s) } });
      } catch { /* leave spec untouched if unparseable */ }
    }
    return json({ ok: true, intent: 'rename', name });
  }

  if (intent === 'notes') {
    // Internal notes are stored inside the draft spec JSON (no dedicated column).
    const notes = String(form.get('notes') ?? '').slice(0, 2000);
    const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
    if (!draft) return json({ error: 'No version to update' }, { status: 400 });
    const prisma = getPrisma();
    try {
      const s = JSON.parse(draft.specJson) as Record<string, unknown>;
      if (notes) s.internalNotes = notes; else delete s.internalNotes;
      await prisma.moduleVersion.update({ where: { id: draft.id }, data: { specJson: JSON.stringify(s) } });
    } catch {
      return json({ error: 'Module spec is invalid' }, { status: 422 });
    }
    return json({ ok: true, intent: 'notes' });
  }

  if (intent === 'delete') {
    await ms.deleteModule(session.shop, moduleId);
    await new ActivityLogService().log({
      actor: 'MERCHANT',
      action: 'MODULE_DELETED',
      resource: `module:${moduleId}`,
      shopId: mod.shopId,
      details: { name: mod.name, type: mod.type, deleted: true },
    }).catch(() => { /* non-fatal */ });
    return json({ ok: true, intent: 'delete', name: mod.name });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

function getDefaultThemeId(
  themes: { id: number; name: string; role: string }[],
  publishedThemeId: string | null
): string {
  if (!themes.length) return '';
  const publishedMatch = publishedThemeId && themes.some(t => String(t.id) === String(publishedThemeId));
  if (publishedMatch) return String(publishedThemeId);
  const main = themes.find(t => String(t.role).toLowerCase() === 'main');
  return main ? String(main.id) : String(themes[0]!.id);
}

/* Vendored category tone → Polaris badge tone ('magic' has no equivalent → 'caution'). */
const CAT_BADGE_TONE: Record<string, WcTone> = { info: 'info', success: 'success', warning: 'warning', magic: 'caution' };
function catTone(category: string): WcTone {
  return CAT_BADGE_TONE[getCategoryTone(category)] ?? 'neutral';
}

const MONO_PRE: CSSProperties = {
  margin: 0, maxHeight: 480, overflow: 'auto', padding: 16,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

export default function ModuleDetail() {
  return (
    <MerchantShell polaris>
      <ModuleDetailBody />
    </MerchantShell>
  );
}

function ModuleDetailBody() {
  const data = useLoaderData<typeof loader>();
  const { moduleId, mod, spec, versions, themes, publishedThemeId, hydration, internalNotes, deployment, previewHtml, previewJson } = data;
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();

  const validationReport = (hydration?.validationReport ?? null) as
    | { overall: string; checks: { id: string; severity: string; status: string; description: string }[] }
    | null;
  // Bucket on the raw library category so the "Type" badge agrees with the
  // "Category" row (previously a lossy heuristic mislabeled admin/customer-account
  // modules as "Storefront UI").
  const category = String(mod.category || 'STOREFRONT_UI');
  const categoryLabel = getCategoryDisplayLabel(category);
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isDraft = mod.status === 'DRAFT';
  const summary = (mod as any).summary || `${categoryLabel} module`;

  const [tab, setTab] = useState('overview');
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState(getDefaultThemeId(themes, publishedThemeId ?? null));
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState(mod.name);
  const [notesDraft, setNotesDraft] = useState(internalNotes ?? '');

  const publishFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const rollbackFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string; name?: string }>();
  const modifyFetcher = useFetcher<{ options?: any[]; error?: string }>();
  const applyFetcher = useFetcher<{ ok?: boolean; version?: number; error?: string }>();
  const duplicateFetcher = useFetcher<{ ok?: boolean; id?: string; name?: string; error?: string }>();
  const renameFetcher = useFetcher<{ ok?: boolean; name?: string; error?: string }>();
  const notesFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const hydrateFetcher = useFetcher<{ ok?: boolean; error?: string; message?: string }>();
  const fillSettingsFetcher = useFetcher<{
    ok?: boolean;
    filled?: boolean;
    version?: number;
    message?: string;
    error?: string;
    diff?: { addedKeys?: string[] };
  }>();
  const coDeployFetcher = useFetcher<{
    recipeId?: string;
    published?: { moduleId: string; type: string }[];
    failed?: { moduleId: string; type: string; error: string }[];
    skipped?: { moduleId: string; type: string; reason: string }[];
    error?: string;
  }>();

  const isPublishing = publishFetcher.state !== 'idle';
  const isCoDeploying = coDeployFetcher.state !== 'idle';

  useEffect(() => {
    if (coDeployFetcher.state !== 'idle' || !coDeployFetcher.data) return;
    const d = coDeployFetcher.data;
    if (d.error) {
      ctx.toast(d.error, { error: true });
    } else {
      const okN = d.published?.length ?? 0;
      const badN = (d.failed?.length ?? 0) + (d.skipped?.length ?? 0);
      ctx.toast(
        badN > 0 ? `Published ${okN} of ${okN + badN} — ${badN} need attention` : `Published all ${okN} modules`,
        { error: badN > 0 },
      );
      revalidator.revalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coDeployFetcher.data, coDeployFetcher.state]);

  const publishAll = () => {
    if (!data.blueprint) return;
    const fd = new FormData();
    if (isThemeModule && selectedThemeId) fd.set('themeId', selectedThemeId);
    coDeployFetcher.submit(fd, { method: 'post', action: `/api/blueprints/${data.blueprint.id}/publish` });
  };

  useEffect(() => {
    if (publishFetcher.data?.ok && publishFetcher.state === 'idle') {
      ctx.toast(isDraft ? 'Published — live in a few minutes' : 'Re-published');
      revalidator.revalidate();
    } else if (publishFetcher.data?.error && publishFetcher.state === 'idle') {
      ctx.toast(publishFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishFetcher.data, publishFetcher.state]);

  useEffect(() => {
    if (rollbackFetcher.data?.ok && rollbackFetcher.state === 'idle') {
      ctx.toast('Rolled back');
      revalidator.revalidate();
    } else if (rollbackFetcher.data?.error && rollbackFetcher.state === 'idle') {
      ctx.toast(rollbackFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackFetcher.data, rollbackFetcher.state]);

  useEffect(() => {
    if (deleteFetcher.state !== 'idle') return;
    if (deleteFetcher.data?.ok) {
      ctx.toast(`Deleted “${deleteFetcher.data.name ?? mod.name}”`);
      navigate('/modules');
    } else if (deleteFetcher.data?.error) {
      ctx.toast(deleteFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.data, deleteFetcher.state]);

  useEffect(() => {
    if (duplicateFetcher.state !== 'idle') return;
    if (duplicateFetcher.data?.ok && duplicateFetcher.data.id) {
      ctx.toast(`Duplicated as “${duplicateFetcher.data.name}”`);
      navigate(`/modules/${duplicateFetcher.data.id}`);
    } else if (duplicateFetcher.data?.error) {
      ctx.toast(duplicateFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateFetcher.data, duplicateFetcher.state]);

  useEffect(() => {
    if (renameFetcher.state !== 'idle') return;
    if (renameFetcher.data?.ok) {
      ctx.toast('Module name saved');
      revalidator.revalidate();
    } else if (renameFetcher.data?.error) {
      ctx.toast(renameFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameFetcher.data, renameFetcher.state]);

  useEffect(() => {
    if (notesFetcher.state !== 'idle') return;
    if (notesFetcher.data?.ok) {
      ctx.toast('Notes saved');
    } else if (notesFetcher.data?.error) {
      ctx.toast(notesFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesFetcher.data, notesFetcher.state]);

  useEffect(() => {
    if (applyFetcher.state !== 'idle') return;
    if (applyFetcher.data?.ok) {
      ctx.toast(`Change applied — saved as v${applyFetcher.data.version}`);
      setModifyOpen(false);
      setModifyInstruction('');
      setApplyingIdx(null);
      revalidator.revalidate();
    } else if (applyFetcher.data?.error) {
      ctx.toast(applyFetcher.data.error, { error: true });
      setApplyingIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFetcher.data, applyFetcher.state]);

  useEffect(() => {
    if (hydrateFetcher.state !== 'idle') return;
    if (hydrateFetcher.data?.ok) {
      ctx.toast('Full settings generated');
      revalidator.revalidate();
    } else if (hydrateFetcher.data?.error) {
      ctx.toast(hydrateFetcher.data.message ?? hydrateFetcher.data.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateFetcher.data, hydrateFetcher.state]);

  useEffect(() => {
    if (fillSettingsFetcher.state !== 'idle' || !fillSettingsFetcher.data) return;
    const d = fillSettingsFetcher.data;
    if (d.ok && d.filled) {
      const n = d.diff?.addedKeys?.length ?? 0;
      ctx.toast(`Filled ${n} missing setting${n === 1 ? '' : 's'}${d.version ? ` — saved as v${d.version}` : ''}`);
      revalidator.revalidate();
    } else if (d.ok && !d.filled) {
      ctx.toast(d.message ?? 'All settings are already filled.');
    } else if (d.error) {
      ctx.toast(d.message ?? d.error, { error: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillSettingsFetcher.data, fillSettingsFetcher.state]);

  const justPublished = searchParams.get('published') === '1';

  const publish = () => {
    const body: Record<string, string> = {};
    if (isThemeModule && selectedThemeId) body.themeId = selectedThemeId;
    publishFetcher.submit(body, { method: 'post', action: `/api/agent/modules/${moduleId}/publish`, encType: 'application/json' });
  };
  const rollback = (version: number) => {
    rollbackFetcher.submit({ moduleId, version: String(version) }, { method: 'post', action: '/api/rollback' });
  };
  const doDelete = () => {
    deleteFetcher.submit({ intent: 'delete' }, { method: 'post' });
    setDelOpen(false);
  };
  const duplicate = () => {
    duplicateFetcher.submit({ intent: 'duplicate' }, { method: 'post' });
  };
  const exportSpec = () => {
    // Server-side download of the current draft spec (Content-Disposition: attachment).
    const a = document.createElement('a');
    a.href = `/modules/${moduleId}?export=spec`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const openPreview = () => {
    // Pass the shop so the bare top-level GET in the new tab can render the module's
    // own compiled preview without the embedded admin session (which it doesn't have).
    window.open(`/preview/${moduleId}?shop=${encodeURIComponent(data.shop)}`, '_blank', 'noopener,noreferrer');
  };
  const saveName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    renameFetcher.submit({ intent: 'rename', name }, { method: 'post' });
  };
  const saveNotes = () => {
    notesFetcher.submit({ intent: 'notes', notes: notesDraft }, { method: 'post' });
  };
  const generateSettings = () => {
    hydrateFetcher.submit({ moduleId }, { method: 'post', action: '/api/ai/hydrate-module' });
  };
  const fillMissingSettings = () => {
    fillSettingsFetcher.submit({ moduleId }, { method: 'post', action: '/api/ai/fill-settings' });
  };
  const applyOption = (option: any, idx: number) => {
    setApplyingIdx(idx);
    applyFetcher.submit(
      { moduleId, spec: JSON.stringify(option.recipe) },
      { method: 'post', action: '/api/ai/modify-module-confirm' },
    );
  };
  const submitModify = () => {
    const q = modifyInstruction.trim();
    if (!q) return;
    modifyFetcher.submit({ instruction: q }, { method: 'post', action: `/api/agent/modules/${moduleId}/modify`, encType: 'application/json' });
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'versions', label: `Versions (${versions.length})` },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <s-page heading={mod.name} inlineSize="base">
      {isDraft
        ? <s-button slot="primary-action" variant="primary" icon="rocket" loading={isPublishing || undefined} onClick={publish}>Publish</s-button>
        : <s-button slot="primary-action" variant="primary" icon="refresh" loading={isPublishing || undefined} onClick={publish}>Republish</s-button>}
      <s-button slot="secondary-actions" icon="view" onClick={openPreview}>Preview</s-button>
      <s-button slot="secondary-actions" icon="wand" onClick={() => setModifyOpen(true)}>Modify with AI</s-button>
      <s-button
        slot="secondary-actions"
        variant="tertiary"
        icon="menu-horizontal"
        accessibilityLabel="More actions"
        commandFor="module-more-menu"
        command="--toggle"
      />
      <s-popover id="module-more-menu">
        <s-menu>
          <s-button icon="duplicate" onClick={duplicate}>Duplicate</s-button>
          <s-button icon="download" onClick={exportSpec}>Export spec</s-button>
          <s-button icon="delete" tone="critical" onClick={() => setDelOpen(true)}>Delete module</s-button>
        </s-menu>
      </s-popover>

      <s-stack direction="inline" gap="small-100" alignItems="center">
        <s-button variant="tertiary" icon="arrow-left" onClick={() => ctx.go('#/app/modules')}>AI Modules</s-button>
        <StatusBadge status={mod.status} />
        <s-text color="subdued">{summary}</s-text>
      </s-stack>

      {data.blueprint && (
        <s-banner tone="info" heading={`Part of the “${data.blueprint.name}” blueprint (${data.blueprint.moduleCount} modules)`}>
          <s-stack gap="small-100">
            <s-stack direction="inline" gap="small-100">
              {data.blueprint.members.map((mem: { id: string; name: string; type: string; status: string }) => (
                <s-link key={mem.id} href={`/modules/${mem.id}`}>
                  <s-badge tone={mem.id === data.moduleId ? 'info' : mem.status === 'PUBLISHED' ? 'success' : 'neutral'}>{mem.name}</s-badge>
                </s-link>
              ))}
            </s-stack>
            {data.blueprint.draftCount > 0 && (
              <s-stack direction="inline">
                <s-button variant="primary" icon="layer" loading={isCoDeploying || undefined} onClick={publishAll}>
                  {`Publish all ${data.blueprint.moduleCount} modules`}
                </s-button>
              </s-stack>
            )}
          </s-stack>
        </s-banner>
      )}

      {justPublished && (
        <s-banner tone="success" heading="Module published">This module is now live on your storefront.</s-banner>
      )}

      {isThemeModule && themes.length > 0 && (
        <s-box maxInlineSize="360px">
          <s-select label="Publish to theme" value={selectedThemeId} onChange={(e) => setSelectedThemeId(e.currentTarget.value)}>
            {themes.map((t: { id: number; name: string; role: string }) => (
              <s-option key={t.id} value={String(t.id)}>{`${t.name}${t.role === 'main' ? ' (live)' : ''}`}</s-option>
            ))}
          </s-select>
        </s-box>
      )}

      {delOpen && (
        <ConfirmModal open heading="Delete module?" tone="critical" confirmLabel="Delete"
          loading={deleteFetcher.state !== 'idle'}
          onConfirm={doDelete} onClose={() => setDelOpen(false)}>
          <s-paragraph>{`This removes “${mod.name}” and all of its versions. This cannot be undone.`}</s-paragraph>
        </ConfirmModal>
      )}

      {modifyOpen && (
        <ModifyAiModal
          instruction={modifyInstruction}
          setInstruction={setModifyInstruction}
          options={modifyFetcher.data?.options}
          error={modifyFetcher.data?.error}
          generating={modifyFetcher.state !== 'idle'}
          applyingIdx={applyingIdx}
          applyBusy={applyFetcher.state !== 'idle'}
          onApply={applyOption}
          onGenerate={submitModify}
          onClose={() => setModifyOpen(false)}
        />
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-stack gap="base">
            <s-section padding="none">
              <s-box border="base" borderRadius="base" overflow="hidden">
                {previewHtml ? (
                  <div style={{ position: 'relative', background: '#fff' }}>
                    <iframe
                      title={`Preview of ${mod.name}`}
                      srcDoc={previewHtml}
                      // No allow-same-origin: previewHtml may include AI-generated
                      // (draft.previewHtmlJson) markup. Keeping the frame at an opaque
                      // origin means any injected script can't reach the admin app's
                      // origin (cookies/storage/parent DOM). The self-contained preview
                      // scripts (countdown, link-intercept) run fine without it.
                      sandbox="allow-scripts"
                      onLoad={() => setPreviewLoaded(true)}
                      style={{ display: 'block', width: '100%', height: 480, border: 0, background: '#fff' }}
                    />
                    {!previewLoaded && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff' }}>
                        <s-spinner size="base" accessibilityLabel="Rendering preview" />
                        <s-text color="subdued">Rendering preview…</s-text>
                      </div>
                    )}
                  </div>
                ) : previewJson ? (
                  <pre style={MONO_PRE}>{JSON.stringify(previewJson, null, 2)}</pre>
                ) : (
                  <EmptyState icon="view" heading="No preview available">
                    This module type has no visual storefront preview.
                  </EmptyState>
                )}
              </s-box>
              <s-box padding="base">
                <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                  <s-text color="subdued">Live preview</s-text>
                  <s-button icon="external" onClick={openPreview}>Open in new tab</s-button>
                </s-grid>
              </s-box>
            </s-section>
            <s-section heading="What this module does">
              <s-paragraph>
                This module adds a {mod.name.toLowerCase()} to your storefront. It is currently on version {versions[0]?.version ?? 1}. All changes are versioned and reversible.
              </s-paragraph>
            </s-section>
            {validationReport && (
              <s-section heading="Validation">
                <s-stack gap="small-200">
                  {validationReport.checks.slice(0, 6).map((c) => (
                    <s-stack key={c.id} direction="inline" gap="small-100" alignItems="center">
                      <s-icon
                        type={c.status === 'PASS' ? 'check-circle' : 'alert-triangle'}
                        tone={c.status === 'PASS' ? 'success' : 'critical'}
                        size="small"
                      />
                      <s-text>{c.description}</s-text>
                    </s-stack>
                  ))}
                </s-stack>
                <s-divider />
                <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                  <s-text color="subdued">Let AI fill any remaining empty settings — merchant-set values are never overwritten.</s-text>
                  <s-button icon="wand" loading={fillSettingsFetcher.state !== 'idle' || undefined} onClick={fillMissingSettings}>
                    Fill missing settings
                  </s-button>
                </s-grid>
              </s-section>
            )}
          </s-stack>
          <s-stack gap="base">
            <s-section heading="Details">
              <KV rows={[
                ['Type', <s-badge key="t" tone={catTone(category)}>{categoryLabel}</s-badge>],
                ['Category', categoryLabel],
                ['Version', 'v' + (versions[0]?.version ?? 1)],
                ['Status', <StatusBadge key="s" status={mod.status} />],
              ]} />
            </s-section>
            {deployment ? (
              <s-section heading="Deployment">
                <s-stack gap="small-100">
                  <s-stack direction="inline" gap="small-100">
                    <s-badge>{RUNTIME_LABEL[deployment.runtime] ?? deployment.runtime}</s-badge>
                    {deployment.requiresPlan === 'plus' ? <s-badge tone="warning">Takes effect on Shopify Plus</s-badge> : null}
                    {deployment.runtimeShipped === false ? <s-badge tone="warning">Runtime pending in this app build</s-badge> : null}
                  </s-stack>
                  <s-text color="subdued">{deployment.note}</s-text>
                </s-stack>
              </s-section>
            ) : null}
            <s-section heading="Placement">
              <s-text color="subdued">{placementText(spec, category)}</s-text>
            </s-section>
          </s-stack>
        </s-grid>
      )}

      {tab === 'versions' && (
        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Version</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="kicker">Published</s-table-header>
              <s-table-header> </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {versions.map((r: any) => (
                <s-table-row key={r.version}>
                  <s-table-cell><s-text type="strong">v{r.version}</s-text></s-table-cell>
                  <s-table-cell><StatusBadge status={r.status} /></s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('en-US') : '—'}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {!r.isActive && <s-button icon="replay" onClick={() => rollback(r.version)}>Roll back</s-button>}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      {tab === 'settings' && (
        <s-section>
          <s-box maxInlineSize="520px">
            <s-stack gap="base">
              <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="end">
                <s-text-field label="Module name" value={nameDraft} onInput={(e) => setNameDraft(e.currentTarget.value ?? '')} />
                <s-button icon="check" loading={renameFetcher.state !== 'idle' || undefined}
                  disabled={(!nameDraft.trim() || nameDraft.trim() === mod.name) || undefined}
                  onClick={saveName}>Save</s-button>
              </s-grid>
              <s-stack gap="small-100">
                <s-text-area label="Internal notes" details="Optional — notes for your team" rows={3}
                  placeholder="Notes for your team…"
                  value={notesDraft} onInput={(e) => setNotesDraft(e.currentTarget.value ?? '')} />
                <s-stack direction="inline">
                  <s-button icon="check" loading={notesFetcher.state !== 'idle' || undefined}
                    disabled={notesDraft === (internalNotes ?? '') || undefined}
                    onClick={saveNotes}>Save notes</s-button>
                </s-stack>
              </s-stack>
              <s-divider />
              {hydration?.status === 'none' && (
                <>
                  <s-banner tone="info" heading="Generate full settings">
                    <s-stack gap="small-100">
                      <s-text>Let AI expand this module into a complete, validated settings schema you can fine-tune.</s-text>
                      <s-stack direction="inline">
                        <s-button icon="wand" loading={hydrateFetcher.state !== 'idle' || undefined} onClick={generateSettings}>
                          Generate full settings
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-banner>
                  <s-divider />
                </>
              )}
              <s-banner tone="critical" heading="Delete this module">
                <s-stack gap="small-100">
                  <s-text>This removes the module and all versions. It cannot be undone.</s-text>
                  <s-stack direction="inline">
                    <s-button tone="critical" icon="delete" onClick={() => setDelOpen(true)}>Delete module</s-button>
                  </s-stack>
                </s-stack>
              </s-banner>
            </s-stack>
          </s-box>
        </s-section>
      )}
    </s-page>
  );
}

/**
 * "Modify with AI" modal. Ref-driven show()/hide() (Polaris web-component
 * modal), closing via the component's `afterhide` custom event so ESC/overlay
 * dismissal stays in sync with React state.
 */
function ModifyAiModal({
  instruction, setInstruction, options, error, generating, applyingIdx, applyBusy, onApply, onGenerate, onClose,
}: {
  instruction: string;
  setInstruction: (v: string) => void;
  options?: any[];
  error?: string;
  generating: boolean;
  applyingIdx: number | null;
  applyBusy: boolean;
  onApply: (option: any, idx: number) => void;
  onGenerate: () => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  return (
    <s-modal ref={modalRef as never} heading="Modify with AI">
      <s-stack gap="base">
        <s-text color="subdued">Describe the change in plain language.</s-text>
        <s-text-area
          label="What should change?"
          rows={4}
          placeholder="e.g. Make the button green and add a quantity stepper"
          value={instruction}
          onInput={(e) => setInstruction(e.currentTarget.value ?? '')}
        />
        {error && <s-banner tone="critical">{error}</s-banner>}
        {options && options.map((o: any, i: number) => (
          <s-box key={i} border="base" borderRadius="base" padding="base">
            <s-stack gap="small-100">
              <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                <s-text type="strong">Option {i + 1}</s-text>
                <s-button variant="primary" icon="check"
                  loading={applyingIdx === i || undefined}
                  disabled={applyBusy || undefined}
                  onClick={() => onApply(o, i)}>
                  Apply
                </s-button>
              </s-grid>
              <s-text color="subdued">{o.explanation}</s-text>
            </s-stack>
          </s-box>
        ))}
      </s-stack>
      <s-button slot="primary-action" variant="primary" icon="wand"
        loading={generating || undefined}
        disabled={!instruction.trim() || undefined}
        onClick={onGenerate}>
        Generate options
      </s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
