import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '@superapp/core';
import {
  applyMergePatch,
  compileDeltaPrompt,
  generateRecipeViaDelta,
} from '~/services/ai/template-delta.server';
import type { GenerateHints, GenerateResult, LlmClient } from '~/services/ai/llm.server';
import { TruncatedOutputError } from '~/services/ai/clients/truncation.server';

/** A valid theme.section RecipeSpec used as the Tier-1 template starting point. */
const TEMPLATE = {
  type: 'theme.section',
  name: 'Stub Banner',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'banner', activation: 'section', fields: { heading: 'Hello', enableAnimation: false }, blocks: [] },
};
const TEMPLATE_JSON = JSON.stringify(TEMPLATE);

/** Replays a fixed sequence of raw JSON responses; the last is reused if exhausted. */
class SequenceLlmClient implements LlmClient {
  public prompts: string[] = [];
  private calls = 0;
  constructor(private readonly responses: string[]) {}
  async generateRecipe(prompt: string): Promise<GenerateResult> {
    this.prompts.push(prompt);
    const rawJson = this.responses[Math.min(this.calls, this.responses.length - 1)] ?? '';
    this.calls += 1;
    return { rawJson, tokensIn: 10, tokensOut: 20, model: 'stub', servedProviderId: null };
  }
}

describe('applyMergePatch (RFC 7386)', () => {
  it('merges objects recursively without mutating the target', () => {
    const target = { a: 1, nested: { keep: 'x', change: 'old' } };
    const out = applyMergePatch(target, { b: 2, nested: { change: 'new' } });
    expect(out).toEqual({ a: 1, b: 2, nested: { keep: 'x', change: 'new' } });
    // Target untouched (pure).
    expect(target).toEqual({ a: 1, nested: { keep: 'x', change: 'old' } });
  });

  it('deletes a key when the patch value is null', () => {
    const out = applyMergePatch({ a: 1, drop: 'gone', nested: { x: 1, y: 2 } }, { drop: null, nested: { y: null } });
    expect(out).toEqual({ a: 1, nested: { x: 1 } });
  });

  it('replaces arrays wholesale (no element-wise merge)', () => {
    const out = applyMergePatch({ list: [1, 2, 3, 4] }, { list: [9] });
    expect(out).toEqual({ list: [9] });
  });

  it('replaces primitives and coerces a non-object target to {} when the patch is an object', () => {
    expect(applyMergePatch({ a: 1 }, 'scalar')).toBe('scalar');
    expect(applyMergePatch('was-a-string', { a: 1 })).toEqual({ a: 1 });
    expect(applyMergePatch({ a: 1 }, null)).toBeNull();
  });
});

describe('compileDeltaPrompt', () => {
  const prompt = compileDeltaPrompt({
    templateSpecJson: TEMPLATE_JSON,
    moduleType: 'theme.section',
    userRequest: 'A summer sale banner in bright orange',
    approachHint: 'Approach: prioritize trust and clarity.',
  });

  it('embeds the template JSON as the starting point', () => {
    expect(prompt).toContain(TEMPLATE_JSON);
  });

  it('instructs the model to output a JSON merge patch and pins the type', () => {
    expect(prompt).toContain('JSON Merge Patch');
    expect(prompt).toContain('"type" field MUST NOT change');
    expect(prompt).toContain('"theme.section"');
    expect(prompt).toContain('"patch"');
  });

  it('includes the (wrapped) user request and the approach hint', () => {
    expect(prompt).toContain('A summer sale banner in bright orange');
    expect(prompt).toContain('prioritize trust and clarity');
  });
});

describe('generateRecipeViaDelta', () => {
  it('happy path: applies the patch, adapts content, and preserves untouched fields', async () => {
    const client = new SequenceLlmClient([
      JSON.stringify({ explanation: 'Adapted to summer sale', patch: { name: 'Summer Sale Banner', config: { fields: { heading: 'Summer Sale' } } } }),
    ]);
    const { recipe, explanation, generationMode } = await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'summer sale banner',
      maxTokens: 1200,
    });
    expect(generationMode).toBe('delta');
    expect(explanation).toBe('Adapted to summer sale');
    expect(recipe.name).toBe('Summer Sale Banner');
    const config = (recipe as { config: { fields: Record<string, unknown> } }).config;
    expect(config.fields.heading).toBe('Summer Sale');
    // Untouched template fields survive the merge.
    expect(config.fields.enableAnimation).toBe(false);
    // Exactly one LLM call for a clean patch.
    expect(client.prompts).toHaveLength(1);
  });

  it('forces the module type back even when the patch tries to change it', async () => {
    const client = new SequenceLlmClient([
      JSON.stringify({ patch: { type: 'proxy.widget', name: 'Sneaky Rename' } }),
    ]);
    const { recipe } = await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'rename it',
      maxTokens: 1200,
    });
    expect(recipe.type).toBe('theme.section');
    expect(recipe.name).toBe('Sneaky Rename');
  });

  it('routes an invalid patched recipe through the shared repair loop', async () => {
    const repaired = { ...TEMPLATE, name: 'Repaired Banner' };
    const client = new SequenceLlmClient([
      // Patch makes config a non-object → fails Zod, unrepairable by heuristics.
      JSON.stringify({ patch: { config: 'not-an-object' } }),
      // The repair prompt returns a valid, wrapped recipe.
      JSON.stringify({ recipe: repaired }),
    ]);
    const { recipe } = await generateRecipeViaDelta({
      client,
      templateSpecJson: TEMPLATE_JSON,
      moduleType: 'theme.section',
      userRequest: 'fix it',
      maxTokens: 1200,
    });
    expect(recipe.name).toBe('Repaired Banner');
    expect(RecipeSpecSchema.safeParse(recipe).success).toBe(true);
    // Delta call + one repair call.
    expect(client.prompts).toHaveLength(2);
  });

  it('throws on non-JSON output so the caller can fall back to freeform', async () => {
    const client = new SequenceLlmClient(['this is not json']);
    await expect(
      generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'x',
        maxTokens: 1200,
      }),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it('throws when the patch does not yield an object recipe (e.g. null patch)', async () => {
    const client = new SequenceLlmClient([JSON.stringify({ patch: null })]);
    await expect(
      generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'x',
        maxTokens: 1200,
      }),
    ).rejects.toThrow(/did not yield an object/i);
  });

  describe('truncation retry (mirrors hydrate\'s WS-C Task 12 budget-bump)', () => {
    /** Throws TruncatedOutputError on the first N calls, then replays `responses`. Records the maxTokens hint per call. */
    class TruncatingLlmClient implements LlmClient {
      public prompts: string[] = [];
      public maxTokensPerCall: Array<number | undefined> = [];
      private calls = 0;
      constructor(
        private readonly truncateFirstNCalls: number,
        private readonly responses: string[],
      ) {}
      async generateRecipe(prompt: string, hints?: GenerateHints): Promise<GenerateResult> {
        this.prompts.push(prompt);
        this.maxTokensPerCall.push(hints?.maxTokens);
        const callIndex = this.calls;
        this.calls += 1;
        if (callIndex < this.truncateFirstNCalls) {
          throw new TruncatedOutputError('Anthropic', 'stop_reason=max_tokens');
        }
        const rawJson = this.responses[Math.min(callIndex - this.truncateFirstNCalls, this.responses.length - 1)] ?? '';
        return { rawJson, tokensIn: 10, tokensOut: 20, model: 'stub', servedProviderId: null };
      }
    }

    it('retries once with a bumped budget after a truncation, then succeeds', async () => {
      const client = new TruncatingLlmClient(1, [
        JSON.stringify({ explanation: 'Adapted after retry', patch: { name: 'Retried Banner' } }),
      ]);
      const { recipe, explanation, generationMode } = await generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'summer sale banner',
        maxTokens: 1200,
      });
      expect(generationMode).toBe('delta');
      expect(explanation).toBe('Adapted after retry');
      expect(recipe.name).toBe('Retried Banner');
      // Exactly 2 calls: the truncated attempt + the bumped retry.
      expect(client.prompts).toHaveLength(2);
      // The retry asked for MORE room than the initial attempt.
      expect(client.maxTokensPerCall[0]).toBe(1200);
      expect(client.maxTokensPerCall[1]).toBeGreaterThan(1200);
    });

    it('gives up and rethrows (so the caller falls back to freeform) when the retry ALSO truncates', async () => {
      const client = new TruncatingLlmClient(2, []);
      await expect(
        generateRecipeViaDelta({
          client,
          templateSpecJson: TEMPLATE_JSON,
          moduleType: 'theme.section',
          userRequest: 'x',
          maxTokens: 1200,
        }),
      ).rejects.toThrow(TruncatedOutputError);
      // Only ONE retry is attempted — never a third call.
      expect(client.prompts).toHaveLength(2);
    });

    it('does not retry on a non-truncation error', async () => {
      class FailOnceClient implements LlmClient {
        public prompts: string[] = [];
        async generateRecipe(prompt: string): Promise<GenerateResult> {
          this.prompts.push(prompt);
          throw new Error('network blip');
        }
      }
      const client = new FailOnceClient();
      await expect(
        generateRecipeViaDelta({
          client,
          templateSpecJson: TEMPLATE_JSON,
          moduleType: 'theme.section',
          userRequest: 'x',
          maxTokens: 1200,
        }),
      ).rejects.toThrow('network blip');
      expect(client.prompts).toHaveLength(1);
    });

    it('the retry is invisible to billing: generateRecipeViaDelta never records AI usage itself, and the returned result carries only the successful call\'s tokens (the truncated attempt contributes none, matching provider clients which throw before usage is known)', async () => {
      const client = new TruncatingLlmClient(1, [
        JSON.stringify({ explanation: 'ok', patch: { name: 'Billed Once' } }),
      ]);
      const { result } = await generateRecipeViaDelta({
        client,
        templateSpecJson: TEMPLATE_JSON,
        moduleType: 'theme.section',
        userRequest: 'x',
        maxTokens: 1200,
      });
      // Only the successful (second) call's usage is reflected — 10/20, not
      // doubled or summed with a phantom first-call cost. The caller
      // (produceOptionRecipe / the option-level recordAiUsage in llm.server.ts)
      // bills exactly ONE billable unit per option off of this single result,
      // regardless of how many attempts generateRecipeViaDelta made internally.
      expect(result.tokensIn).toBe(10);
      expect(result.tokensOut).toBe(20);
    });
  });
});
