import { describe, expect, it } from 'vitest';
import { selectToolsForPrompt } from '~/services/ai/internal-assistant-tools.server';

describe('app-aware tool routing', () => {
  it('"explain this app" selects getAppOverview + searchAppDocs', () => {
    const tools = selectToolsForPrompt('Explain this app');
    expect(tools).toContain('getAppOverview');
    expect(tools).toContain('searchAppDocs');
  });

  it('"why did the last publish job fail?" keeps getRecentErrors (docs may accompany, never evict)', () => {
    const tools = selectToolsForPrompt('Why did the last publish job fail?');
    expect(tools).toContain('getRecentErrors');
    expect(tools.length).toBeLessThanOrEqual(3);
  });

  it('"how do plan tiers work?" selects searchAppDocs', () => {
    const tools = selectToolsForPrompt('How do plan tiers work?');
    expect(tools).toContain('searchAppDocs');
  });

  it('"hello" selects no tools', () => {
    expect(selectToolsForPrompt('hello')).toEqual([]);
  });

  it('generation imperative containing a domain word ("release note") stays empty', () => {
    expect(selectToolsForPrompt('Write a clean release note for me')).toEqual([]);
  });

  it('a question with no domain/ops keyword still grounds via the default docs rule', () => {
    const tools = selectToolsForPrompt('Can you tell me about yesterday?');
    expect(tools).toContain('searchAppDocs');
  });

  it('honours the max-3 cap on a crowded prompt', () => {
    const tools = selectToolsForPrompt(
      'Why did the publish job fail? Explain the app architecture, check the db and the logs.',
    );
    expect(tools.length).toBeLessThanOrEqual(3);
    expect(tools).toContain('getRecentErrors');
  });
});
