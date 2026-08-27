/**
 * WS-C Task 12. Truncation detection at the provider-client layer, using the
 * REAL `anthropicGenerateRecipe`/`openAiGenerateRecipe` implementations with
 * only their HTTP layer (`postJsonWithRetries`) mocked — kept in its own
 * file (not `hydrate-hardening.test.ts`) because that file needs
 * `anthropicGenerateRecipe` to be a STUBBED module for the `hydrateRecipeSpec`
 * retry/billing tests, and vitest's `vi.mock` is file-scoped (same reasoning
 * `hydrate-billing-dedupe.test.ts` documents at its own file split).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({ postJsonWithRetries: vi.fn() }));
vi.mock('~/services/ai/http/ai-http.server', () => ({
  postJsonWithRetries: hoisted.postJsonWithRetries,
}));

import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';
import { openAiGenerateRecipe } from '~/services/ai/clients/openai-responses.client.server';
import { TruncatedOutputError } from '~/services/ai/clients/truncation.server';

beforeEach(() => {
  hoisted.postJsonWithRetries.mockReset();
});

describe('anthropicGenerateRecipe: stop_reason=max_tokens throws TruncatedOutputError (WS-C Task 12)', () => {
  it('throws TruncatedOutputError before extraction when stop_reason is max_tokens', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"incomple' }] },
      meta: {},
    });

    await expect(
      anthropicGenerateRecipe({ apiKey: 'sk-test', model: 'claude-sonnet-4-6', prompt: 'p' }),
    ).rejects.toBeInstanceOf(TruncatedOutputError);
  });

  it('a max_tokens stop on a forced tool_use (structured output) call also throws before extraction', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: { stop_reason: 'max_tokens', content: [{ type: 'tool_use', input: { partial: true } }] },
      meta: {},
    });

    await expect(
      anthropicGenerateRecipe({
        apiKey: 'sk-test',
        model: 'claude-sonnet-4-6',
        prompt: 'p',
        responseSchema: { name: 'emit_hydrate_envelope', schema: { type: 'object' } },
      }),
    ).rejects.toBeInstanceOf(TruncatedOutputError);
  });

  it('a normal stop_reason (end_turn) does not throw and extracts text as before', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":1}' }], usage: {} },
      meta: {},
    });

    const result = await anthropicGenerateRecipe({ apiKey: 'sk-test', model: 'claude-sonnet-4-6', prompt: 'p' });
    expect(result.rawJson).toBe('{"a":1}');
  });
});

describe('openAiGenerateRecipe: incomplete status throws TruncatedOutputError (WS-C Task 12)', () => {
  it('a top-level incomplete status throws TruncatedOutputError', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] },
      meta: {},
    });

    await expect(
      openAiGenerateRecipe({ apiKey: 'sk-test', model: 'gpt-4o-mini', prompt: 'p' }),
    ).rejects.toBeInstanceOf(TruncatedOutputError);
  });

  it('a message-level incomplete status throws TruncatedOutputError', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: {
        output: [{ type: 'message', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, content: [] }],
      },
      meta: {},
    });

    await expect(
      openAiGenerateRecipe({ apiKey: 'sk-test', model: 'gpt-4o-mini', prompt: 'p' }),
    ).rejects.toBeInstanceOf(TruncatedOutputError);
  });

  it('a complete response does not throw and extracts output_text as before', async () => {
    hoisted.postJsonWithRetries.mockResolvedValue({
      json: {
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"a":1}' }] }],
        usage: {},
      },
      meta: {},
    });

    const result = await openAiGenerateRecipe({ apiKey: 'sk-test', model: 'gpt-4o-mini', prompt: 'p' });
    expect(result.rawJson).toBe('{"a":1}');
  });
});
