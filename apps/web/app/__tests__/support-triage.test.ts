import { describe, it, expect } from 'vitest';
import { buildTriagePrompt } from '~/services/support/triage.server';

describe('buildTriagePrompt — D4: Maya is disclosed as AI', () => {
  it('does NOT instruct the model to hide that it is AI', () => {
    const { system } = buildTriagePrompt({ shopDomain: 's.myshopify.com', subject: 'x', description: 'y' });
    expect(system.toLowerCase()).not.toMatch(/never mention ai, bots, or automation/);
    expect(system.toLowerCase()).not.toMatch(/friendly human support representative/);
    expect(system.toLowerCase()).toMatch(/maya.*ai|ai.*assistant/);
  });
});
