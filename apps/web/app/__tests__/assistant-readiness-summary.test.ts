import { describe, expect, it } from 'vitest';
import { buildAssistantReadinessSummary } from '~/services/ai/assistant-readiness-summary';

describe('buildAssistantReadinessSummary', () => {
  it('reports active local readiness with cloud standby details', () => {
    const summary = buildAssistantReadinessSummary({
      activeTarget: 'localMachine',
      assistantLocalOnly: false,
      probes: {
        localMachine: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: { ok: true, message: 'chat endpoint accepted' },
        },
        modalRemote: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: { ok: false, message: 'chat endpoint missing' },
        },
      },
    });
    expect(summary.tone).toBe('good');
    expect(summary.headline).toBe('Local ready');
    expect(summary.detail).toBe('Connected and ready for prompts.');
    expect(summary.diagnostics.active).toEqual({
      health: 'healthz ok (200)',
      chat: 'chat endpoint accepted',
    });
    expect(summary.standby?.target).toBe('modalRemote');
  });

  it('flags active cloud chat as blocked', () => {
    const summary = buildAssistantReadinessSummary({
      activeTarget: 'modalRemote',
      assistantLocalOnly: false,
      probes: {
        localMachine: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: { ok: true, message: 'chat endpoint accepted' },
        },
        modalRemote: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: { ok: false, message: 'chat endpoint missing' },
        },
      },
    });
    expect(summary.tone).toBe('warn');
    expect(summary.headline).toBe('Cloud chat blocked');
    expect(summary.detail).toBe('Connection is up, but chat is not ready.');
  });

  it('suppresses standby summary while local-only guardrail is enabled', () => {
    const summary = buildAssistantReadinessSummary({
      activeTarget: 'localMachine',
      assistantLocalOnly: true,
      probes: {
        localMachine: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: { ok: true, message: 'chat endpoint accepted' },
        },
        modalRemote: {
          health: { ok: false, message: 'unreachable' },
          chatProbe: { ok: false, message: 'disabled' },
        },
      },
    });
    expect(summary.standby).toBeUndefined();
    expect(summary.headline).toBe('Local ready');
  });

  it('keeps verbose probe diagnostics out of primary summary copy', () => {
    const summary = buildAssistantReadinessSummary({
      activeTarget: 'localMachine',
      assistantLocalOnly: false,
      probes: {
        localMachine: {
          health: { ok: true, message: 'healthz ok (200)' },
          chatProbe: {
            ok: false,
            message: 'localMachine chat endpoint accepted (/v1/chat/completions 502)',
          },
        },
        modalRemote: {
          health: { ok: false, message: 'upstream timeout' },
          chatProbe: { ok: false, message: 'chat unavailable' },
        },
      },
    });

    expect(summary.detail).toBe('Connection is up, but chat is not ready.');
    expect(summary.detail).not.toContain('healthz ok');
    expect(summary.detail).not.toContain('/v1/chat/completions');
    expect(summary.diagnostics.active.chat).toContain('/v1/chat/completions');
  });
});
