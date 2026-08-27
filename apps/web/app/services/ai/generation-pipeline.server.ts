import type { RecipeSpec } from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';
import {
  generateValidatedRecipeOptionsStream,
  generateValidatedBlueprint,
  type RecipeOption,
} from '~/services/ai/llm.server';
import { rankOptions } from '~/services/ai/option-ranking.server';
import { classifyUserIntent, CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt } from '~/services/ai/token-budget.server';
import { buildPromptRouterDecision } from '~/services/ai/prompt-router.server';
import { extractRequirementSpec } from '~/services/ai/requirement-spec.server';
import { searchSolutions } from '~/services/ai/solution-search.server';
import { ensureStoreAesthetic } from '~/services/theme/ensure-aesthetic.server';
import { applyStorePalette } from '~/services/theme/apply-store-palette.server';
import { applyStylePackTokens } from '~/services/ai/apply-style-pack.server';
import { applyCompositionRules } from '~/services/ai/apply-composition.server';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';
import { planBlueprint } from '~/services/ai/blueprint-planner';
import { isBlueprintsEnabled } from '~/env.server';
import { QaTelemetryService } from '~/services/observability/qa-telemetry.service';

export type GenerationPipelineInput = {
  shopId: string;
  shopDomain: string;
  /** Raw merchant prompt (constraints are assembled inside, matching the route today). */
  prompt: string;
  preferredType: string; // 'Auto' | ModuleType
  preferredCategory: string;
  preferredBlockType: string;
  matchStoreColors: boolean;
  optionCount?: number; // default 3
  correlationId?: string;
  planTier: string; // resolved by the caller (route: CapabilityService; worker: Shop row)
  admin: AdminApiContext['admin'];
  /** epoch ms — threaded into hints (Task 10) */
  deadlineAt?: number;
  /**
   * Task 15: ops-promoted QA issue ids to escalate warn->fail this run. Tests
   * (and any future caller that already has the list) can inject it directly;
   * production callers leave it undefined and the pipeline loads it once via
   * `QaTelemetryService` below.
   */
  promotedBlockingIssueIds?: string[];
};

export type GenerationIntentFrame = {
  intent: string;
  surface: string;
  confidence: number;
  confidenceBand: 'direct' | 'with_alternatives' | 'fallback';
  alternatives: unknown[];
  reasons: unknown[];
  routing: unknown;
  moduleType: string;
  routerDecision: unknown;
  /**
   * WS-C commit-0 fold-in (b): the RAG exemplar match, if any, surfaced here so
   * callers can persist it durably (see `JobService.updatePayload`). Before Task
   * 4's refactor, `jobs.create` ran AFTER classify/RAG and could stamp
   * `classifiedType`/`intent`/`exemplarTier`/`exemplarTemplateId` straight onto
   * `Job.payload` at creation time. Task 4 moved `jobs.create` BEFORE this
   * pipeline runs (both the stream route and, from Task 5, the worker
   * processor create the Job first so they have an id to enqueue/report
   * against), so that metadata is no longer known at create time — callers
   * that need it durable must merge it in from this hook instead.
   */
  exemplarTier?: 1 | 2 | null;
  exemplarTemplateId?: string | null;
};

export type GenerationBlueprintFrame = {
  name: string;
  summary: string;
  moduleCount: number;
  modules: Array<{ role: string; type: string; explanation: string; recipe: RecipeSpec }>;
  links: unknown[];
  sharedRecords?: unknown[];
  bindings?: unknown[];
};

export type GenerationPipelineHooks = {
  onStage?(stage: 'classifying' | 'generating' | 'ranking' | 'finalizing'): void | Promise<void>;
  onIntent?(frame: GenerationIntentFrame): void | Promise<void>;
  /** forwards the stream's `started` events (SSE route re-emits them) */
  onStarted?(o: { index: number; approach: string; total: number }): void | Promise<void>;
  onOption?(o: { index: number; approach: string; option: RecipeOption; durationMs: number }): void | Promise<void>;
  onOptionFailed?(o: { index: number; approach: string; error: string; durationMs: number }): void | Promise<void>;
  onRanking?(r: { recommendedIndex: number; scores: { index: number; score: number; badges: string[] }[] }): void | Promise<void>;
  onBlueprint?(b: GenerationBlueprintFrame): void | Promise<void>;
  /** route wires its `aborted` flag; worker returns false */
  isAborted?(): boolean;
};

export type GenerationPipelineResult = {
  validCount: number;
  moduleType: string;
  /** final (post-mutation) options by real index */
  collected: Map<number, RecipeOption>;
};

/**
 * Extracted from `api.ai.create-module.stream.tsx` (WS-C Task 4) so both the
 * legacy inline SSE route and the async worker processor (Task 5) drive the
 * SAME classify -> intent -> router -> RAG -> aesthetics -> option-stream ->
 * composition/palette -> ranking -> blueprint orchestration. Auth, rate-limit,
 * quota, Job bookkeeping, judge-polish and SSE mechanics stay in the caller.
 *
 * THROW SURFACE (WS-C commit-0 fold-in, c) — read before adding a step here.
 * Before Task 4, everything this function now does ran INLINE in the stream
 * route's `action()`, before the `Response`/`ReadableStream` existed. A throw
 * there became a real HTTP error (`!res.ok`) reaching the client's `fetch`
 * BEFORE any billing could occur, which is exactly what the client's
 * transport-failure catch in `generate._index.tsx` (`streamGenerate`) expects
 * before it safely resubmits via the batch route (`nextStepAfterStream` ->
 * 'batch-fallback') — a legitimate, no-double-bill retry path.
 *
 * This function now runs POST-Response for both of its callers:
 *   - the stream route calls it from inside the `ReadableStream`'s `start()`,
 *     after the 200 + SSE headers have already gone out — a throw here is
 *     caught by that route's own try/catch and turned into a terminal SSE
 *     `error` frame (see the route's "Do NOT throw into the transport catch"
 *     comment), which is DIFFERENT client handling (`sawErrorFrame` ->
 *     'show-retry', not the batch-fallback path) — never a `!res.ok`.
 *   - the worker processor (Task 5) runs this with no HTTP response at all;
 *     a throw there fails the BullMQ job (billing-safe via the correlationId
 *     dedupe seam, but there is no "resubmit as a different request shape"
 *     fallback the way the old pre-Response 500 gave the client).
 *
 * Net effect: the pre-Task-4 safety net of "let it fail loud before the
 * client has committed to this attempt" no longer exists for code added
 * here. Any new step in this pipeline must therefore either (a) swallow and
 * degrade — best-effort, exactly like the composition/palette/blueprint
 * blocks below already do (`try { ... } catch { /* best-effort *\/ }`) — or
 * (b) be a DELIBERATE terminal failure the caller is meant to surface as an
 * SSE `error` frame / a failed+retried job, not an accidental one introduced
 * by a minor additive feature.
 */
export async function runGenerationPipeline(
  input: GenerationPipelineInput,
  hooks: GenerationPipelineHooks,
): Promise<GenerationPipelineResult> {
  const { admin, shopId, shopDomain, planTier } = input;

  // Task 15: load ops-promoted QA issue ids once per run. Best-effort per this
  // function's throw-surface discipline (see the doc comment above) — a
  // telemetry read failing must never block generation, so it degrades to []
  // (no escalation this run) rather than throwing.
  let promotedBlockingIssueIds = input.promotedBlockingIssueIds;
  if (promotedBlockingIssueIds === undefined) {
    try {
      promotedBlockingIssueIds = await new QaTelemetryService().getPromotedBlockingIssueIds();
    } catch {
      promotedBlockingIssueIds = [];
    }
  }

  const constraints: string[] = [];
  if (input.preferredType && input.preferredType !== 'Auto') {
    constraints.push(`Module type must be exactly: ${input.preferredType}.`);
  }
  if (input.preferredCategory && input.preferredCategory !== 'Auto') {
    constraints.push(`Category must be: ${input.preferredCategory}.`);
  }
  if (input.preferredBlockType && input.preferredBlockType !== 'Auto') {
    constraints.push(`For customer account blocks, target must be: ${input.preferredBlockType}.`);
  }
  if (planTier && planTier !== 'UNKNOWN') {
    constraints.push(
      `Merchant plan tier: ${planTier}. Only suggest module types the merchant can publish on this plan.`,
    );
  }
  const finalPrompt = constraints.length > 0
    ? `Constraints: ${constraints.join(' ')}\n\nUser request: ${input.prompt}`
    : input.prompt;

  await hooks.onStage?.('classifying');
  let classification = await classifyUserIntent(finalPrompt, input.preferredType);
  classification = await augmentWithCheapClassifier(classification, finalPrompt, shopId);
  const intentPacket = buildIntentPacket(finalPrompt, classification, {
    storeContext: { shop_domain: shopDomain, theme_os2: true },
  });
  const routerDecision = await buildPromptRouterDecision({
    prompt: finalPrompt,
    classification,
    intentPacket,
    shopDomain,
    operationClass: 'P0_CREATE',
  });

  const confidence = intentPacket.classification.confidence;
  const band =
    confidence >= CONFIDENCE_THRESHOLDS.DIRECT
      ? 'direct'
      : confidence >= CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES
        ? 'with_alternatives'
        : 'fallback';

  // Parity with the batch route: RAG grounding + live store-palette matching so
  // generated storefront options look the same across all entry points.
  const requirementSpec = await extractRequirementSpec({ userRequest: finalPrompt, classification, intentPacket });
  const { grounding, exemplar } = searchSolutions(requirementSpec);
  const isStorefrontType =
    classification.moduleType === 'theme.section' || classification.moduleType === 'proxy.widget';
  const matchStoreColors = input.matchStoreColors;
  if (isStorefrontType && matchStoreColors) {
    await ensureStoreAesthetic({ admin, shopId });
  }
  const aesthetic = isStorefrontType && matchStoreColors ? await loadStoreAesthetic(shopId) : null;

  await hooks.onIntent?.({
    intent: intentPacket.classification.intent,
    surface: intentPacket.classification.surface,
    confidence,
    confidenceBand: band,
    alternatives: intentPacket.classification.alternatives ?? [],
    reasons: intentPacket.classification.reasons ?? [],
    routing: intentPacket.routing,
    moduleType: classification.moduleType,
    routerDecision,
    exemplarTier: exemplar?.tier ?? null,
    exemplarTemplateId: exemplar?.templateId ?? null,
  });

  let validCount = 0;
  // Collect the FINAL (post-mutation) options so a deterministic `ranking` can
  // be emitted once all options have arrived. Keyed by real option index —
  // failed options simply never enter the map.
  const collected = new Map<number, RecipeOption>();

  if (hooks.isAborted?.()) {
    return { validCount: 0, moduleType: classification.moduleType, collected };
  }

  await hooks.onStage?.('generating');
  for await (const event of generateValidatedRecipeOptionsStream(finalPrompt, classification, {
    shopId,
    intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
    confidenceScore: confidence,
    promptProfile: intentPacket.routing.prompt_profile,
    routerDecision,
    optionCount: input.optionCount ?? 3,
    groundingBlock: grounding || undefined,
    exemplar,
    correlationId: input.correlationId,
    deadlineAt: input.deadlineAt,
    promotedBlockingIssueIds,
  })) {
    // Stop consuming once the caller signals abandonment. In-flight option LLM
    // calls already launched by this generator are not cancelled (the
    // generator fans them all out up front, before the first event is even
    // yielded, so there is no safe way to abort mid-flight without losing
    // partial work) — but no further work happens for events that arrive
    // after the disconnect, and — more importantly — the blueprint phase
    // below never starts.
    if (hooks.isAborted?.()) break;

    if (event.kind === 'started') {
      await hooks.onStarted?.({ index: event.index, approach: event.approach, total: event.total });
    }
    if (event.kind === 'option') {
      validCount++;
      // Composition guardrails (§04/§6) — palette-independent, parity with batch.
      if (event.option?.recipe) {
        try {
          applyCompositionRules(event.option.recipe as RecipeSpec);
        } catch {
          /* composition clamp is best-effort */
        }
      }
      // Snap storefront options onto the live store palette (parity with batch).
      if (aesthetic && event.option?.recipe) {
        try {
          applyStorePalette(event.option.recipe as RecipeSpec, aesthetic.palette);
          applyStylePackTokens(event.option.recipe as RecipeSpec, aesthetic.palette, aesthetic.typography);
        } catch {
          /* palette match is best-effort */
        }
      }
      if (event.option) collected.set(event.index, event.option);
      await hooks.onOption?.({
        index: event.index,
        approach: event.approach,
        option: event.option,
        durationMs: event.durationMs,
      });
    }
    if (event.kind === 'option_failed') {
      await hooks.onOptionFailed?.({
        index: event.index,
        approach: event.approach,
        error: event.error,
        durationMs: event.durationMs,
      });
    }
    // Emit the deterministic ranking just before finalizing so the caller can
    // preselect the recommended option. A caller that ignores this hook is
    // unaffected (purely additive).
    if (event.kind === 'done' && collected.size > 0) {
      await hooks.onStage?.('ranking');
      const entries = [...collected.entries()].sort((a, b) => a[0] - b[0]);
      const ranking = rankOptions(entries.map(([, opt]) => opt));
      await hooks.onRanking?.({
        recommendedIndex: entries[ranking.recommendedIndex]?.[0] ?? entries[0]![0],
        scores: ranking.scores.map((s) => ({
          index: entries[s.index]![0],
          score: s.score,
          badges: s.badges,
        })),
      });
    }
  }

  // Blueprint parity: when the request maps to a coordinated set, generate it
  // (best-effort — never blocks the options). Don't start this extra LLM call
  // at all once the caller is known gone — nobody will read the frame.
  try {
    const plan = planBlueprint({ moduleType: classification.moduleType, intent: intentPacket.classification.intent });
    if (!hooks.isAborted?.() && isBlueprintsEnabled() && plan.kind === 'blueprint') {
      const blueprint = await generateValidatedBlueprint(finalPrompt, plan, {
        shopId,
        intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
        confidenceScore: confidence,
        promptProfile: intentPacket.routing.prompt_profile,
        routerDecision,
        groundingBlock: grounding || undefined,
        exemplar,
        deadlineAt: input.deadlineAt,
      });
      if (blueprint) {
        if (aesthetic) {
          for (const member of blueprint.modules) {
            if (member.recipe.type === 'theme.section' || member.recipe.type === 'proxy.widget') {
              try {
                applyStorePalette(member.recipe as RecipeSpec, aesthetic.palette);
                applyStylePackTokens(member.recipe as RecipeSpec, aesthetic.palette, aesthetic.typography);
              } catch {
                /* best-effort */
              }
            }
          }
        }
        await hooks.onBlueprint?.({
          name: blueprint.name,
          summary: blueprint.summary,
          moduleCount: blueprint.modules.length,
          modules: blueprint.modules.map((m) => ({ role: m.role, type: m.recipe.type, explanation: m.explanation, recipe: m.recipe })),
          links: blueprint.links ?? [],
          ...(blueprint.sharedRecords?.length ? { sharedRecords: blueprint.sharedRecords, bindings: blueprint.bindings ?? [] } : {}),
        });
      }
    }
  } catch {
    /* blueprint is additive — never fail the pipeline */
  }

  await hooks.onStage?.('finalizing');
  return { validCount, moduleType: classification.moduleType, collected };
}
