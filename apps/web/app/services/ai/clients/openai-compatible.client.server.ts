import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { captureAiDebug, isAiDebugCaptureEnabled } from '~/services/ai/debug-capture.server';

export async function openAiCompatibleGenerateRecipe(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  shopId?: string;
  /** Override default max output tokens (default 8192). */
  maxTokens?: number;
  /** Optional JSON Schema for structured output. */
  responseSchema?: { name?: string; schema: Record<string, unknown> };
}) {
  const start = Date.now();
  type CompatResult = { rawJson: string; tokensIn: number; tokensOut: number; model: string };
  const state: { result: CompatResult | null } = { result: null };
  try {
    try {
      state.result = await tryResponses(opts);
    } catch {
      state.result = await tryChatCompletions(opts);
    }
    if (isAiDebugCaptureEnabled() && state.result) {
      await captureAiDebug({
        provider: 'CUSTOM',
        model: state.result.model,
        prompt: opts.prompt,
        response: state.result.rawJson,
        tokensIn: state.result.tokensIn,
        tokensOut: state.result.tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
      });
    }
    return state.result;
  } catch (err) {
    if (isAiDebugCaptureEnabled()) {
      const captured = state.result;
      await captureAiDebug({
        provider: 'CUSTOM',
        model: captured?.model ?? opts.model,
        prompt: opts.prompt,
        response: captured?.rawJson ?? '',
        tokensIn: captured?.tokensIn,
        tokensOut: captured?.tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

async function tryResponses(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  shopId?: string;
  maxTokens?: number;
  responseSchema?: { name?: string; schema: Record<string, unknown> };
}) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/responses`;

  const format = opts.responseSchema
    ? {
        type: 'json_schema' as const,
        name: opts.responseSchema.name ?? 'RecipeSpec',
        schema: opts.responseSchema.schema,
        strict: true,
      }
    : { type: 'json_object' as const };

  const body = {
    model: opts.model,
    input: [{ role: 'user', content: [{ type: 'input_text', text: opts.prompt }] }],
    text: { format },
    max_output_tokens: opts.maxTokens ?? 8192,
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body,
    logMeta: { provider: 'CUSTOM', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  return {
    rawJson: extractResponsesText(json),
    tokensIn: json?.usage?.input_tokens ?? 0,
    tokensOut: json?.usage?.output_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

async function tryChatCompletions(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  shopId?: string;
  maxTokens?: number;
  responseSchema?: { name?: string; schema: Record<string, unknown> };
}) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/chat/completions`;

  const responseFormat = opts.responseSchema
    ? {
        type: 'json_schema' as const,
        json_schema: {
          name: opts.responseSchema.name ?? 'RecipeSpec',
          schema: opts.responseSchema.schema,
          strict: true,
        },
      }
    : { type: 'json_object' as const };

  const body = {
    model: opts.model,
    messages: [{ role: 'user', content: opts.prompt }],
    response_format: responseFormat,
    max_tokens: opts.maxTokens ?? 8192,
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body,
    logMeta: { provider: 'CUSTOM', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Chat completions missing content');

  return {
    rawJson: text.trim(),
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

function extractResponsesText(resp: any): string {
  const chunks: string[] = [];
  for (const item of resp?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  const text = chunks.join('\n').trim();
  if (!text) throw new Error('Responses missing output_text');
  return text;
}
