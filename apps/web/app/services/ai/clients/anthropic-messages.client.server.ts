import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { captureAiDebug, isAiDebugCaptureEnabled } from '~/services/ai/debug-capture.server';
import { TruncatedOutputError } from '~/services/ai/clients/truncation.server';
import { isPromptCachingEnabled } from '~/env.server';

/** Claude Agent Skills config: skills (anthropic IDs e.g. pptx, xlsx or custom skill_01Ab...) and optional code execution. */
export type AnthropicSkillsConfig = {
  skills?: string[];
  codeExecution?: boolean;
};

export async function anthropicGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
  /** Override default max_tokens (default 8192). Hydration responses including previewHtml need more tokens. */
  maxTokens?: number;
  /**
   * WS-C Task 10 (C7). Deadline-bounded HTTP timeout, precomputed by
   * `ConfiguredLlmClient.callProvider` from `GenerateHints.deadlineAt`.
   * Forwarded verbatim to `postJsonWithRetries`; absent when the caller
   * (or Env*Client) didn't pass a `deadlineAt` hint — behavior unchanged.
   */
  timeoutMs?: number;
  /**
   * WS-C Task 10 (C7, fix round 1). The raw epoch-ms deadline, forwarded
   * ALONGSIDE `timeoutMs` so `postJsonWithRetries` can re-derive the
   * effective per-attempt timeout on every retry (a `timeoutMs` fixed once
   * up front would let each 429/5xx/network retry re-claim a full fresh
   * window instead of the shrinking remainder of the actual budget).
   */
  deadlineAt?: number;
  /** When set, sends container.skills and optional code_execution tool with beta headers. */
  skillsConfig?: AnthropicSkillsConfig;
  /**
   * Optional JSON Schema for structured output. When present, we use Claude's
   * tool_use mechanic to force a single tool call whose input matches the
   * schema, then extract that as the response. This eliminates JSON-shape
   * errors that the prose-only mode is prone to.
   *
   * Cannot be combined with `skillsConfig` (tools list conflicts with skills).
   */
  responseSchema?: { name?: string; schema: Record<string, unknown> };
  /**
   * WS P2-A. Char offset into `opts.prompt` marking the end of the cache-stable
   * prefix (from CompiledPrompt.cacheableChars). When set AND AI_PROMPT_CACHING_ENABLED
   * is true, messages[0].content becomes a two-block array with cache_control on
   * the prefix block. Absent, 0, or flag-off: unchanged single-string content
   * (byte-identical to pre-P2A behavior).
   */
  cacheBoundary?: number;
}) {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const useSkills = opts.skillsConfig?.skills?.length;
  const useCodeExecution = Boolean(opts.skillsConfig?.codeExecution);
  const useStructured = Boolean(opts.responseSchema) && !useSkills && !useCodeExecution;
  const cachingEnabled = isPromptCachingEnabled();

  const betaParts: string[] = [];
  if (useSkills) betaParts.push('skills-2025-10-02', 'files-api-2025-04-14');
  if (useSkills || useCodeExecution) betaParts.push('code-execution-2025-08-25');
  const anthropicBeta = [...new Set(betaParts)].join(',');

  const headers: Record<string, string> = {
    'x-api-key': opts.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (anthropicBeta) headers['anthropic-beta'] = anthropicBeta;

  const systemText = useStructured
    ? 'You are a JSON generator. Call the provided tool exactly once with valid arguments matching the schema.'
    : 'You are a JSON generator. Always respond with valid JSON only. No markdown, no explanation outside the JSON.';

  // WS P2-A: when structured output is active, the forced tool's JSON Schema is
  // deterministic per (moduleType, mode) or fully global (hydrate) — cache it
  // together with `system` (render order tools -> system -> messages means a
  // breakpoint on the last system block caches both).
  const system = cachingEnabled && useStructured
    ? [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }]
    : systemText;

  const hasCacheBoundary = cachingEnabled && typeof opts.cacheBoundary === 'number' && opts.cacheBoundary > 0 && opts.cacheBoundary < opts.prompt.length;
  const content = hasCacheBoundary
    ? [
        { type: 'text', text: opts.prompt.slice(0, opts.cacheBoundary), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: opts.prompt.slice(opts.cacheBoundary) },
      ]
    : opts.prompt;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8192,
    system,
    messages: [{ role: 'user', content }],
  };

  if (useSkills) {
    body.container = {
      skills: opts.skillsConfig!.skills!.map((skillId) =>
        skillId.startsWith('skill_')
          ? { type: 'custom', skill_id: skillId, version: 'latest' as const }
          : { type: 'anthropic', skill_id: skillId, version: 'latest' as const }
      ),
    };
  }

  if (useSkills || useCodeExecution) {
    // WS P2-A: fixed the code_execution_20250825 -> code_execution_20260521 drift
    // (the _20250825 type string pre-dated this codebase's current API reference).
    body.tools = [{ type: 'code_execution_20260521', name: 'code_execution' }];
  }

  if (useStructured) {
    const toolName = (opts.responseSchema!.name ?? 'emit_recipe').replace(/[^a-zA-Z0-9_]/g, '_');
    body.tools = [
      {
        name: toolName,
        description: 'Emit the recipe JSON. Call this exactly once with valid arguments.',
        input_schema: opts.responseSchema!.schema,
      },
    ];
    body.tool_choice = { type: 'tool', name: toolName };
  }

  const start = Date.now();
  let rawJson = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let modelOut = opts.model;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  try {
    const { json } = await postJsonWithRetries({
      url,
      headers,
      body,
      timeoutMs: opts.timeoutMs,
      deadlineAt: opts.deadlineAt,
      logMeta: { provider: 'ANTHROPIC', model: opts.model, actor: 'INTERNAL' },
      shopId: opts.shopId,
    });

    // WS-C Task 12. Anthropic never threw on truncation before this — a
    // `stop_reason: 'max_tokens'` reply (text OR tool_use cut off mid-call)
    // silently fell through to `extractText`/`extractToolUseInput`, either
    // producing a generic parse error downstream or, worse, a
    // valid-looking-but-incomplete JSON prefix. Detect it here, before
    // extraction, so callers can retry with a bumped token budget instead of
    // burning a full billed retry against the same one.
    if (json?.stop_reason === 'max_tokens') {
      throw new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens');
    }

    rawJson = useStructured ? extractToolUseInput(json) : extractText(json);
    const usage = json?.usage;
    tokensIn = usage?.input_tokens ?? 0;
    tokensOut = usage?.output_tokens ?? 0;
    cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
    cacheCreationTokens = usage?.cache_creation_input_tokens ?? 0;
    modelOut = json?.model ?? opts.model;

    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'ANTHROPIC',
        model: modelOut,
        prompt: opts.prompt,
        response: rawJson,
        tokensIn,
        tokensOut,
        shopId: opts.shopId,
        durationMs: Date.now() - start,
      });
    }
    return { rawJson, tokensIn, tokensOut, model: modelOut, cacheReadTokens, cacheCreationTokens };
  } catch (err) {
    if (isAiDebugCaptureEnabled()) {
      await captureAiDebug({
        provider: 'ANTHROPIC',
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

function extractText(resp: any): string {
  const content = resp?.content;
  if (!Array.isArray(content)) throw new Error('Anthropic response missing content[]');

  const types = content.map((c: any) => c?.type).filter(Boolean);

  // Collect text from regular text blocks (primary output for JSON responses)
  const textParts = content
    .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
    .map((c: any) => c.text);

  // Also collect output from code_execution_result blocks (returned when code execution tool is enabled)
  const codeResultParts = content
    .filter((c: any) => c?.type === 'code_execution_result' && typeof c?.output === 'string')
    .map((c: any) => c.output);

  const text = [...textParts, ...codeResultParts].join('\n').trim();
  if (text) return text;

  // No text: often happens when the model returns only "thinking" blocks (extended reasoning) and no text block,
  // e.g. max_tokens reached during thinking or a thinking-only model response.
  if (types.some((t: string) => t === 'thinking')) {
    throw new Error(
      'Anthropic returned only thinking blocks (no text). Try increasing max_tokens, or use a model without extended thinking for this task.'
    );
  }
  throw new Error(
    `Anthropic response missing text (content had ${content.length} block(s), types: ${types.join(', ') || 'none'}). Check model and max_tokens.`
  );
}

/**
 * Pull the structured output from a forced tool_use call. Anthropic returns
 * `content: [{ type: 'tool_use', input: {...} }]`. We re-stringify so the
 * caller's parse path is identical to the json_object code-path.
 */
function extractToolUseInput(resp: any): string {
  const content = resp?.content;
  if (!Array.isArray(content)) throw new Error('Anthropic response missing content[]');
  for (const block of content) {
    if (block?.type === 'tool_use' && block?.input && typeof block.input === 'object') {
      return JSON.stringify(block.input);
    }
  }
  // Fall back to text in case the model declined to call the tool
  return extractText(resp);
}
