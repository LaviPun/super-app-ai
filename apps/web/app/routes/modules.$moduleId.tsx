import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useFetcher, useSearchParams, useRevalidator } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { BlueprintService } from '~/services/blueprints/blueprint.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { PreviewService } from '~/services/preview/preview.service';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';
import { MODULE_CATALOG, isCapabilityAllowed, hasManifest } from '@superapp/core';
import type { ModuleType } from '@superapp/core';
import { SettingsService } from '~/services/settings/settings.service';
import { buildAdminFormConfig } from '~/services/control-packs/admin-form.server';
import { compileRecipe } from '~/services/recipes/compiler';
import { ThemeService } from '~/services/shopify/theme.service';
import type { Capability, DeployTarget, RecipeSpec } from '@superapp/core';
import { ConfigEditor, type V2Form } from '~/components/ConfigEditor';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Badge, StatusBadge, Card, CardHead, Section, Field, Input, Textarea, Select,
  Tabs, Banner, Menu, KV, PageHead, DataTable, ConfirmDialog, Modal, EmptyState, titleCase,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TYPE_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };

function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

// Real placement description derived from the module's spec — no hardcoded copy.
function placementText(spec: any, designT: string): string {
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
  switch (designT) {
    case 'Function': return 'Runs automatically during checkout as a Shopify Function — no storefront placement.';
    case 'Flow': return 'Runs in the background when its trigger fires — no storefront placement.';
    case 'Integration': return 'Connects to an external service — no storefront placement.';
    case 'Data store': return 'Stores structured data used by your modules — no storefront placement.';
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
  let blueprint: { id: string; name: string; moduleCount: number; members: { id: string; name: string; type: string }[] } | null = null;
  if (mod.recipeId) {
    const bp = await new BlueprintService().getBlueprint(session.shop, mod.recipeId);
    if (bp && bp.modules.length > 1) {
      blueprint = {
        id: bp.id,
        name: bp.title,
        moduleCount: bp.modules.length,
        members: bp.modules.map((x) => ({ id: x.id, name: x.name, type: x.type })),
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

  // Parse AI-generated admin config schema (from hydration)
  let adminConfig: { jsonSchema: Record<string, unknown>; uiSchema?: Record<string, unknown>; defaults: Record<string, unknown> } | null = null;
  const adminConfigSource = hydratedSource?.adminConfigSchemaJson ?? null;
  if (adminConfigSource) {
    try {
      adminConfig = JSON.parse(adminConfigSource) as typeof adminConfig;
    } catch {
      // ignore malformed JSON
    }
  }

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

  // Module System v2: when the engine flag is on and this type has a control-pack
  // manifest, compose the grouped admin-form schema. Defaults to v1 (no change).
  const engine = (await new SettingsService().get()).moduleSystemVersion;
  const v2Form: V2Form | null =
    engine === 'v2' && spec && hasManifest(spec.type as ModuleType)
      ? (() => {
          const built = buildAdminFormConfig(spec.type as ModuleType, 'advanced');
          return built
            ? ({ jsonSchema: built.jsonSchema, uiSchema: built.uiSchema, tier: 'advanced' } as unknown as V2Form)
            : null;
        })()
      : null;

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId, hydration, adminConfig, engine, v2Form, blueprint });
}

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

export default function ModuleDetail() {
  return (
    <MerchantShell>
      <ModuleDetailBody />
    </MerchantShell>
  );
}

function ModuleDetailBody() {
  const data = useLoaderData<typeof loader>();
  const { moduleId, mod, spec, versions, themes, publishedThemeId, hydration } = data;
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();

  const validationReport = (hydration?.validationReport ?? null) as
    | { overall: string; checks: { id: string; severity: string; status: string; description: string }[] }
    | null;
  const designT = designType(String(spec?.type ?? mod.type));
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isDraft = mod.status === 'DRAFT';
  const summary = (mod as any).summary || `${designT} module`;

  const [tab, setTab] = useState('overview');
  const [delOpen, setDelOpen] = useState(false);
  const [modifyOpen, setModifyOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState(getDefaultThemeId(themes, publishedThemeId ?? null));
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState(mod.name);

  const publishFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const rollbackFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string; name?: string }>();
  const modifyFetcher = useFetcher<{ options?: any[]; error?: string }>();
  const applyFetcher = useFetcher<{ ok?: boolean; version?: number; error?: string }>();
  const duplicateFetcher = useFetcher<{ ok?: boolean; id?: string; name?: string; error?: string }>();
  const renameFetcher = useFetcher<{ ok?: boolean; name?: string; error?: string }>();
  const hydrateFetcher = useFetcher<{ ok?: boolean; error?: string; message?: string }>();

  const isPublishing = publishFetcher.state !== 'idle';

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
    window.open(`/preview/${moduleId}`, '_blank', 'noopener,noreferrer');
  };
  const saveName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    renameFetcher.submit({ intent: 'rename', name }, { method: 'post' });
  };
  const generateSettings = () => {
    hydrateFetcher.submit({ moduleId }, { method: 'post', action: '/api/ai/hydrate-module' });
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
    { id: 'versions', label: 'Versions', badge: versions.length },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="page">
      <PageHead
        back={{ href: '/modules', label: 'AI Modules' }}
        title={mod.name}
        badge={<StatusBadge value={mod.status} />}
        sub={summary}
        actions={(
          <>
            <Btn icon="eye" onClick={openPreview}>Preview</Btn>
            <Btn icon="magic" onClick={() => setModifyOpen(true)}>Modify with AI</Btn>
            <Menu trigger={<button className="btn btn-icon"><Icon name="dotsH" size={16} /></button>} items={[
              { icon: 'copy', label: 'Duplicate', onClick: duplicate },
              { icon: 'download', label: 'Export spec', onClick: exportSpec },
              { divider: true },
              { icon: 'trash', label: 'Delete module', tone: 'critical', onClick: () => setDelOpen(true) },
            ]} />
            {isDraft
              ? <Btn variant="primary" icon="rocket" loading={isPublishing} onClick={publish}>Publish</Btn>
              : <Btn variant="primary" icon="refresh" loading={isPublishing} onClick={publish}>Republish</Btn>}
          </>
        )}
      />

      {data.blueprint && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="info" title={`Part of the “${data.blueprint.name}” blueprint (${data.blueprint.moduleCount} modules)`}>
            <div className="row-2" style={{ flexWrap: 'wrap', gap: 6 }}>
              {data.blueprint.members.map((mem: { id: string; name: string; type: string }) => (
                <a key={mem.id} href={`/modules/${mem.id}`} style={{ textDecoration: 'none' }}>
                  <Badge tone={mem.id === data.moduleId ? 'info' : undefined}>{mem.name}</Badge>
                </a>
              ))}
            </div>
          </Banner>
        </div>
      )}

      {justPublished && (
        <div style={{ marginBottom: 16 }}>
          <Banner tone="success" title="Module published">This module is now live on your storefront.</Banner>
        </div>
      )}

      {isThemeModule && themes.length > 0 && (
        <div style={{ marginBottom: 16, maxWidth: 360 }}>
          <Field label="Publish to theme">
            <Select
              options={themes.map((t: { id: number; name: string; role: string }) => ({ value: String(t.id), label: `${t.name}${t.role === 'main' ? ' (live)' : ''}` }))}
              value={selectedThemeId}
              onChange={(e: any) => setSelectedThemeId(e.target.value)}
            />
          </Field>
        </div>
      )}

      {delOpen && (
        <ConfirmDialog title="Delete module?" tone="critical" confirmLabel="Delete" icon="trash"
          message={`This removes “${mod.name}” and all of its versions. This cannot be undone.`}
          onConfirm={doDelete} onClose={() => setDelOpen(false)} />
      )}

      {modifyOpen && (
        <Modal title="Modify with AI" sub="Describe the change in plain language" onClose={() => setModifyOpen(false)}
          footer={(
            <>
              <span className="grow" />
              <Btn onClick={() => setModifyOpen(false)}>Cancel</Btn>
              <Btn variant="magic" icon="magic" loading={modifyFetcher.state !== 'idle'} disabled={!modifyInstruction.trim()}
                onClick={submitModify}>Generate options</Btn>
            </>
          )}>
          <div className="stack-4">
            <Field label="What should change?">
              <Textarea rows={4} placeholder="e.g. Make the button green and add a quantity stepper"
                value={modifyInstruction} onChange={(e: any) => setModifyInstruction(e.target.value)} />
            </Field>
            {modifyFetcher.data?.error && <Banner tone="critical">{modifyFetcher.data.error}</Banner>}
            {modifyFetcher.data?.options && (
              <div className="stack-2">
                {modifyFetcher.data.options.map((o: any, i: number) => (
                  <div key={i} className="card card-pad">
                    <div className="t-sm t-strong">Option {i + 1}</div>
                    <div className="t-sm t-muted">{o.explanation}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      <Card style={{ marginBottom: 18 }}>
        <Tabs active={tab} onChange={setTab} tabs={tabs} />
      </Card>

      {tab === 'overview' && (
        <div className="col-main">
          <div className="stack-4">
            <Card>
              <div className="br-canvas" style={{ height: 320, borderRadius: '12px 12px 0 0' }}>
                <div className="fake-pdp">
                  <div className="fake-img skel" />
                  <div className="stack-2" style={{ flex: 1 }}>
                    <div className="skel" style={{ height: 14, width: '60%' }} />
                    <div className="skel" style={{ height: 10, width: '40%' }} />
                    <div className="gen-overlay">
                      <div className="row-2"><Icon name="cart" size={16} /><span className="t-strong">Add to cart — $48.00</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <Section>
                <div className="row spread">
                  <div className="t-sm t-muted">Live preview · last rendered just now</div>
                  <Btn size="sm" icon="external">Open in new tab</Btn>
                </div>
              </Section>
            </Card>
            <Card>
              <CardHead title="What this module does" />
              <Section>
                <div className="t-body">
                  This module adds a {mod.name.toLowerCase()} to your storefront. It is currently on version {versions[0]?.version ?? 1}. All changes are versioned and reversible.
                </div>
              </Section>
            </Card>
            {validationReport && (
              <Card>
                <CardHead title="Validation" />
                <Section>
                  <div className="stack-2">
                    {validationReport.checks.slice(0, 6).map((c) => (
                      <div key={c.id} className="row-2">
                        <Icon name={c.status === 'PASS' ? 'check' : 'alert'} size={14}
                          style={{ color: c.status === 'PASS' ? 'var(--p-success)' : 'var(--p-critical)' }} />
                        <span className="t-sm">{c.description}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </Card>
            )}
          </div>
          <div className="stack-4">
            <Card pad>
              <div className="t-h3" style={{ marginBottom: 12 }}>Details</div>
              <KV rows={[
                ['Type', <Badge key="t" tone={TYPE_COLOR[designT]}>{designT}</Badge>],
                ['Category', titleCase(String(mod.category || 'General'))],
                ['Version', 'v' + (versions[0]?.version ?? 1)],
                ['Status', <StatusBadge key="s" value={mod.status} />],
              ]} />
            </Card>
            <Card pad>
              <div className="t-h3" style={{ marginBottom: 10 }}>Placement</div>
              <div className="t-sm t-muted">Shown on all product pages, sticky to the bottom of the viewport.</div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'versions' && (
        <Card>
          <DataTable rowKey="version" columns={[
            { key: 'version', label: 'Version', render: (r: any) => <span className="cell-strong">v{r.version}</span> },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'publishedAt', label: 'Published', render: (r: any) => <span className="cell-sub">{r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('en-US') : '—'}</span> },
            { key: 'act', label: '', render: (r: any) => (
              <div className="dt-actions">
                {!r.isActive && <Btn size="sm" icon="replay" onClick={() => rollback(r.version)}>Roll back</Btn>}
              </div>
            ) },
          ]} rows={versions} />
        </Card>
      )}

      {tab === 'settings' && (
        <Card pad>
          <div className="stack-4" style={{ maxWidth: 520 }}>
            <Field label="Module name"><Input defaultValue={mod.name} /></Field>
            <Field label="Internal notes" optional><Textarea placeholder="Notes for your team…" /></Field>
            <div className="divider" />
            <Banner tone="critical" title="Delete this module">
              <div className="stack-2">
                <span>This removes the module and all versions. It cannot be undone.</span>
                <div><Btn variant="critical" icon="trash" onClick={() => setDelOpen(true)}>Delete module</Btn></div>
              </div>
            </Banner>
          </div>
        </Card>
      )}
    </div>
  );
}
