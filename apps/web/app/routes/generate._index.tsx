import { json } from '@remix-run/node';
import { useNavigate, useLocation, useFetcher, useLoaderData } from '@remix-run/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
import { StatusBadge, EmptyState, Progress, titleCase } from '~/components/merchant/polaris';
import { nextStepAfterStream, withGenerationCorrelationId, stepIndexForSeenEvents, isStreamEventKind, type StreamEventKind } from '~/utils/generation-outcome';
import { SchemaForm, type JsonSchemaNode } from '~/components/SchemaForm';


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
  // Sidekick "create" action-link lands here with ?prompt=… (see
  // extensions/superapp-sidekick-create). Surface it so the workspace can seed
  // the generator even without client-side router state. Additive: absent param
  // ⇒ null ⇒ existing state-based seeding is byte-for-byte unchanged.
  const seedPrompt = new URL(request.url).searchParams.get('prompt');
  return json({
    aiLeft: aiLimit === -1 ? null : Math.max(0, aiLimit - aiUsed),
    defaultThemeId: main ? String(main.id) : themes[0] ? String(themes[0].id) : null,
    seedPrompt: seedPrompt && seedPrompt.trim() ? seedPrompt.trim() : null,
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
  // R3.1 — the shared-record manifest when this blueprint is a composite. Opaque
  // to the client (carried verbatim to /api/ai/create-blueprint, re-validated there).
  sharedRecords?: unknown[];
  bindings?: unknown[];
};

// Read by GenCandMini's decorative concept-picker preview only (real editing
// goes through the recipe's actual config/style — see SchemaForm mount below).
const RADIUS_MAP: Record<string, number> = { none: 0, sm: 6, md: 10, lg: 16, full: 999 };
// Each refine is one AI request against the monthly quota (enforced server-side).
const COST_PER_CHANGE = 1;

const GEN_STEPS = [
  { icon: 'magic', label: 'Understanding your request' },
  { icon: 'layers', label: 'Exploring module types — Storefront UI' },
  { icon: 'layers', label: 'Drafting 3 layout concepts' },
  { icon: 'shield', label: 'Validating each against schema' },
  { icon: 'eye', label: 'Rendering live previews' },
];

// Visual concept presets — icon/accent per slot. Real data (name, tagline, tags,
// type, settings) comes from the AI recipe attached to each concept. Icon names
// are Polaris web-component icon types (s-icon).
const CONCEPT_PRESETS = [
  { id: 'sticky', name: 'Concept 1', icon: 'desktop', accent: '#6B40D8' },
  { id: 'floating', name: 'Concept 2', icon: 'cart', accent: '#0E9F6E' },
  { id: 'inline', name: 'Concept 3', icon: 'layer', accent: '#2F80ED' },
];

type Concept = typeof CONCEPT_PRESETS[number] & {
  recipe?: Record<string, unknown>;
  explanation?: string;
  type: string;
  tagline: string;
  tags: string[];
  intro: string;
  /** Deterministic ranker's pick (Phase 2c) — drives the "Recommended" badge. */
  recommended?: boolean;
  /** Async LLM-judge score 0-100 (Phase 5c) — optional, present after polish. */
  judgeScore?: number;
  /** Set when a validated judge polish replaced this concept's recipe (Phase 5c). */
  polished?: boolean;
};

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
 * Decorative-only projection of a concept's REAL recipe onto the small mini
 * preview shown on the concept-picker card (GenCandMini) — read-only, no
 * write-back. Replaces the old BASE_SETTINGS/settingsFromRecipe two-way
 * sync: settings editing now writes straight into the recipe's real
 * config/style via SchemaForm (see GenSettingsPanel), so this is purely "what
 * does the real recipe say, with sane fallbacks for the card thumbnail."
 */
function candMiniProjection(recipe?: Record<string, unknown> | null): {
  label: string; buttonColor: string; buttonText: string; bg: string; radius: string; mode: string; showVariants: boolean; countdown: boolean;
} {
  const config = (recipe?.config as Record<string, unknown>) ?? {};
  const style = (recipe?.style as Record<string, any>) ?? {};
  return {
    label: typeof config.title === 'string' && config.title ? config.title : 'Add to cart',
    buttonColor: typeof style.colors?.buttonBg === 'string' ? style.colors.buttonBg : '#1F3A5F',
    buttonText: typeof style.colors?.buttonText === 'string' ? style.colors.buttonText : '#FFFFFF',
    bg: typeof style.colors?.background === 'string' ? style.colors.background : '#FFFFFF',
    radius: typeof style.shape?.radius === 'string' ? style.shape.radius : 'md',
    mode: typeof style.layout?.mode === 'string' ? style.layout.mode : 'sticky',
    showVariants: true,
    countdown: false,
  };
}

/**
 * Label/help wrapper for the bespoke controls (segmented fields, condition
 * rows) that have no direct Polaris web-component equivalent — mirrors
 * `<s-text-field>`'s own label/details layout so it reads as one family.
 */
function Field({ label, optional, help, children }: { label?: ReactNode; optional?: boolean; help?: ReactNode; children?: ReactNode }) {
  return (
    <s-stack gap="small-100">
      {label && (
        <s-text type="strong">{label}{optional && <s-text color="subdued"> (optional)</s-text>}</s-text>
      )}
      {children}
      {help && <s-text color="subdued">{help}</s-text>}
    </s-stack>
  );
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
  // Prefer client-nav router state; fall back to the loader's ?prompt= param so
  // a Sidekick create action-link (which arrives as a fresh URL navigation, no
  // router state) still seeds the generator.
  const seedPrompt =
    typeof seed?.prompt === 'string' && seed.prompt.trim()
      ? seed.prompt.trim()
      : (loaderData.seedPrompt ?? '');

  const proposeFetcher = useFetcher<{ options?: { index: number; explanation: string; recipe: Record<string, unknown>; qualityBadges?: string[]; score?: number }[]; recommendedIndex?: number; blueprint?: BlueprintResult | null; error?: string; message?: string }>();
  const confirmFetcher = useFetcher<{ moduleId?: string; recipeId?: string; firstModuleId?: string; moduleCount?: number; error?: string }>();
  const refineFetcher = useFetcher<{ ok?: boolean; recipe?: Record<string, unknown>; summary?: string; changedPaths?: string[]; creditsLeft?: number | null; error?: string; message?: string }>();
  const publishFetcher = useFetcher<{ error?: string }>();
  const valFetcher = useFetcher<{ ok?: boolean; schemaOk?: boolean; planTier?: string | null; errors?: { code: string; message: string; field?: string }[]; publish?: { status: 'deployable' | 'needs_runtime'; willDeploy: boolean; reasons: string[]; requiresExtension: string | null }; error?: string }>();
  const [blueprint, setBlueprint] = useState<BlueprintResult | null>(null);

  const [phase, setPhase] = useState<'generating' | 'choosing' | 'ready' | 'failed'>('generating');
  const [genError, setGenError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [candidates, setCandidates] = useState<Concept[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [threadMap, setThreadMap] = useState<Record<string, any[]>>({});
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [tab, setTab] = useState<'preview' | 'validation'>('preview');
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
  // WS-F: the in-flight generation stream's AbortController. Cancel (and
  // unmounting mid-generation, e.g. the merchant navigating away by any
  // route) aborts the real fetch instead of merely navigating away while the
  // request keeps running, keeps billing, and keeps mutating state.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // WS-F: settings editing now writes straight into the selected concept's real
  // recipe.config/style (via SchemaForm) instead of a parallel BASE_SETTINGS
  // projection that got merged in at save time — kills the hard-coded "buy bar"
  // field set that didn't correspond to any real recipe schema.
  const updateSelectedRecipe = useCallback((updater: (r: Record<string, unknown>) => Record<string, unknown>) => {
    if (!selected) return;
    setCandidates((cs) => cs.map((c) => (c.id === selected && c.recipe ? { ...c, recipe: updater(c.recipe) } : c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // Merchant config for the new packs (rule-engine / recommendation / pricing)
  // writes the pack's whole object straight onto recipe.config[<namespace>] — the
  // flat-pin key the compiler already reads. `undefined` deletes the key (back to
  // "no pack", byte-identical).
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
  const applyOptions = useCallback((opts: { explanation: string; recipe: Record<string, unknown> }[], bp?: BlueprintResult | null, recommendedPos?: number) => {
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
        recommended: recommendedPos != null && i === recommendedPos,
      };
    });
    const tm: Record<string, any[]> = {}, hm: Record<string, any[]> = {};
    concs.forEach((c) => {
      tm[c.id] = [
        { role: 'user', text: seedPrompt },
        { role: 'assistant', text: c.intro + '\n\nUse the controls on the right to fine-tune it, or ask me to change anything below.' },
      ];
      hm[c.id] = [{ id: 'h_gen', label: 'Module generated', detail: `Created “${c.name}” from your prompt.`, cost: 1, time: 'Just now' }];
    });
    setCandidates(concs);
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
    // WS-QF / AI-2 review fix: one id per CLICK (not per leg). The batch
    // fallback below resubmits this SAME FormData, so the id travels
    // unchanged to whichever leg the server sees — letting it detect a
    // stream-then-batch retry of one attempt instead of billing it twice.
    withGenerationCorrelationId(fd, crypto.randomUUID());
    const collected: Record<number, { explanation: string; recipe: Record<string, unknown> }> = {};
    let gotAny = false;
    let sawErrorFrame: string | null = null;
    // WS-F: real progress — every distinct SSE event kind seen so far maps to
    // a GEN_STEPS index (stepIndexForSeenEvents), replacing the old fake
    // setInterval tick that advanced independently of the actual stream.
    const seenEvents = new Set<StreamEventKind>();
    setStepIdx(0);
    // WS-F: one AbortController per generation attempt — Cancel (GenLoading's
    // onCancel) and the unmount-cleanup effect both call abortRef.current?.abort().
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/ai/create-module/stream', { method: 'POST', body: fd, headers: { Accept: 'text/event-stream' }, signal: controller.signal });
      if (!res.ok || !res.body) throw new Error('stream unavailable');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          seenEvents.add('done');
          setStepIdx(stepIndexForSeenEvents(seenEvents, GEN_STEPS.length));
          break;
        }
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
              // Narrow the raw `event:` field name via the type guard rather
              // than an unsafe cast — an unrecognized name (e.g. SSE's
              // default 'message') is simply not tracked for progress.
              if (isStreamEventKind(ev)) {
                seenEvents.add(ev);
                setStepIdx(stepIndexForSeenEvents(seenEvents, GEN_STEPS.length));
              }
              if (ev === 'option' && payload.option?.recipe) {
                collected[payload.index] = { explanation: payload.option.explanation ?? '', recipe: payload.option.recipe };
                gotAny = true;
                applyOptions(Object.keys(collected).sort((a, b) => Number(a) - Number(b)).map((k) => collected[Number(k)]!));
              } else if (ev === 'ranking' && typeof payload.recommendedIndex === 'number') {
                // recommendedIndex is a REAL option index — map it to the concept
                // grid position (sorted by option index) so the right card is flagged.
                const keys = Object.keys(collected).map(Number).sort((a, b) => a - b);
                const recPos = keys.indexOf(payload.recommendedIndex);
                applyOptions(keys.map((k) => collected[k]!), undefined, recPos >= 0 ? recPos : undefined);
              } else if (ev === 'blueprint') {
                setBlueprint(payload as BlueprintResult);
              } else if (ev === 'score' && typeof payload.index === 'number' && typeof payload.score === 'number') {
                // Async judge score (Phase 5c) — optional, arrives after `done`.
                // Store it on the matching concept; ignorable when absent.
                const keys = Object.keys(collected).map(Number).sort((a, b) => a - b);
                const pos = keys.indexOf(payload.index);
                if (pos >= 0) setCandidates((cs) => cs.map((c, i) => (i === pos ? { ...c, judgeScore: payload.score } : c)));
              } else if (ev === 'option_updated' && typeof payload.index === 'number' && payload.recipe) {
                // A validated, not-worse judge polish (Phase 5c). Replace the
                // concept's recipe and flag it "Polished".
                collected[payload.index] = { explanation: collected[payload.index]?.explanation ?? '', recipe: payload.recipe };
                const keys = Object.keys(collected).map(Number).sort((a, b) => a - b);
                const pos = keys.indexOf(payload.index);
                if (pos >= 0) {
                  setCandidates((cs) => cs.map((c, i) => (i === pos ? { ...c, recipe: payload.recipe, name: (payload.recipe?.name as string) || c.name, polished: true } : c)));
                }
              } else if (ev === 'error') {
                // Server-terminal failure: the generation RAN and produced nothing.
                // Do NOT throw into the transport catch — that path auto-refires
                // the batch route and bills a second request.
                sawErrorFrame = payload.message || 'Generation failed';
              }
            }
          }
          sep = buf.indexOf('\n\n');
        }
      }
      const next = nextStepAfterStream({ gotAny, sawErrorFrame: sawErrorFrame != null, transportFailed: false });
      if (next === 'show-retry') {
        setGenError(sawErrorFrame ?? 'The AI returned no valid concepts.');
        genStartedRef.current = false;
        setPhase('failed');
      }
      // next === 'proceed' → applyOptions already rendered the chooser.
    } catch (err) {
      // WS-F: distinguish an intentional Cancel from a real transport failure
      // — `controller.abort()` rejects both `fetch` and `reader.read()` with a
      // DOMException named 'AbortError'. An abort must never trigger the
      // batch-fallback (that would bill a second request the merchant just
      // told us to stop).
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      // Transport failure only (SSE unreachable / !res.ok / no body): usually
      // the stream leg billed nothing, but it may have billed just before the
      // drop (WS-QF / AI-2 review finding) — `fd` still carries this attempt's
      // correlationId, so the server-side dedupe (seedBillingStateForCorrelation
      // in llm.server.ts) bills 0 here if the stream leg already charged.
      const next = nextStepAfterStream({ gotAny, sawErrorFrame: false, transportFailed: !aborted, aborted });
      if (next === 'batch-fallback') {
        proposeFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module' });
      }
      // 'cancelled': the merchant asked to stop — no fallback, no toast, no retry UI.
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
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
    // Batch options are contiguous + index-ordered, so the real recommendedIndex
    // is also its grid position.
    const rec = proposeFetcher.data.recommendedIndex;
    applyOptions(opts, proposeFetcher.data.blueprint ?? null, typeof rec === 'number' && rec < opts.length ? rec : undefined);
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
    fd.set('spec', JSON.stringify(cand.recipe));
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
    fd.set('spec', JSON.stringify(cand.recipe));
    refineFetcher.submit(fd, { method: 'post', action: '/generate' });
  };

  const openConcept = (id: string) => { setSelected(id); setTab('preview'); setPhase('ready'); };
  const backToOptions = () => setPhase('choosing');
  const regenerate = () => {
    setCandidates([]); setThreadMap({}); setHistoryMap({}); setSelected(null);
    setBlueprint(null);
    createdRef.current = null;
    finishRef.current = null;
    genStartedRef.current = false;
    setGenError(null);
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
      // R3.1 — carry the composite manifest through so createDraft persists it.
      ...(blueprint.sharedRecords?.length ? { sharedRecords: blueprint.sharedRecords, bindings: blueprint.bindings ?? [] } : {}),
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
    fd.set('spec', JSON.stringify(recipe));
    confirmFetcher.submit(fd, { method: 'post', action: '/api/ai/create-module-from-recipe' });
  };

  if (!seedPrompt) return null;
  if (phase === 'generating') return <GenLoading prompt={seedPrompt} stepIdx={stepIdx} onCancel={() => { abortRef.current?.abort(); navigate('/'); }} />;
  if (phase === 'failed') return <GenFailed prompt={seedPrompt} message={genError} onRetry={regenerate} onCancel={() => navigate('/modules')} />;
  if (phase === 'choosing') return <GenChoose prompt={seedPrompt} candidates={candidates} onSelect={openConcept} onRegenerate={regenerate} onCancel={() => navigate('/')} />;

  const publishing = confirmFetcher.state !== 'idle' || publishFetcher.state !== 'idle';

  return (
    <div className="sa-m-gen-shell">
      <header className="sa-m-gen-head">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <button className="sa-m-gen-back" onClick={backToOptions} title="Back to all concepts">
            <s-icon type="arrow-left" size="small" />All concepts
          </button>
          <s-box padding="small-200" borderRadius="base" background="strong">
            <s-icon type={((activeCand && activeCand.icon) || 'desktop') as never} size="small" />
          </s-box>
          <s-stack gap="none">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-text type="strong">{activeCand ? activeCand.name : 'Module'}</s-text>
              <StatusBadge status="DRAFT" />
            </s-stack>
            <s-text color="subdued">{(activeCand ? activeCand.type : 'Module') + ' · concept ' + (activeIdx + 1) + ' of ' + candidates.length + ' · unsaved'}</s-text>
          </s-stack>
        </s-stack>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-button icon="wand" onClick={regenerate}>Regenerate</s-button>
          <s-button onClick={() => navigate('/')}>Discard</s-button>
          <s-button loading={(confirmFetcher.state !== 'idle' && finishRef.current?.mode === 'draft') || undefined} onClick={() => finish('draft')}>Save draft</s-button>
          <s-button variant="primary" icon="rocket" loading={publishing || undefined} onClick={() => finish('publish')}>Publish</s-button>
        </s-stack>
      </header>
      {blueprint && (
        <div style={{ padding: '12px 16px 0' }}>
          <s-banner tone="info" heading={`This request is a full solution: ${blueprint.name} (${blueprint.moduleCount} modules)`}>
            <s-stack gap="small-200">
              <s-text>{blueprint.summary}</s-text>
              <s-stack direction="inline" gap="small-100">
                {blueprint.modules.map((m) => (
                  <s-badge key={m.role}>{`${m.role} · ${titleCase(String(m.type).replace(/\./g, ' '))}`}</s-badge>
                ))}
              </s-stack>
              <div>
                <s-button variant="primary" icon="layer" loading={publishing || undefined} onClick={finishBlueprint}>
                  {`Create all ${blueprint.moduleCount} modules`}
                </s-button>
              </div>
            </s-stack>
          </s-banner>
        </div>
      )}
      <div className="sa-m-gen-body">
        <GenBuildPanel
          moduleType={String((activeCand?.recipe as any)?.type ?? '')}
          config={((activeCand?.recipe as any)?.config ?? {}) as Record<string, unknown>}
          style={((activeCand?.recipe as any)?.style ?? {}) as Record<string, unknown>}
          setConfigObject={setConfigObject}
          updateSelectedRecipe={updateSelectedRecipe}
          thread={thread} thinking={thinking} refine={refine} setRefine={setRefine} onRefine={doRefine}
          credits={credits} dockOpen={dockOpen} setDockOpen={setDockOpen} histOpen={histOpen} setHistOpen={setHistOpen} history={history}
        />
        <div className="sa-m-gen-center">
          <div className="sa-m-gen-toolbar">
            <s-button-group>
              <s-button variant={device === 'desktop' ? 'primary' : 'tertiary'} icon="desktop" onClick={() => setDevice('desktop')}>Desktop</s-button>
              <s-button variant={device === 'mobile' ? 'primary' : 'tertiary'} icon="mobile" onClick={() => setDevice('mobile')}>Mobile</s-button>
            </s-button-group>
            <div style={{ flex: 1 }} />
            <s-button-group>
              {(['preview', 'validation'] as const).map((x) => (
                <s-button key={x} variant={tab === x ? 'primary' : 'tertiary'} onClick={() => setTab(x)}>{titleCase(x)}</s-button>
              ))}
            </s-button-group>
          </div>
          <div className="sa-m-gen-canvas-wrap">
            {tab === 'preview' && (
              <GenPreview
                recipe={activeCand?.recipe ?? null}
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
    <div className="sa-m-gen-loading">
      <div className="sa-m-gen-loading-card">
        <s-box padding="base">
          <s-spinner size="large" accessibilityLabel="Generating concepts" />
        </s-box>
        <div className="sa-m-gen-eyebrow"><span className="sa-m-gen-pulse-dot" />Generating concepts</div>
        <s-box paddingBlockStart="small-100">
          <s-heading>Designing your module</s-heading>
        </s-box>
        <div className="sa-m-gen-prompt-echo">“{prompt}”</div>
        <div className="sa-m-gen-steps">
          {GEN_STEPS.map((s, i) => {
            const done = i < stepIdx, active = i === stepIdx;
            return (
              <div key={i} className={'sa-m-gen-step' + (done ? ' done' : active ? ' active' : '')}>
                <span className="sa-m-gen-step-ico">{done ? <s-icon type="check" size="small" /> : active ? <s-spinner size="base" accessibilityLabel={s.label} /> : <span className="sa-m-gen-step-dot" />}</span>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
        <s-box inlineSize="100%">
          <Progress value={stepIdx} max={GEN_STEPS.length} />
        </s-box>
        <s-box paddingBlockStart="base">
          <s-button variant="tertiary" onClick={onCancel}>Cancel</s-button>
        </s-box>
      </div>
    </div>
  );
}

function GenFailed({
  prompt,
  message,
  onRetry,
  onCancel,
}: {
  prompt: string;
  message: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sa-m-gen-loading">
      <div className="sa-m-gen-loading-card">
        <div className="sa-m-gen-eyebrow"><span className="sa-m-gen-pulse-dot" />Generation failed</div>
        <s-box paddingBlockStart="small-100">
          <s-heading>No concepts this time</s-heading>
        </s-box>
        <div className="sa-m-gen-prompt-echo">“{prompt}”</div>
        <s-box paddingBlockEnd="base">
          <s-paragraph>
            {(() => {
              const text = message || 'The AI returned no valid concepts.';
              // The server's terminal error frame already appends its own
              // "not billed" sentence (see api.ai.create-module.stream.tsx);
              // only add the client fallback when the message doesn't already
              // say it, to avoid doubling the sentence.
              return /not billed/i.test(text) ? text : `${text} This attempt was not billed.`;
            })()}
          </s-paragraph>
        </s-box>
        <s-stack gap="small-200" alignItems="center">
          <s-button variant="primary" onClick={onRetry}>Try again</s-button>
          <s-button variant="tertiary" onClick={onCancel}>Back to modules</s-button>
        </s-stack>
      </div>
    </div>
  );
}

function GenChoose({ prompt, candidates, onSelect, onRegenerate, onCancel }: any) {
  const n = candidates.length;
  return (
    <div className="sa-m-gen-choose">
      <div className="sa-m-gen-choose-inner">
        <div className="sa-m-gen-choose-head">
          <div className="sa-m-gen-eyebrow"><span className="sa-m-gen-pulse-dot" />{n + ' concept' + (n === 1 ? '' : 's') + ' generated'}</div>
          <h1 className="sa-m-gen-choose-title">Pick a starting point</h1>
          <s-box maxInlineSize="620px">
            <s-text color="subdued">From “{prompt}”. Open any concept to customize it — the rest stay right here until you save. Nothing is stored yet, so you can regenerate anytime.</s-text>
          </s-box>
          <button className="sa-m-gen-choose-close" onClick={onCancel} title="Cancel"><s-icon type="x" /></button>
        </div>
        <div className="sa-m-gen-cand-grid">
          {candidates.map((c: any, i: number) => (
            <GenCandCard key={c.id} c={c} idx={i} total={candidates.length} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
        <s-box paddingBlockStart="base">
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <s-button variant="tertiary" icon="wand" onClick={onRegenerate}>Regenerate</s-button>
            <s-text color="subdued">Nothing is saved — concepts reset when you regenerate or leave.</s-text>
          </s-stack>
        </s-box>
      </div>
    </div>
  );
}

function GenCandCard({ c, idx, total, onSelect }: any) {
  const num = String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  return (
    <button className={'sa-m-gen-cand' + (c.recommended ? ' sa-m-gen-cand-recommended' : '')} style={{ ['--acc' as any]: c.accent }} onClick={onSelect} aria-label={c.recommended ? `${c.name} (recommended)` : c.name}>
      <span className="sa-m-gen-cand-num">{num}</span>
      {c.recommended && (
        <span style={{ position: 'absolute', top: 12, right: 12 }}>
          <s-badge tone="success" icon="wand">Recommended</s-badge>
        </span>
      )}
      <div className="sa-m-gen-cand-head">
        <span className="sa-m-gen-cand-ico"><s-icon type={c.icon as never} /></span>
        <s-stack gap="small-100">
          <s-text type="strong">{c.name}</s-text>
          <s-text color="subdued">{c.type}</s-text>
        </s-stack>
      </div>
      <p className="sa-m-gen-cand-tagline">{c.tagline}</p>
      {c.polished && (
        <span style={{ position: 'absolute', top: 12, left: 12 }} title="Refined by an AI reviewer after generation">
          <s-badge tone="info" icon="wand">Polished</s-badge>
        </span>
      )}
      <GenCandMini s={candMiniProjection(c.recipe)} accent={c.accent} />
      <div className="sa-m-gen-cand-tags">{c.tags.map((t: string) => <span key={t} className="sa-m-gen-cand-tag">{t}</span>)}</div>
      <div className="sa-m-gen-cand-cta">
        <span><s-icon type="wand" size="small" /> Open &amp; customize</span>
        <s-icon type="arrow-right" />
      </div>
    </button>
  );
}

function GenCandMini({ s, accent }: any) {
  const r = Math.min(RADIUS_MAP[s.radius] ?? 10, 14);
  const btn = (
    <span className="sa-m-gen-mini-btn" style={{ background: s.buttonColor, color: s.buttonText, borderRadius: r }}>
      <s-icon type="cart" size="small" />{s.label}
    </span>
  );
  const chips = s.showVariants && (
    <span className="sa-m-gen-mini-chips">{[0, 1, 2].map((i) => <i key={i} className={i === 1 ? 'on' : ''} style={i === 1 ? { borderColor: accent, background: accent } : undefined} />)}</span>
  );
  let bar;
  if (s.mode === 'floating') bar = <span className="sa-m-gen-mini-bar sa-m-gen-mini-bar-floating">{btn}</span>;
  else if (s.mode === 'inline') bar = (
    <span className="sa-m-gen-mini-bar sa-m-gen-mini-bar-inline" style={{ background: s.bg }}>
      {s.countdown && <span className="sa-m-gen-mini-count">12:45</span>}{chips}<span className="sa-m-gen-mini-grow" />{btn}
    </span>
  );
  else bar = <span className="sa-m-gen-mini-bar sa-m-gen-mini-bar-sticky">{chips}<span className="sa-m-gen-mini-grow" />{btn}</span>;
  return (
    <div className="sa-m-gen-mini">
      <div className="sa-m-gen-mini-top"><i /><i /><i /></div>
      <div className="sa-m-gen-mini-pdp">
        <div className="sa-m-gen-mini-img" />
        <div className="sa-m-gen-mini-lines">
          <i className="w3" /><i className="w1" /><i className="w4" style={{ background: accent, opacity: .55 }} /><i className="w2" />
        </div>
      </div>
      {bar}
    </div>
  );
}

function GenBuildPanel(props: any) {
  return (
    <aside className="sa-m-gen-build-panel">
      <GenSettingsPanel
        moduleType={props.moduleType} config={props.config} style={props.style}
        setConfigObject={props.setConfigObject} updateSelectedRecipe={props.updateSelectedRecipe}
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

/**
 * WS-F: single schema-driven settings editor for every module type, replacing
 * the old hard-coded "buy bar" control panel (GenControls) and the ad-hoc
 * JS-type-inferred fallback for other types (GenConfigControls). Fetches the
 * type's real JSON Schema (config properties + the design-vocabulary `style`
 * pack) from /api/generate/config-schema and mounts SchemaForm against it —
 * the schema-registry module itself stays server-only (binding build rule).
 *
 * pricing / recommendation / ruleEngine keep their dedicated, structured pack
 * editors below (tiered/conditional-list UX SchemaForm's generic renderer
 * can't represent) — the fetched schema excludes those three keys server-side
 * so there's exactly one editor per field, never two.
 */
function GenSettingsPanel({ moduleType, config, style, setConfigObject, updateSelectedRecipe }: any) {
  const [schema, setSchema] = useState<JsonSchemaNode | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    if (!moduleType) { setSchema(null); return; }
    let cancelled = false;
    setSchemaLoading(true);
    fetch(`/api/generate/config-schema?type=${encodeURIComponent(moduleType)}`)
      .then((r) => r.json())
      .then((d: { jsonSchema?: JsonSchemaNode | null }) => { if (!cancelled) setSchema(d?.jsonSchema ?? null); })
      .catch(() => { if (!cancelled) setSchema(null); })
      .finally(() => { if (!cancelled) setSchemaLoading(false); });
    return () => { cancelled = true; };
  }, [moduleType]);

  // Which pack editors apply to this type (flat-pin sites in recipe.ts):
  //   pricing → functions.discountRules + functions.cartTransform ·
  //   recommendation → checkout.upsell + checkout.block + postPurchase.offer + theme.section ·
  //   ruleEngine → theme.section + proxy.widget.
  const showPricing = moduleType === 'functions.discountRules' || moduleType === 'functions.cartTransform';
  const showRecs = ['checkout.upsell', 'checkout.block', 'postPurchase.offer', 'theme.section'].includes(moduleType);
  const showRules = moduleType === 'theme.section' || moduleType === 'proxy.widget';

  // `style` is merged into the same form value under a `style` key (matching
  // the fetched schema's shape) so style-token edits round-trip through one
  // onChange, then get split back out into the recipe's real, separate
  // `style` branch — never left nested under `config.style`.
  const formValue: Record<string, unknown> = { ...config, style };
  const onFormChange = (next: Record<string, unknown>) => {
    const { style: nextStyle, ...restConfig } = next as { style?: Record<string, unknown> } & Record<string, unknown>;
    updateSelectedRecipe((r: Record<string, unknown>) => ({
      ...r,
      config: restConfig,
      ...(nextStyle !== undefined ? { style: nextStyle } : {}),
    }));
  };

  const hasFields = !!schema?.properties && Object.keys(schema.properties).length > 0;

  return (
    <s-stack gap="none">
      <s-box padding="base" paddingBlockEnd="small-100">
        <s-stack direction="inline" justifyContent="space-between" alignItems="baseline">
          <s-text type="strong">Settings</s-text>
          <s-text color="subdued">{titleCase(String(moduleType || 'module').replace(/\./g, ' '))}</s-text>
        </s-stack>
      </s-box>
      <div className="sa-m-gen-ctrl-body">
        <s-stack gap="base">
          {schemaLoading && <s-spinner size="base" accessibilityLabel="Loading settings" />}
          {!schemaLoading && hasFields && schema && (
            <SchemaForm schema={schema} value={formValue} onChange={onFormChange} tier="advanced" />
          )}
          {!schemaLoading && !hasFields && !showPricing && !showRecs && !showRules && (
            <s-banner tone="info">No editable settings on this module yet — describe changes in the Builder chat below.</s-banner>
          )}
          {showPricing && (
            <>
              <s-divider />
              <PricingControls value={config?.pricing} onChange={(v: unknown) => setConfigObject('pricing', v)} />
            </>
          )}
          {showRecs && (
            <>
              <s-divider />
              <RecommendationControls value={config?.recommendation} onChange={(v: unknown) => setConfigObject('recommendation', v)} />
            </>
          )}
          {showRules && (
            <>
              <s-divider />
              <RuleEngineControls value={config?.ruleEngine} onChange={(v: unknown) => setConfigObject('ruleEngine', v)} />
            </>
          )}
        </s-stack>
      </div>
    </s-stack>
  );
}

function GenBuilderDock({ credits, costPerChange, open, setOpen, thread, thinking, refine, setRefine, onRefine, changes, onOpenHistory }: any) {
  const last = thread.slice().reverse().find((m: any) => m.role === 'assistant');
  const unlimited = credits === null;
  const low = !unlimited && credits <= 40, out = !unlimited && credits <= 0;
  const suggestions = ['Use brand green', 'Make it a pill', 'Add a countdown'];
  return (
    <div className="sa-m-gen-dock">
      <button className="sa-m-gen-dock-head" onClick={() => setOpen(!open)}>
        <span className="sa-m-gen-dock-ava"><s-icon type="wand" size="small" /></span>
        <div className="sa-m-gen-dock-id">
          <s-text type="strong">Builder</s-text>
          <s-text color="subdued">{open ? 'Describe a change — applied to the spec' : 'Tap to refine with AI'}</s-text>
        </div>
        <span className={'sa-m-gen-credit-pill' + (low ? ' low' : '')} title={unlimited ? 'Unlimited AI requests on your plan' : credits.toLocaleString() + ' AI requests remaining this month'}>
          <s-icon type="bolt" size="small" />{unlimited ? 'Unlimited' : credits.toLocaleString() + ' left'}
        </span>
        <s-icon type={open ? 'chevron-down' : 'chevron-up'} size="small" />
      </button>
      {open && (
        <div className="sa-m-gen-dock-body">
          <div className={'sa-m-gen-dock-last' + (last ? '' : ' empty')}>
            {last ? (
              <>
                <span className="sa-m-gen-last-ico"><s-icon type="check" size="small" /></span>
                <div>
                  <div className="sa-m-gen-last-cap">Latest change</div>
                  <div className="sa-m-gen-last-text" dangerouslySetInnerHTML={{ __html: gmd(last.text) }} />
                </div>
              </>
            ) : <s-text color="subdued">No changes yet — ask for an edit below and you’ll see what happened here.</s-text>}
          </div>
          {thinking && (
            <div className="sa-m-gen-dock-thinking">
              <div className="sa-m-gen-typing"><span /><span /><span /></div>
              <s-text color="subdued">Applying your change…</s-text>
            </div>
          )}
          <div className="sa-m-gen-dock-input">
            <textarea className="sa-m-gen-refine-input" rows={1} placeholder={out ? 'Out of AI requests — upgrade to keep building' : 'Refine with AI…'}
              value={refine} disabled={out} onChange={(e) => setRefine(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRefine(); } }} />
            <s-button variant="primary" icon="send" accessibilityLabel="Send refinement" onClick={() => onRefine()} disabled={(out || thinking || !refine.trim()) || undefined} />
          </div>
          {!out && (
            <div className="sa-m-gen-dock-sugg">
              {suggestions.map((sg) => <button key={sg} className="sa-m-gen-chip" onClick={() => onRefine(sg)}><s-icon type="wand" size="small" />{sg}</button>)}
            </div>
          )}
          <div className="sa-m-gen-dock-foot">
            <span className="sa-m-gen-cost-note"><s-icon type="bolt" size="small" />Each change costs <b>{costPerChange === 1 ? '1 AI request' : costPerChange + ' AI requests'}</b></span>
            <s-button variant="tertiary" icon="clock" onClick={onOpenHistory}>
              History{changes ? <span className="sa-m-gen-hist-count">{changes}</span> : null}
            </s-button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenHistory({ history, credits, onClose }: any) {
  const spent = history.reduce((a: number, h: any) => a + h.cost, 0);
  return (
    <div className="sa-m-gen-hist">
      <div className="sa-m-gen-hist-head">
        <s-stack gap="none">
          <s-text type="strong">Change history</s-text>
          <s-text color="subdued">{history.length + ' change' + (history.length === 1 ? '' : 's') + ' · ' + spent + ' AI request' + (spent === 1 ? '' : 's') + ' spent'}</s-text>
        </s-stack>
        <s-button variant="tertiary" icon="x" accessibilityLabel="Close" onClick={onClose} />
      </div>
      <div className="sa-m-gen-hist-list">
        {history.slice().reverse().map((h: any) => (
          <div key={h.id} className="sa-m-gen-hist-row">
            <span className="sa-m-gen-hist-dot" />
            <div className="sa-m-gen-hist-main">
              <div className="sa-m-gen-hist-label">{h.label}</div>
              <div className="sa-m-gen-hist-detail">{h.detail}</div>
              <div className="sa-m-gen-hist-time">{h.time}</div>
            </div>
            <span className="sa-m-gen-hist-cost">{'−' + h.cost}</span>
          </div>
        ))}
      </div>
      <div className="sa-m-gen-hist-foot">
        <s-icon type="bolt" size="small" />
        <span><b>{credits === null ? 'Unlimited' : credits.toLocaleString()}</b> AI requests remaining</span>
        <a className="sa-m-gen-hist-topup" href="/billing">Upgrade</a>
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
    <div className={'sa-m-gen-canvas' + (device === 'mobile' ? ' mobile' : '')}>
      {isSimulated && (
        <div className="sa-m-gen-pv-sim" role="group" aria-label="Simulation context">
          <s-text color="subdued">Simulate</s-text>
          <select aria-label="Currency" value={sim.currency} onChange={(e) => setSim((v) => ({ ...v, currency: e.target.value }))}>
            {['USD', 'CAD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Country" value={sim.countryCode} onChange={(e) => setSim((v) => ({ ...v, countryCode: e.target.value }))}>
            {['US', 'CA', 'GB', 'DE'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="sa-m-gen-pv-sim-plus"><input type="checkbox" checked={sim.isPlus} onChange={(e) => setSim((v) => ({ ...v, isPlus: e.target.checked }))} />Plus</label>
        </div>
      )}
      <div className="sa-m-gen-pv-frame">
        <div className="sa-m-gen-pv-browser"><span className="sa-m-gen-pv-dot" /><span className="sa-m-gen-pv-dot" /><span className="sa-m-gen-pv-dot" /><div className="sa-m-gen-pv-url">Live preview · {type || 'module'}</div></div>
        <div className="sa-m-gen-pv-live">
          {state.status === 'idle' && (
            <div className="sa-m-gen-pv-msg"><s-icon type="layer" /><s-text color="subdued">Pick a concept to preview it here.</s-text></div>
          )}
          {state.status === 'loading' && (
            <div className="sa-m-gen-pv-msg"><s-spinner size="base" accessibilityLabel="Rendering preview" /><s-text color="subdued">Rendering preview…</s-text></div>
          )}
          {state.status === 'error' && (
            <div className="sa-m-gen-pv-msg"><s-icon type="alert-triangle" /><s-text color="subdued">{state.error}</s-text></div>
          )}
          {state.status === 'html' && (
            <iframe
              title="Module preview"
              className="sa-m-gen-pv-iframe"
              srcDoc={state.html}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}
          {state.status === 'json' && (
            <pre className="sa-m-gen-pv-json">{JSON.stringify(state.json, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

function SegField({ value, options, onChange }: any) {
  return (
    <s-button-group>
      {options.map((o: any) => (
        <s-button key={o[0]} variant={value === o[0] ? 'primary' : 'tertiary'} onClick={() => onChange(o[0])}>{o[1]}</s-button>
      ))}
    </s-button-group>
  );
}
function ToggleRow({ label, checked, onChange }: any) {
  return (
    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
      <s-text>{label}</s-text>
      <s-switch accessibilityLabel={String(label)} checked={checked || undefined} onChange={onChange} />
    </s-stack>
  );
}

/** Human label for an enum token — titleCase but hyphen-aware (fixed-amount → Fixed Amount). */
function labelize(s: string): string {
  return titleCase(String(s).replace(/-/g, ' '));
}

/** Section header for a pack editor with an on/off switch. */
function PackHeader({ title, hint, enabled, onToggle }: any) {
  return (
    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
      <s-stack gap="none">
        <s-text type="strong">{title}</s-text>
        {hint && <s-text color="subdued">{hint}</s-text>}
      </s-stack>
      <s-switch accessibilityLabel={String(title)} checked={enabled || undefined} onChange={onToggle} />
    </s-stack>
  );
}

/** Comma-separated string[] editor backed by a single text input. */
function TagListField({ label, help, value, onChange, placeholder }: any) {
  const arr: string[] = Array.isArray(value) ? value : [];
  return (
    <s-text-field label={label} details={help} value={arr.join(', ')} placeholder={placeholder}
      onInput={(e) => onChange(String(e.currentTarget.value ?? '').split(',').map((x) => x.trim()).filter(Boolean))} />
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
    <s-stack gap="base">
      <PackHeader
        title="Product recommendations"
        hint="How this widget chooses which products to offer."
        enabled={enabled}
        onToggle={() => onChange(enabled ? undefined : { strategy: 'related', productLimit: 4, fallback: 'related' })}
      />
      {enabled && (
        <>
          <s-select label="Strategy" value={strategy} onChange={(e) => patch({ strategy: e.currentTarget.value })}>
            {RECOMMENDATION_STRATEGIES.map((sname) => <s-option key={sname} value={sname}>{labelize(sname)}</s-option>)}
          </s-select>
          {strategy === 'manual' && (
            <TagListField label="Manual variant GIDs" help="gid://shopify/ProductVariant/… — comma-separated."
              value={v.manualVariantGids} placeholder="gid://shopify/ProductVariant/123"
              onChange={(arr: string[]) => patch({ manualVariantGids: arr })} />
          )}
          {strategy === 'collection' && (
            <>
              <s-text-field label="Collection GID" details="gid://shopify/Collection/…" value={v.collectionGid ?? ''} placeholder="gid://shopify/Collection/456"
                onInput={(e) => patch({ collectionGid: e.currentTarget.value || undefined })} />
              <ToggleRow label="Pick one at random" checked={!!v.collectionRandom} onChange={() => patch({ collectionRandom: !v.collectionRandom })} />
            </>
          )}
          {['related', 'complementary', 'buy-it-again'].includes(strategy) && (
            <s-text-field label="Seed product GID (optional)" details="Defaults to the current PDP product." value={v.seedProductGid ?? ''} placeholder="gid://shopify/Product/789"
              onInput={(e) => patch({ seedProductGid: e.currentTarget.value || undefined })} />
          )}
          <s-number-field label="Products to show" details={`${RECOMMENDATION_LIMITS.productLimitMin}–${RECOMMENDATION_LIMITS.productLimitMax}.`}
            min={RECOMMENDATION_LIMITS.productLimitMin} max={RECOMMENDATION_LIMITS.productLimitMax}
            value={String(v.productLimit ?? 4)}
            onInput={(e) => patch({ productLimit: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} />
          {isDynamic && (
            <s-select label="Fallback" details="Shown when a dynamic strategy has no result (empty history / service down)."
              value={v.fallback ?? 'related'} onChange={(e) => patch({ fallback: e.currentTarget.value })}>
              {RECOMMENDATION_FALLBACKS.map((f) => <s-option key={f} value={f}>{labelize(f)}</s-option>)}
            </s-select>
          )}
        </>
      )}
    </s-stack>
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
    <s-stack gap="base">
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
            <s-button variant="tertiary" icon="plus" onClick={addGroup}>Add rule group</s-button>
          )}
        </>
      )}
    </s-stack>
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
    <s-box border="base" borderRadius="base" padding="small-200">
      <s-stack gap="small-200">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text type="strong">{showOuter ? `Group ${index + 1}` : 'Conditions'}</s-text>
          {showOuter && (
            <s-button variant="tertiary" tone="critical" icon="delete" accessibilityLabel="Remove group" onClick={onRemove} />
          )}
        </s-stack>
        <s-stack gap="small-200">
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
            <s-button variant="tertiary" icon="plus" onClick={addRow}>Add condition</s-button>
          )}
        </s-stack>
      </s-stack>
    </s-box>
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
    <s-stack gap="small-100">
      {showLogic && (
        <s-button-group>
          {[['AND', 'AND'], ['OR', 'OR']].map((o) => (
            <s-button key={o[0]} variant={groupLogic === o[0] ? 'primary' : 'tertiary'} onClick={() => onLogic(o[0])}>{o[1]}</s-button>
          ))}
        </s-button-group>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6 }}>
        <div style={{ flex: '1 1 110px' }}>
          <s-select label="Object" labelAccessibilityVisibility="exclusive" value={object} onChange={(e) => setObject(e.currentTarget.value)}>
            {RULE_OBJECTS.map((o) => <s-option key={o} value={o}>{titleCase(o)}</s-option>)}
          </s-select>
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <s-select label="Attribute" labelAccessibilityVisibility="exclusive" value={attribute} onChange={(e) => onChange({ ...row, object, attribute: e.currentTarget.value })}>
            {attrs.map((a) => <s-option key={a} value={a}>{titleCase(a)}</s-option>)}
          </s-select>
        </div>
        <div style={{ flex: '1 1 130px' }}>
          <s-select label="Operator" labelAccessibilityVisibility="exclusive" value={operator} onChange={(e) => onChange({ ...row, operator: e.currentTarget.value })}>
            {CONDITION_OPERATORS.map((op) => <s-option key={op} value={op}>{labelize(op)}</s-option>)}
          </s-select>
        </div>
        {!valueless && (
          <div style={{ flex: '2 1 150px' }}>
            {valueType === 'boolean' ? (
              <s-select label="Value" labelAccessibilityVisibility="exclusive" value={String(row?.value ?? 'true')} onChange={(e) => onChange({ ...row, value: e.currentTarget.value === 'true' })}>
                <s-option value="true">True</s-option>
                <s-option value="false">False</s-option>
              </s-select>
            ) : valueType === 'stringList' ? (
              <s-text-field label="Value" labelAccessibilityVisibility="exclusive" value={Array.isArray(row?.value) ? row.value.join(', ') : (row?.value ?? '')} placeholder="a, b, c"
                onInput={(e) => onChange({ ...row, value: String(e.currentTarget.value ?? '').split(',').map((x) => x.trim()).filter(Boolean) })} />
            ) : valueType === 'number' ? (
              <s-number-field label="Value" labelAccessibilityVisibility="exclusive" value={String(row?.value ?? '')}
                onInput={(e) => onChange({ ...row, value: e.currentTarget.value === '' ? '' : Number(e.currentTarget.value) })} />
            ) : (
              <s-text-field label="Value" labelAccessibilityVisibility="exclusive" value={row?.value ?? ''}
                onInput={(e) => onChange({ ...row, value: e.currentTarget.value ?? '' })} />
            )}
          </div>
        )}
        {onRemove && (
          <s-button variant="tertiary" tone="critical" icon="x" accessibilityLabel="Remove condition" onClick={onRemove} />
        )}
      </div>
    </s-stack>
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
    <s-stack gap="base">
      <PackHeader
        title="Pricing & discounts"
        hint="Discount vocabulary; lowered into the Function on publish."
        enabled={enabled}
        onToggle={() => onChange(enabled ? undefined : { model: 'single', discount: { kind: 'percentage', value: 10 } })}
      />
      {enabled && (
        <>
          <s-select label="Model" value={model} onChange={(e) => setModel(e.currentTarget.value)}>
            {PRICING_MODELS.map((m) => <s-option key={m} value={m}>{labelize(m)}</s-option>)}
          </s-select>
          <s-select label="Mechanism" details="How the discount is enforced at checkout."
            value={v.mechanism ?? 'shopify-function-discount'} onChange={(e) => emit({ mechanism: e.currentTarget.value })}>
            {PRICING_MECHANISMS.map((m) => <s-option key={m} value={m}>{labelize(m)}</s-option>)}
          </s-select>
          {model === 'single' && (
            <DiscountFields discount={v.discount ?? { kind: 'percentage', value: 10 }} onChange={(d: unknown) => emit({ discount: d })} />
          )}
          {model === 'tiered' && (
            <PricingTiers tiers={v.tiers ?? { basis: 'quantity', rows: [] }} onChange={(t: unknown) => emit({ tiers: t })} />
          )}
          {(model === 'bogo' || model === 'gift') && (
            <s-banner tone="info">{labelize(model)} needs product/collection targeting — describe it in the Builder chat below; the live preview reflects the real module.</s-banner>
          )}
        </>
      )}
    </s-stack>
  );
}

const KIND_NEEDS_VALUE = new Set(['percentage', 'fixed-amount', 'fixed-price']);
function DiscountFields({ discount, onChange }: any) {
  const d = discount ?? {};
  const kind = d.kind ?? 'percentage';
  const needsValue = KIND_NEEDS_VALUE.has(kind);
  return (
    <s-stack gap="small-200">
      <s-select label="Discount kind" value={kind} onChange={(e) => onChange({ ...d, kind: e.currentTarget.value })}>
        {DISCOUNT_KINDS.map((k) => <s-option key={k} value={k}>{labelize(k)}</s-option>)}
      </s-select>
      {needsValue && (
        <s-number-field label={kind === 'percentage' ? 'Percent off (0–100)' : kind === 'fixed-price' ? 'Final price' : 'Amount off'}
          min={0} max={kind === 'percentage' ? 100 : undefined} value={String(d.value ?? 0)}
          onInput={(e) => onChange({ ...d, value: e.currentTarget.value === '' ? 0 : Number(e.currentTarget.value) })} />
      )}
      {kind === 'cheapest-free' && (
        <s-number-field label="How many cheapest become free" min={1} value={String(d.cheapestFreeCount ?? 1)}
          onInput={(e) => onChange({ ...d, cheapestFreeCount: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value) })} />
      )}
    </s-stack>
  );
}

function PricingTiers({ tiers, onChange }: any) {
  const t = tiers ?? { basis: 'quantity', rows: [] };
  const rows: any[] = Array.isArray(t.rows) ? t.rows : [];
  const setRows = (next: any[]) => onChange({ ...t, rows: next });
  const addRow = () => setRows([...rows, { threshold: rows.length + 2, discount: { kind: 'percentage', value: 10 } }]);
  return (
    <s-stack gap="small-200">
      <Field label="Tier threshold basis">
        <SegField value={t.basis ?? 'quantity'} options={THRESHOLD_BASIS.map((b) => [b, labelize(b)])} onChange={(b: string) => onChange({ ...t, basis: b })} />
      </Field>
      {rows.map((r, ri) => (
        <s-box key={ri} border="base" borderRadius="base" padding="small-200">
          <s-stack gap="small-200">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-text type="strong">Tier {ri + 1}</s-text>
              {rows.length > 1 && (
                <s-button variant="tertiary" tone="critical" icon="delete" accessibilityLabel={`Remove tier ${ri + 1}`}
                  onClick={() => setRows(rows.filter((_, i) => i !== ri))} />
              )}
            </s-stack>
            <s-stack gap="small-200">
              <s-number-field label={`Threshold (${t.basis === 'cart-value' ? 'cart value' : 'quantity'})`} min={1} value={String(r.threshold ?? 1)}
                onInput={(e) => setRows(rows.map((x, i) => (i === ri ? { ...x, threshold: Number(e.currentTarget.value) } : x)))} />
              <DiscountFields discount={r.discount} onChange={(dd: unknown) => setRows(rows.map((x, i) => (i === ri ? { ...x, discount: dd } : x)))} />
            </s-stack>
          </s-stack>
        </s-box>
      ))}
      <s-button variant="tertiary" icon="plus" onClick={addRow}>Add tier</s-button>
    </s-stack>
  );
}

// Real validation results from this route's `validate` action: RecipeSpecSchema
// plus the same pre-publish validator Publish runs server-side. No fixed rows.
function GenValidation({ loading, data, hasRecipe }: any) {
  if (!hasRecipe) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
        <EmptyState icon="shield-check-mark" heading="Nothing to validate">This concept has no generated spec — regenerate and pick a concept first.</EmptyState>
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        <s-spinner size="base" accessibilityLabel="Running checks" />
        <s-text color="subdued">Running schema and pre-publish checks…</s-text>
      </div>
    );
  }
  if (data.error) {
    return (
      <div style={{ padding: 20, maxWidth: 640, width: '100%', margin: '0 auto' }}>
        <s-banner tone="critical" heading="Validation could not run">{String(data.error)}</s-banner>
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
        ? <s-banner tone="critical" heading={failCount + ' issue' + (failCount === 1 ? '' : 's') + ' found'}>Fix these before publishing — Publish enforces the same checks server-side.</s-banner>
        : deployBlocked
          ? <s-banner tone="warning" heading="Valid — but not publishable yet">{(publish!.reasons[0] ?? 'This module type needs its runtime shipped before it can publish.') + ' Publishing will be blocked until then; saving a draft still works.'}</s-banner>
          : <s-banner tone="success" heading="All checks passed">Schema and pre-publish validation both passed — Publish runs these same checks server-side before going live.</s-banner>}
      <s-box border="base" borderRadius="base" paddingBlockStart="small-100" paddingBlockEnd="small-100">
        <s-stack gap="none">
          {rows.map((r, i) => (
            <s-box key={i} padding="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-icon type={r.pass ? 'check' : 'alert-triangle'} size="small" tone={r.pass ? 'success' : 'critical'} />
                <div style={{ flex: 1 }}>
                  <s-text type="strong">{r.label}</s-text>
                  <s-text color="subdued">{r.detail}</s-text>
                </div>
                <s-badge tone={r.pass ? 'success' : 'critical'}>{r.pass ? 'Pass' : 'Fail'}</s-badge>
              </s-stack>
            </s-box>
          ))}
          {errors.map((e: any, i: number) => (
            <s-box key={'e' + i} padding="small-200">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-icon type="alert-triangle" size="small" tone="critical" />
                <div style={{ flex: 1 }}>
                  <s-text type="strong">{e.code}</s-text>
                  <s-text color="subdued">{e.message}</s-text>
                </div>
                <s-badge tone="critical">Fail</s-badge>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-box>
    </div>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';

function gmd(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
}
