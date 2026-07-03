import { json } from '@remix-run/node';
import { useNavigate, useLocation, useFetcher, useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecipeSpecSchema,
  RECOMMENDATION_STRATEGIES,
  RECOMMENDATION_FALLBACKS,
  RECOMMENDATION_LIMITS,
  STATIC_RECOMMENDATION_STRATEGIES,
  RULE_OBJECTS,
  RULE_ATTRIBUTES,
  RULE_ATTRIBUTE_VALUE_TYPES,
  RULE_MATCH_ACTIONS,
  RULE_LIMITS,
  CONDITION_OPERATORS,
  DISCOUNT_KINDS,
  THRESHOLD_BASIS,
  PRICING_MODELS,
  PRICING_MECHANISMS,
  STOREFRONT_DENSITY_LEVELS,
  STOREFRONT_ELEVATION_IDIOMS,
  STOREFRONT_MOTION_DURATIONS,
  STOREFRONT_MOTION_EASINGS,
  STOREFRONT_RADIUS_SCALING_MIN,
  STOREFRONT_RADIUS_SCALING_MAX,
} from '@superapp/core';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { ThemeService } from '~/services/shopify/theme.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { JobService } from '~/services/jobs/job.service';
import { modifyRecipeSpec, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { classifyModulePublishability } from '~/services/publish/publish-preflight.server';
import { deployedFunctionExtensions } from '~/services/publish/deployed-extensions.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Badge, StatusBadge, Field, Input, Textarea, Select, Toggle, Banner, EmptyState, titleCase } from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Embedded route: authenticates, then loads the real AI-credit balance (same
// QuotaService source as the dashboard) and the store's themes so Publish can
// target the live theme for theme.* modules.
export async function loader({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const quota = new QuotaService();
  const [usage, themes] = await Promise.all([
    quota.getUsageSummary(shopRow.id),
    (async () => {
      // Best-effort: publish needs a theme id for theme.* modules; failure to
      // list themes just means the server will reject publish with a real error.
      try {
        const raw = await new ThemeService(admin).listThemes();
        return raw
          .map((t) => ({ id: Number(t.id), name: String(t.name ?? ''), role: String(t.role ?? '').toLowerCase() }))
          .filter((t) => Number.isFinite(t.id) && t.id > 0);
      } catch {
        return [] as { id: number; name: string; role: string }[];
      }
    })(),
  ]);

  const aiLimit = usage.quotas?.aiRequestsPerMonth ?? 0;
  const aiUsed = usage.used?.aiRequests ?? 0;
  const main = themes.find((t) => t.role === 'main');
  return json({
    aiLeft: aiLimit === -1 ? null : Math.max(0, aiLimit - aiUsed),
    defaultThemeId: main ? String(main.id) : themes[0] ? String(themes[0].id) : null,
  });
}

/**
 * Route action — two real intents used by the workspace:
 *  - refine:   AI-modifies the selected concept's RecipeSpec (quota-enforced,
 *              job-logged; same service the module modify API uses).
 *  - validate: runs the real schema + pre-publish validator on the concept.
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/generate', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const form = await request.formData();
      const intent = String(form.get('intent') ?? '').trim();
      const specJson = String(form.get('spec') ?? '').trim();
      if (!specJson) return json({ error: 'Missing spec' }, { status: 400 });

      let specRaw: unknown;
      try {
        specRaw = JSON.parse(specJson);
      } catch {
        return json({ error: 'Invalid spec JSON' }, { status: 400 });
      }

      if (intent === 'validate') {
        const parsed = RecipeSpecSchema.safeParse(specRaw);
        if (!parsed.success) {
          return json({
            intent: 'validate',
            ok: false,
            schemaOk: false,
            planTier: null,
            errors: parsed.error.issues.slice(0, 10).map((i) => ({
              code: 'SCHEMA_INVALID',
              message: `${i.path.join('.') || 'spec'}: ${i.message}`,
            })),
          });
        }
        const caps = new CapabilityService();
        let tier = await caps.getPlanTier(session.shop);
        if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);
        const errors = validateBeforePublish(parsed.data, { planTier: tier });
        // WS5/026: deployability preflight so the merchant sees, before publishing,
        // whether this type actually deploys or needs a runtime shipped first.
        const preflight = classifyModulePublishability(parsed.data, { deployedExtensions: deployedFunctionExtensions() });
        return json({
          intent: 'validate',
          ok: errors.length === 0,
          schemaOk: true,
          planTier: tier,
          errors,
          publish: {
            status: preflight.status,
            willDeploy: preflight.willDeploy,
            reasons: preflight.reasons,
            requiresExtension: preflight.requiresExtension ?? null,
          },
        });
      }

      if (intent === 'refine') {
        await enforceRateLimit(`ai:${session.shop}`);
        const instruction = String(form.get('instruction') ?? '').trim();
        if (!instruction) return json({ error: 'Missing instruction' }, { status: 400 });

        let spec;
        try {
          spec = RecipeSpecSchema.parse(specRaw);
        } catch (err) {
          return json({ error: `Invalid RecipeSpec: ${String(err)}` }, { status: 400 });
        }

        const prisma = getPrisma();
        const shopRow = await prisma.shop.upsert({
          where: { shopDomain: session.shop },
          create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
          update: {},
        });

        const quota = new QuotaService();
        await quota.enforce(shopRow.id, 'aiRequest');

        const jobs = new JobService();
        const job = await jobs.create({
          shopId: shopRow.id,
          type: 'AI_MODIFY',
          payload: { source: 'generate_refine', instructionLen: instruction.length, specType: spec.type },
        });
        await jobs.start(job.id);

        try {
          const modified = await modifyRecipeSpec(
            spec,
            `Keep the module type unchanged.\n\nInstruction: ${instruction}`,
            { shopId: shopRow.id, maxAttempts: 2 },
          );
          const changedPaths = diffSpecPaths(spec, modified);
          await jobs.succeed(job.id, { changed: changedPaths.length });

          const usage = await quota.getUsageSummary(shopRow.id);
          const aiLimit = usage.quotas?.aiRequestsPerMonth ?? 0;
          const creditsLeft = aiLimit === -1 ? null : Math.max(0, aiLimit - (usage.used?.aiRequests ?? 0));
          const summary = changedPaths.length
            ? `Applied — updated ${changedPaths.slice(0, 6).join(', ')}${changedPaths.length > 6 ? ` and ${changedPaths.length - 6} more field(s)` : ''}.`
            : 'The AI returned a revised spec with no detectable field changes — try a more specific instruction.';
          return json({ intent: 'refine', ok: true, recipe: modified, summary, changedPaths, creditsLeft });
        } catch (e) {
          await jobs.fail(job.id, e);
          if (e instanceof AiProviderNotConfiguredError) {
            return json({ error: e.code, message: e.message }, { status: 503 });
          }
          return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      }

      return json({ error: 'Unknown intent' }, { status: 400 });
    },
  );
}

/** Dotted paths (depth ≤ 3) where two specs differ — real change report for the refine chat. */
function diffSpecPaths(a: unknown, b: unknown, prefix = '', depth = 0, out: string[] = []): string[] {
  if (out.length >= 24) return out;
  const isObj = (x: unknown) => typeof x === 'object' && x !== null && !Array.isArray(x);
  if (depth >= 3 || !isObj(a) || !isObj(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix || 'spec');
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of keys) {
    diffSpecPaths((a as any)[k], (b as any)[k], prefix ? `${prefix}.${k}` : k, depth + 1, out);
    if (out.length >= 24) break;
  }
  return out;
}

// Multi-module blueprint returned alongside the single-module options when the
// request maps to a coordinated set (flag-gated; see docs/blueprints.md).
type BlueprintResult = {
  name: string;
  summary: string;
  moduleCount: number;
  modules: { role: string; type: string; explanation: string; recipe: Record<string, unknown> }[];
  links?: { fromRole: string; toRole: string; note: string }[];
};

const RADIUS_MAP: Record<string, number> = { none: 0, sm: 6, md: 10, lg: 16, full: 999 };
const SHADOW_MAP: Record<string, string> = { none: 'none', sm: '0 1px 2px rgba(20,33,58,.12)', md: '0 4px 12px rgba(20,33,58,.16)', lg: '0 12px 28px rgba(20,33,58,.22)' };
// Each refine is one AI request against the monthly quota (enforced server-side).
const COST_PER_CHANGE = 1;

const GEN_STEPS = [
  { icon: 'magic', label: 'Understanding your request' },
  { icon: 'layers', label: 'Exploring module types — Storefront UI' },
  { icon: 'layers', label: 'Drafting 3 layout concepts' },
  { icon: 'shield', label: 'Validating each against schema' },
  { icon: 'eye', label: 'Rendering live previews' },
];

const BASE_SETTINGS = {
  label: 'Add to cart', price: '$48.00', buttonColor: '#1F3A5F', buttonText: '#FFFFFF',
  bg: '#FFFFFF', radius: 'md', size: 'M', mode: 'sticky', anchor: 'bottom', width: 'full',
  shadow: 'lg', hideMobile: false, showQty: true, showVariants: true, countdown: false,
  customCss: '',
};

// Visual concept presets — icon/accent/default layout per slot. Real data (name,
// tagline, tags, type) comes from the AI recipe attached to each concept.
const CONCEPT_PRESETS = [
  {
    id: 'sticky', name: 'Concept 1', icon: 'desktop', accent: '#6B40D8',
    settings: { ...BASE_SETTINGS, mode: 'sticky', anchor: 'bottom', buttonColor: '#1F3A5F', radius: 'md', shadow: 'lg' },
  },
  {
    id: 'floating', name: 'Concept 2', icon: 'cart', accent: '#0E9F6E',
    settings: { ...BASE_SETTINGS, mode: 'floating', buttonColor: '#0E9F6E', radius: 'full', shadow: 'lg', showVariants: false, showQty: false, size: 'L' },
  },
  {
    id: 'inline', name: 'Concept 3', icon: 'layers', accent: '#2F80ED',
    settings: { ...BASE_SETTINGS, mode: 'inline', buttonColor: '#14213A', radius: 'lg', bg: '#F6F8FB', countdown: true },
  },
];

type Concept = typeof CONCEPT_PRESETS[number] & {
  recipe?: Record<string, unknown>;
  explanation?: string;
  type: string;
  tagline: string;
  tags: string[];
  intro: string;
};

const STOREFRONT_TYPES = ['theme.section', 'proxy.widget'];
const SIZE_TO_TYPO: Record<string, string> = { S: 'SM', M: 'MD', L: 'LG' };
const TYPO_TO_SIZE: Record<string, string> = { SM: 'S', MD: 'M', LG: 'L' };

/** Display label for a real RecipeSpec type. */
function displayType(t?: unknown): string {
  const s = String(t ?? '');
  if (!s) return 'Module';
  if (s.startsWith('theme.') || s === 'proxy.widget') return 'Storefront UI';
  if (/flow/i.test(s)) return 'Flow';
  if (/function|discount|cartTransform/i.test(s)) return 'Function';
  if (/integration|connector|webhook|pixel/i.test(s)) return 'Integration';
  return titleCase(s.replace(/\./g, ' '));
}

/** Real tags for a concept card, derived from the recipe (never invented). */
function tagsFromRecipe(recipe?: Record<string, unknown> | null): string[] {
  if (!recipe) return [];
  const cfg = (recipe.config as Record<string, unknown>) ?? {};
  const tags = [cfg.kind, cfg.activation]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .map((x) => titleCase(x));
  return tags.length ? tags : [displayType(recipe.type)];
}

/**
 * Persist the merchant's control-panel tweaks into the recipe that gets saved:
 * layout/colors/shape/typography/responsive/customCss map onto the real `style`
 * pack (storefront types), content settings onto `config` (theme.section config
 * is an open object; strict configs simply strip unknown keys server-side).
 */
function mergeSettingsIntoRecipe(recipe: Record<string, unknown>, s: any): Record<string, unknown> {
  // Non-storefront modules are edited directly via GenConfigControls (setConfig
  // writes recipe.config), so never overlay the storefront button/price/toggle
  // projection onto them — that would clobber real config fields.
  if (!STOREFRONT_TYPES.includes(String(recipe.type))) {
    return { ...recipe };
  }
  const config = { ...((recipe.config as Record<string, unknown>) ?? {}) };
  config.label = s.label;
  config.price = s.price;
  config.showQty = !!s.showQty;
  config.showVariants = !!s.showVariants;
  config.countdown = !!s.countdown;
  const merged: Record<string, unknown> = { ...recipe, config };
  {
    const style = { ...((recipe.style as Record<string, any>) ?? {}) };
    style.layout = { ...(style.layout ?? {}), mode: s.mode, anchor: s.anchor, width: s.width };
    style.colors = { ...(style.colors ?? {}), background: s.bg, buttonBg: s.buttonColor, buttonText: s.buttonText };
    style.shape = { ...(style.shape ?? {}), radius: s.radius, shadow: s.shadow };
    style.typography = { ...(style.typography ?? {}), size: SIZE_TO_TYPO[s.size] ?? 'MD' };
    style.responsive = { ...(style.responsive ?? {}), hideOnMobile: !!s.hideMobile };
    const css = String(s.customCss ?? '').trim();
    if (css) style.customCss = css.slice(0, 2000);
    else delete style.customCss;
    merged.style = style;
  }
  return merged;
}

/** Reverse mapping: seed/update the control panel from what the recipe really says. */
function settingsFromRecipe(recipe?: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!recipe) return out;
  const config = (recipe.config as Record<string, unknown>) ?? {};
  if (typeof config.label === 'string') out.label = config.label;
  if (typeof config.price === 'string') out.price = config.price;
  if (typeof config.showQty === 'boolean') out.showQty = config.showQty;
  if (typeof config.showVariants === 'boolean') out.showVariants = config.showVariants;
  if (typeof config.countdown === 'boolean') out.countdown = config.countdown;
  const style = (recipe.style as Record<string, any>) ?? null;
  if (style) {
    if (style.layout?.mode && ['sticky', 'inline', 'floating'].includes(style.layout.mode)) out.mode = style.layout.mode;
    if (style.layout?.anchor && ['top', 'bottom'].includes(style.layout.anchor)) out.anchor = style.layout.anchor;
    if (typeof style.colors?.buttonBg === 'string') out.buttonColor = style.colors.buttonBg;
    if (typeof style.colors?.buttonText === 'string') out.buttonText = style.colors.buttonText;
    if (typeof style.colors?.background === 'string') out.bg = style.colors.background;
    if (style.shape?.radius && RADIUS_MAP[style.shape.radius] !== undefined) out.radius = style.shape.radius;
    if (style.shape?.shadow && SHADOW_MAP[style.shape.shadow] !== undefined) out.shadow = style.shape.shadow;
    if (style.typography?.size && TYPO_TO_SIZE[style.typography.size]) out.size = TYPO_TO_SIZE[style.typography.size];
    if (typeof style.responsive?.hideOnMobile === 'boolean') out.hideMobile = style.responsive.hideOnMobile;
    if (typeof style.customCss === 'string') out.customCss = style.customCss;
  }
  return out;
}

export default function GeneratePage() {
  return (
    <MerchantShell fullBleed>
      <GenerateWorkspace />
    </MerchantShell>
  );
}

function GenerateWorkspace() {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const location = useLocation();
  const loaderData = useLoaderData<typeof loader>();
  const seed = (location.state as any) || null;
  const seedPrompt = typeof seed?.prompt === 'string' ? seed.prompt.trim() : '';

  const proposeFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown> }[]; blueprint?: BlueprintResult | null; error?: string; message?: string }>();
  const confirmFetcher = useFetcher<{ moduleId?: string; recipeId?: string; firstModuleId?: string; moduleCount?: number; error?: string }>();
  const refineFetcher = useFetcher<{ ok?: boolean; recipe?: Record<string, unknown>; summary?: string; changedPaths?: string[]; creditsLeft?: number | null; error?: string; message?: string }>();
  const publishFetcher = useFetcher<{ error?: string }>();
  const valFetcher = useFetcher<{ ok?: boolean; schemaOk?: boolean; planTier?: string | null; errors?: { code: string; message: string; field?: string }[]; publish?: { status: 'deployable' | 'needs_runtime'; willDeploy: boolean; reasons: string[]; requiresExtension: string | null }; error?: string }>();
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null);

  const [phase, setPhase] = useState<'generating' | 'choosing' | 'ready'>('generating');
  const [stepIdx, setStepIdx] = useState(0);
  const [candidates, setCandidates] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsMap, setSettingsMap] = useState<Record<string, any>>({});
  const [threadMap, setThreadMap] = useState<Record<string, any[]>>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [tab, setTab] = useState<'preview' | 'validation'>('preview');
  const [ctrlTab, setCtrlTab] = useState<'basic' | 'advanced' | 'css'>('basic');
  const [refine, setRefine] = useState('');
  // Real AI-credit balance from QuotaService (null = unlimited plan).
  const [credits, setCredits] = useState<number | null>(loaderData.aiLeft);
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
  const [dockOpen, setDockOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<{ mode: 'draft' | 'publish'; conceptId: string } | null>(null);
  const createdRef = useRef<{ conceptId: string; moduleId: string } | null>(null);
  const pendingRefineRef = useRef<{ q: string; conceptId: string } | null>(null);
  const handledConfirmRef = useRef<unknown>(null);
  const handledRefineRef = useRef<unknown>(null);
  const handledPublishRef = useRef<unknown>(null);

  const settings = settingsMap[selected ?? ''] || BASE_SETTINGS;
  const set = (patch: any) => setSettingsMap((m) => ({ ...m, [selected!]: { ...m[selected!], ...patch } }));
  // For non-storefront types, edit the generated recipe.config directly (schema-
  // driven from the real config shape) so preview/validation/save all reflect it.
  const setConfig = (key: string, value: unknown) => {
    if (!selected) return;
    setCandidates((cs) => cs.map((c) => (c.id === selected
      ? { ...c, recipe: { ...c.recipe, config: { ...((c.recipe as any).config ?? {}), [key]: value } } }
      : c)));
  };
  // Merchant config for the new packs (rule-engine / recommendation / pricing)
  // writes the pack's whole object straight onto recipe.config[<namespace>] — the
  // flat-pin key the compiler already reads. `undefined` deletes the key (back to
  // "no pack", byte-identical). Additive: never touches the storefront projection.
  const setConfigObject = (key: string, value: unknown) => {
    if (!selected) return;
    setCandidates((cs) => cs.map((c) => {
      if (c.id !== selected) return c;
      const config = { ...((c.recipe as any)?.config ?? {}) };
      if (value === undefined) delete config[key];
      else config[key] = value;
      return { ...c, recipe: { ...c.recipe, config } };
    }));
  };
  // Style tokens (density / elevation / motion / seed / scaling) write straight
  // into recipe.style.<group>. Kept off the `settings` projection because those
  // keys aren't in it; mergeSettingsIntoRecipe preserves what it doesn't overwrite
  // (shape.elevation/scaling, motion, colors.seed all survive the merge).
  const setStyle = (group: string, patch: Record<string, unknown>) => {
    if (!selected) return;
    setCandidates((cs) => cs.map((c) => {
      if (c.id !== selected) return c;
      const style = { ...((c.recipe as any)?.style ?? {}) };
      const prev = { ...((style[group] as Record<string, unknown>) ?? {}) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete prev[k];
        else prev[k] = v;
      }
      style[group] = prev;
      return { ...c, recipe: { ...c.recipe, style } };
    }));
  };
  const thread = threadMap[selected ?? ''] || [];
  const history = historyMap[selected ?? ''] || [];
  const activeCand = candidates.find((c) => c.id === selected);
  const activeIdx = candidates.findIndex((c) => c.id === selected);
  const thinking = refineFetcher.state !== 'idle';

  // No seeded prompt (direct visit / refresh): never silently burn an AI
  // generation on a canned prompt — send the merchant to the real prompt box.
  useEffect(() => {
    if (!seedPrompt) navigate('/modules?openBuilder=1', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  // Build the chooser concepts from a set of AI options (shared by the streaming
  // and batch paths). Re-runnable: the stream calls it as each option arrives.
  const genStartedRef = useRef(false);
  const applyOptions = useCallback((opts: { explanation: string; recipe: Record<string, unknown> }[], bp?: BlueprintResult | null) => {
    const capped = opts.slice(0, CONCEPT_PRESETS.length);
    if (capped.length === 0) return;
    const concs: Concept[] = capped.map((opt, i) => {
      const preset = CONCEPT_PRESETS[i]!;
      const name = (opt.recipe?.name as string) || preset.name;
      return {
        ...preset,
        recipe: opt.recipe,
        explanation: opt.explanation,
        name,
        type: displayType(opt.recipe?.type),
        tagline: opt.explanation || '',
        tags: tagsFromRecipe(opt.recipe),
        intro: opt.explanation ? `Done. ${opt.explanation}` : `Done. I generated “${name}” from your prompt.`,
      };
    });
    const sm: Record<string, any> = {}, tm: Record<string, any[]> = {}, hm: Record<string, any[]> = {};
    concs.forEach((c) => {
      sm[c.id] = { ...c.settings, ...settingsFromRecipe(c.recipe) };
      tm[c.id] = [
        { role: 'user', text: seedPrompt },
        { role: 'assistant', text: c.intro + '\n\nUse the controls on the right to fine-tune it, or ask me to change anything below.' },
      ];
      hm[c.id] = [{ id: 'h_gen', label: 'Module generated', detail: `Created “${c.name}” from your prompt.`, cost: 1, time: 'Just now' }];
    });
    setCandidates(concs);
    setSettingsMap(sm);
    setThreadMap(tm);
    setHistoryMap(hm);
    if (bp !== undefined) setBlueprint(bp ?? null);
    setSelected(null);
    setPhase('choosing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  // Streaming generation: options render as they validate (faster first paint).
  // Any failure falls back to the proven batch route, so it's never worse.
  const streamGenerate = useCallback(async () => {
    const fd = new FormData();
    fd.set('prompt', seedPrompt);
    fd.set('preferredType', 'Auto');
    fd.set('preferredCategory', 'Auto');
    fd.set('preferredBlockType', 'Auto');
    fd.set('matchStoreColors', 'true');
    const collected: Record<number, { explanation: string; recipe: Record<string, unknown> }> = {};
    let gotAny = false;
    try {
      const res = await fetch('/api/ai/create-module/stream', { method: 'POST', body: fd, headers: { Accept: 'text/event-stream' } });
      if (!res.ok || !res.body) throw new Error('stream unavailable');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep = buf.indexOf('\n\n');
        while (sep !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let ev = 'message';
          const dataLines: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
          }
          if (dataLines.length) {
            let payload: any = null;
            try { payload = JSON.parse(dataLines.join('\n')); } catch { payload = null; }
            if (payload) {
              if (ev === 'option' && payload.option?.recipe) {
                collected[payload.index] = { explanation: payload.option.explanation ?? '', recipe: payload.option.recipe };
                gotAny = true;
                applyOptions(Object.keys(collected).sort((a, b) => Number(a) - Number(b)).map((k) => collected[Number(k)]!));
              } else if (ev === 'blueprint') {
                setBlueprint(payload as BlueprintResult);
              } else if (ev === 'error') {
                throw new Error(payload.message || 'Generation failed');
              }
            }
          }
          sep = buf.indexOf('\n\n');
        }
      }
      if (!gotAny) throw new Error('no options streamed');
    } catch {
      // Batch fallback — only if streaming produced nothing usable.
      if (!gotAny) proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt, applyOptions]);

  // Kick off real generation when entering the generating phase (stream once).
  useEffect(() => {
    if (phase !== 'generating' || !seedPrompt) return;
    if (!genStartedRef.current) {
      genStartedRef.current = true;
      void streamGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Step animation while generation is in flight.
  useEffect(() => {
    if (phase !== 'generating') return;
    setStepIdx(0);
    let i = 0;
    const tick = setInterval(() => { i += 1; setStepIdx((s) => Math.min(s + 1, GEN_STEPS.length)); if (i >= GEN_STEPS.length) clearInterval(tick); }, 560);
    return () => clearInterval(tick);
  }, [phase]);

  // When real options arrive (or error), build the chooser — one concept per
  // real AI option only (no preset-only concepts that could never be saved).
  useEffect(() => {
    if (proposeFetcher.state !== 'idle' || !proposeFetcher.data) return;
    if (proposeFetcher.data.error) {
      ctx.toast(proposeFetcher.data.message || proposeFetcher.data.error, { error: true });
      navigate('/modules');
      return;
    }
    const opts = (proposeFetcher.data.options ?? []).slice(0, CONCEPT_PRESETS.length);
    if (opts.length === 0) {
      ctx.toast('The AI returned no valid concepts — please try again.', { error: true });
      navigate('/modules');
      return;
    }
    applyOptions(opts, proposeFetcher.data.blueprint ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposeFetcher.state, proposeFetcher.data]);

  // Publish the created module via the real publish pipeline. On success the
  // server redirects to /modules/:id?published=1 (the fetcher follows it).
  const submitPublish = (moduleId: string, conceptId: string) => {
    const cand = candidates.find((c) => c.id === conceptId);
    const fd = new FormData();
    fd.set('moduleId', moduleId);
    const isTheme = String((cand?.recipe as any)?.type ?? '').startsWith('theme.');
    if (isTheme && loaderData.defaultThemeId) fd.set('themeId', loaderData.defaultThemeId);
    publishFetcher.submit(fd, { method: 'post', action: '/api/publish' });
  };

  // After confirm (real module created): draft → module detail; publish → chain
  // into /api/publish. Blueprint → first created module.
  useEffect(() => {
    if (confirmFetcher.state !== 'idle' || !confirmFetcher.data) return;
    if (handledConfirmRef.current === confirmFetcher.data) return;
    handledConfirmRef.current = confirmFetcher.data;
    const data = confirmFetcher.data;
    if (data.firstModuleId) {
      // Blueprint members are created as DRAFTs; the merchant co-deploys them as a
      // unit via the "Publish all N" affordance on the module's blueprint banner
      // (R3.2). Land on the first member where that button (+ theme picker) lives.
      ctx.toast(`Blueprint created — ${data.moduleCount ?? 'multiple'} modules. Use “Publish all” to deploy them together.`);
      navigate(`/modules/${data.firstModuleId}`);
      return;
    }
    if (data.moduleId) {
      const pending = finishRef.current;
      finishRef.current = null;
      if (pending) createdRef.current = { conceptId: pending.conceptId, moduleId: data.moduleId };
      if (pending?.mode === 'publish') {
        submitPublish(data.moduleId, pending.conceptId);
      } else {
        ctx.toast('Draft saved');
        navigate(`/modules/${data.moduleId}`);
      }
      return;
    }
    if (data.error) ctx.toast(data.error, { error: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmFetcher.state, confirmFetcher.data]);

  // Publish errors surface from the server; success is a server redirect.
  useEffect(() => {
    if (publishFetcher.state !== 'idle' || !publishFetcher.data) return;
    if (handledPublishRef.current === publishFetcher.data) return;
    handledPublishRef.current = publishFetcher.data;
    const err = (publishFetcher.data as any)?.error;
    if (err) ctx.toast(String(err), { error: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishFetcher.state, publishFetcher.data]);

  // Refine result: update the concept's real recipe, mirror recognizable fields
  // back into the control panel, and log the server-reported change.
  useEffect(() => {
    if (refineFetcher.state !== 'idle' || !refineFetcher.data) return;
    if (handledRefineRef.current === refineFetcher.data) return;
    handledRefineRef.current = refineFetcher.data;
    const pending = pendingRefineRef.current;
    pendingRefineRef.current = null;
    const data = refineFetcher.data;
    if (data.error || !data.ok || !data.recipe) {
      ctx.toast(data.message || data.error || 'Refine failed', { error: true });
      return;
    }
    const conceptId = pending?.conceptId;
    if (!conceptId) return;
    const recipe = data.recipe;
    setCandidates((cs) => cs.map((c) => (c.id === conceptId ? { ...c, recipe, name: (recipe as any)?.name || c.name } : c)));
    setSettingsMap((m) => ({ ...m, [conceptId]: { ...m[conceptId], ...settingsFromRecipe(recipe) } }));
    setThreadMap((m) => ({ ...m, [conceptId]: [...(m[conceptId] || []), { role: 'assistant', text: data.summary || 'Change applied to the module spec.' }] }));
    if (data.creditsLeft !== undefined) setCredits(data.creditsLeft);
    setHistoryMap((m) => ({
      ...m,
      [conceptId]: [...(m[conceptId] || []), { id: 'h_' + Date.now(), label: pending?.q ?? 'AI refinement', detail: data.summary || 'Change applied.', cost: COST_PER_CHANGE, time: 'Just now' }],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refineFetcher.state, refineFetcher.data]);

  // Validation tab: run the real schema + pre-publish validator on the concept
  // (including the merchant's current tweaks) whenever the tab is opened.
  useEffect(() => {
    if (tab !== 'validation' || !selected) return;
    const cand = candidates.find((c) => c.id === selected);
    if (!cand?.recipe) return;
    const fd = new FormData();
    fd.set('intent', 'validate');
    fd.set('spec', JSON.stringify(mergeSettingsIntoRecipe(cand.recipe, settingsMap[selected] || BASE_SETTINGS)));
    valFetcher.submit(fd, { method: 'post', action: '/generate' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selected]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread, thinking, phase]);

  // Real AI refine: posts the concept's current spec + instruction to this
  // route's action, which runs the same modify pipeline as the module editor.
  const doRefine = (text?: string) => {
    const q = (text ?? refine).trim();
    if (!q || !selected || thinking) return;
    if (credits !== null && credits <= 0) return;
    const cand = candidates.find((c) => c.id === selected);
    if (!cand?.recipe) {
      ctx.toast('This concept has no generated spec to refine — regenerate first.', { error: true });
      return;
    }
    setThreadMap((m) => ({ ...m, [selected]: [...(m[selected] || []), { role: 'user', text: q }] }));
    setRefine('');
    pendingRefineRef.current = { q, conceptId: selected };
    const fd = new FormData();
    fd.set('intent', 'refine');
    fd.set('instruction', q);
    fd.set('spec', JSON.stringify(mergeSettingsIntoRecipe(cand.recipe, settingsMap[selected] || BASE_SETTINGS)));
    refineFetcher.submit(fd, { method: 'post', action: '/generate' });
  };

  const openConcept = (id: string) => { setSelected(id); setTab('preview'); setCtrlTab('basic'); setPhase('ready'); };
  const backToOptions = () => setPhase('choosing');
  const regenerate = () => {
    setCandidates([]); setSettingsMap({}); setThreadMap({}); setHistoryMap({}); setSelected(null);
    setBlueprint(null);
    createdRef.current = null;
    finishRef.current = null;
    genStartedRef.current = false;
    setPhase('generating');
    void streamGenerate();
  };

  // Create the real modules from the generated blueprint, then navigate.
  const finishBlueprint = () => {
    if (!blueprint) return;
    const fd = new FormData();
    fd.set('blueprint', JSON.stringify({
      name: blueprint.name,
      summary: blueprint.summary,
      modules: blueprint.modules.map((m) => ({ role: m.role, explanation: m.explanation, recipe: m.recipe })),
      links: blueprint.links ?? [],
    }));
    confirmFetcher.submit(fd, { method: 'post', action: '/api/ai/create-blueprint' });
  };

  // Save/Publish: merge the merchant's tweaks into the selected concept's real
  // recipe, create the draft module, and (for Publish) chain into /api/publish.
  const finish = (mode: 'draft' | 'publish') => {
    if (!selected) return;
    const recipe = activeCand?.recipe;
    if (!recipe) {
      ctx.toast('This concept has no generated spec — regenerate and pick again.', { error: true });
      return;
    }
    const created = createdRef.current;
    if (created && created.conceptId === selected) {
      // Module already created (e.g. a previous publish attempt failed).
      if (mode === 'publish') submitPublish(created.moduleId, selected);
      else navigate(`/modules/${created.moduleId}`);
      return;
    }
    finishRef.current = { mode, conceptId: selected };
    const fd = new FormData();
    fd.set('spec', JSON.stringify(mergeSettingsIntoRecipe(recipe, settings)));
    confirmFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module-from-recipe' });
  };

  if (!seedPrompt) return null;
  if (phase === 'generating') return <GenLoading prompt={seedPrompt} stepIdx={stepIdx} onCancel={() => navigate('/')} />;
  if (phase === 'choosing') return <GenChoose prompt={seedPrompt} candidates={candidates} settingsMap={settingsMap} onSelect={openConcept} onRegenerate={regenerate} onCancel={() => navigate('/')} />;

  const publishing = confirmFetcher.state !== 'idle' || publishFetcher.state !== 'idle';

  return (
    <div className="gen-shell">
      <header className="gen-head">
        <div className="row-3" style={{ minWidth: 0 }}>
          <button className="gen-back-btn" onClick={backToOptions} title="Back to all concepts">
            <Icon name="arrowLeft" size={15} /><span>All concepts</span>
          </button>
          <span className="tile-ico" style={{ width: 34, height: 34, background: 'var(--p-info-bg)', color: 'var(--sa-secondary)' }}>
            <Icon name={(activeCand && activeCand.icon) || 'desktop'} size={17} />
          </span>
          <div className="stack" style={{ gap: 1, minWidth: 0 }}>
            <div className="row-2"><span className="t-h3">{activeCand ? activeCand.name : 'Module'}</span><StatusBadge value="DRAFT" /></div>
            <span className="t-xs t-muted">{(activeCand ? activeCand.type : 'Module') + ' · concept ' + (activeIdx + 1) + ' of ' + candidates.length + ' · unsaved'}</span>
          </div>
        </div>
        <div className="row-2">
          <Btn icon="magic" onClick={regenerate} title="Discard these concepts and generate again">Regenerate</Btn>
          <Btn onClick={() => navigate('/')}>Discard</Btn>
          <Btn loading={confirmFetcher.state !== 'idle' && finishRef.current?.mode === 'draft'} onClick={() => finish('draft')}>Save draft</Btn>
          <Btn variant="primary" icon="rocket" loading={publishing} onClick={() => finish('publish')}>Publish</Btn>
        </div>
      </header>
      {blueprint && (
        <div style={{ padding: '12px 16px 0' }}>
          <Banner tone="info" title={`This request is a full solution: ${blueprint.name} (${blueprint.moduleCount} modules)`}>
            <div className="stack" style={{ gap: 8 }}>
              <span className="t-sm">{blueprint.summary}</span>
              <div className="row-2" style={{ flexWrap: 'wrap', gap: 6 }}>
                {blueprint.modules.map((m) => (
                  <Badge key={m.role}>{`${m.role} · ${titleCase(String(m.type).replace(/\./g, ' '))}`}</Badge>
                ))}
              </div>
              <div>
                <Btn variant="primary" icon="layers" loading={publishing} onClick={finishBlueprint}>
                  {`Create all ${blueprint.moduleCount} modules`}
                </Btn>
              </div>
            </div>
          </Banner>
        </div>
      )}
      <div className="gen-body">
        <GenBuildPanel
          settings={settings} set={set} ctrlTab={ctrlTab} setCtrlTab={setCtrlTab}
          moduleType={String((activeCand?.recipe as any)?.type ?? '')}
          config={((activeCand?.recipe as any)?.config ?? {}) as Record<string, unknown>} setConfig={setConfig}
          setConfigObject={setConfigObject}
          style={((activeCand?.recipe as any)?.style ?? {}) as Record<string, unknown>} setStyle={setStyle}
          thread={thread} thinking={thinking} refine={refine} setRefine={setRefine} onRefine={doRefine}
          credits={credits} dockOpen={dockOpen} setDockOpen={setDockOpen} histOpen={histOpen} setHistOpen={setHistOpen} history={history}
        />
        <div className="gen-center">
          <div className="gen-toolbar">
            <div className="seg">
              <button aria-selected={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="desktop" size={14} />Desktop</button>
              <button aria-selected={device === 'mobile'} onClick={() => setDevice('mobile')}><Icon name="store" size={14} />Mobile</button>
            </div>
            <div className="grow" />
            <div className="tabs-mini">
              {(['preview', 'validation'] as const).map((x) => (
                <button key={x} className={'tab-mini' + (tab === x ? ' sel' : '')} onClick={() => setTab(x)}>{titleCase(x)}</button>
              ))}
            </div>
          </div>
          <div className="gen-canvas-wrap">
            {tab === 'preview' && (
              <GenPreview
                recipe={activeCand?.recipe ? mergeSettingsIntoRecipe(activeCand.recipe, settings) : null}
                device={device}
              />
            )}
            {tab === 'validation' && <GenValidation loading={valFetcher.state !== 'idle'} data={valFetcher.data} hasRecipe={!!activeCand?.recipe} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenLoading({ prompt, stepIdx, onCancel }: any) {
  return (
    <div className="gen-loading">
      <div className="gen-loading-card">
        <div className="gen-orb-wrap">
          <span className="gen-orb-halo" /><span className="gen-orb-ring r1" /><span className="gen-orb-ring r2" /><span className="gen-orb-ring r3" />
          <div className="gen-orb"><Icon name="magic" size={28} /></div>
        </div>
        <div className="gen-loading-eyebrow"><span className="pulse-dot" />Generating concepts</div>
        <div className="t-h2" style={{ marginTop: 6, textAlign: 'center' }}>Designing your module</div>
        <div className="gen-prompt-echo">“{prompt}”</div>
        <div className="gen-steps">
          {GEN_STEPS.map((s, i) => {
            const done = i < stepIdx, active = i === stepIdx;
            return (
              <div key={i} className={'gen-step' + (done ? ' done' : active ? ' active' : '')}>
                <span className="gen-step-ico">{done ? <Icon name="check" size={14} /> : active ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <span className="gen-step-dot" />}</span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
        <div className="gen-progress"><i style={{ width: Math.min(100, (stepIdx / GEN_STEPS.length) * 100) + '%' }} /></div>
        <button className="btn btn-plain btn-plain-subdued" style={{ marginTop: 8 }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function GenChoose({ prompt, candidates, settingsMap, onSelect, onRegenerate, onCancel }: any) {
  const n = candidates.length;
  return (
    <div className="gen-choose">
      <div className="gen-choose-aurora" />
      <div className="gen-choose-grid-bg" />
      <div className="gen-choose-inner">
        <div className="gen-choose-head">
          <div className="gen-choose-eyebrow"><span className="pulse-dot" />{n + ' concept' + (n === 1 ? '' : 's') + ' generated'}</div>
          <h1 className="gen-choose-title">Pick a starting point</h1>
          <p className="gen-choose-sub">From “{prompt}”. Open any concept to customize it — the rest stay right here until you save. Nothing is stored yet, so you can regenerate anytime.</p>
          <button className="gen-choose-close" onClick={onCancel} title="Cancel"><Icon name="x" size={16} /></button>
        </div>
        <div className="gen-cand-grid">
          {candidates.map((c: any, i: number) => (
            <GenCandCard key={c.id} c={c} idx={i} total={candidates.length} settings={settingsMap[c.id] || c.settings} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
        <div className="gen-choose-foot">
          <button className="gen-regen-btn" onClick={onRegenerate}><Icon name="magic" size={15} />Regenerate</button>
          <span className="t-xs t-muted">Nothing is saved — concepts reset when you regenerate or leave.</span>
        </div>
      </div>
    </div>
  );
}

function GenCandCard({ c, idx, total, settings, onSelect }: any) {
  const num = String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  return (
    <button className="gen-cand" style={{ ['--acc' as any]: c.accent, animationDelay: (0.08 + idx * 0.12) + 's' }} onClick={onSelect}>
      <span className="gen-cand-scan" />
      <span className="cand-num">{num}</span>
      <div className="cand-head">
        <span className="cand-ico"><Icon name={c.icon} size={19} /></span>
        <div className="stack" style={{ gap: 2, minWidth: 0, textAlign: 'left' }}>
          <span className="cand-name">{c.name}</span>
          <span className="t-xs t-muted">{c.type}</span>
        </div>
      </div>
      <p className="cand-tagline">{c.tagline}</p>
      <GenCandMini s={settings} accent={c.accent} />
      <div className="cand-tags">{c.tags.map((t: string) => <span key={t} className="cand-tag">{t}</span>)}</div>
      <div className="cand-cta">
        <span className="cand-open"><Icon name="magic" size={14} />Open & customize</span>
        <Icon name="arrowRight" size={16} />
      </div>
    </button>
  );
}

function GenCandMini({ s, accent }: any) {
  const r = Math.min(RADIUS_MAP[s.radius] ?? 10, 14);
  const btn = (
    <span className="cand-btn" style={{ background: s.buttonColor, color: s.buttonText, borderRadius: r }}>
      <Icon name="cart" size={11} />{s.label}
    </span>
  );
  const chips = s.showVariants && (
    <span className="cand-chips">{[0, 1, 2].map((i) => <i key={i} className={i === 1 ? 'on' : ''} style={i === 1 ? { borderColor: accent, background: accent } : undefined} />)}</span>
  );
  let bar;
  if (s.mode === 'floating') bar = <span className="cand-bar cand-bar-floating">{btn}</span>;
  else if (s.mode === 'inline') bar = (
    <span className="cand-bar cand-bar-inline" style={{ background: s.bg }}>
      {s.countdown && <span className="cand-count">12:45</span>}{chips}<span className="grow" />{btn}
    </span>
  );
  else bar = <span className="cand-bar cand-bar-sticky">{chips}<span className="grow" />{btn}</span>;
  return (
    <div className="cand-mini">
      <div className="cand-mini-top"><i /><i /><i /></div>
      <div className="cand-mini-pdp">
        <div className="cand-mini-img" />
        <div className="cand-mini-lines">
          <i className="w3" /><i className="w1" /><i className="w4" style={{ background: accent, opacity: .55 }} /><i className="w2" />
        </div>
      </div>
      {bar}
    </div>
  );
}

function GenBuildPanel(props: any) {
  return (
    <aside className="gen-build-panel">
      <GenControls
        settings={props.settings} set={props.set} ctrlTab={props.ctrlTab} setCtrlTab={props.setCtrlTab}
        moduleType={props.moduleType} config={props.config} setConfig={props.setConfig}
        setConfigObject={props.setConfigObject} style={props.style} setStyle={props.setStyle}
      />
      <GenBuilderDock
        credits={props.credits} costPerChange={COST_PER_CHANGE} open={props.dockOpen} setOpen={props.setDockOpen}
        thread={props.thread} thinking={props.thinking} refine={props.refine} setRefine={props.setRefine} onRefine={props.onRefine}
        changes={props.history.length} onOpenHistory={() => props.setHistOpen(true)}
      />
      {props.histOpen && <GenHistory history={props.history} credits={props.credits} onClose={() => props.setHistOpen(false)} />}
    </aside>
  );
}

function GenBuilderDock({ credits, costPerChange, open, setOpen, thread, thinking, refine, setRefine, onRefine, changes, onOpenHistory }: any) {
  const last = thread.slice().reverse().find((m: any) => m.role === 'assistant');
  const unlimited = credits === null;
  const low = !unlimited && credits <= 40, out = !unlimited && credits <= 0;
  const suggestions = ['Use brand green', 'Make it a pill', 'Add a countdown'];
  return (
    <div className={'gen-dock' + (open ? ' open' : '')}>
      <button className="gen-dock-head" onClick={() => setOpen(!open)}>
        <span className="gen-dock-ava"><Icon name="magic" size={15} /></span>
        <div className="gen-dock-id">
          <span className="t-strong t-sm">Builder</span>
          <span className="t-xs t-muted">{open ? 'Describe a change — applied to the spec' : 'Tap to refine with AI'}</span>
        </div>
        <span className={'gen-credit-pill' + (low ? ' low' : '')} title={unlimited ? 'Unlimited AI requests on your plan' : credits.toLocaleString() + ' AI requests remaining this month'}>
          <Icon name="bolt" size={12} />{unlimited ? 'Unlimited' : credits.toLocaleString() + ' left'}
        </span>
        <span className="gen-dock-chev"><Icon name={open ? 'chevronDown' : 'chevronUp'} size={16} /></span>
      </button>
      {open && (
        <div className="gen-dock-body">
          <div className={'gen-dock-last' + (last ? '' : ' empty')}>
            {last ? (
              <>
                <span className="gen-last-ico"><Icon name="check" size={12} /></span>
                <div className="gen-last-body">
                  <div className="gen-last-cap">Latest change</div>
                  <div className="gen-last-text" dangerouslySetInnerHTML={{ __html: gmd(last.text) }} />
                </div>
              </>
            ) : <span className="t-xs t-muted">No changes yet — ask for an edit below and you’ll see what happened here.</span>}
          </div>
          {thinking && (
            <div className="gen-dock-thinking">
              <div className="asst-typing"><span /><span /><span /></div>
              <span className="t-xs t-muted">Applying your change…</span>
            </div>
          )}
          <div className={'gen-dock-input' + (out ? ' is-out' : '')}>
            <textarea className="gen-refine-input" rows={1} placeholder={out ? 'Out of AI requests — upgrade to keep building' : 'Refine with AI…'}
              value={refine} disabled={out} onChange={(e) => setRefine(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine(); } }} />
            <Btn variant="magic" icon="send" onClick={() => onRefine()} disabled={out || thinking || !refine.trim()} />
          </div>
          {!out && (
            <div className="gen-dock-sugg">
              {suggestions.map((sg) => <button key={sg} className="example-chip" onClick={() => onRefine(sg)}><Icon name="magic" size={11} />{sg}</button>)}
            </div>
          )}
          <div className="gen-dock-foot">
            <span className="gen-cost-note"><Icon name="bolt" size={12} />Each change costs <b>{costPerChange === 1 ? '1 AI request' : costPerChange + ' AI requests'}</b></span>
            <button className="gen-hist-btn" onClick={onOpenHistory}>
              <Icon name="clock" size={13} />History{changes ? <span className="gen-hist-count">{changes}</span> : null}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenHistory({ history, credits, onClose }: any) {
  const spent = history.reduce((a: number, h: any) => a + h.cost, 0);
  return (
    <div className="gen-hist">
      <div className="gen-hist-head">
        <div className="stack" style={{ gap: 1 }}>
          <span className="t-strong t-sm">Change history</span>
          <span className="t-xs t-muted">{history.length + ' change' + (history.length === 1 ? '' : 's') + ' · ' + spent + ' AI request' + (spent === 1 ? '' : 's') + ' spent'}</span>
        </div>
        <button className="gen-hist-x" onClick={onClose} title="Close"><Icon name="x" size={15} /></button>
      </div>
      <div className="gen-hist-list">
        {history.slice().reverse().map((h: any) => (
          <div key={h.id} className="gen-hist-row">
            <span className="gen-hist-dot" />
            <div className="gen-hist-main">
              <div className="gen-hist-label">{h.label}</div>
              <div className="gen-hist-detail">{h.detail}</div>
              <div className="gen-hist-time">{h.time}</div>
            </div>
            <span className="gen-hist-cost">{'−' + h.cost}</span>
          </div>
        ))}
      </div>
      <div className="gen-hist-foot">
        <Icon name="bolt" size={13} />
        <span><b>{credits === null ? 'Unlimited' : credits.toLocaleString()}</b> AI requests remaining</span>
        <span className="grow" />
        <a className="gen-hist-topup" href="/billing">Upgrade</a>
      </div>
    </div>
  );
}

/**
 * Live preview of the REAL generated module. Renders the merged recipe through
 * `PreviewService` via `/api/preview` in a sandboxed iframe, so what the merchant
 * sees is exactly what will publish (no mock, works for every module type). For
 * Function/checkout/post-purchase modules it drives a deterministic simulation
 * against a representative cart/customer fixture (currency / country / Plus).
 */
function GenPreview({ recipe, device }: { recipe: Record<string, unknown> | null; device: 'desktop' | 'mobile' }) {
  const type = String((recipe as { type?: unknown } | null)?.type ?? '');
  const isSimulated = type.startsWith('functions.') || type.startsWith('checkout.') || type.startsWith('postPurchase.');
  const [sim, setSim] = useState({ currency: 'USD', countryCode: 'US', isPlus: true });
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'html' | 'json' | 'error'; html?: string; json?: unknown; error?: string }>({ status: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const specKey = recipe ? JSON.stringify(recipe) : '';

  useEffect(() => {
    if (!recipe) { setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState((s) => (s.status === 'idle' ? { status: 'loading' } : s));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.set('spec', specKey);
      if (isSimulated) fd.set('simulation', JSON.stringify(sim));
      fetch('/api/preview', { method: 'POST', body: fd })
        .then((r) => r.json())
        .then((d: { html?: string; json?: unknown; error?: string }) => {
          if (cancelled) return;
          if (typeof d?.html === 'string') setState({ status: 'html', html: d.html });
          else if (d && 'json' in d) setState({ status: 'json', json: d.json });
          else setState({ status: 'error', error: d?.error || 'Preview unavailable' });
        })
        .catch((e: unknown) => { if (!cancelled) setState({ status: 'error', error: e instanceof Error ? e.message : String(e) }); });
    }, 250);
    return () => { cancelled = true; if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, isSimulated, sim.currency, sim.countryCode, sim.isPlus]);

  return (
    <div className={'gen-canvas' + (device === 'mobile' ? ' mobile' : '')}>
      {isSimulated && (
        <div className="pv-sim" role="group" aria-label="Simulation context">
          <span className="t-xs t-muted">Simulate</span>
          <select aria-label="Currency" value={sim.currency} onChange={(e) => setSim((v) => ({ ...v, currency: e.target.value }))}>
            {['USD', 'CAD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Country" value={sim.countryCode} onChange={(e) => setSim((v) => ({ ...v, countryCode: e.target.value }))}>
            {['US', 'CA', 'GB', 'DE'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="pv-sim-plus"><input type="checkbox" checked={sim.isPlus} onChange={(e) => setSim((v) => ({ ...v, isPlus: e.target.checked }))} />Plus</label>
        </div>
      )}
      <div className="pv-frame">
        <div className="pv-browser"><span className="pv-dot" /><span className="pv-dot" /><span className="pv-dot" /><div className="pv-url">Live preview · {type || 'module'}</div></div>
        <div className="pv-live">
          {state.status === 'idle' && (
            <div className="pv-msg"><Icon name="layers" size={22} /><span className="t-sm t-muted">Pick a concept to preview it here.</span></div>
          )}
          {state.status === 'loading' && (
            <div className="pv-msg"><span className="spinner" style={{ width: 20, height: 20 }} /><span className="t-sm t-muted">Rendering preview…</span></div>
          )}
          {state.status === 'error' && (
            <div className="pv-msg"><Icon name="alert" size={22} /><span className="t-sm t-muted">{state.error}</span></div>
          )}
          {state.status === 'html' && (
            <iframe
              title="Module preview"
              className="pv-iframe"
              srcDoc={state.html}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}
          {state.status === 'json' && (
            <pre className="pv-json">{JSON.stringify(state.json, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Settings form for non-storefront modules, driven by the generated config's
 * real shape: top-level scalar fields become editable inputs (writing straight
 * into recipe.config); structured fields are steered to the AI chat.
 */
// New packs that get a first-class editor on non-storefront types, so they never
// fall into the "structured — edit via chat" bucket. Keyed by the flat config key.
const PACK_CONFIG_KEYS = new Set(['pricing', 'recommendation']);

function GenConfigControls({ moduleType, config, setConfig, setConfigObject }: any) {
  // Which pack editors apply to this type (flat-pin sites in recipe.ts):
  //   pricing → functions.discountRules + functions.cartTransform ·
  //   recommendation → checkout.upsell + checkout.block + postPurchase.offer.
  const showPricing = moduleType === 'functions.discountRules' || moduleType === 'functions.cartTransform';
  const showRecs = moduleType === 'checkout.upsell' || moduleType === 'checkout.block' || moduleType === 'postPurchase.offer';
  const entries: [string, unknown][] = Object.entries(config || {});
  const scalars = entries.filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v));
  // Structured fields we render with a dedicated pack editor are excluded from the
  // "edit via chat" bucket below (they now have real controls).
  const complex = entries.filter(([k, v]) => v !== null && typeof v === 'object' && !PACK_CONFIG_KEYS.has(k));
  const fieldLabel = (key: string) => titleCase(String(key).replace(/([A-Z])/g, ' $1').replace(/[_.]/g, ' ').trim());
  return (
    <div className="gbp-controls">
      <div className="gen-controls-head"><span className="t-h3">Settings</span><span className="t-xs t-muted">{titleCase(String(moduleType || 'module').replace(/\./g, ' '))}</span></div>
      <div className="gen-ctrl-body">
        <div className="stack-4" style={{ padding: 16 }}>
          {scalars.length === 0 && complex.length === 0 && !showPricing && !showRecs && (
            <Banner tone="info">No editable settings on this module yet — describe changes in the Builder chat below.</Banner>
          )}
          {scalars.map(([key, val]) => {
            if (typeof val === 'boolean') {
              return <ToggleRow key={key} label={fieldLabel(key)} checked={val} onChange={() => setConfig(key, !val)} />;
            }
            const isNum = typeof val === 'number';
            return (
              <Field key={key} label={fieldLabel(key)}>
                <Input
                  type={isNum ? 'number' : 'text'}
                  value={val == null ? '' : String(val)}
                  onChange={(e: any) => setConfig(key, isNum ? Number(e.target.value) : e.target.value)}
                />
              </Field>
            );
          })}
          {showPricing && (
            <div style={{ borderTop: '1px solid var(--p-border)', paddingTop: 14 }}>
              <PricingControls value={config?.pricing} onChange={(v: unknown) => setConfigObject('pricing', v)} />
            </div>
          )}
          {showRecs && (
            <div style={{ borderTop: '1px solid var(--p-border)', paddingTop: 14 }}>
              <RecommendationControls value={config?.recommendation} onChange={(v: unknown) => setConfigObject('recommendation', v)} />
            </div>
          )}
          {complex.length > 0 && (
            <Banner tone="info" title="Structured fields">
              {complex.map(([k]) => fieldLabel(k)).join(', ')} {complex.length === 1 ? 'is' : 'are'} structured — edit by describing the change in the Builder chat below. The live preview always reflects the real module.
            </Banner>
          )}
        </div>
      </div>
    </div>
  );
}

function GenControls({ settings: s, set, ctrlTab, setCtrlTab, moduleType, config, setConfig, setConfigObject, style, setStyle }: any) {
  const swatches = ['#1F3A5F', '#0E9F6E', '#14213A', '#2F80ED', '#D97706', '#DC2626'];
  // The visual controls below model a storefront block (button/layout/colors).
  // For non-storefront types, drive the form off the generated config's real
  // shape (edit recipe.config directly) instead of the storefront projection.
  const isStorefront = moduleType === 'theme.section' || moduleType === 'proxy.widget';
  if (!isStorefront) {
    return <GenConfigControls moduleType={moduleType} config={config} setConfig={setConfig} setConfigObject={setConfigObject} />;
  }
  // Which new packs apply to this storefront type (flat-pin sites in recipe.ts):
  //   ruleEngine → theme.section + proxy.widget · recommendation → theme.section.
  const showRules = moduleType === 'theme.section' || moduleType === 'proxy.widget';
  const showRecs = moduleType === 'theme.section';
  return (
    <div className="gbp-controls">
      <div className="gen-controls-head"><span className="t-h3">Controls</span><span className="t-xs t-muted">Changes apply live</span></div>
      <div className="gen-ctrl-tabs">
        {(['basic', 'advanced', 'css'] as const).map((x) => (
          <button key={x} className={'gen-ctrl-tab' + (ctrlTab === x ? ' sel' : '')} onClick={() => setCtrlTab(x)}>{x === 'css' ? 'Custom CSS' : titleCase(x)}</button>
        ))}
      </div>
      <div className="gen-ctrl-body">
        {ctrlTab === 'basic' && (
          <div className="stack-4">
            <Field label="Button label"><Input value={s.label} onChange={(e: any) => set({ label: e.target.value })} /></Field>
            <Field label="Price suffix" optional><Input value={s.price} onChange={(e: any) => set({ price: e.target.value })} /></Field>
            <Field label="Button color"><SwatchRow value={s.buttonColor} swatches={swatches} onChange={(c: string) => set({ buttonColor: c })} /></Field>
            <Field label="Button text color"><SwatchRow value={s.buttonText} swatches={['#FFFFFF', '#14213A']} onChange={(c: string) => set({ buttonText: c })} /></Field>
            <Field label="Corner radius"><SegField value={s.radius} options={[['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L'], ['full', 'Pill']]} onChange={(v: string) => set({ radius: v })} /></Field>
            <Field label="Button size"><SegField value={s.size} options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} onChange={(v: string) => set({ size: v })} /></Field>
          </div>
        )}
        {ctrlTab === 'advanced' && (
          <div className="stack-4">
            <Field label="Layout mode" help="How the module sits on the page">
              <Select options={[{ value: 'sticky', label: 'Sticky bar' }, { value: 'inline', label: 'Inline (in product info)' }, { value: 'floating', label: 'Floating button' }]} value={s.mode} onChange={(e: any) => set({ mode: e.target.value })} />
            </Field>
            {s.mode === 'sticky' && <Field label="Anchor"><SegField value={s.anchor} options={[['top', 'Top'], ['bottom', 'Bottom']]} onChange={(v: string) => set({ anchor: v })} /></Field>}
            <Field label="Background"><SwatchRow value={s.bg} swatches={['#FFFFFF', '#F6F8FB', '#14213A']} onChange={(c: string) => set({ bg: c })} /></Field>
            <Field label="Shadow"><SegField value={s.shadow} options={[['none', 'None'], ['sm', 'S'], ['md', 'M'], ['lg', 'L']]} onChange={(v: string) => set({ shadow: v })} /></Field>
            <div className="divider" />
            <ToggleRow label="Show variant picker" checked={s.showVariants} onChange={() => set({ showVariants: !s.showVariants })} />
            <ToggleRow label="Show quantity stepper" checked={s.showQty} onChange={() => set({ showQty: !s.showQty })} />
            <ToggleRow label="Urgency countdown" checked={s.countdown} onChange={() => set({ countdown: !s.countdown })} />
            <ToggleRow label="Hide on mobile" checked={s.hideMobile} onChange={() => set({ hideMobile: !s.hideMobile })} />
            <div className="divider" />
            <StyleTokenControls style={style} setStyle={setStyle} />
          </div>
        )}
        {ctrlTab === 'css' && (
          <div className="stack-3">
            <Banner tone="info">Scoped &amp; sanitized · max 2000 characters. Saved with the module.</Banner>
            <Textarea mono rows={10} maxLength={2000} value={s.customCss ?? ''}
              placeholder={'.sa-bar {\n  backdrop-filter: blur(8px);\n}\n.sa-bar__button:hover {\n  transform: translateY(-1px);\n}'}
              onChange={(e: any) => set({ customCss: e.target.value })} />
          </div>
        )}
        {ctrlTab === 'basic' && (showRecs || showRules) && (
          <div className="stack-3" style={{ marginTop: 14, borderTop: '1px solid var(--p-border)', paddingTop: 14 }}>
            {showRecs && <RecommendationControls value={config?.recommendation} onChange={(v: unknown) => setConfigObject('recommendation', v)} />}
            {showRules && <RuleEngineControls value={config?.ruleEngine} onChange={(v: unknown) => setConfigObject('ruleEngine', v)} />}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Phase #2 style tokens (design-vocabulary §1) — density / elevation / motion /
 * radius scaling / brand seed. Writes straight into recipe.style.<group> via
 * setStyle; every value is a named token from the manifest (never a raw ms /
 * cubic-bezier / px). All optional: "Auto" clears the key so the compiler falls
 * back to the pack/default, keeping older recipes byte-identical.
 */
function StyleTokenControls({ style, setStyle }: any) {
  const spacing = style?.spacing ?? {};
  const shape = style?.shape ?? {};
  const motion = style?.motion ?? {};
  const colors = style?.colors ?? {};
  const density = spacing.density ?? '';
  const elevation = shape.elevation ?? '';
  const scaling = typeof shape.scaling === 'number' ? shape.scaling : 100;
  const dur = motion.duration ?? '';
  const ease = motion.easing ?? '';
  const seedSwatches = ['#1F3A5F', '#0E9F6E', '#2F80ED', '#D97706', '#DC2626', '#7C3AED'];
  const autoOpt = (label: string) => ({ value: '', label });
  return (
    <div className="stack-4">
      <div className="row spread"><span className="t-sm t-strong">Design tokens</span><span className="t-xs t-muted">Phase 2</span></div>
      <Field label="Density" help="Airy for marketing, compact for utility.">
        <Select
          value={density}
          options={[autoOpt('Auto (pack default)'), ...STOREFRONT_DENSITY_LEVELS.map((d) => ({ value: d, label: titleCase(d) }))]}
          onChange={(e: any) => setStyle('spacing', { density: e.target.value || undefined })}
        />
      </Field>
      <Field label="Elevation" help="Shadow personality applied to the module surface.">
        <Select
          value={elevation}
          options={[autoOpt('Auto (flat / pack default)'), ...STOREFRONT_ELEVATION_IDIOMS.map((v) => ({ value: v, label: titleCase(v) }))]}
          onChange={(e: any) => setStyle('shape', { elevation: e.target.value || undefined })}
        />
      </Field>
      <Field label="Corner scaling" help={`Shift the whole radius ladder tighter or softer (${STOREFRONT_RADIUS_SCALING_MIN}–${STOREFRONT_RADIUS_SCALING_MAX}%).`}>
        <div className="row-2" style={{ alignItems: 'center' }}>
          <input type="range" min={STOREFRONT_RADIUS_SCALING_MIN} max={STOREFRONT_RADIUS_SCALING_MAX} step={5} value={scaling}
            style={{ flex: 1 }} onChange={(e) => setStyle('shape', { scaling: Number(e.target.value) })} />
          <span className="t-mono t-xs t-muted" style={{ width: 42, textAlign: 'right' }}>{scaling}%</span>
          {typeof shape.scaling === 'number' && (
            <button className="btn-plain btn-plain-subdued" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 2 }}
              title="Reset to default" onClick={() => setStyle('shape', { scaling: undefined })}><Icon name="x" size={13} /></button>
          )}
        </div>
      </Field>
      <Field label="Motion duration" help="Named speed; always paired with a reduced-motion fallback.">
        <Select
          value={dur}
          options={[autoOpt('Auto (base)'), ...STOREFRONT_MOTION_DURATIONS.map((v) => ({ value: v, label: titleCase(v) }))]}
          onChange={(e: any) => setStyle('motion', { duration: e.target.value || undefined })}
        />
      </Field>
      <Field label="Motion easing" help="Personality of the transition curve.">
        <Select
          value={ease}
          options={[autoOpt('Auto (standard)'), ...STOREFRONT_MOTION_EASINGS.map((v) => ({ value: v, label: titleCase(v) }))]}
          onChange={(e: any) => setStyle('motion', { easing: e.target.value || undefined })}
        />
      </Field>
      <Field label="Brand seed" optional help="Seeds the OKLCH semantic color ramp. Additive — flat colors above still apply.">
        <SwatchRow value={colors.seed ?? ''} swatches={seedSwatches} onChange={(c: string) => setStyle('colors', { seed: c })} />
        {colors.seed && (
          <button className="btn-plain btn-plain-subdued" style={{ border: 0, background: 'none', cursor: 'pointer', padding: '4px 2px', marginTop: 4 }}
            onClick={() => setStyle('colors', { seed: undefined })}><span className="t-xs t-muted">Clear seed</span></button>
        )}
      </Field>
    </div>
  );
}

function SwatchRow({ value, swatches, onChange }: any) {
  return (
    <div className="row-2 row-wrap">
      {swatches.map((c: string) => <button key={c} className={'swatch-btn' + (c.toLowerCase() === value.toLowerCase() ? ' sel' : '')} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}
      <span className="t-mono t-xs t-muted">{value}</span>
    </div>
  );
}
function SegField({ value, options, onChange }: any) {
  return (
    <div className="seg" style={{ width: '100%' }}>
      {options.map((o: any) => <button key={o[0]} aria-selected={value === o[0]} onClick={() => onChange(o[0])} style={{ flex: 1, justifyContent: 'center' }}>{o[1]}</button>)}
    </div>
  );
}
function ToggleRow({ label, checked, onChange }: any) {
  return <label className="row spread" style={{ cursor: 'pointer' }}><span className="t-sm">{label}</span><Toggle checked={checked} onChange={onChange} /></label>;
}

/** Human label for an enum token — titleCase but hyphen-aware (fixed-amount → Fixed Amount). */
function labelize(s: string): string {
  return titleCase(String(s).replace(/-/g, ' '));
}

/** Section header for a pack editor with an on/off switch. */
function PackHeader({ title, hint, enabled, onToggle }: any) {
  return (
    <div className="row spread" style={{ marginBottom: enabled ? 10 : 0 }}>
      <div className="stack" style={{ gap: 1 }}>
        <span className="t-sm t-strong">{title}</span>
        {hint && <span className="t-xs t-muted">{hint}</span>}
      </div>
      <Toggle checked={enabled} onChange={onToggle} />
    </div>
  );
}

/** Comma-separated string[] editor backed by a single text input. */
function TagListField({ label, help, value, onChange, placeholder }: any) {
  const arr: string[] = Array.isArray(value) ? value : [];
  return (
    <Field label={label} help={help}>
      <Input value={arr.join(', ')} placeholder={placeholder}
        onChange={(e: any) => onChange(String(e.target.value).split(',').map((x) => x.trim()).filter(Boolean))} />
    </Field>
  );
}

// ── Recommendation pack (R2.3) ──────────────────────────────────────────────
// Strategy select + its key fields (productLimit, seed/collection, fallback).
// Writes the whole `recommendation` object to config; toggle off removes the key.
const RECS_STATIC = new Set<string>(STATIC_RECOMMENDATION_STRATEGIES as readonly string[]);
function RecommendationControls({ value, onChange }: any) {
  const enabled = !!value;
  const v = value ?? {};
  const strategy = v.strategy ?? 'related';
  const patch = (p: Record<string, unknown>) => onChange({ ...v, ...p });
  const isDynamic = !RECS_STATIC.has(strategy);
  return (
    <div className="stack-4">
      <PackHeader
        title="Product recommendations"
        hint="How this widget chooses which products to offer."
        enabled={enabled}
        onToggle={() => onChange(enabled ? undefined : { strategy: 'related', productLimit: 4, fallback: 'related' })}
      />
      {enabled && (
        <>
          <Field label="Strategy">
            <Select value={strategy} options={RECOMMENDATION_STRATEGIES.map((sname) => ({ value: sname, label: labelize(sname) }))}
              onChange={(e: any) => patch({ strategy: e.target.value })} />
          </Field>
          {strategy === 'manual' && (
            <TagListField label="Manual variant GIDs" help="gid://shopify/ProductVariant/… — comma-separated."
              value={v.manualVariantGids} placeholder="gid://shopify/ProductVariant/123"
              onChange={(arr: string[]) => patch({ manualVariantGids: arr })} />
          )}
          {strategy === 'collection' && (
            <>
              <Field label="Collection GID" help="gid://shopify/Collection/…">
                <Input value={v.collectionGid ?? ''} placeholder="gid://shopify/Collection/456"
                  onChange={(e: any) => patch({ collectionGid: e.target.value || undefined })} />
              </Field>
              <ToggleRow label="Pick one at random" checked={!!v.collectionRandom} onChange={() => patch({ collectionRandom: !v.collectionRandom })} />
            </>
          )}
          {['related', 'complementary', 'buy-it-again'].includes(strategy) && (
            <Field label="Seed product GID" optional help="Defaults to the current PDP product.">
              <Input value={v.seedProductGid ?? ''} placeholder="gid://shopify/Product/789"
                onChange={(e: any) => patch({ seedProductGid: e.target.value || undefined })} />
            </Field>
          )}
          <Field label="Products to show" help={`${RECOMMENDATION_LIMITS.productLimitMin}–${RECOMMENDATION_LIMITS.productLimitMax}.`}>
            <Input type="number" min={RECOMMENDATION_LIMITS.productLimitMin} max={RECOMMENDATION_LIMITS.productLimitMax}
              value={v.productLimit ?? 4}
              onChange={(e: any) => patch({ productLimit: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </Field>
          {isDynamic && (
            <Field label="Fallback" help="Shown when a dynamic strategy has no result (empty history / service down).">
              <Select value={v.fallback ?? 'related'} options={RECOMMENDATION_FALLBACKS.map((f) => ({ value: f, label: labelize(f) }))}
                onChange={(e: any) => patch({ fallback: e.target.value })} />
            </Field>
          )}
        </>
      )}
    </div>
  );
}

// ── Rule-engine pack (R2.1) ─────────────────────────────────────────────────
// Display-rules editor: condition rows {object, attribute, operator, value}
// grouped, combined AND/OR. Writes the whole `ruleEngine` object to config.
const VALUELESS_OPS = new Set(['is_set', 'is_not_set']);
function attrsFor(object: string): readonly string[] {
  return (RULE_ATTRIBUTES as Record<string, readonly string[]>)[object] ?? [];
}
function RuleEngineControls({ value, onChange }: any) {
  const enabled = !!value?.enabled;
  const v = value ?? {};
  const groups: any[] = Array.isArray(v.groups) ? v.groups : [];
  const emit = (p: Record<string, unknown>) => onChange({ enabled: true, logic: v.logic ?? 'AND', groups, matchAction: v.matchAction ?? 'SHOW', ...p });
  const setGroups = (next: any[]) => emit({ groups: next });
  const toggle = () => {
    if (enabled) { onChange(undefined); return; }
    // Turning on with no rows yet: seed a first group + row so it's editable.
    const seed = { logic: 'AND', conditions: [{ object: 'product', attribute: 'tags', operator: 'contains', value: '' }] };
    onChange({ enabled: true, logic: 'AND', groups: [seed], matchAction: 'SHOW' });
  };
  const addGroup = () => {
    if (groups.length >= RULE_LIMITS.maxGroups) return;
    setGroups([...groups, { logic: 'AND', conditions: [{ object: 'product', attribute: 'tags', operator: 'contains', value: '' }] }]);
  };
  return (
    <div className="stack-4">
      <PackHeader
        title="Display rules"
        hint="Conditions that decide when this module appears."
        enabled={enabled}
        onToggle={toggle}
      />
      {enabled && (
        <>
          <Field label="When rules match" help="Show or hide the module when the conditions pass.">
            <SegField value={v.matchAction ?? 'SHOW'} options={RULE_MATCH_ACTIONS.map((m) => [m, labelize(m)])} onChange={(m: string) => emit({ matchAction: m })} />
          </Field>
          {groups.length > 1 && (
            <Field label="Combine groups" help="Match ALL groups (AND) or ANY group (OR).">
              <SegField value={v.logic ?? 'AND'} options={[['AND', 'All (AND)'], ['OR', 'Any (OR)']]} onChange={(l: string) => emit({ logic: l })} />
            </Field>
          )}
          {groups.map((g, gi) => (
            <RuleGroupEditor
              key={gi}
              group={g}
              index={gi}
              showOuter={groups.length > 1}
              onChange={(next: any) => setGroups(groups.map((x, i) => (i === gi ? next : x)))}
              onRemove={() => setGroups(groups.filter((_, i) => i !== gi))}
            />
          ))}
          {groups.length < RULE_LIMITS.maxGroups && (
            <button className="example-chip" onClick={addGroup}><Icon name="plus" size={12} />Add rule group</button>
          )}
        </>
      )}
    </div>
  );
}

function RuleGroupEditor({ group, index, showOuter, onChange, onRemove }: any) {
  const conditions: any[] = Array.isArray(group?.conditions) ? group.conditions : [];
  const setConds = (next: any[]) => onChange({ ...group, conditions: next });
  const addRow = () => {
    if (conditions.length >= RULE_LIMITS.maxRowsPerGroup) return;
    setConds([...conditions, { object: 'product', attribute: 'tags', operator: 'contains', value: '' }]);
  };
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <span className="t-xs t-strong">{showOuter ? `Group ${index + 1}` : 'Conditions'}</span>
        {showOuter && (
          <button className="btn-plain btn-plain-subdued" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 2 }}
            title="Remove group" onClick={onRemove}><Icon name="trash" size={13} /></button>
        )}
      </div>
      <div className="stack-3">
        {conditions.map((c, ci) => (
          <RuleRowEditor
            key={ci}
            row={c}
            showLogic={ci > 0}
            groupLogic={group?.logic ?? 'AND'}
            onLogic={(l: string) => onChange({ ...group, logic: l })}
            onChange={(next: any) => setConds(conditions.map((x, i) => (i === ci ? next : x)))}
            onRemove={conditions.length > 1 ? () => setConds(conditions.filter((_, i) => i !== ci)) : null}
          />
        ))}
        {conditions.length < RULE_LIMITS.maxRowsPerGroup && (
          <button className="example-chip" onClick={addRow}><Icon name="plus" size={12} />Add condition</button>
        )}
      </div>
    </div>
  );
}

function RuleRowEditor({ row, showLogic, groupLogic, onLogic, onChange, onRemove }: any) {
  const object = row?.object ?? 'product';
  const attrs = attrsFor(object);
  const attribute = attrs.includes(row?.attribute) ? row.attribute : (attrs[0] ?? '');
  const valueType = RULE_ATTRIBUTE_VALUE_TYPES[`${object}.${attribute}`] ?? 'string';
  const operator = row?.operator ?? 'equal_to';
  const valueless = VALUELESS_OPS.has(operator);
  const setObject = (obj: string) => {
    const nextAttrs = attrsFor(obj);
    onChange({ object: obj, attribute: nextAttrs[0] ?? '', operator: 'equal_to', value: '' });
  };
  return (
    <div className="stack-2">
      {showLogic && (
        <div className="seg" style={{ width: 'fit-content' }}>
          {[['AND', 'AND'], ['OR', 'OR']].map((o) => (
            <button key={o[0]} aria-selected={groupLogic === o[0]} onClick={() => onLogic(o[0])} style={{ padding: '2px 10px' }}>{o[1]}</button>
          ))}
        </div>
      )}
      <div className="row-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ flex: '1 1 110px' }}>
          <Select value={object} options={RULE_OBJECTS.map((o) => ({ value: o, label: titleCase(o) }))} onChange={(e: any) => setObject(e.target.value)} />
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <Select value={attribute} options={attrs.map((a) => ({ value: a, label: titleCase(a) }))} onChange={(e: any) => onChange({ ...row, object, attribute: e.target.value })} />
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <Select value={operator} options={CONDITION_OPERATORS.map((op) => ({ value: op, label: labelize(op) }))} onChange={(e: any) => onChange({ ...row, operator: e.target.value })} />
        </div>
        {!valueless && (
          <div style={{ flex: '2 1 150px' }}>
            {valueType === 'boolean' ? (
              <Select value={String(row?.value ?? 'true')} options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]} onChange={(e: any) => onChange({ ...row, value: e.target.value === 'true' })} />
            ) : valueType === 'stringList' ? (
              <Input value={Array.isArray(row?.value) ? row.value.join(', ') : (row?.value ?? '')} placeholder="a, b, c"
                onChange={(e: any) => onChange({ ...row, value: String(e.target.value).split(',').map((x) => x.trim()).filter(Boolean) })} />
            ) : (
              <Input type={valueType === 'number' ? 'number' : 'text'} value={row?.value ?? ''}
                onChange={(e: any) => onChange({ ...row, value: valueType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} />
            )}
          </div>
        )}
        {onRemove && (
          <button className="btn-plain btn-plain-subdued" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 6 }}
            title="Remove condition" onClick={onRemove}><Icon name="x" size={14} /></button>
        )}
      </div>
    </div>
  );
}

// ── Pricing pack (R2.2) ─────────────────────────────────────────────────────
// Model select + the single-discount fields and tiered rows. Writes the whole
// `pricing` object to config; toggle off removes the key (legacy rules[] path).
function PricingControls({ value, onChange }: any) {
  const enabled = !!value;
  const v = value ?? {};
  const model = v.model ?? 'single';
  const emit = (p: Record<string, unknown>) => onChange({ ...v, ...p });
  const setModel = (m: string) => {
    // Give the newly-selected model a minimal valid body so the spec validates.
    const body: Record<string, unknown> = { model: m };
    if (m === 'single') body.discount = v.discount ?? { kind: 'percentage', value: 10 };
    if (m === 'tiered') body.tiers = v.tiers ?? { basis: 'quantity', rows: [{ threshold: 2, discount: { kind: 'percentage', value: 10 } }] };
    emit(body);
  };
  return (
    <div className="stack-4">
      <PackHeader
        title="Pricing & discounts"
        hint="Discount vocabulary; lowered into the Function on publish."
        enabled={enabled}
        onToggle={() => onChange(enabled ? undefined : { model: 'single', discount: { kind: 'percentage', value: 10 } })}
      />
      {enabled && (
        <>
          <Field label="Model">
            <Select value={model} options={PRICING_MODELS.map((m) => ({ value: m, label: labelize(m) }))} onChange={(e: any) => setModel(e.target.value)} />
          </Field>
          <Field label="Mechanism" help="How the discount is enforced at checkout.">
            <Select value={v.mechanism ?? 'shopify-function-discount'} options={PRICING_MECHANISMS.map((m) => ({ value: m, label: labelize(m) }))}
              onChange={(e: any) => emit({ mechanism: e.target.value })} />
          </Field>
          {model === 'single' && (
            <DiscountFields discount={v.discount ?? { kind: 'percentage', value: 10 }} onChange={(d: unknown) => emit({ discount: d })} />
          )}
          {model === 'tiered' && (
            <PricingTiers tiers={v.tiers ?? { basis: 'quantity', rows: [] }} onChange={(t: unknown) => emit({ tiers: t })} />
          )}
          {(model === 'bogo' || model === 'gift') && (
            <Banner tone="info">{labelize(model)} needs product/collection targeting — describe it in the Builder chat below; the live preview reflects the real module.</Banner>
          )}
        </>
      )}
    </div>
  );
}

const KIND_NEEDS_VALUE = new Set(['percentage', 'fixed-amount', 'fixed-price']);
function DiscountFields({ discount, onChange }: any) {
  const d = discount ?? {};
  const kind = d.kind ?? 'percentage';
  const needsValue = KIND_NEEDS_VALUE.has(kind);
  return (
    <div className="stack-3">
      <Field label="Discount kind">
        <Select value={kind} options={DISCOUNT_KINDS.map((k) => ({ value: k, label: labelize(k) }))} onChange={(e: any) => onChange({ ...d, kind: e.target.value })} />
      </Field>
      {needsValue && (
        <Field label={kind === 'percentage' ? 'Percent off (0–100)' : kind === 'fixed-price' ? 'Final price' : 'Amount off'}>
          <Input type="number" min={0} max={kind === 'percentage' ? 100 : undefined} value={d.value ?? 0}
            onChange={(e: any) => onChange({ ...d, value: e.target.value === '' ? 0 : Number(e.target.value) })} />
        </Field>
      )}
      {kind === 'cheapest-free' && (
        <Field label="How many cheapest become free">
          <Input type="number" min={1} value={d.cheapestFreeCount ?? 1}
            onChange={(e: any) => onChange({ ...d, cheapestFreeCount: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </Field>
      )}
    </div>
  );
}

function PricingTiers({ tiers, onChange }: any) {
  const t = tiers ?? { basis: 'quantity', rows: [] };
  const rows: any[] = Array.isArray(t.rows) ? t.rows : [];
  const setRows = (next: any[]) => onChange({ ...t, rows: next });
  const addRow = () => setRows([...rows, { threshold: rows.length + 2, discount: { kind: 'percentage', value: 10 } }]);
  return (
    <div className="stack-3">
      <Field label="Tier threshold basis">
        <SegField value={t.basis ?? 'quantity'} options={THRESHOLD_BASIS.map((b) => [b, labelize(b)])} onChange={(b: string) => onChange({ ...t, basis: b })} />
      </Field>
      {rows.map((r, ri) => (
        <div key={ri} className="card" style={{ padding: 12 }}>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <span className="t-xs t-strong">Tier {ri + 1}</span>
            {rows.length > 1 && (
              <button className="btn-plain btn-plain-subdued" style={{ border: 0, background: 'none', cursor: 'pointer', padding: 2 }}
                title="Remove tier" onClick={() => setRows(rows.filter((_, i) => i !== ri))}><Icon name="trash" size={13} /></button>
            )}
          </div>
          <div className="stack-3">
            <Field label={`Threshold (${t.basis === 'cart-value' ? 'cart value' : 'quantity'})`}>
              <Input type="number" min={1} value={r.threshold ?? 1}
                onChange={(e: any) => setRows(rows.map((x, i) => (i === ri ? { ...x, threshold: Number(e.target.value) } : x)))} />
            </Field>
            <DiscountFields discount={r.discount} onChange={(dd: unknown) => setRows(rows.map((x, i) => (i === ri ? { ...x, discount: dd } : x)))} />
          </div>
        </div>
      ))}
      <button className="example-chip" onClick={addRow}><Icon name="plus" size={12} />Add tier</button>
    </div>
  );
}

// Real validation results from this route's `validate` action: RecipeSpecSchema
// plus the same pre-publish validator Publish runs server-side. No fixed rows.
function GenValidation({ loading, data, hasRecipe }: any) {
  if (!hasRecipe) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
        <EmptyState icon="shield" title="Nothing to validate">This concept has no generated spec — regenerate and pick a concept first.</EmptyState>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="spinner" style={{ width: 16, height: 16 }} />
        <span className="t-sm t-muted">Running schema and pre-publish checks…</span>
      </div>
    );
  }
  if (data.error) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
        <Banner tone="critical" title="Validation could not run">{String(data.error)}</Banner>
      </div>
    );
  }
  const errors = data.errors ?? [];
  const failCount = errors.length || (data.ok ? 0 : 1);
  const publish = data.publish as { status: 'deployable' | 'needs_runtime'; willDeploy: boolean; reasons: string[]; requiresExtension: string | null } | undefined;
  const rows = [
    { label: 'Schema validation', detail: data.schemaOk ? 'RecipeSpec matches the platform schema' : 'The spec does not match the platform schema', pass: !!data.schemaOk },
    { label: 'Pre-publish checks', detail: data.planTier ? `Publish validator ran against your ${titleCase(String(data.planTier).toLowerCase())} plan` : 'Publish validator ran on this spec', pass: !!data.schemaOk && errors.length === 0 },
    ...(publish
      ? [{
          label: 'Publishability',
          detail: publish.willDeploy
            ? 'This module deploys to your store on publish'
            : (publish.reasons[0] ?? 'This module type needs a runtime shipped before it can publish'),
          pass: publish.willDeploy,
        }]
      : []),
  ];
  const deployBlocked = !!publish && !publish.willDeploy;
  return (
    <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
      {!data.ok
        ? <Banner tone="critical" title={failCount + ' issue' + (failCount === 1 ? '' : 's') + ' found'}>Fix these before publishing — Publish enforces the same checks server-side.</Banner>
        : deployBlocked
          ? <Banner tone="warning" title="Valid — but not publishable yet">{(publish!.reasons[0] ?? 'This module type needs its runtime shipped before it can publish.') + ' Publishing will be blocked until then; saving a draft still works.'}</Banner>
          : <Banner tone="success" title="All checks passed">Schema and pre-publish validation both passed — Publish runs these same checks server-side before going live.</Banner>}
      <div className="card" style={{ marginTop: 16 }}>
        {rows.map((r, i) => (
          <div key={i} className="val-row">
            <span className="val-ico" style={r.pass ? undefined : { background: 'var(--p-critical-bg)', color: 'var(--p-critical)' }}><Icon name={r.pass ? 'check' : 'alert'} size={14} /></span>
            <div className="grow"><div className="t-sm t-strong">{r.label}</div><div className="t-xs t-muted">{r.detail}</div></div>
            <Badge tone={r.pass ? 'success' : 'critical'}>{r.pass ? 'Pass' : 'Fail'}</Badge>
          </div>
        ))}
        {errors.map((e: any, i: number) => (
          <div key={'e' + i} className="val-row">
            <span className="val-ico" style={{ background: 'var(--p-critical-bg)', color: 'var(--p-critical)' }}><Icon name="alert" size={14} /></span>
            <div className="grow"><div className="t-sm t-strong">{e.code}</div><div className="t-xs t-muted">{e.message}</div></div>
            <Badge tone="critical">Fail</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function gmd(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}
