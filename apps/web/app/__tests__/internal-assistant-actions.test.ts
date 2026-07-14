import { describe, expect, it } from 'vitest';
import {
  ACTION_INTENT_ALLOWLIST,
  MAX_ACTION_PROPOSALS,
  deriveActionProposals,
  isAllowedActionIntent,
  parseStoredActionProposals,
  validateActionProposal,
} from '~/services/ai/internal-assistant-actions.server';
import type { AssistantToolRunResult } from '~/services/ai/internal-assistant-tools.server';

const JOB_ID_A = 'cmrezggie001m11h4wulhkams';
const JOB_ID_B = 'cmrezftuu001k11h4cq5leu8n';
const JOB_ID_C = 'cmrezbmus001811h40hjmvj30';

function investigateFailedJob(id: string, message = 'Error: ensureMetafieldDefinition error'): AssistantToolRunResult {
  return {
    toolName: 'investigateLogEntry',
    ok: true,
    data: {
      found: true,
      entry: { table: 'job', id, status: 'FAILED', message, createdAt: '2026-07-14T00:00:00.000Z' },
    },
  };
}

function jobStatus(input: {
  dlq?: number;
  recentFailed?: Array<{ id: string; type?: string; result?: string }>;
}): AssistantToolRunResult {
  return {
    toolName: 'getJobStatus',
    ok: true,
    data: {
      windowDays: 7,
      byStatus: { FAILED: input.dlq ?? 0 },
      dlqFailedTotal: input.dlq ?? 0,
      recentFailed: input.recentFailed ?? [],
    },
  };
}

describe('deriveActionProposals', () => {
  it('maps an investigated FAILED job to a job_replay proposal carrying the resolved id', () => {
    const proposals = deriveActionProposals([investigateFailedJob(JOB_ID_A, 'boom: publish failed')]);
    expect(proposals).toHaveLength(1);
    const first = proposals[0]!;
    expect(first).toMatchObject({ intent: 'job_replay', params: { id: JOB_ID_A } });
    expect(first.label).toContain('Replay job');
    expect(first.reason).toContain('boom: publish failed');
    expect(first.id).toMatch(/^sap_/);
  });

  it('does NOT propose replay for an investigated job that is not FAILED', () => {
    const running: AssistantToolRunResult = {
      toolName: 'investigateLogEntry',
      ok: true,
      data: { found: true, entry: { table: 'job', id: JOB_ID_A, status: 'RUNNING', message: 'in progress' } },
    };
    expect(deriveActionProposals([running])).toEqual([]);
  });

  it('does NOT propose replay when the investigated entry is not a job (errorLog)', () => {
    const errEntry: AssistantToolRunResult = {
      toolName: 'investigateLogEntry',
      ok: true,
      data: { found: true, entry: { table: 'errorLog', id: JOB_ID_A, level: 'ERROR', message: 'x' } },
    };
    expect(deriveActionProposals([errEntry])).toEqual([]);
  });

  it('maps getJobStatus dlqFailedTotal > 0 to a job_replay_all proposal', () => {
    const proposals = deriveActionProposals([jobStatus({ dlq: 5 })]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!).toMatchObject({ intent: 'job_replay_all', params: {} });
    expect(proposals[0]!.label).toBe('Replay all 5 DLQ jobs');
  });

  it('emits no job_replay_all when dlqFailedTotal is 0', () => {
    expect(deriveActionProposals([jobStatus({ dlq: 0 })])).toEqual([]);
  });

  it('maps up to 2 recentFailed jobs to job_replay proposals', () => {
    const proposals = deriveActionProposals([
      jobStatus({
        dlq: 0,
        recentFailed: [
          { id: JOB_ID_A, type: 'PUBLISH', result: 'fail a' },
          { id: JOB_ID_B, type: 'PUBLISH', result: 'fail b' },
          { id: JOB_ID_C, type: 'PUBLISH', result: 'fail c' },
        ],
      }),
    ]);
    expect(proposals.map((p) => p.params.id)).toEqual([JOB_ID_A, JOB_ID_B]);
  });

  it('dedupes a recentFailed job that duplicates the investigated job', () => {
    const proposals = deriveActionProposals([
      investigateFailedJob(JOB_ID_A),
      jobStatus({ dlq: 0, recentFailed: [{ id: JOB_ID_A, type: 'PUBLISH', result: 'same job' }, { id: JOB_ID_B }] }),
    ]);
    const replayIds = proposals.filter((p) => p.intent === 'job_replay').map((p) => p.params.id);
    expect(replayIds).toEqual([JOB_ID_A, JOB_ID_B]);
    // JOB_ID_A appears exactly once.
    expect(replayIds.filter((id) => id === JOB_ID_A)).toHaveLength(1);
  });

  it('caps output at MAX_ACTION_PROPOSALS keeping the highest-priority ones', () => {
    const proposals = deriveActionProposals([
      investigateFailedJob(JOB_ID_A),
      jobStatus({
        dlq: 9,
        recentFailed: [{ id: JOB_ID_B }, { id: JOB_ID_C }],
      }),
    ]);
    expect(proposals).toHaveLength(MAX_ACTION_PROPOSALS);
    // Investigate (JOB_ID_A) then dlq-all then first recent (JOB_ID_B).
    expect(proposals[0]!).toMatchObject({ intent: 'job_replay', params: { id: JOB_ID_A } });
    expect(proposals[1]!).toMatchObject({ intent: 'job_replay_all' });
    expect(proposals[2]!).toMatchObject({ intent: 'job_replay', params: { id: JOB_ID_B } });
  });

  it('produces nothing for read-only tool results (docs search only)', () => {
    const docs: AssistantToolRunResult = {
      toolName: 'searchAppDocs',
      ok: true,
      data: { available: true, matches: 2, snippets: [] },
    };
    expect(deriveActionProposals([docs])).toEqual([]);
  });

  it('produces nothing from ok:false tool results even if they carry a job id', () => {
    const failed: AssistantToolRunResult = {
      toolName: 'investigateLogEntry',
      ok: false,
      data: { found: true, entry: { table: 'job', id: JOB_ID_A, status: 'FAILED' } },
    };
    const failedStatus: AssistantToolRunResult = {
      toolName: 'getJobStatus',
      ok: false,
      data: { dlqFailedTotal: 4, recentFailed: [{ id: JOB_ID_B }] },
    };
    expect(deriveActionProposals([failed, failedStatus])).toEqual([]);
  });

  it('ignores a malformed/injection-shaped entry id (never derives from junk)', () => {
    const bad: AssistantToolRunResult = {
      toolName: 'investigateLogEntry',
      ok: true,
      data: { found: true, entry: { table: 'job', id: '../etc/passwd', status: 'FAILED' } },
    };
    expect(deriveActionProposals([bad])).toEqual([]);
  });

  it('returns [] for empty input', () => {
    expect(deriveActionProposals([])).toEqual([]);
  });
});

describe('validateActionProposal (allowlist enforcement)', () => {
  const good = { id: 'sap_x', intent: 'job_replay', params: { id: JOB_ID_A }, label: 'Replay', reason: 'r' };

  it('accepts a well-formed allowlisted proposal', () => {
    expect(validateActionProposal(good)).toBe(true);
  });

  it('rejects an unknown intent', () => {
    expect(validateActionProposal({ ...good, intent: 'drop_table' })).toBe(false);
    expect(isAllowedActionIntent('drop_table')).toBe(false);
    expect(isAllowedActionIntent('job_replay')).toBe(true);
  });

  it('rejects job_replay with a missing id', () => {
    expect(validateActionProposal({ ...good, params: {} })).toBe(false);
  });

  it('rejects job_replay with a malformed id', () => {
    expect(validateActionProposal({ ...good, params: { id: 'has space' } })).toBe(false);
    expect(validateActionProposal({ ...good, params: { id: '../secret' } })).toBe(false);
  });

  it('rejects unexpected extra params (tamper resistance)', () => {
    expect(validateActionProposal({ ...good, params: { id: JOB_ID_A, evil: 'x' } })).toBe(false);
  });

  it('rejects non-string param values', () => {
    expect(validateActionProposal({ ...good, params: { id: 123 } })).toBe(false);
  });

  it('accepts job_replay_all with empty params but rejects it with an id', () => {
    expect(validateActionProposal({ ...good, intent: 'job_replay_all', params: {} })).toBe(true);
    expect(validateActionProposal({ ...good, intent: 'job_replay_all', params: { id: JOB_ID_A } })).toBe(false);
  });

  it('rejects non-object / missing fields', () => {
    expect(validateActionProposal(null)).toBe(false);
    expect(validateActionProposal('job_replay')).toBe(false);
    expect(validateActionProposal({ intent: 'job_replay' })).toBe(false);
  });

  it('every allowlisted intent maps to a real /internal/ops intent', () => {
    // Guards against drift: the ops route only handles these intents.
    const opsIntents = new Set([
      'publish', 'rollback', 'flow_pause', 'flow_resume', 'flow_run',
      'connector_test', 'connector_save', 'connector_delete', 'job_replay', 'job_replay_all',
    ]);
    for (const intent of Object.keys(ACTION_INTENT_ALLOWLIST)) {
      expect(opsIntents.has(intent)).toBe(true);
    }
  });
});

describe('parseStoredActionProposals', () => {
  it('parses and validates a persisted JSON string, dropping tampered entries', () => {
    const stored = JSON.stringify([
      { id: 'sap_a', intent: 'job_replay', params: { id: JOB_ID_A }, label: 'Replay', reason: 'r' },
      { id: 'sap_evil', intent: 'rm_rf', params: {}, label: 'Nuke', reason: 'r' },
    ]);
    const parsed = parseStoredActionProposals(stored);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.intent).toBe('job_replay');
  });

  it('returns [] for null, empty, or malformed JSON', () => {
    expect(parseStoredActionProposals(null)).toEqual([]);
    expect(parseStoredActionProposals('')).toEqual([]);
    expect(parseStoredActionProposals('{not json')).toEqual([]);
  });

  it('caps a stored array at MAX_ACTION_PROPOSALS', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `sap_${i}`,
      intent: 'job_replay',
      params: { id: `cmrezggie001m11h4wulhka${String(i).padStart(2, '0')}` },
      label: 'Replay',
      reason: 'r',
    }));
    expect(parseStoredActionProposals(JSON.stringify(many))).toHaveLength(MAX_ACTION_PROPOSALS);
  });
});
