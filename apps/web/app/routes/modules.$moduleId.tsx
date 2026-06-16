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
import { computeRepublishDiff } from '@superapp/platform-contracts';
import type { ModuleType } from '@superapp/core';
import { SettingsService } from '~/services/settings/settings.service';
import { buildAdminFormConfig } from '~/services/control-packs/admin-form.server';
import { compileRecipe } from '~/services/recipes/compiler';
import { ThemeService } from '~/services/shopify/theme.service';
import type { Capability, DeployTarget } from '@superapp/core';
import type { V2Form } from '~/components/ConfigEditor';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Badge, StatusBadge, Card, CardHead, Section, Field, Input, Textarea, Select,
  Tabs, Banner, Menu, KV, PageHead, DataTable, ConfirmDialog, Modal, titleCase,
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

  // WS5/026 + WS3/024: idempotent republish preview — what changes if the merchant
  // republishes the current draft over the live version. Pure config diff; no I/O.
  const republishDiff = (() => {
    if (!spec) return null;
    const draftConfig = ((spec as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;
    let existing: { metaobjectId: string; config: Record<string, unknown> } | null = null;
    if (publishedVersion) {
      try {
        const publishedSpec = new RecipeService().parse(publishedVersion.specJson);
        existing = {
          metaobjectId: publishedVersion.id,
          config: ((publishedSpec as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>,
        };
      } catch {
        existing = null;
      }
    }
    return computeRepublishDiff({
      moduleType: spec.type,
      metaobjectType: spec.type,
      existing,
      next: draftConfig,
    });
  })();

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

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId, hydration, adminConfig, engine, v2Form, republishDiff, blueprint });
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

  const publishFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const rollbackFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const deleteFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const modifyFetcher = useFetcher<{ options?: any[]; error?: string }>();

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollbackFetcher.data, rollbackFetcher.state]);

  useEffect(() => {
    if (deleteFetcher.data?.ok && deleteFetcher.state === 'idle') {
      navigate('/modules');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteFetcher.data, deleteFetcher.state]);

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
    deleteFetcher.submit({}, { method: 'post', action: `/api/modules/${moduleId}/delete` });
    ctx.toast(`Deleted “${mod.name}”`);
    setDelOpen(false);
  };
  const submitModify = () => {
    const q = modifyInstruction.trim();
    if (!q) return;
    modifyFetcher.submit({ instruction: q }, { method: 'post', action: `/api/agent/modules/${moduleId}/modify`, encType: 'application/json' });
    ctx.toast('Generating modification options…');
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
            <Btn icon="eye" onClick={() => ctx.toast('Opening live preview')}>Preview</Btn>
            <Btn icon="magic" onClick={() => setModifyOpen(true)}>Modify with AI</Btn>
            <Menu trigger={<button className="btn btn-icon"><Icon name="dotsH" size={16} /></button>} items={[
              { icon: 'copy', label: 'Duplicate', onClick: () => ctx.toast(`Duplicated “${mod.name}”`) },
              { icon: 'download', label: 'Export spec', onClick: () => ctx.toast('Spec exported as JSON') },
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
              {data.blueprint.members.map((mem) => (
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
              options={themes.map(t => ({ value: String(t.id), label: `${t.name}${t.role === 'main' ? ' (live)' : ''}` }))}
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
                        <Icon name={c.status === 'pass' ? 'check' : 'alert'} size={14}
                          style={{ color: c.status === 'pass' ? 'var(--p-success)' : 'var(--p-critical)' }} />
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
