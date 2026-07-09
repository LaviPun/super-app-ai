import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { captureAiDebug, isAiDebugCaptureEnabled } from '~/services/ai/debug-capture.server';

export async function openAiGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
  /** Override default max_output_tokens (default 8192). Hydration responses need more tokens. */
  maxTokens?: number;
  /**
   * Optional JSON Schema for structured output. When present, OpenAI Responses
   * will guarantee the response matches the schema (text.format = json_schema).
   * Caller must pass a `name` for the schema; we generate one if missing.
   */
  responseSchema?: { name?: string; schema: Record<string, unknown> };
  openaiFeatures?: {
    reasoningEffort?: 'low' | 'medium' | 'high';
    verbosity?: 'low' | 'medium' | 'high';
    webSearch?: boolean;
  };
}) {
  const base = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
  const url = `${base}/v1/responses`;

  const format = opts.responseSchema
    ? {
        type: 'json_schema' as const,
        name: opts.responseSchema.name ?? 'RecipeSpec',
        schema: opts.responseSchema.schema,
        // NOTE: strict must stay false. Several RecipeSpec branches contain
        // open-ended maps (theme.section `fields`/`.catchall`, flow/httpSync
        // mapping records = `z.record(...)`). OpenAI strict structured output
        // requires `additionalProperties: false` on EVERY object, which cannot
        // represent an open record — the API rejects the request outright
        // ("additionalProperties is required to be supplied and to be false").
        // Non-strict still passes the schema as strong guidance; the Zod
        // validate+repair pipeline downstream is the correctness guarantee.
        strict: false,
      }
    : ({ type: 'json_object' as const });

  const textPayload: Record<string, unknown> = { format };
  if (opts.openaiFeatures?.verbosity) textPayload.verbosity = opts.openaiFeatures.verbosity;

  // Reasoning models (gpt-5*, o1/o3/o4*) spend output tokens on hidden reasoning
  // BEFORE the visible answer, and `max_output_tokens` caps reasoning + visible
  // COMBINED. The caller's per-type budget (token-budget.server) sizes the
  // VISIBLE JSON only, so on a reasoning model the reasoning pass can exhaust the
  // cap and truncate the JSON ("output truncated (max_output_tokens)"). Give
  // reasoning models dedicated headroom on top of the caller's budget, and
  // default to low effort for these structured-JSON tasks (they don't need deep
  // reasoning) so the visible output always has room. Explicit caller settings win.
  const isReasoningModel = /^(?:o[134](?:-|$)|gpt-5)/i.test(opts.model);
  const REASONING_HEADROOM = 6000;
  const visibleBudget = opts.maxTokens ?? 8192;
  const maxOutputTokens = isReasoningModel ? visibleBudget + REASONING_HEADROOM : visibleBudget;

  const body: Record<string, unknown> = {
    model: opts.model,
    instructions: 'You are a JSON generator. Always respond with valid JSON only. No markdown, no explanation outside the JSON.',
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: opts.prompt }],
      },
    ],
    text: textPayload,
    max_output_tokens: maxOutputTokens,
  };
  const reasoningEffort = opts.openaiFeatures?.reasoningEffort ?? (isReasoningModel ? 'low' : undefined);
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }
  if (opts.openaiFeatures?.webSearch) {
    body.tools = [{ type: 'web_search_preview' }];
  }

  const start = Date.now();
  let rawJson = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelOut = opts.model;
  try {
    const { json } = await postJsonWithRetries({
      url,
      headers: { authorization: `Bearer ${opts.apiKey}` },
      body,
      logMeta: { provider: 'OPENAI', model: opts.model, actor: 'INTERNAL' },
      shopId: opts.shopId,
    });

    rawJson = extractOutputText(json);
    const usage = json?.usage;
    tokensIn = usage?.input_tokens ?? 0;
    tokensOut = usage?.output_tokens ?? 0;
    modelOut = json?.model ?? opts.model;

    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'OPENAI',
        model: modelOut,
        prompt: opts.prompt,
        response: rawJson,
        tokensIn,
        tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
      });
    }
    return { rawJson, tokensIn, tokensOut, model: modelOut };
  } catch (err) {
    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'OPENAI',
        model: opts.model,
        prompt: opts.prompt,
        response: rawJson,
        tokensIn,
        tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

function extractOutputText(resp: any): string {
  const out = resp?.output;
  if (!Array.isArray(out)) throw new Error('OpenAI response missing output[]');

  // Top-level response truncation (e.g. max_output_tokens hit)
  if (resp?.status === 'incomplete') {
    const reason = resp?.incomplete_details?.reason ?? 'unknown';
    throw new Error(`OpenAI output truncated (${reason}): increase max_output_tokens or reduce prompt complexity`);
  }

  const chunks: string[] = [];
  for (const item of out) {
    if (item?.type !== 'message') continue;
    // Message-level truncation
    if (item?.status === 'incomplete') {
      const reason = item?.incomplete_details?.reason ?? 'unknown';
      throw new Error(`OpenAI output truncated (${reason}): increase max_output_tokens or reduce prompt complexity`);
    }
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') chunks.push(part.text);
    }
  }

  const text = chunks.join('\n').trim();
  if (!text) throw new Error('OpenAI response missing output_text');
  return text;
}
