import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createSessionMock,
  createMemoryMock,
  updateMemoryMock,
  deleteSessionMock,
  deleteMemoryMock,
  getSessionMock,
  findUserMessageByRequestMock,
  createMessageMock,
  requireInternalAdminMock,
  isInternalAiLocalOnlyEnabledMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(async (input?: { mode?: string }) => ({
    id: 'sess-created-1',
    mode: input?.mode ?? 'localMachine',
  })),
  createMemoryMock: vi.fn(async () => ({
    id: 'memory-1',
  })),
  updateMemoryMock: vi.fn(async () => ({
    id: 'memory-1',
  })),
  deleteSessionMock: vi.fn(async () => undefined),
  deleteMemoryMock: vi.fn(async () => undefined),
  getSessionMock: vi.fn(async () => null),
  findUserMessageByRequestMock: vi.fn(async () => null),
  createMessageMock: vi.fn(async () => ({ id: 'msg-1' })),
  requireInternalAdminMock: vi.fn(async () => undefined),
  isInternalAiLocalOnlyEnabledMock: vi.fn(() => false),
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/ai/internal-ai-local-only', () => ({
  isInternalAiLocalOnlyEnabledFromEnv: () => isInternalAiLocalOnlyEnabledMock(),
}));

vi.mock('~/services/ai/internal-assistant-store.server', () => ({
  InternalAssistantStoreService: class {
    createSession = createSessionMock;
    updateSession = vi.fn();
    deleteSession = deleteSessionMock;
    createMemory = createMemoryMock;
    updateMemory = updateMemoryMock;
    deleteMemory = deleteMemoryMock;
    getSession = getSessionMock;
    listSessions = vi.fn();
    listMessages = vi.fn();
    listMemories = vi.fn();
    findUserMessageByRequest = findUserMessageByRequestMock;
    createMessage = createMessageMock;
  },
}));

function makeFormRequest(body: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    form.set(key, value);
  }
  return new Request('http://test/internal/ai-assistant', { method: 'POST', body: form });
}

describe('session action FormData helpers', () => {
  it('buildCreateSessionFormData sets intent and default mode', async () => {
    const { buildCreateSessionFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildCreateSessionFormData();
    expect(fd.get('intent')).toBe('createSession');
    expect(fd.get('mode')).toBe('localMachine');
  });

  it('buildCreateSessionFormData respects modal mode', async () => {
    const { buildCreateSessionFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildCreateSessionFormData('modalRemote');
    expect(fd.get('mode')).toBe('modalRemote');
  });

  it('buildDeleteSessionFormData sets intent and sessionId', async () => {
    const { buildDeleteSessionFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildDeleteSessionFormData('sess-xyz');
    expect(fd.get('intent')).toBe('deleteSession');
    expect(fd.get('sessionId')).toBe('sess-xyz');
  });

  it('buildUpdateSessionModeFormData sets updateSession fields', async () => {
    const { buildUpdateSessionModeFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildUpdateSessionModeFormData('s1', 'localMachine');
    expect(fd.get('intent')).toBe('updateSession');
    expect(fd.get('sessionId')).toBe('s1');
    expect(fd.get('mode')).toBe('localMachine');
  });

  it('buildUpdateSessionMemoryFormData sets memoryEnabled string', async () => {
    const { buildUpdateSessionMemoryFormData } = await import('~/routes/internal.ai-assistant');
    const fdOff = buildUpdateSessionMemoryFormData('s2', false);
    expect(fdOff.get('memoryEnabled')).toBe('false');
    const fdOn = buildUpdateSessionMemoryFormData('s2', true);
    expect(fdOn.get('memoryEnabled')).toBe('true');
  });

  it('buildCreateMemoryFormData sets memory intent fields', async () => {
    const { buildCreateMemoryFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildCreateMemoryFormData({
      title: 'Ops policy',
      content: 'Always check probes first.',
      tags: 'ops,runbook',
      isEnabled: false,
    });
    expect(fd.get('intent')).toBe('createMemory');
    expect(fd.get('title')).toBe('Ops policy');
    expect(fd.get('content')).toBe('Always check probes first.');
    expect(fd.get('tags')).toBe('ops,runbook');
    expect(fd.get('isEnabled')).toBe('false');
  });

  it('buildUpdateMemoryFormData sets update payload', async () => {
    const { buildUpdateMemoryFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildUpdateMemoryFormData('memory-1', {
      title: 'Updated',
      content: 'Updated content',
      tags: 'a,b',
      isEnabled: true,
    });
    expect(fd.get('intent')).toBe('updateMemory');
    expect(fd.get('memoryId')).toBe('memory-1');
    expect(fd.get('title')).toBe('Updated');
    expect(fd.get('content')).toBe('Updated content');
    expect(fd.get('tags')).toBe('a,b');
    expect(fd.get('isEnabled')).toBe('true');
  });

  it('buildDeleteMemoryFormData targets deleteMemory intent', async () => {
    const { buildDeleteMemoryFormData } = await import('~/routes/internal.ai-assistant');
    const fd = buildDeleteMemoryFormData('memory-z');
    expect(fd.get('intent')).toBe('deleteMemory');
    expect(fd.get('memoryId')).toBe('memory-z');
  });

  it('buildImportSessionFormData serializes payload', async () => {
    const { buildImportSessionFormData } = await import('~/routes/internal.ai-assistant');
    const payload = {
      title: 'Imported',
      mode: 'localMachine' as const,
      messages: [{ role: 'user' as const, content: 'hello' }],
    };
    const fd = buildImportSessionFormData(payload);
    expect(fd.get('intent')).toBe('importSession');
    expect(typeof fd.get('payload')).toBe('string');
    expect(JSON.parse(String(fd.get('payload')))).toMatchObject(payload);
  });
});

describe('internal.ai-assistant action deleteSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isInternalAiLocalOnlyEnabledMock.mockReturnValue(false);
    getSessionMock.mockResolvedValue(null);
    findUserMessageByRequestMock.mockResolvedValue(null);
  });

  it('creates a new session and returns session id', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({ intent: 'createSession', mode: 'localMachine' }),
    });

    expect(response.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'localMachine' }),
    );
    const body = (await response.json()) as { sessionId?: string };
    expect(body.sessionId).toBe('sess-created-1');
  });

  it('forces local mode while local-only guardrail is enabled', async () => {
    isInternalAiLocalOnlyEnabledMock.mockReturnValue(true);
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({ intent: 'createSession', mode: 'modalRemote' }),
    });

    expect(response.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'localMachine' }),
    );
  });

  it('deletes the requested session id', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({ intent: 'deleteSession', sessionId: 'sess-delete-1' }),
    });

    expect(response.status).toBe(200);
    expect(requireInternalAdminMock).toHaveBeenCalledTimes(1);
    expect(deleteSessionMock).toHaveBeenCalledWith('sess-delete-1');
  });

  it('rejects deleteSession when sessionId is missing', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({ intent: 'deleteSession' }),
    });

    expect(response.status).toBe(400);
    expect(deleteSessionMock).not.toHaveBeenCalled();
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/Missing sessionId/);
  });

  it('creates memory via createMemory intent', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({
        intent: 'createMemory',
        title: 'Runbook',
        content: 'Escalate after 2 retries',
        tags: 'ops,alerts',
        isEnabled: 'true',
      }),
    });
    expect(response.status).toBe(200);
    expect(createMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Runbook',
        content: 'Escalate after 2 retries',
        tags: ['ops', 'alerts'],
        isEnabled: true,
      }),
    );
  });

  it('rejects createMemory when required fields are missing', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({
        intent: 'createMemory',
        title: 'Runbook',
      }),
    });
    expect(response.status).toBe(400);
    expect(createMemoryMock).not.toHaveBeenCalled();
  });

  it('updates memory via updateMemory intent', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({
        intent: 'updateMemory',
        memoryId: 'memory-1',
        title: 'Runbook v2',
        content: 'Updated steps',
        tags: 'ops,critical',
        isEnabled: 'false',
      }),
    });
    expect(response.status).toBe(200);
    expect(updateMemoryMock).toHaveBeenCalledWith(
      'memory-1',
      expect.objectContaining({
        title: 'Runbook v2',
        content: 'Updated steps',
        tags: ['ops', 'critical'],
        isEnabled: false,
      }),
    );
  });

  it('deletes memory via deleteMemory intent', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({
        intent: 'deleteMemory',
        memoryId: 'memory-1',
      }),
    });
    expect(response.status).toBe(200);
    expect(deleteMemoryMock).toHaveBeenCalledWith('memory-1');
  });

  it('imports session payload and returns imported result', async () => {
    const { action } = await import('~/routes/internal.ai-assistant');
    const response = await action({
      request: makeFormRequest({
        intent: 'importSession',
        payload: JSON.stringify({
          title: 'Imported session',
          mode: 'localMachine',
          memoryEnabled: true,
          messages: [{ role: 'user', content: 'hello import', clientRequestId: 'req-1' }],
        }),
      }),
    });
    expect(response.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalled();
    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: 'hello import',
        clientRequestId: 'req-1',
      }),
    );
    const body = (await response.json()) as { ok?: boolean; inserted?: number };
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(1);
  });
});

describe('computeSessionMutationFollowUp', () => {
  it('navigates after create when action returns sessionId', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const searchParams = new URLSearchParams('q=logs');
    const followUp = computeSessionMutationFollowUp({
      pending: { kind: 'create' },
      raw: { ok: true, sessionId: 'new-sess' },
      searchParams,
    });
    expect(followUp).toEqual({
      effect: 'navigate',
      href: '/internal/ai-assistant?q=logs&sessionId=new-sess',
    });
  });

  it('revalidates after create when response has no sessionId', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const followUp = computeSessionMutationFollowUp({
      pending: { kind: 'create' },
      raw: { ok: true },
      searchParams: new URLSearchParams(),
    });
    expect(followUp).toEqual({ effect: 'revalidate' });
  });

  it('navigates after delete of active session with fallback', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const searchParams = new URLSearchParams('sessionId=active-1');
    const followUp = computeSessionMutationFollowUp({
      pending: {
        kind: 'delete',
        deletedId: 'active-1',
        activeId: 'active-1',
        sessionsSnapshot: [
          { id: 'active-1', title: 'A', messageCount: 1 },
          { id: 'next-1', title: 'B', messageCount: 0 },
        ],
      },
      raw: { ok: true },
      searchParams,
    });
    expect(followUp).toEqual({
      effect: 'navigate',
      href: '/internal/ai-assistant?sessionId=next-1',
    });
  });

  it('revalidates on action error object', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const followUp = computeSessionMutationFollowUp({
      pending: { kind: 'create' },
      raw: { ok: false, error: 'bad' },
      searchParams: new URLSearchParams(),
    });
    expect(followUp).toEqual({ effect: 'revalidate' });
  });

  it('revalidates after updateSession when action returns ok: false', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const followUp = computeSessionMutationFollowUp({
      pending: { kind: 'update' },
      raw: { ok: false, error: 'conflict' },
      searchParams: new URLSearchParams(),
    });
    expect(followUp).toEqual({ effect: 'revalidate' });
  });

  it('revalidates after deleteSession when action response is not ok', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const followUp = computeSessionMutationFollowUp({
      pending: {
        kind: 'delete',
        deletedId: 's-del',
        activeId: 's-act',
        sessionsSnapshot: [{ id: 's-act', title: 'A', messageCount: 1 }],
      },
      raw: { ok: false, error: 'not found' },
      searchParams: new URLSearchParams('sessionId=s-act'),
    });
    expect(followUp).toEqual({ effect: 'revalidate' });
  });

  it('revalidates after deleteSession when raw is missing ok', async () => {
    const { computeSessionMutationFollowUp } = await import('~/routes/internal.ai-assistant');
    const followUp = computeSessionMutationFollowUp({
      pending: {
        kind: 'delete',
        deletedId: 's-del',
        activeId: 's-act',
        sessionsSnapshot: [],
      },
      raw: {},
      searchParams: new URLSearchParams(),
    });
    expect(followUp).toEqual({ effect: 'revalidate' });
  });
});
