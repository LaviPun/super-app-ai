import { json } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useFetcher, useSearchParams, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Button, TextField,
  Banner, Badge, DataTable, Box,
  Modal, Tabs, Select,
} from '@shopify/polaris';
import { useState, useCallback, useEffect, useRef } from 'react';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { PreviewService } from '~/services/preview/preview.service';
import { MODULE_CATALOG, isCapabilityAllowed } from '@superapp/core';
import { getTypeDisplayLabel, getTypeTone, getCategoryDisplayLabel } from '~/utils/type-label';
import { compileRecipe } from '~/services/recipes/compiler';
import { StyleBuilder } from '~/components/StyleBuilder';
import { ConfigEditor } from '~/components/ConfigEditor';
import { ThemeService } from '~/services/shopify/theme.service';
import type { Capability, DeployTarget, RecipeSpec } from '@superapp/core';

function isThemeStorefrontUi(spec: RecipeSpec): boolean {
  return ['theme.banner', 'theme.popup', 'theme.notificationBar', 'theme.contactForm', 'theme.effect', 'theme.floatingWidget', 'proxy.widget'].includes(spec.type);
}

const DB_STYLES = `
  @keyframes db-breathe {
    0%,100% { box-shadow: 0 4px 20px rgba(124,58,237,0.08), 0 0 0 1px rgba(139,92,246,0.12); }
    50%      { box-shadow: 0 12px 56px rgba(124,58,237,0.28), 0 0 0 1px rgba(139,92,246,0.24), 0 0 90px rgba(139,92,246,0.07); }
  }
  @keyframes db-beam   { 0% { left:-65%; } 100% { left:145%; } }
  @keyframes db-blink  { 0%,100% { opacity:1; } 50% { opacity:0; } }
  @keyframes db-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
`;

const DB_MESSAGES = [
  '> Querying neural layers...',
  '> Propagating signals...',
  '> Aggregating features...',
  '> Synthesizing module...',
  '> Rendering output...',
];

// Neural-network node coordinates [x, y]
const NN_IN:   [number, number][] = [[22, 18], [22, 48], [22, 78]];
const NN_H1:   [number, number][] = [[88, 10], [88, 33], [88, 56], [88, 79]];
const NN_H2:   [number, number][] = [[158, 10], [158, 33], [158, 56], [158, 79]];
const NN_OUT:  [number, number][] = [[218, 30], [218, 66]];

// 10 signal routes: input → hidden1 → hidden2 → output
const NN_SIGS: [number, number][][] = [
  [NN_IN[0]!, NN_H1[0]!, NN_H2[0]!, NN_OUT[0]!],
  [NN_IN[0]!, NN_H1[1]!, NN_H2[2]!, NN_OUT[1]!],
  [NN_IN[1]!, NN_H1[1]!, NN_H2[1]!, NN_OUT[0]!],
  [NN_IN[1]!, NN_H1[2]!, NN_H2[2]!, NN_OUT[1]!],
  [NN_IN[2]!, NN_H1[2]!, NN_H2[3]!, NN_OUT[0]!],
  [NN_IN[2]!, NN_H1[3]!, NN_H2[3]!, NN_OUT[1]!],
  [NN_IN[0]!, NN_H1[3]!, NN_H2[1]!, NN_OUT[0]!],
  [NN_IN[1]!, NN_H1[0]!, NN_H2[3]!, NN_OUT[1]!],
  [NN_IN[2]!, NN_H1[1]!, NN_H2[0]!, NN_OUT[0]!],
  [NN_IN[1]!, NN_H1[3]!, NN_H2[2]!, NN_OUT[1]!],
];

function nnPath(pts: [number, number][]): string {
  const [x0, y0] = pts[0]!;
  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]!;
    const [cx, cy] = pts[i]!;
    const mx = (px + cx) / 2;
    d += ` C ${mx} ${py} ${mx} ${cy} ${cx} ${cy}`;
  }
  return d;
}

function AIGeneratingAnimation({ label }: { label?: string }) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % DB_MESSAGES.length), 1700);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DB_STYLES }} />
      <div style={{
        padding: '28px 24px 22px',
        background: 'linear-gradient(145deg, #ffffff 0%, #f5f0ff 50%, #fdf4ff 100%)',
        borderRadius: 18,
        border: '1px solid rgba(139,92,246,0.14)',
        animation: 'db-breathe 3.2s ease-in-out infinite',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'center',
      }}>
        {/* light beam sweep */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '45%',
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)',
          animation: 'db-beam 3.8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* corner accent dots */}
        <div style={{ position: 'absolute', top: 12, left: 12,   width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.20)' }} />
        <div style={{ position: 'absolute', top: 12, right: 12,  width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.20)' }} />
        <div style={{ position: 'absolute', bottom: 12, left: 12,  width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.20)' }} />
        <div style={{ position: 'absolute', bottom: 12, right: 12, width: 5, height: 5, borderRadius: '50%', background: 'rgba(139,92,246,0.20)' }} />

        {/* Neural-network SVG */}
        <svg viewBox="0 0 298 96" width="298" height="96"
          style={{ display: 'block', margin: '0 auto 16px', overflow: 'visible' }}>
          <defs>
            <filter id="nn-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <radialGradient id="nn-ng" cx="38%" cy="32%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ede9fe" />
            </radialGradient>
          </defs>

          {/* Connection lines */}
          {NN_IN.flatMap(([ix, iy]) => NN_H1.map(([hx, hy], j) => (
            <line key={`ih1-${ix}-${j}`} x1={ix} y1={iy} x2={hx} y2={hy} stroke="rgba(139,92,246,0.10)" strokeWidth="0.7" />
          )))}
          {NN_H1.flatMap(([hx, hy], i) => NN_H2.map(([h2x, h2y], j) => (
            <line key={`h1h2-${i}-${j}`} x1={hx} y1={hy} x2={h2x} y2={h2y} stroke="rgba(139,92,246,0.10)" strokeWidth="0.7" />
          )))}
          {NN_H2.flatMap(([hx, hy], i) => NN_OUT.map(([ox, oy], j) => (
            <line key={`h2o-${i}-${j}`} x1={hx} y1={hy} x2={ox} y2={oy} stroke="rgba(139,92,246,0.10)" strokeWidth="0.7" />
          )))}
          {/* OUT → module card connectors */}
          {NN_OUT.map(([ox, oy], i) => (
            <line key={`om-${i}`} x1={ox} y1={oy} x2={235} y2={i === 0 ? 34 : 62} stroke="rgba(124,58,237,0.22)" strokeWidth="1" strokeDasharray="3 2" />
          ))}

          {/* Signal particles flowing through the network */}
          {NN_SIGS.map((pts, i) => (
            <circle key={`sig-${i}`} r="2.8" fill="#7c3aed" filter="url(#nn-glow)">
              <animateMotion
                dur="2.4s"
                repeatCount="indefinite"
                begin={`${-(i * 0.24).toFixed(2)}s`}
                path={nnPath(pts)}
                calcMode="linear"
              />
            </circle>
          ))}

          {/* Input + hidden nodes */}
          {[...NN_IN, ...NN_H1, ...NN_H2].map(([x, y], i) => (
            <g key={`nd-${i}`}>
              <circle cx={x} cy={y} r="5.5" fill="url(#nn-ng)" stroke="rgba(139,92,246,0.28)" strokeWidth="1.3" />
              <circle cx={x} cy={y} r="2" fill="rgba(139,92,246,0.42)" />
            </g>
          ))}

          {/* Output nodes — pulsing rings */}
          {NN_OUT.map(([x, y], i) => (
            <g key={`out-${i}`}>
              <circle cx={x} cy={y} r="7" fill="url(#nn-ng)" stroke="#7c3aed" strokeWidth="2">
                <animate attributeName="r"             values="7;9;7"     dur="2s" repeatCount="indefinite" begin={`${i * 0.7}s`} />
                <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin={`${i * 0.7}s`} />
              </circle>
              <circle cx={x} cy={y} r="3" fill="#7c3aed">
                <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin={`${i * 0.7}s`} />
              </circle>
            </g>
          ))}

          {/* Mini module card being assembled */}
          <g>
            <rect x="235" y="14" width="32" height="68" rx="5"
              fill="rgba(245,240,255,0.94)" stroke="rgba(124,58,237,0.48)" strokeWidth="1.5">
              <animate attributeName="stroke-opacity" values="0.48;1;0.48" dur="2s" repeatCount="indefinite" />
            </rect>
            {/* header */}
            <rect x="239" y="19" width="24" height="6" rx="2" fill="rgba(124,58,237,0.40)" />
            {/* content lines */}
            <rect x="239" y="30" width="24" height="2" rx="1" fill="rgba(124,58,237,0.18)" />
            <rect x="239" y="35" width="18" height="2" rx="1" fill="rgba(124,58,237,0.12)" />
            <rect x="239" y="40" width="21" height="2" rx="1" fill="rgba(124,58,237,0.18)" />
            {/* button */}
            <rect x="239" y="46" width="24" height="8" rx="2" fill="rgba(124,58,237,0.20)">
              <animate attributeName="fill-opacity" values="1;0.5;1" dur="1.8s" repeatCount="indefinite" />
            </rect>
            {/* footer lines */}
            <rect x="239" y="58" width="16" height="2" rx="1" fill="rgba(124,58,237,0.12)" />
            <rect x="239" y="63" width="20" height="2" rx="1" fill="rgba(124,58,237,0.10)" />
            <rect x="239" y="68" width="12" height="2" rx="1" fill="rgba(124,58,237,0.10)" />
            {/* sparkle above card */}
            <circle cx="267" cy="14" r="2.5" fill="#7c3aed">
              <animate attributeName="opacity" values="1;0;1"     dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="r"       values="2.5;4;2.5" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Labels */}
          <text x="22"  y="94" textAnchor="middle" fontSize="6.5" fill="rgba(109,40,217,0.35)" fontFamily="'SF Mono',monospace">data</text>
          <text x="251" y="94" textAnchor="middle" fontSize="6.5" fill="rgba(109,40,217,0.60)" fontFamily="'SF Mono',monospace">module</text>
        </svg>

        {/* Terminal message */}
        <div style={{ fontFamily: '"SF Mono","Fira Code","Cascadia Code",monospace', fontSize: 13, color: '#5b21b6', marginBottom: 5, letterSpacing: '0.01em' }}>
          <span key={msgIdx} style={{ animation: 'db-fadein 0.3s ease' }}>
            {DB_MESSAGES[msgIdx]}
          </span>
          <span style={{ animation: 'db-blink 1s step-end infinite', marginLeft: 2, color: '#7c3aed' }}>▋</span>
        </div>
        {label && (
          <div style={{ fontSize: 11, color: 'rgba(109,40,217,0.40)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>{label}</div>
        )}
      </div>
    </>
  );
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
    const result = new PreviewService().render(spec);
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

  const publishedVersion =
    mod.activeVersion ?? mod.versions.find(v => v.status === 'PUBLISHED') ?? null;
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

  return json({ moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId, hydration, adminConfig });
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
  const { moduleId, mod, spec, catalog, compiled, planTier, blockedCapabilities, blockReasons, versions, previewHtml, previewJson, themes, publishedThemeId, hydration, adminConfig } =
    useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [searchParams] = useSearchParams();
  const justPublished = searchParams.get('published') === '1';
  const draft = mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  const isThemeModule = String(spec?.type ?? '').startsWith('theme.');
  const isAdminBlock = spec?.type === 'admin.block';
  const isBlocked = blockedCapabilities.length > 0;
  const nav = useNavigation();
  const modifyFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown> }[]; error?: string; moduleId?: string }>();
  const modifyConfirmFetcher = useFetcher<{ ok?: boolean; error?: string; version?: number; name?: string }>();
  const hydrateFetcher = useFetcher<{ ok?: boolean; error?: string; validationReport?: { overall: string; checks: { id: string; severity: string; status: string; description: string; howToFix?: string }[] }; hydratedAt?: string }>();
  const publishFetcher = useFetcher<{ error?: string }>();
  const PublishForm = publishFetcher.Form;
  const isPublishing = publishFetcher.state !== 'idle';
  const isModifying = modifyFetcher.state !== 'idle';
  const isModifyConfirming = modifyConfirmFetcher.state !== 'idle';
  const isHydrating = hydrateFetcher.state !== 'idle';
  const [livePreviewHtml, setLivePreviewHtml] = useState<string | null>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewLinkInfo, setPreviewLinkInfo] = useState<{ href: string; target: string; text: string } | null>(null);
  const linkInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(moduleId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
  }, [moduleId]);
  const isSaving = nav.state !== 'idle' || publishFetcher.state !== 'idle';

  const defaultThemeId = getDefaultThemeId(themes, publishedThemeId ?? null);
  const [selectedThemeId, setSelectedThemeId] = useState(defaultThemeId);

  useEffect(() => {
    const next = getDefaultThemeId(themes, publishedThemeId ?? null);
    const currentValid = themes.length && themes.some(t => String(t.id) === selectedThemeId);
    if (!currentValid) setSelectedThemeId(next);
  }, [themes, publishedThemeId, selectedThemeId]);

  const [previewMode, setPreviewMode] = useState<'visual' | 'html'>('visual');
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [techTab, setTechTab] = useState(0);
  const [modifyModalOpen, setModifyModalOpen] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [modifyOptions, setModifyOptions] = useState<{ index: number; explanation: string; recipe: Record<string, unknown> }[] | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteFetcher = useFetcher<{ error?: string }>();
  const isDeletingModule = deleteFetcher.state !== 'idle';

  useEffect(() => {
    if (modifyFetcher.data?.options && modifyFetcher.state === 'idle') {
      setModifyOptions(modifyFetcher.data.options);
    }
  }, [modifyFetcher.data, modifyFetcher.state]);

  const hasHtmlPreview = previewHtml !== null;

  useEffect(() => {
    if (modifyConfirmFetcher.data?.ok && !isModifyConfirming) {
      // Reload to show the updated module spec after AI modification
      window.location.reload();
    }
  }, [modifyConfirmFetcher.data, isModifyConfirming]);

  useEffect(() => {
    if (hydrateFetcher.data?.ok && hydrateFetcher.state === 'idle') {
      revalidator.revalidate();
    }
  }, [hydrateFetcher.data, hydrateFetcher.state, revalidator]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'preview-link-click') {
        setPreviewLinkInfo({ href: e.data.href, target: e.data.target, text: e.data.text });
        if (linkInfoTimeoutRef.current) clearTimeout(linkInfoTimeoutRef.current);
        linkInfoTimeoutRef.current = setTimeout(() => setPreviewLinkInfo(null), 5000);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleSpecChange = useCallback((updatedSpec: RecipeSpec) => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set('spec', JSON.stringify(updatedSpec));
      fetch('/api/preview', { method: 'POST', body: fd })
        .then(r => r.json())
        .then((data: { html?: string }) => { if (data?.html) setLivePreviewHtml(data.html); })
        .catch(() => {});
    }, 300);
  }, []);

  // Auto-trigger hydration only for brand-new modules that have NEVER been hydrated.
  useEffect(() => {
    if (hydration.status === 'none' && !hydration.everHydrated && spec && draft?.id && hydrateFetcher.state === 'idle') {
      hydrateFetcher.submit(
        { moduleId, versionId: draft.id },
        { method: 'post', action: '/api/ai/hydrate-module' },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  return (
    <Page
      title={mod.name}
      subtitle={spec ? `${getCategoryDisplayLabel(spec.category)} · ${getTypeDisplayLabel(spec.type)}` : undefined}
      backAction={{ content: 'Modules', url: '/modules' }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone={mod.status === 'PUBLISHED' ? 'success' : 'attention'}>{mod.status}</Badge>
          <Badge>{planTier}</Badge>
        </InlineStack>
      }
    >
      <BlockStack gap="500">
        {/* Top: single row of tags (no redundant cards) */}
        <InlineStack gap="200" wrap>
          {spec && (
            <Badge tone={getTypeTone(spec.type)}>{getTypeDisplayLabel(spec.type)}</Badge>
          )}
          {spec?.category != null && <Badge>{getCategoryDisplayLabel(spec.category)}</Badge>}
          <Badge>{`Versions: ${versions.length}`}</Badge>
          <Badge>{`Plan: ${planTier}`}</Badge>
        </InlineStack>

        {/* Module ID — click to copy */}
        <InlineStack gap="200" blockAlign="center">
          <Text as="p" variant="bodySm" tone="subdued">Module ID:</Text>
          <button
            type="button"
            onClick={handleCopyId}
            title="Click to copy module ID"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#f6f6f7', border: '1px solid #e3e3e3',
              borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
              fontFamily: 'var(--p-font-mono, monospace)', fontSize: 12,
              color: '#303030',
            }}
          >
            <span>{moduleId}</span>
            <span style={{ fontSize: 11, color: copiedId ? '#008060' : '#6d7175' }}>
              {copiedId ? '✓ Copied' : '⎘ Copy'}
            </span>
          </button>
          {mod.status === 'PUBLISHED' && (
            <Text as="p" variant="bodySm" tone="subdued">
              Paste this ID into the <strong>SuperApp Module Slot</strong> block in your theme editor.
            </Text>
          )}
        </InlineStack>

        {justPublished && (
          <Banner tone="success" title="Module published successfully!">
            <Text as="p">Your module is now live on your store.</Text>
          </Banner>
        )}

        {isAdminBlock && (
          <Banner tone="info" title="How to activate this admin block">
            <Text as="p">
              This block is published and stored. To display it on Shopify Admin pages, go to the relevant order, product, or customer page in Shopify Admin, click <strong>Customize</strong>, and add the <strong>SuperApp</strong> block from the extensions panel.
            </Text>
          </Banner>
        )}

        {catalog && (
          <Banner tone="info" title={`Template: ${catalog.catalogId}`}>
            <p>{catalog.description}</p>
          </Banner>
        )}

        {isBlocked && (
          <Banner tone="warning" title="Plan upgrade required">
            <BlockStack gap="200">
              {blockReasons.map((r, i) => <Text key={i} as="p">{r}</Text>)}
              <Button url="/billing" variant="plain">View upgrade options →</Button>
            </BlockStack>
          </Banner>
        )}

        {/* Two-panel: left = settings, right = sticky preview */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--p-space-400)', alignItems: 'start' }}>

          {/* LEFT PANEL: Config + Style + AI + Publish + History + Tech */}
          <BlockStack gap="400">

            {spec && (
              <ConfigEditor key={`config-${draft?.id}`} spec={spec} moduleId={moduleId} adminConfig={adminConfig} onSpecChange={handleSpecChange} />
            )}

            {spec && isThemeStorefrontUi(spec) && (
              <StyleBuilder key={draft?.id} spec={spec} moduleId={moduleId} onSpecChange={handleSpecChange} />
            )}

            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">Modify with AI</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Describe what you want to change and AI will generate 3 modification options to choose from.
                    </Text>
                  </BlockStack>
                  <Badge tone="magic">AI-powered</Badge>
                </InlineStack>
                <Button onClick={() => { setModifyModalOpen(true); setModifyOptions(null); }} aria-label="Open modal to rework this module’s recipe with AI">
                  Rework recipe
                </Button>
              </BlockStack>
            </Card>

            {spec && (
              <Card padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Full settings &amp; validation</Text>
                    {hydration.status === 'done' && (
                      <Badge tone={(hydration.validationReport as { overall?: string } | null)?.overall === 'PASS' ? 'success' : 'warning'}>
                        {(hydration.validationReport as { overall?: string } | null)?.overall ?? 'Done'}
                      </Badge>
                    )}
                  </InlineStack>
                  {hydration.status === 'none' && (
                    <>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Generate admin config schema, defaults, theme editor settings, and a validation report for this module.
                      </Text>
                      {hydrateFetcher.data?.error && !isHydrating && (
                        <Banner tone="critical">
                          <Text as="p">{hydrateFetcher.data.error}</Text>
                        </Banner>
                      )}
                      {isHydrating ? (
                        <AIGeneratingAnimation label="Generating admin config, defaults & validation report" />
                      ) : (
                        <hydrateFetcher.Form method="post" action="/api/ai/hydrate-module">
                          <input type="hidden" name="moduleId" value={moduleId} />
                          {draft?.id && <input type="hidden" name="versionId" value={draft.id} />}
                          <Button submit variant="primary" loading={isHydrating}>
                            Generate full settings
                          </Button>
                        </hydrateFetcher.Form>
                      )}
                    </>
                  )}
                  {hydration.status === 'done' && hydration.validationReport && Array.isArray((hydration.validationReport as { checks?: unknown }).checks) && (
                    <BlockStack gap="300">
                      {hydration.hydratedAt && (
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center" wrap={false}>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Generated {new Date(hydration.hydratedAt).toLocaleString()}
                            </Text>
                            <hydrateFetcher.Form method="post" action="/api/ai/hydrate-module">
                              <input type="hidden" name="moduleId" value={moduleId} />
                              {draft?.id && <input type="hidden" name="versionId" value={draft.id} />}
                              <input type="hidden" name="force" value="1" />
                              <Button submit variant="secondary" size="slim" loading={isHydrating} aria-label="Re-run AI to regenerate full settings and validation report">
                                Regenerate full settings
                              </Button>
                            </hydrateFetcher.Form>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Re-run AI to refresh admin schema, defaults, and validation report.
                          </Text>
                        </BlockStack>
                      )}
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" fontWeight="semibold">Validation checks</Text>
                        {((hydration.validationReport as { checks: Array<{ id: string; severity: string; status: string; description: string; howToFix?: string }> }).checks).map((c, i) => (
                          <div key={i}>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone={c.status === 'PASS' ? 'success' : c.status === 'WARN' ? 'warning' : 'critical'}>{c.status}</Badge>
                              <Text as="span" variant="bodySm">{c.description}</Text>
                            </InlineStack>
                            {c.howToFix && (
                              <Text as="p" variant="bodySm" tone="subdued">{c.howToFix}</Text>
                            )}
                          </div>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            )}

            <Card padding="400">
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Publish</Text>
                  {mod.status === 'PUBLISHED' && <Badge tone="success">Live</Badge>}
                </InlineStack>
                {isBlocked ? (
                  <Banner tone="critical">
                    <Text as="p">This module requires capabilities not included in your plan.</Text>
                  </Banner>
                ) : (
                  <Text as="p" tone="subdued">
                    Publishing deploys the module to your store.{isThemeModule ? ' Select a target theme below.' : ''}
                  </Text>
                )}
                {publishFetcher.data?.error && !isPublishing && (() => {
                  const err = publishFetcher.data.error;
                  const msg = typeof err === 'string' ? err : 'Publish failed. Please try again.';
                  // Don't show "Theme X not found" when that theme is in the current list (stale/transient error)
                  const themeNotFoundMatch = msg.match(/^Theme\s+(\d+)\s+not found/);
                  const themeIdInError = themeNotFoundMatch ? themeNotFoundMatch[1] : null;
                  const themeInList = themeIdInError && themes.some(t => String(t.id) === themeIdInError);
                  if (themeInList) return null;
                  return (
                    <Banner tone="critical">
                      <Text as="p">{msg}</Text>
                    </Banner>
                  );
                })()}
                <PublishForm method="post" action="/api/publish">
                  <input type="hidden" name="moduleId" value={moduleId} />
                  <BlockStack gap="300">
                    {isThemeModule && themes.length > 0 && (
                      <>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <Box minWidth="240px">
                            <Select
                              label="Target theme"
                              options={themes.map((t: { id: number; name: string; role: string }) => ({
                                value: String(t.id),
                                label: String(t.role).toLowerCase() === 'main' ? `${t.name} (Live)` : t.name,
                              }))}
                              value={selectedThemeId || defaultThemeId}
                              onChange={setSelectedThemeId}
                            />
                          </Box>
                          <Box paddingBlockStart="400">
                            <Button
                              onClick={() => revalidator.revalidate()}
                              loading={revalidator.state === 'loading'}
                            >
                              Refresh themes
                            </Button>
                          </Box>
                        </InlineStack>
                        <input type="hidden" name="themeId" value={selectedThemeId || defaultThemeId} />
                      </>
                    )}
                    {isThemeModule && themes.length === 0 && (
                      <Banner tone="warning">
                        <BlockStack gap="200">
                          <Text as="p">Could not fetch themes from your store. Click Refresh themes to try again.</Text>
                          <Button
                            onClick={() => revalidator.revalidate()}
                            loading={revalidator.state === 'loading'}
                          >
                            Refresh themes
                          </Button>
                        </BlockStack>
                      </Banner>
                    )}
                    <InlineStack gap="200">
                      <Button
                        submit
                        variant="primary"
                        disabled={isBlocked || isSaving || (isThemeModule && themes.length > 0 && !(selectedThemeId || defaultThemeId))}
                        loading={isSaving}
                      >
                        {mod.status === 'PUBLISHED' ? 'Re-publish' : 'Publish to store'}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </PublishForm>
              </BlockStack>
            </Card>

            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Version history</Text>
                {versions.length === 0 ? (
                  <Text as="p" tone="subdued">No versions yet.</Text>
                ) : (
                  <DataTable
                    columnContentTypes={['numeric', 'text', 'text', 'text']}
                    headings={['Version', 'Status', 'Published at', '']}
                    rows={versions.map(v => [
                      v.version,
                      <Badge key={v.id} tone={v.status === 'PUBLISHED' ? 'success' : 'attention'}>
                        {`${v.status}${v.isActive ? ' (active)' : ''}`}
                      </Badge>,
                      v.publishedAt ? new Date(v.publishedAt).toLocaleString('en-US') : '—',
                      v.isActive ? (
                        <Text key={v.id} as="span" tone="subdued">Current</Text>
                      ) : (
                        <Form key={v.id} method="post" action="/api/rollback">
                          <input type="hidden" name="moduleId" value={moduleId} />
                          <input type="hidden" name="version" value={String(v.version)} />
                          <Button submit size="slim" variant="secondary">
                            {`Rollback to v${v.version}`}
                          </Button>
                        </Form>
                      ),
                    ])}
                  />
                )}
              </BlockStack>
            </Card>

            <Card padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Technical details</Text>
                <Button onClick={() => setTechModalOpen(true)}>
                  View compiled operations &amp; RecipeSpec
                </Button>
              </InlineStack>
            </Card>

            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Danger zone</Text>
                <Text as="p" tone="subdued">
                  Permanently delete this module and all its versions. This cannot be undone.
                </Text>
                {!deleteConfirm ? (
                  <Button tone="critical" onClick={() => setDeleteConfirm(true)}>
                    Delete module
                  </Button>
                ) : (
                  <BlockStack gap="200">
                    <Banner tone="critical">
                      <Text as="p">Are you sure? This will permanently delete "{mod.name}" and all its versions.</Text>
                    </Banner>
                    <InlineStack gap="200">
                      <Form method="post" action={`/api/modules/${moduleId}/delete`}>
                        <Button submit tone="critical" variant="primary" loading={isDeletingModule}>
                          Yes, delete permanently
                        </Button>
                      </Form>
                      <Button onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                    </InlineStack>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

          </BlockStack>

          {/* Right panel: sticky preview */}
          <div style={{ position: 'sticky', top: 'var(--p-space-400)' }}>
            <Card padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">Live preview</Text>
                  <InlineStack gap="200">
                    {hasHtmlPreview && (
                      <Button
                        size="slim"
                        variant={previewMode === 'visual' ? 'primary' : 'secondary'}
                        onClick={() => setPreviewMode(previewMode === 'visual' ? 'html' : 'visual')}
                      >
                        {previewMode === 'visual' ? 'View HTML' : 'Visual preview'}
                      </Button>
                    )}
                    {livePreviewHtml && <Badge tone="success">Live</Badge>}
                    <Badge>{hasHtmlPreview ? 'HTML' : 'JSON'}</Badge>
                  </InlineStack>
                </InlineStack>

                {hasHtmlPreview && previewMode === 'visual' && (
                  <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid var(--p-color-border)', minHeight: 520, background: 'var(--p-color-bg-surface-secondary)' }}>
                    <iframe
                      title="Module preview"
                      srcDoc={livePreviewHtml ?? previewHtml ?? ''}
                      style={{ width: '100%', height: 520, border: 0 }}
                      sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                  </div>
                )}

                {hasHtmlPreview && previewMode === 'html' && (
                  <div style={{ padding: 16, background: 'var(--p-color-bg-surface-secondary)', borderRadius: 12, minHeight: 520, maxHeight: 520, overflow: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'var(--p-font-mono)', lineHeight: 1.6 }}>
                      {previewHtml}
                    </pre>
                  </div>
                )}

                {!hasHtmlPreview && previewJson != null && (
                  <div style={{ padding: 16, background: 'var(--p-color-bg-surface-secondary)', borderRadius: 12, minHeight: 520, maxHeight: 520, overflow: 'auto' }}>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'var(--p-font-mono)' }}>
                      {JSON.stringify(previewJson as Record<string, unknown>, null, 2)}
                    </pre>
                  </div>
                )}

                {!hasHtmlPreview && !previewJson && (
                  <Box padding="600" background="bg-surface-secondary" borderRadius="300" minHeight="200px">
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">No preview available for this module type.</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Publish to a theme to see it on your storefront.</Text>
                    </BlockStack>
                  </Box>
                )}

                {previewLinkInfo && (
                  <Banner tone="info" onDismiss={() => setPreviewLinkInfo(null)}>
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm">
                        <strong>Link clicked{previewLinkInfo.text ? `: "${previewLinkInfo.text}"` : ''}</strong>
                      </Text>
                      <Text as="p" variant="bodySm">
                        URL: <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{previewLinkInfo.href || '(no URL)'}</code>
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Opens in: {previewLinkInfo.target === '_blank' ? 'new tab' : previewLinkInfo.target === '_self' || !previewLinkInfo.target ? 'same page (redirect)' : previewLinkInfo.target}
                      </Text>
                    </BlockStack>
                  </Banner>
                )}

                <Text as="p" variant="bodySm" tone="subdued">
                  For pixel-perfect preview, publish to a duplicate theme and test on your storefront.
                </Text>
              </BlockStack>
            </Card>
          </div>

        </div>
      </BlockStack>

        {modifyModalOpen && (
          <Modal
            open={modifyModalOpen}
            onClose={() => { setModifyModalOpen(false); setModifyInstruction(''); setModifyOptions(null); }}
            title="Modify module with AI"
            primaryAction={modifyOptions ? undefined : {
              content: 'Generate 3 options',
              loading: isModifying,
              disabled: !modifyInstruction.trim() || isModifying,
              onAction: () => {
                setModifyOptions(null);
                modifyFetcher.submit(
                  { moduleId, instruction: modifyInstruction },
                  { method: 'post', action: '/api/ai/modify-module' },
                );
              },
            }}
            secondaryActions={[{
              content: modifyOptions ? 'Back' : 'Cancel',
              onAction: () => {
                if (modifyOptions) { setModifyOptions(null); }
                else { setModifyModalOpen(false); setModifyInstruction(''); }
              },
            }]}
            size={modifyOptions ? 'large' : undefined}
          >
            <Modal.Section>
              <BlockStack gap="400">
                {!modifyOptions && (
                  <>
                    <Text as="p" tone="subdued">
                      Describe the changes you want. AI will generate 3 different modification options while keeping the same type ({spec ? getTypeDisplayLabel(spec.type) : '—'}).
                    </Text>
                    <TextField
                      label="What should change?"
                      value={modifyInstruction}
                      onChange={setModifyInstruction}
                      autoComplete="off"
                      multiline={4}
                      placeholder='e.g. "Change the headline to Holiday Sale", "Make the popup trigger on scroll instead of exit intent"'
                      helpText="Be specific about what to change. The rest of the module will be preserved."
                    />
                    {isModifying && (
                      <AIGeneratingAnimation label="Crafting 3 unique modification options for you" />
                    )}
                  </>
                )}

                {modifyOptions && (
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">Choose a modification</Text>
                    {modifyOptions.map((opt, i) => {
                      const config = (opt.recipe.config ?? {}) as Record<string, unknown>;
                      return (
                        <Card key={i}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingSm">Option {i + 1}</Text>
                              <Badge tone="info">{String(opt.recipe.type ?? '')}</Badge>
                            </InlineStack>
                            <Text as="p" variant="bodyMd">{opt.explanation}</Text>
                            <BlockStack gap="050">
                              {Object.entries(config).slice(0, 4).map(([k, v]) => (
                                <Text key={k} as="p" variant="bodySm" tone="subdued">
                                  {k}: {typeof v === 'object' ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)}
                                </Text>
                              ))}
                            </BlockStack>
                            <Button
                              variant="primary"
                              loading={isModifyConfirming}
                              disabled={isModifyConfirming}
                              onClick={() => {
                                modifyConfirmFetcher.submit(
                                  { moduleId, spec: JSON.stringify(opt.recipe) },
                                  { method: 'post', action: '/api/ai/modify-module-confirm' },
                                );
                              }}
                            >
                              Use this option
                            </Button>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </BlockStack>
                )}

                {modifyConfirmFetcher.data?.ok && (
                  <Banner tone="success">
                    <Text as="p">Module updated to version {modifyConfirmFetcher.data.version}. Reload the page to see changes.</Text>
                  </Banner>
                )}
                {modifyFetcher.data?.error && !isModifying && (
                  <Banner tone="critical">
                    <Text as="p">{modifyFetcher.data.error}</Text>
                  </Banner>
                )}
                {modifyConfirmFetcher.data?.error && !isModifyConfirming && (
                  <Banner tone="critical">
                    <Text as="p">{modifyConfirmFetcher.data.error}</Text>
                  </Banner>
                )}
              </BlockStack>
            </Modal.Section>
          </Modal>
        )}

    {techModalOpen && (
      <Modal
        open={techModalOpen}
        onClose={() => setTechModalOpen(false)}
        title="Technical details"
        size="large"
      >
        <Modal.Section>
          <Tabs
            tabs={[
              { id: 'compiled', content: 'Compiled operations' },
              { id: 'recipespec', content: 'RecipeSpec' },
            ]}
            selected={techTab}
            onSelect={setTechTab}
          />
          <Box paddingBlockStart="400">
            {techTab === 0 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Deploy operations generated from the RecipeSpec. Read-only.
                </Text>
                <div style={{ background: '#f6f6f7', borderRadius: 8, padding: 12, maxHeight: 500, overflow: 'auto' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                    {JSON.stringify(compiled, null, 2)}
                  </pre>
                </div>
              </BlockStack>
            )}
            {techTab === 1 && (
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  The validated RecipeSpec JSON for this module. Read-only.
                </Text>
                <div style={{ background: '#f6f6f7', borderRadius: 8, padding: 12, maxHeight: 500, overflow: 'auto' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12, fontFamily: 'monospace' }}>
                    {JSON.stringify(spec, null, 2)}
                  </pre>
                </div>
              </BlockStack>
            )}
          </Box>
        </Modal.Section>
      </Modal>
    )}
    </Page>
  );
}
