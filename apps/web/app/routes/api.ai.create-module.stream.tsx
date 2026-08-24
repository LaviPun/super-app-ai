import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import {
  AiProviderNotConfiguredError,
  getLlmClient,
  attributeServedCost,
  recordAiUsage,
} from '~/services/ai/llm.server';
import { AiUsageService } from '~/services/observability/ai-usage.service';
import { judgeAndPolishOption, isJudgePolishEnabled, polishIsNotWorse } from '~/services/ai/judge-polish.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';

/** GET disallowed; this is a streaming POST endpoint. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * Server-Sent Events streaming variant of `/api/ai/create-module`.
 *
 * Returns `text/event-stream` with one event per option as it validates:
 *   event: started     data: { index, approach, total }
 *   event: option      data: { index, approach, explanation, recipe }
 *   event: option_failed data: { index, approach, error }
 *   event: ranking     data: { recommendedIndex, scores: [{ index, score, badges }] }
 *   event: done        data: { valid, total }
 *   event: score          data: { index, score, dimensions? }   (Phase 5c, flag-gated)
 *   event: option_updated data: { index, recipe, note:'polished' } (Phase 5c, flag-gated)
 *   event: error       data: { code, message }   (terminal)
 *
 * The `ranking` event (Phase 2c) is emitted once, right before `done`, when at
 * least one option validated. It is purely additive — clients that ignore it are
 * unaffected. `recommendedIndex`/`scores[].index` are REAL option indices.
 *
 * ASYNC JUDGE POLISH (Phase 5c) — emitted AFTER `done`, not before. The stream
 * client (generate._index.tsx `streamGenerate`) reads frames from the response
 * body until the ReadableStream CLOSES (`reader.read()` → done), NOT until the
 * `done` SSE event — exactly like the existing `blueprint` frame, which already
 * ships after `done`. So post-`done` `score`/`option_updated` frames are received
 * as long as they precede `controller.close()`. This keeps the core response
 * (options + ranking + done) first and fastest, then spends a HARD-time-boxed
 * background window (≤ POLISH_MAX_MS, and skipped entirely once the request has
 * already burned POLISH_SKIP_AFTER_MS) judging each option with a cheap model and
 * pushing a validated, not-worse copy/style polish. It is OFF by default
 * (JUDGE_POLISH_ENABLED) and every failure is silent — the core flow is never
 * delayed or degraded. See judge-polish.server.ts.
 *
 * WS-C (Task 4): the classify -> intent -> router -> RAG -> aesthetics ->
 * option-stream -> composition/palette -> ranking -> blueprint orchestration
 * now lives in `runGenerationPipeline` (generation-pipeline.server.ts), shared
 * with the async worker processor (Task 5). This route keeps auth/rate-limit/
 * quota/Job bookkeeping/judge-polish/SSE mechanics and wires the pipeline's
 * hooks straight into `send(...)`, preserving today's event names/payloads.
 *
 * Use when the merchant UI wants progressive option rendering. The non-streaming
 * `/api/ai/create-module` route still works for clients that prefer batch.
 */
// Async judge-polish time-box (Phase 5c). The core flow targets ≤60s and the
// Cloudflare tunnel drops the connection at ~90-100s, so polish must stay well
// inside that: cap the window at 20s, keep total under ~80s, and skip polish
// outright when the pre-polish flow already ran long (elapsed > 45s).
const POLISH_MAX_MS = 20_000;
const POLISH_SKIP_AFTER_MS = 45_000;
const POLISH_TUNNEL_SOFT_BUDGET_MS = 80_000;
export async function action({ request }: { request: Request }) {
  // Wall-clock anchor for the Phase-5c polish time-box (see POLISH_* constants).
  const requestStart = Date.now();
  const { session, admin } = await shopify.authenticate.admin(request);
  await enforceRateLimit(`ai:${session.shop}`);

  const form = await request.formData();
  const prompt = String(form.get('prompt') ?? '').trim();
  if (!prompt) return json({ error: 'Missing prompt' }, { status: 400 });

  // WS-QF / AI-2 review fix: client-generated per-attempt id, reused verbatim
  // on the batch-route fallback if this stream drops after billing — lets the
  // fallback leg detect the prior charge and bill 0 (see
  // seedBillingStateForCorrelation in llm.server.ts).
  const correlationId = String(form.get('correlationId') ?? '').trim() || undefined;

  const preferredType = String(form.get('preferredType') ?? 'Auto').trim();
  const preferredCategory = String(form.get('preferredCategory') ?? 'Auto').trim();
  const preferredBlockType = String(form.get('preferredBlockType') ?? 'Auto').trim();
  // Default true (parity with the batch /api/ai/create-module route): storefront
  // options should match the live store palette unless the merchant opts out.
  const matchStoreColors = String(form.get('matchStoreColors') ?? 'true').trim() !== 'false';

  const prisma = getPrisma();
  const shopRow = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
    update: {},
  });

  const quotaService = new QuotaService();
  await quotaService.enforce(shopRow.id, 'aiRequest');

  const caps = new CapabilityService();
  let planTier = shopRow.planTier ?? 'UNKNOWN';
  if (planTier === 'UNKNOWN') planTier = await caps.refreshPlanTier(session.shop, admin);

  const jobs = new JobService();
  const job = await jobs.create({
    shopId: shopRow.id,
    type: 'AI_GENERATE',
    payload: {
      promptLen: prompt.length,
      stream: true,
    },
  });
  await jobs.start(job.id);

  // WS-QF / AI-2 review fix (Finding 2a): the client can disconnect (tab
  // closed, tunnel drop, deliberate abandon) while generation is still
  // running. Without watching for that, the route keeps consuming stream
  // events and — worse — keeps STARTING new LLM work (the blueprint call,
  // the judge-polish fan-out) for a response nobody will ever read, burning
  // tokens for nothing. `aborted` is flipped by whichever signal fires first:
  // the platform's ReadableStream `cancel()` (called when the underlying sink
  // is torn down) or the Request's AbortSignal (fired when the underlying
  // connection closes). Already-in-flight option LLM calls are NOT cancelled
  // when this flips — `generateValidatedRecipeOptionsStream` fans all of them
  // out up front, before the first event is even yielded, so there is no safe
  // way to abort them mid-flight without losing partial work; letting them
  // finish (and bill/cost-record normally) is accepted. What this DOES stop:
  // further event processing/`send()`s once the loop notices, and starting
  // the blueprint/judge-polish phases at all.
  let aborted = false;
  request.signal.addEventListener('abort', () => {
    aborted = true;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller already closed by a cancel() the abort listener hasn't
          // observed yet (ordering isn't guaranteed across runtimes) — treat
          // it the same as an observed abort rather than throwing.
          aborted = true;
        }
      };

      let moduleType = 'theme.section';
      try {
        const result = await runGenerationPipeline(
          {
            shopId: shopRow.id,
            shopDomain: session.shop,
            prompt,
            preferredType,
            preferredCategory,
            preferredBlockType,
            matchStoreColors,
            optionCount: 3,
            correlationId,
            planTier,
            admin,
          },
          {
            onIntent: (frame) => {
              send('intent', frame);
            },
            onStarted: (o) => {
              send('started', { kind: 'started', ...o });
            },
            onOption: (o) => {
              send('option', { kind: 'option', ...o });
            },
            onOptionFailed: (o) => {
              send('option_failed', { kind: 'option_failed', ...o });
            },
            onRanking: (r) => {
              send('ranking', r);
            },
            onBlueprint: (b) => {
              send('blueprint', b);
            },
            isAborted: () => aborted,
          },
        );
        moduleType = result.moduleType;
        const collected = result.collected;
        send('done', { kind: 'done', valid: result.validCount, total: 3 });

        // Async LLM-judge polish (Phase 5c) — AFTER `done`/`blueprint`, flag-gated
        // and hard-time-boxed so it can never delay or degrade the core response.
        // WS-QF / AI-2 review fix (Finding 2a): also gated on !aborted — this
        // fans out one judge LLM call per option, exactly the "new option
        // work" that shouldn't start for a response nobody will read.
        if (!aborted && isJudgePolishEnabled() && collected.size > 0) {
          const elapsed = Date.now() - requestStart;
          const timeBox = Math.min(POLISH_MAX_MS, POLISH_TUNNEL_SOFT_BUDGET_MS - elapsed);
          // Skip entirely when the pre-polish flow already ran long, or no budget
          // remains — protecting the tunnel deadline over a nice-to-have polish.
          if (elapsed <= POLISH_SKIP_AFTER_MS && timeBox > 0) {
            try {
              const entries = [...collected.entries()].sort((a, b) => a[0] - b[0]);
              const { client: judgeClient, providerId: judgeProviderId } = await getLlmClient(shopRow.id, {
                blockMerchantCodeExecution: true,
              });
              const usage = new AiUsageService();
              const deadline = requestStart + elapsed + timeBox;
              // Once the window closes, suppress any late emit rather than push a
              // frame past the intended budget.
              let polishAborted = false;
              const abortTimer = setTimeout(() => {
                polishAborted = true;
              }, timeBox);

              await Promise.all(
                entries.map(async ([index, option]) => {
                  const remaining = deadline - Date.now();
                  if (remaining <= 0) return;
                  const res = await judgeAndPolishOption(option.recipe, {
                    client: judgeClient,
                    userRequest: prompt,
                    timeoutMs: Math.min(remaining, timeBox),
                  });
                  if (!res) return; // timed out — nothing to score or bill

                  // Attribute the judge call's cost/usage. Judge calls are NOT a
                  // billable merchant unit (requestCount: 0), mirroring how fan-out
                  // option siblings count 0 toward quota (claimOptionBillableUnit).
                  if (res.raw) {
                    try {
                      const { providerId: servedId, costCents } = await attributeServedCost(
                        res.raw,
                        judgeProviderId,
                        res.raw.tokensIn,
                        res.raw.tokensOut,
                      );
                      await recordAiUsage(usage, {
                        providerId: servedId,
                        shopId: shopRow.id,
                        action: 'RECIPE_JUDGE_POLISH',
                        tokensIn: res.raw.tokensIn,
                        tokensOut: res.raw.tokensOut,
                        costCents,
                        requestCount: 0,
                        meta: {
                          index,
                          model: res.raw.model,
                          score: res.score,
                          patched: Boolean(res.patchedRecipe),
                        },
                      });
                    } catch {
                      /* usage logging must never break the stream */
                    }
                  }

                  if (polishAborted) return;
                  if (typeof res.score === 'number') {
                    send('score', {
                      index,
                      score: res.score,
                      ...(res.dimensions ? { dimensions: res.dimensions } : {}),
                    });
                  }
                  // Push a polished recipe ONLY when the validated patch does not
                  // regress the deterministic rank score (never push a worse option).
                  if (
                    res.patchedRecipe &&
                    polishIsNotWorse(option.recipe, res.patchedRecipe, {
                      generationMode: option.generationMode,
                      qaSummary: option.qaSummary,
                    })
                  ) {
                    send('option_updated', { index, recipe: res.patchedRecipe, note: 'polished' });
                  }
                }),
              );
              clearTimeout(abortTimer);
            } catch {
              /* judge polish is additive — never fail the stream */
            }
          }
        }

        // WS-QF / AI-2: 0 valid options is a FAILURE — jobs.fail + a typed
        // terminal error frame so the client shows retry instead of silently
        // re-running (and re-billing) the whole generation via the batch route.
        const terminal = await finalizeGenerationJob(jobs, job.id, result.validCount, {
          type: moduleType,
        });
        if (terminal.kind === 'failed') {
          send('error', {
            code: terminal.code,
            message: `${terminal.message} Please try again — this attempt was not billed.`,
          });
        }
      } catch (e: unknown) {
        await jobs.fail(job.id, e);
        if (e instanceof AiProviderNotConfiguredError) {
          send('error', { code: e.code, message: e.message, setupUrl: '/internal/ai-providers' });
        } else {
          send('error', {
            code: 'GENERATION_FAILED',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed via cancel()/abort — nothing left to do */
        }
      }
    },
    // WS-QF / AI-2 review fix (Finding 2a): called by the platform when the
    // consumer goes away (client closed the connection / tab / tunnel drop).
    // Belt-and-suspenders alongside the Request AbortSignal listener above —
    // different runtimes surface the disconnect through one, the other, or
    // both, and whichever fires first wins.
    cancel() {
      aborted = true;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  });
}
