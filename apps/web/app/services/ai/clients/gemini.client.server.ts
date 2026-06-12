import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { captureAiDebug, isAiDebugCaptureEnabled } from '~/services/ai/debug-capture.server';

/** Default base URL for Google's Gemini (Generative Language) API. */
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

type GeminiResult = { rawJson: string; tokensIn: number; tokensOut: number; model: string };

/**
 * Generate a RecipeSpec via Google's Gemini API (`models/{model}:generateContent`).
 * Mirrors the OpenAI/Anthropic client contract: returns `{ rawJson, tokensIn,
 * tokensOut, model }`. The system instruction forces JSON-only output; when a
 * response schema is provided, Gemini's native structured-output mode is used.
 */
export async function geminiGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
  /** Override default max output tokens (default 8192). */
  maxTokens?: number;
  /** Optional JSON Schema for structured output. */
  responseSchema?: { name?: string; schema: Record<string, unknown> };
}): Promise<GeminiResult> {
  const start = Date.now();
  const base = (opts.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(/\/$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: opts.maxTokens ?? 8192,
    responseMimeType: 'application/json',
  };
  if (opts.responseSchema) {
    // Gemini accepts a subset of JSON Schema (no $schema / additionalProperties).
    generationConfig.responseSchema = sanitizeSchemaForGemini(opts.responseSchema.schema);
  }

  const body = {
    systemInstruction: {
      parts: [
        {
          text: 'You are a JSON generator. Always respond with valid JSON only. No markdown, no explanation outside the JSON.',
        },
      ],
    },
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    generationConfig,
  };

  let result: GeminiResult | null = null;
  try {
    const { json } = await postJsonWithRetries({
      url,
      // Gemini authenticates with x-goog-api-key (not a Bearer token).
      headers: { 'x-goog-api-key': opts.apiKey },
      body,
      logMeta: { provider: 'GEMINI', model: opts.model, actor: 'INTERNAL' },
      shopId: opts.shopId,
    });

    const rawJson = extractGeminiText(json);
    result = {
      rawJson,
      tokensIn: Number(json?.usageMetadata?.promptTokenCount ?? 0) || 0,
      tokensOut: Number(json?.usageMetadata?.candidatesTokenCount ?? 0) || 0,
      model: json?.modelVersion ?? opts.model,
    };
    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'GEMINI',
        model: result.model,
        prompt: opts.prompt,
        response: result.rawJson,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
      });
    }
    return result;
  } catch (err) {
    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'GEMINI',
        model: result?.model ?? opts.model,
        prompt: opts.prompt,
        response: result?.rawJson ?? '',
        tokensIn: result?.tokensIn,
        tokensOut: result?.tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }
}

/** Concatenate text parts from the first candidate. */
function extractGeminiText(resp: any): string {
  const parts = resp?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    : '';
  if (!text) {
    const blockReason = resp?.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Gemini returned no content (blocked: ${blockReason})`
        : 'Gemini response missing candidate text',
    );
  }
  return text;
}

/**
 * Gemini's `responseSchema` rejects JSON Schema keywords it doesn't support
 * (`$schema`, `additionalProperties`, `$ref`, `definitions`). Strip them
 * recursively so a schema authored for OpenAI/Anthropic still works.
 */
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === '$schema' || key === 'additionalProperties' || key === '$ref' || key === 'definitions') {
        continue;
      }
      out[key] = sanitizeSchemaForGemini(value);
    }
    return out;
  }
  return schema;
}
