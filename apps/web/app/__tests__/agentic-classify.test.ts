import { describe, it, expect } from 'vitest';
import { classifyUserIntentKeywords } from '~/services/ai/classify.server';

/**
 * M13 — the classifier routes AI-channel / product-feed prompts to
 * agentic.catalogProfile (CLASSIFICATION_RULES keyword rule).
 */
describe('agentic.catalogProfile classification (M13)', () => {
  it('routes "make my catalog discoverable in ChatGPT shopping"', () => {
    const r = classifyUserIntentKeywords('Make my catalog discoverable in ChatGPT shopping');
    expect(r.moduleType).toBe('agentic.catalogProfile');
  });

  it('routes "optimize my products for AI channels with a product feed"', () => {
    const r = classifyUserIntentKeywords('Optimize my products for AI channels with a product feed');
    expect(r.moduleType).toBe('agentic.catalogProfile');
  });

  it('routes "agentic commerce catalog syndication"', () => {
    const r = classifyUserIntentKeywords('Set up agentic commerce catalog syndication');
    expect(r.moduleType).toBe('agentic.catalogProfile');
  });
});
