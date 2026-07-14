import { describe, expect, it } from 'vitest';
import {
  rankTemplates,
  resolveInspectTarget,
  selectToolsForPrompt,
} from '~/services/ai/internal-assistant-tools.server';

describe('rankTemplates (pure ranking + budget)', () => {
  it('ranks cart-upsell templates to the top for a "cart upsell" query', () => {
    const { hits, totalMatches } = rankTemplates('Find me a template for a cart upsell');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(6);
    expect(totalMatches).toBeGreaterThanOrEqual(hits.length);
    // A checkout upsell template should surface near the top.
    expect(hits.some((h) => /upsell/i.test(h.name) || h.type === 'checkout.upsell')).toBe(true);
    // Every hit carries the shape the link card + snapshot rely on.
    for (const h of hits) {
      expect(typeof h.id).toBe('string');
      expect(typeof h.name).toBe('string');
      expect(typeof h.type).toBe('string');
    }
  });

  it('returns nothing for an all-stopword query', () => {
    const { hits, totalMatches } = rankTemplates('find me a template please');
    expect(hits).toEqual([]);
    expect(totalMatches).toBe(0);
  });

  it('honours the top-N limit', () => {
    const { hits } = rankTemplates('discount checkout product order', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
  });

  it('keeps a single searchTemplates payload within ~1200 chars for a broad query', () => {
    const { hits, totalMatches } = rankTemplates('discount checkout product order shipping');
    const payload = JSON.stringify({ query: 'discount checkout product order shipping', totalMatches, results: hits });
    expect(payload.length).toBeLessThanOrEqual(1200);
  });
});

describe('resolveInspectTarget', () => {
  it('resolves a real template by its id token', () => {
    const target = resolveInspectTarget('inspect the recipe CHKU-01 please');
    expect(target?.kind).toBe('template');
    if (target?.kind === 'template') expect(target.template.id).toBe('CHKU-01');
  });

  it('resolves a module cuid to a moduleId target', () => {
    const target = resolveInspectTarget('validate the module cmrezggie001m11h4wulhkams spec');
    expect(target).toEqual({ kind: 'moduleId', id: 'cmrezggie001m11h4wulhkams' });
  });

  it('returns null when there is no id/name signal', () => {
    expect(resolveInspectTarget('tell me about recipes in general')).toBeNull();
  });
});

describe('selectToolsForPrompt — recipe/template + briefing routing', () => {
  it('selects searchTemplates for a template-search prompt', () => {
    expect(selectToolsForPrompt('Find me a template for a cart upsell')).toContain('searchTemplates');
  });

  it('selects inspectRecipe for an inspect-verb recipe prompt', () => {
    expect(selectToolsForPrompt('inspect this recipe CHKU-01')).toContain('inspectRecipe');
  });

  it('selects inspectRecipe for a module keyword + cuid signal', () => {
    expect(selectToolsForPrompt('validate module cmrezggie001m11h4wulhkams')).toContain('inspectRecipe');
  });

  it('does NOT select inspectRecipe for a bare recipe mention without a signal', () => {
    expect(selectToolsForPrompt('how do recipes work in this app?')).not.toContain('inspectRecipe');
  });

  it('routes a morning-briefing prompt to getOpsBriefing and NOT the keyword ops tools', () => {
    const tools = selectToolsForPrompt('Morning briefing');
    expect(tools).toContain('getOpsBriefing');
    expect(tools).not.toContain('getSystemHealth');
    expect(tools).not.toContain('getRecentErrors');
  });

  it('briefing prompt with a "status report" phrasing still routes to briefing, not health', () => {
    const tools = selectToolsForPrompt('give me a status report');
    expect(tools).toContain('getOpsBriefing');
    expect(tools).not.toContain('getSystemHealth');
  });

  it('keeps investigation in slot 0 even for a briefing prompt carrying an explicit target', () => {
    const tools = selectToolsForPrompt('morning briefing for job cmrezggie001m11h4wulhkams');
    expect(tools[0]).toBe('investigateLogEntry');
    expect(tools).toContain('getOpsBriefing');
  });

  it('never exceeds the max-3 window', () => {
    const tools = selectToolsForPrompt(
      'inspect recipe CHKU-01 and find a template and check db health and errors and logs',
    );
    expect(tools.length).toBeLessThanOrEqual(3);
  });
});
