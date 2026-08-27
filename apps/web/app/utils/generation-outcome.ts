export type StreamOutcomeInput = {
  /** At least one `option` frame arrived and rendered. */
  gotAny: boolean;
  /** The server sent a terminal `error` SSE frame (it ran and finished — retrying is a NEW billable request). */
  sawErrorFrame: boolean;
  /** The SSE transport itself failed (fetch rejected / !res.ok / no body) — the stream leg billed nothing. */
  transportFailed: boolean;
  /** True when the fetch was aborted by the merchant clicking Cancel (or
   *  navigating away mid-generation) — an intentional cancel is never a
   *  transport failure to recover from, and must never trigger the
   *  batch-fallback (which would bill a second request the merchant already
   *  told us to stop). Checked first, ahead of every other outcome. */
  aborted?: boolean;
};

export type StreamNextStep = 'proceed' | 'show-retry' | 'batch-fallback' | 'cancelled';

/**
 * What the generate UI does after the stream ends (WS-QF / AI-2). A server
 * terminal error means the generation RAN and failed — auto-refiring the batch
 * route would silently start a second billable request, so the merchant gets an
 * honest retry UI instead. The batch fallback survives only for transport
 * failure, where the stream request never generated (and billed 0).
 *
 * `aborted` is checked before anything else (WS-F): an intentional Cancel
 * must never be treated as a transport failure worth falling back from, and
 * must never be treated as "proceed" just because some options had already
 * rendered before the click.
 */
export function nextStepAfterStream(o: StreamOutcomeInput): StreamNextStep {
  if (o.aborted) return 'cancelled';
  if (o.gotAny) return 'proceed';
  if (o.sawErrorFrame) return 'show-retry';
  if (o.transportFailed) return 'batch-fallback';
  return 'show-retry';
}

// The full wire protocol emitted by /api/ai/create-module/stream (see that
// route's own doc comment) — 10 distinct event kinds. Only 'option',
// 'ranking', 'score', 'option_updated', and 'done' move STEP_ORDER below;
// 'intent', 'started', 'option_failed', 'blueprint', and 'error' are real
// frames the client also receives but don't advance progress (blueprint is
// flag-gated and handled separately by the caller; error is terminal and
// handled via sawErrorFrame, not step advancement).
export type StreamEventKind =
  | 'intent'
  | 'started'
  | 'option'
  | 'option_failed'
  | 'ranking'
  | 'blueprint'
  | 'score'
  | 'option_updated'
  | 'error'
  | 'done';

const STREAM_EVENT_KINDS: ReadonlySet<string> = new Set<StreamEventKind>([
  'intent',
  'started',
  'option',
  'option_failed',
  'ranking',
  'blueprint',
  'score',
  'option_updated',
  'error',
  'done',
]);

/** Type guard so callers can narrow a raw SSE `event:` field name to
 *  StreamEventKind without an unsafe cast — unrecognized event names (e.g. a
 *  future server addition, or the SSE default 'message') are simply ignored. */
export function isStreamEventKind(ev: string): ev is StreamEventKind {
  return STREAM_EVENT_KINDS.has(ev);
}

// Builder loading-animation stage labels (WS-builder-ux): Understanding your
// request -> Selecting exemplars -> Generating concepts -> Design QA -> Ranking
// (see GEN_STEPS in generate._index.tsx). Both transports map their real
// progress signals onto this same 5-slot index space:
//  - 'intent' (stream) fires once classify + RAG exemplar search have BOTH
//    resolved (the frame carries exemplarTier/exemplarTemplateId — the actual
//    exemplar-selection OUTCOME) — so seeing it jumps past step 0 straight to
//    step 1, "Selecting exemplars", which is already complete by then.
//  - 'started'/'option' mark the per-option generate+QA fan-out running —
//    step 2, "Generating concepts" (each option's own Design QA gate already
//    runs inline before that option's frame is sent, so there is no separate
//    wire event for it).
//  - 'ranking' fires only after every option settled AND the deterministic
//    ranker ran — by construction every arrived option already passed its
//    QA gate, so seeing 'ranking' retroactively completes step 3 ("Design
//    QA") the instant it completes step 4 ("Ranking") itself.
//  - 'score'/'option_updated' are the post-`done` async judge-polish frames;
//    clamped to the last real step like before.
//  - 'done' completes everything.
const STEP_ORDER: Array<{ kind: StreamEventKind; minStep: number }> = [
  { kind: 'intent', minStep: 1 },
  { kind: 'started', minStep: 2 },
  { kind: 'option', minStep: 2 },
  { kind: 'ranking', minStep: 4 },
  { kind: 'score', minStep: 4 },
  { kind: 'option_updated', minStep: 4 },
  { kind: 'done', minStep: Number.MAX_SAFE_INTEGER }, // clamped to totalSteps below
];

/**
 * Real-event-driven replacement for the Builder's old setInterval progress
 * tick (WS-F). Pure, order-independent-safe: given the set of distinct SSE
 * event kinds seen so far in a stream, returns which GEN_STEPS index is
 * "current." Every input here is a REAL SSE frame the route already parses
 * (intent/started/option/ranking/score/option_updated/done) — nothing is
 * simulated.
 */
export function stepIndexForSeenEvents(seen: ReadonlySet<StreamEventKind>, totalSteps: number): number {
  let step = 0;
  for (const { kind, minStep } of STEP_ORDER) {
    if (seen.has(kind)) step = Math.max(step, minStep);
  }
  return Math.min(step, totalSteps);
}

// Real Job.stage values the async worker persists (runGenerationPipeline's
// onStage hook, called from both the stream route and
// ai-generation.processor.server.ts) — see GenerationPipelineHooks.onStage in
// generation-pipeline.server.ts. PolledJobSnapshot.stage carries this back to
// the client on every `GET /api/ai/jobs/:jobId` poll.
const POLL_STAGE_STEP: Readonly<Record<string, number>> = {
  // 'classifying' covers BOTH classify AND the RAG exemplar search (they run
  // back-to-back before the pipeline's next hook fires) — the poll transport
  // has no finer-grained signal than this single stage name, unlike the
  // stream transport's separate 'intent' frame, so it stays at step 0 for the
  // whole stage rather than claiming a "Selecting exemplars" moment it can't
  // actually observe.
  classifying: 0,
  // By the time the worker reports 'generating', classify + exemplar search
  // have already resolved — jump straight to "Generating concepts" (step 2),
  // same as the stream path's 'intent' -> 'started' transition.
  generating: 2,
  // Every option that reached ranking already passed its own Design QA gate
  // (see STEP_ORDER's 'ranking' comment above) — same retroactive-complete
  // reasoning applies here.
  ranking: 4,
  finalizing: 5,
};

/**
 * Maps the async/poll transport's real `Job.stage` (PolledJobSnapshot.stage)
 * onto the same GEN_STEPS index space `stepIndexForSeenEvents` uses for the
 * SSE transport, so the loading animation is driven by real server-reported
 * progress on both paths (WS-builder-ux) — never a fake timer. `null`
 * (freshly queued, no stage reported yet) and any unrecognized/future stage
 * name both degrade to step 0 rather than throwing.
 */
export function stepIndexForPollStage(stage: string | null, totalSteps: number): number {
  const step = stage != null ? (POLL_STAGE_STEP[stage] ?? 0) : 0;
  return Math.min(step, totalSteps);
}

const MIN_OPTION_COUNT = 1;
const MAX_OPTION_COUNT = 3;
const DEFAULT_OPTION_COUNT = 3;

/**
 * Clamps a merchant-chosen concept count (the Builder's 1/2/3 segmented
 * control, WS-builder-ux) to the billing-safe range the generation pipeline
 * already enforces server-side (`generateValidatedRecipeOptionsStream`/
 * `...Parallel`'s own `Math.max(1, Math.min(3, ...))`, and
 * `WebAiGenerateJobPayloadSchema.optionCount`'s `z.number().min(1).max(3)`).
 * This is the SAME clamp reused at every entry point (client control, and
 * each server route's FormData read) so the value can never silently drift
 * out of range between them. Accepts `FormData.get()`'s string shape
 * directly; any non-finite/garbage/missing input defaults to 3 — today's
 * existing behavior — rather than throwing.
 */
export function clampOptionCount(value: unknown): 1 | 2 | 3 {
  if (value === null || value === undefined || value === '') return DEFAULT_OPTION_COUNT;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_OPTION_COUNT;
  const rounded = Math.round(n);
  return Math.max(MIN_OPTION_COUNT, Math.min(MAX_OPTION_COUNT, rounded)) as 1 | 2 | 3;
}

/**
 * Stamps a generation attempt's FormData with its correlationId (WS-QF / AI-2
 * review fix). The stream leg sends this id, and — because the batch fallback
 * in `generate._index.tsx` resubmits the SAME FormData object rather than
 * building a new one — the fallback leg carries the identical id automatically.
 * This is what lets the server's cross-leg billing dedupe
 * (`claimOptionBillableUnit` / `seedBillingStateForCorrelation` in
 * llm.server.ts) recognize a batch-fallback call as a retry of an
 * already-billed attempt instead of a fresh, separately-billable request.
 */
export function withGenerationCorrelationId(fd: FormData, correlationId: string): FormData {
  fd.set('correlationId', correlationId);
  return fd;
}

/**
 * WS-C Task 13 fix round 1: stamps a generation attempt's FormData AND its
 * ref (`genCorrelationIdRef` in generate._index.tsx) with the SAME
 * correlationId in one call. Before this helper existed, `streamGenerate`
 * called `withGenerationCorrelationId(fd, ...)` but never set the ref —
 * only `asyncGenerate` did — so a save after an SSE-path generation (the
 * no-Redis default, and the documented fallback on async transport failure
 * / 503 ASYNC_DISABLED) sent an empty correlationId on save and the funnel
 * spine (WS-C Task 13) never chained `Module.generationCorrelationId` for
 * that traffic. A single call site for "stamp both" makes that class of bug
 * structurally harder to reintroduce.
 */
export function stampGenerationCorrelationId(
  fd: FormData,
  ref: { current: string | null },
  correlationId: string,
): string {
  withGenerationCorrelationId(fd, correlationId);
  ref.current = correlationId;
  return correlationId;
}

/**
 * WS-C final review (IMPORTANT-1): resolves the id `streamGenerate` should
 * stamp — an explicit id, when one is passed in, ALWAYS wins over minting a
 * fresh uuid. `asyncGenerate`'s fallback paths pass their own
 * `newCorrelationId` explicitly: the async enqueue route (`POST
 * /api/ai/generate-async`) only returns 200 after BOTH `jobs.create` and
 * `enqueueWebJob` succeed, so a transport failure or unreadable response
 * AFTER that point may leave a live, orphaned worker job that will still run
 * (and bill) under `newCorrelationId` regardless of what the client does
 * next. Reusing that same id for the SSE fallback lets the billing dedupe
 * seam (`seedBillingStateForCorrelation` in llm.server.ts) collapse the
 * orphan and the fallback into one billed unit instead of two. A genuinely
 * fresh, first attempt (no prior leg, nothing to reuse) mints its own id.
 * Naming this its own function keeps "explicit id always wins" independently
 * testable without a full component/SSE test harness.
 */
export function resolveGenerationCorrelationId(explicitCorrelationId?: string): string {
  return explicitCorrelationId ?? crypto.randomUUID();
}
