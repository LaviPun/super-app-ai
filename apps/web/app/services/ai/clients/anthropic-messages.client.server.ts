import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { captureAiDebug, isAiDebugCaptureEnabled } from '~/services/ai/debug-capture.server';

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
}) {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const useSkills = opts.skillsConfig?.skills?.length;
  const useCodeExecution = Boolean(opts.skillsConfig?.codeExecution);
  const useStructured = Boolean(opts.responseSchema) && !useSkills && !useCodeExecution;

  if (opts.responseSchema && (useSkills || useCodeExecution)) {
    throw new Error(
      'Anthropic skills/code execution cannot be combined with JSON schema structured output for this call. Disable skills/code execution or omit responseSchema.',
    );
  }

  const betaParts: string[] = [];
  if (useSkills) betaParts.push('skills-2025-10-02', 'files-api-2025-04-14');
  if (useSkills || useCodeExecution) betaParts.push('code-execution-2025-08-25');
  const anthropicBeta = [...new Set(betaParts)].join(',');

  const headers: Record<string, string> = {
    'x-api-key': opts.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (anthropicBeta) headers['anthropic-beta'] = anthropicBeta;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8192,
    system: useStructured
      ? 'You are a JSON generator. Call the provided tool exactly once with valid arguments matching the schema.'
      : 'You are a JSON generator. Always respond with valid JSON only. No markdown, no explanation outside the JSON.',
    messages: [{ role: 'user', content: opts.prompt }],
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
    body.tools = [{ type: 'code_execution_20250825', name: 'code_execution' }];
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
  try {
    const { json } = await postJsonWithRetries({
      url,
      headers,
      body,
      logMeta: { provider: 'ANTHROPIC', model: opts.model, actor: 'INTERNAL' },
      shopId: opts.shopId,
    });

    rawJson = useStructured ? extractToolUseInput(json) : extractText(json);
    const usage = json?.usage;
    tokensIn = usage?.input_tokens ?? 0;
    tokensOut = usage?.output_tokens ?? 0;
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
    return { rawJson, tokensIn, tokensOut, model: modelOut };
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
