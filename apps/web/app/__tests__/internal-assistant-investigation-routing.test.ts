import { describe, expect, it } from 'vitest';
import {
  extractInvestigationTarget,
  selectToolsForPrompt,
} from '~/services/ai/internal-assistant-tools.server';

describe('extractInvestigationTarget', () => {
  it('extracts an embedded cuid entity id', () => {
    const target = extractInvestigationTarget('why did job cmrezggie001m11h4wulhkams fail?');
    expect(target).toEqual({ kind: 'id', id: 'cmrezggie001m11h4wulhkams' });
  });

  it('extracts a corr_/req_ correlation token (generateCorrelationId shape)', () => {
    const target = extractInvestigationTarget('trace corr_0a1b2c3d4e5f6071 please');
    expect(target).toEqual({ kind: 'correlation', correlationId: 'corr_0a1b2c3d4e5f6071' });
  });

  it('extracts a UUID correlation token (real propagated shape)', () => {
    const target = extractInvestigationTarget(
      'what happened in 04bfce6d-305a-41ce-9171-e315754f6c74?',
    );
    expect(target).toEqual({
      kind: 'correlation',
      correlationId: '04bfce6d-305a-41ce-9171-e315754f6c74',
    });
  });

  it('resolves latest-error phrasing to the latest sentinel', () => {
    expect(extractInvestigationTarget('investigate the latest error')).toEqual({ kind: 'latest' });
    expect(extractInvestigationTarget('why did the most recent job fail?')).toEqual({
      kind: 'latest',
    });
  });

  it('returns null for unrelated prompts', () => {
    expect(extractInvestigationTarget('hello there')).toBeNull();
    expect(extractInvestigationTarget('How do plan tiers work?')).toBeNull();
    expect(extractInvestigationTarget('Write a clean release note for me')).toBeNull();
  });
});

describe('investigation-aware tool routing', () => {
  it('"why did job <id> fail?" selects investigateLogEntry FIRST + getJobStatus', () => {
    const tools = selectToolsForPrompt('why did job cmrezggie001m11h4wulhkams fail?');
    expect(tools[0]).toBe('investigateLogEntry');
    expect(tools).toContain('getJobStatus');
    expect(tools.length).toBeLessThanOrEqual(3);
  });

  it('"investigate the latest error" selects investigateLogEntry', () => {
    const tools = selectToolsForPrompt('investigate the latest error');
    expect(tools).toContain('investigateLogEntry');
    expect(tools[0]).toBe('investigateLogEntry');
  });

  it('"how are webhooks doing?" selects getWebhookStatus', () => {
    const tools = selectToolsForPrompt('how are webhooks doing?');
    expect(tools).toContain('getWebhookStatus');
  });

  it('"show me recent activity and audit events" selects getActivityEvents', () => {
    const tools = selectToolsForPrompt('show me recent activity and audit events');
    expect(tools).toContain('getActivityEvents');
  });

  it('investigateLogEntry is never evicted by the max-3 cap', () => {
    const tools = selectToolsForPrompt(
      'why did job cmrezggie001m11h4wulhkams fail? check the db, the logs, webhooks and audit activity',
    );
    expect(tools[0]).toBe('investigateLogEntry');
    expect(tools.length).toBeLessThanOrEqual(3);
  });
});
