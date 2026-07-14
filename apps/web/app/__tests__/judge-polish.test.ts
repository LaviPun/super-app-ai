import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema, type RecipeSpec } from '@superapp/core';
import type { GenerateHints, GenerateResult, LlmClient } from '~/services/ai/llm.server';
import {
  applyAndValidatePolish,
  compileJudgePolishPrompt,
  extractRenderedText,
  isJudgePolishEnabled,
  judgeAndPolishOption,
  polishIsNotWorse,
  sanitizePolishPatch,
} from '~/services/ai/judge-polish.server';

/** A valid theme.section RecipeSpec used as the option under judgement. */
const RECIPE: RecipeSpec = RecipeSpecSchema.parse({
  type: 'theme.section',
  name: 'Summer Banner',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'banner', activation: 'section', fields: { heading: 'Hello', enableAnimation: false }, blocks: [] },
});

/** Replays fixed raw-JSON responses; records prompts + call count. */
class MockClient implements LlmClient {
  public prompts: string[] = [];
  public calls = 0;
  constructor(private readonly responses: string[]) {}
  async generateRecipe(prompt: string, _hints?: GenerateHints): Promise<GenerateResult> {
    this.prompts.push(prompt);
    const rawJson = this.responses[Math.min(this.calls, this.responses.length - 1)] ?? '';
    this.calls += 1;
    return { rawJson, tokensIn: 11, tokensOut: 22, model: 'mock-cheap', servedProviderId: null };
  }
}

/** A client that resolves only after `delayMs` — used to exercise the timeout. */
class SlowClient implements LlmClient {
  constructor(private readonly delayMs: number, private readonly response: string) {}
  async generateRecipe(): Promise<GenerateResult> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return { rawJson: this.response, tokensIn: 1, tokensOut: 1, model: 'slow', servedProviderId: null };
  }
}

describe('isJudgePolishEnabled', () => {
  it('defaults OFF and only turns on for truthy values', () => {
    const prev = process.env.JUDGE_POLISH_ENABLED;
    try {
      delete process.env.JUDGE_POLISH_ENABLED;
      expect(isJudgePolishEnabled()).toBe(false);
      process.env.JUDGE_POLISH_ENABLED = 'false';
      expect(isJudgePolishEnabled()).toBe(false);
      process.env.JUDGE_POLISH_ENABLED = '1';
      expect(isJudgePolishEnabled()).toBe(true);
      process.env.JUDGE_POLISH_ENABLED = 'on';
      expect(isJudgePolishEnabled()).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.JUDGE_POLISH_ENABLED;
      else process.env.JUDGE_POLISH_ENABLED = prev;
    }
  });
});

describe('compileJudgePolishPrompt', () => {
  it('embeds the recipe JSON, the user request, and the 0-100 rubric', () => {
    const prompt = compileJudgePolishPrompt({ userRequest: 'a bright summer sale banner', recipe: RECIPE });
    expect(prompt).toContain('Summer Banner');
    expect(prompt).toContain('bright summer sale banner');
    expect(prompt).toContain('0-100');
    expect(prompt).toContain('suggestedPatch');
  });

  it('includes rendered storefront copy when provided', () => {
    const prompt = compileJudgePolishPrompt({ userRequest: 'x', recipe: RECIPE, renderedText: 'RENDERED-COPY-TOKEN' });
    expect(prompt).toContain('RENDERED-COPY-TOKEN');
  });
});

describe('sanitizePolishPatch', () => {
  it('keeps only name/config and drops structural/capability keys', () => {
    const out = sanitizePolishPatch({
      type: 'proxy.widget',
      category: 'FUNCTION',
      requires: ['APP_PROXY'],
      name: 'New Name',
      config: { fields: { heading: 'Hi' } },
    });
    expect(out).toEqual({ name: 'New Name', config: { fields: { heading: 'Hi' } } });
  });

  it('returns null when nothing allowed remains, or the patch is not an object', () => {
    expect(sanitizePolishPatch({ type: 'proxy.widget' })).toBeNull();
    expect(sanitizePolishPatch(null)).toBeNull();
    expect(sanitizePolishPatch('nope')).toBeNull();
    expect(sanitizePolishPatch([1, 2])).toBeNull();
  });
});

describe('applyAndValidatePolish', () => {
  it('applies a copy patch, pins the type, and returns a valid recipe', () => {
    const out = applyAndValidatePolish(RECIPE, { config: { fields: { heading: 'Refined Heading' } } });
    expect(out).not.toBeNull();
    expect(out!.type).toBe('theme.section');
    expect((out as any).config.fields.heading).toBe('Refined Heading');
    // Untouched fields survive the merge.
    expect((out as any).config.fields.enableAnimation).toBe(false);
  });

  it('drops (returns null for) a patch that produces an invalid recipe', () => {
    // config coerced to a primitive → fails schema, unrepairable by heuristics.
    expect(applyAndValidatePolish(RECIPE, { config: 'not-an-object' })).toBeNull();
  });
});

describe('polishIsNotWorse', () => {
  it('accepts an identical/score-neutral copy polish (>= guard)', () => {
    const polished = applyAndValidatePolish(RECIPE, { config: { fields: { heading: 'Tighter Headline' } } })!;
    expect(polishIsNotWorse(RECIPE, polished)).toBe(true);
  });

  it('rejects a patch whose recipe ranks strictly worse', () => {
    // A schema-invalid "patched" recipe scores worse under the deterministic
    // ranker (verifyPenalty), so the guard refuses to push it.
    const worse = { name: 'broken' } as unknown as RecipeSpec; // missing type/category
    expect(polishIsNotWorse(RECIPE, worse)).toBe(false);
  });
});

describe('extractRenderedText', () => {
  it('returns "" for non-storefront types', () => {
    const fn = RecipeSpecSchema.parse({
      type: 'functions.discountRules',
      name: 'Disc',
      category: 'FUNCTION',
      requires: ['DISCOUNT_FUNCTION'],
      config: { rules: [{ when: { minSubtotal: 10 }, apply: { percentageOff: 5 } }], combineWithOtherDiscounts: true },
    });
    expect(extractRenderedText(fn)).toBe('');
  });
});

describe('judgeAndPolishOption', () => {
  it('parses the score + dimensions (no patch) and surfaces raw usage', async () => {
    const client = new MockClient([JSON.stringify({ score: 82, dimensions: { relevance: 90, design: 70 } })]);
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'a banner', timeoutMs: 2000 });
    expect(res).not.toBeNull();
    expect(res!.score).toBe(82);
    expect(res!.dimensions).toEqual({ relevance: 90, design: 70 });
    expect(res!.patchedRecipe).toBeUndefined();
    expect(res!.raw?.tokensOut).toBe(22);
    // Exactly one judge call.
    expect(client.calls).toBe(1);
  });

  it('validates + applies a safe patch → patchedRecipe present', async () => {
    const client = new MockClient([
      JSON.stringify({ score: 88, suggestedPatch: { config: { fields: { heading: 'Bright Summer Sale' } } } }),
    ]);
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'summer sale banner', timeoutMs: 2000 });
    expect(res!.score).toBe(88);
    expect(res!.patchedRecipe).toBeDefined();
    expect((res!.patchedRecipe as any).config.fields.heading).toBe('Bright Summer Sale');
    expect(res!.patch).toEqual({ config: { fields: { heading: 'Bright Summer Sale' } } });
  });

  it('drops an invalid patch but still returns the score', async () => {
    const client = new MockClient([JSON.stringify({ score: 60, suggestedPatch: { config: 'not-an-object' } })]);
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'x', timeoutMs: 2000 });
    expect(res!.score).toBe(60);
    expect(res!.patchedRecipe).toBeUndefined();
    expect(res!.patch).toBeUndefined();
  });

  it('strips a disallowed (type-changing) patch before it can apply', async () => {
    const client = new MockClient([JSON.stringify({ score: 75, suggestedPatch: { type: 'proxy.widget' } })]);
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'x', timeoutMs: 2000 });
    expect(res!.score).toBe(75);
    expect(res!.patchedRecipe).toBeUndefined();
  });

  it('returns raw (for usage) but no score when the judge output is unparseable', async () => {
    const client = new MockClient(['this is not json']);
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'x', timeoutMs: 2000 });
    expect(res).not.toBeNull();
    expect(res!.score).toBeUndefined();
    expect(res!.raw?.tokensIn).toBe(11);
  });

  it('returns null on timeout (nothing to score or bill)', async () => {
    const client = new SlowClient(200, JSON.stringify({ score: 99 }));
    const res = await judgeAndPolishOption(RECIPE, { client, userRequest: 'x', timeoutMs: 10 });
    expect(res).toBeNull();
  });
});
