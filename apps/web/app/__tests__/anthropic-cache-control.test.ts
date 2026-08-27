import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// vi.mock factories are hoisted above top-level const declarations, so a
// plain `const postJsonWithRetries = vi.fn()` referenced inside the factory
// below throws "Cannot access before initialization". vi.hoisted() runs its
// callback at the same hoisted point as vi.mock, so the reference is valid.
const { postJsonWithRetries } = vi.hoisted(() => ({ postJsonWithRetries: vi.fn() }));
vi.mock('~/services/ai/http/ai-http.server', () => ({ postJsonWithRetries }));
vi.mock('~/services/ai/debug-capture.server', () => ({
  captureAiDebug: vi.fn(),
  isAiDebugCaptureEnabled: () => false,
}));

import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';

const okResponse = {
  json: {
    content: [{ type: 'text', text: '{"ok":true}' }],
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 },
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
  },
};

describe('anthropicGenerateRecipe cache_control', () => {
  const originalFlag = process.env.AI_PROMPT_CACHING_ENABLED;

  beforeEach(() => {
    postJsonWithRetries.mockReset();
    postJsonWithRetries.mockResolvedValue(okResponse);
    process.env.AI_PROMPT_CACHING_ENABLED = 'true';
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.AI_PROMPT_CACHING_ENABLED;
    else process.env.AI_PROMPT_CACHING_ENABLED = originalFlag;
  });

  it('splits messages[0].content into a cached prefix block and an uncached suffix block when cacheBoundary is set', async () => {
    const prompt = 'STATIC_PREFIX_TEXT' + 'DYNAMIC_SUFFIX_TEXT';
    await anthropicGenerateRecipe({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      prompt,
      cacheBoundary: 'STATIC_PREFIX_TEXT'.length,
    });
    const body = postJsonWithRetries.mock.calls[0]![0].body;
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content[0]).toMatchObject({ type: 'text', text: 'STATIC_PREFIX_TEXT', cache_control: { type: 'ephemeral' } });
    expect(body.messages[0].content[1]).toMatchObject({ type: 'text', text: 'DYNAMIC_SUFFIX_TEXT' });
    expect(body.messages[0].content[1].cache_control).toBeUndefined();
    // Byte-concat of the two blocks reconstructs the original prompt.
    expect(body.messages[0].content[0].text + body.messages[0].content[1].text).toBe(prompt);
  });

  it('keeps the single-string content shape when cacheBoundary is absent (back-compat)', async () => {
    await anthropicGenerateRecipe({ apiKey: 'k', model: 'claude-sonnet-5', prompt: 'anything' });
    const body = postJsonWithRetries.mock.calls[0]![0].body;
    expect(body.messages).toEqual([{ role: 'user', content: 'anything' }]);
  });

  it('keeps the single-string content shape when the flag is off, even with a cacheBoundary', async () => {
    process.env.AI_PROMPT_CACHING_ENABLED = 'false';
    await anthropicGenerateRecipe({ apiKey: 'k', model: 'claude-sonnet-5', prompt: 'STATIC' + 'DYNAMIC', cacheBoundary: 6 });
    const body = postJsonWithRetries.mock.calls[0]![0].body;
    expect(body.messages).toEqual([{ role: 'user', content: 'STATICDYNAMIC' }]);
  });

  it('puts cache_control on the system block when responseSchema (structured output) is active', async () => {
    await anthropicGenerateRecipe({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      prompt: 'p',
      responseSchema: { name: 'emit_recipe', schema: { type: 'object', properties: {} } },
    });
    const body = postJsonWithRetries.mock.calls[0]![0].body;
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('captures cache_read_input_tokens/cache_creation_input_tokens onto the returned result', async () => {
    const result = await anthropicGenerateRecipe({ apiKey: 'k', model: 'claude-sonnet-5', prompt: 'p', cacheBoundary: 1 });
    expect(result.cacheReadTokens).toBe(800);
    expect(result.cacheCreationTokens).toBe(0);
  });

  it('uses the code_execution_20260521 tool type when skills/code execution is enabled', async () => {
    await anthropicGenerateRecipe({
      apiKey: 'k',
      model: 'claude-sonnet-5',
      prompt: 'p',
      skillsConfig: { codeExecution: true },
    });
    const body = postJsonWithRetries.mock.calls[0]![0].body;
    expect(body.tools).toEqual([{ type: 'code_execution_20260521', name: 'code_execution' }]);
  });
});
