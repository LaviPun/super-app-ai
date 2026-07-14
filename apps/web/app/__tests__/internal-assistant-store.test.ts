import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RawRow = Record<string, unknown>;

function makePrismaMock() {
  const internalAiMessage = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const internalAiSession = {
    delete: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  };
  const internalAiToolAudit = {
    deleteMany: vi.fn(),
    create: vi.fn(),
  };
  return {
    $queryRawUnsafe: vi.fn(async () => [] as RawRow[]),
    $executeRawUnsafe: vi.fn(async () => 0),
    internalAiMessage,
    internalAiSession,
    internalAiToolAudit,
  };
}

let prismaMock: ReturnType<typeof makePrismaMock>;

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

beforeEach(() => {
  prismaMock = makePrismaMock();
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('parseTags', () => {
  it('round-trips an array via JSON', async () => {
    const { parseTags } = await import('~/services/ai/internal-assistant-store.server');
    const json = JSON.stringify(['alpha', 'beta']);
    expect(parseTags(json)).toEqual(['alpha', 'beta']);
  });

  it('returns [] for null', async () => {
    const { parseTags } = await import('~/services/ai/internal-assistant-store.server');
    expect(parseTags(null)).toEqual([]);
  });

  it('returns [] for malformed JSON', async () => {
    const { parseTags } = await import('~/services/ai/internal-assistant-store.server');
    expect(parseTags('{not json')).toEqual([]);
  });

  it('returns [] when payload is not an array', async () => {
    const { parseTags } = await import('~/services/ai/internal-assistant-store.server');
    expect(parseTags('{"foo":1}')).toEqual([]);
  });

  it('filters non-string entries', async () => {
    const { parseTags } = await import('~/services/ai/internal-assistant-store.server');
    expect(parseTags(JSON.stringify(['ok', 42, null, 'two']))).toEqual(['ok', 'two']);
  });
});

describe('ensureInternalAiTables PRAGMA guard', () => {
  it('skips SQLite bootstrap SQL for non-SQLite DATABASE_URL', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/app';
    prismaMock.internalAiSession.create.mockResolvedValueOnce({
      id: 'sess-non-sqlite',
      title: 'New chat',
      mode: 'localMachine',
      memoryEnabled: true,
      updatedAt: new Date(),
      createdAt: new Date(),
      _count: { messages: 0 },
    });

    try {
      const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
      const store = new InternalAssistantStoreService();
      await expect(
        store.createSession({ title: 'x', mode: 'localMachine' }),
      ).resolves.toMatchObject({ id: 'sess-non-sqlite' });
      expect(prismaMock.$executeRawUnsafe).not.toHaveBeenCalled();
      expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('runs SQLite bootstrap SQL for sqlite DATABASE_URL', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./dev.db';
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);
    prismaMock.internalAiSession.create.mockResolvedValueOnce({
      id: 'sess-sqlite',
      title: 'New chat',
      mode: 'localMachine',
      memoryEnabled: true,
      updatedAt: new Date(),
      createdAt: new Date(),
      _count: { messages: 0 },
    });

    try {
      const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
      const store = new InternalAssistantStoreService();
      await expect(
        store.createSession({ title: 'x', mode: 'localMachine' }),
      ).resolves.toMatchObject({ id: 'sess-sqlite' });
      expect(prismaMock.$executeRawUnsafe).toHaveBeenCalled();
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('swallows non-SQLite PRAGMA errors without rethrowing', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./dev.db';
    prismaMock.$executeRawUnsafe.mockImplementationOnce(async () => {
      const err = new Error('syntax error at or near "PRAGMA"');
      (err as { code?: string }).code = 'P2010';
      throw err;
    });
    prismaMock.internalAiSession.create.mockResolvedValueOnce({
      id: 'sess-1',
      title: 'New chat',
      mode: 'localMachine',
      memoryEnabled: true,
      updatedAt: new Date(),
      createdAt: new Date(),
      _count: { messages: 0 },
    });

    try {
      const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
      const store = new InternalAssistantStoreService();
      await expect(
        store.createSession({ title: 'x', mode: 'localMachine' }),
      ).resolves.toMatchObject({ id: 'sess-1' });
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('rethrows unrelated database errors', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./dev.db';
    prismaMock.$executeRawUnsafe.mockImplementationOnce(async () => {
      throw new Error('connection refused');
    });
    try {
      const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
      const store = new InternalAssistantStoreService();
      await expect(
        store.createSession({ title: 'x', mode: 'localMachine' }),
      ).rejects.toThrow('connection refused');
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('swallows non-SQLite DATETIME DDL errors and continues', async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'file:./dev.db';
    prismaMock.$executeRawUnsafe.mockImplementationOnce(async () => {
      throw new Error('type "DATETIME" does not exist');
    });
    prismaMock.internalAiSession.create.mockResolvedValueOnce({
      id: 'sess-2',
      title: 'New chat',
      mode: 'localMachine',
      memoryEnabled: true,
      updatedAt: new Date(),
      createdAt: new Date(),
      _count: { messages: 0 },
    });

    try {
      const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
      const store = new InternalAssistantStoreService();
      await expect(
        store.createSession({ title: 'x', mode: 'localMachine' }),
      ).resolves.toMatchObject({ id: 'sess-2' });
    } finally {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});

describe('findUserMessageByRequest', () => {
  it('returns null when no message exists for the request id', async () => {
    prismaMock.internalAiMessage.findFirst.mockResolvedValueOnce(null);
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const result = await store.findUserMessageByRequest('sess-1', 'req-abc');
    expect(result).toBeNull();
    expect(prismaMock.internalAiMessage.findFirst).toHaveBeenCalledWith({
      where: { sessionId: 'sess-1', role: 'user', clientRequestId: 'req-abc' },
      orderBy: [{ createdAt: 'desc' }],
    });
  });

  it('maps a found row to AssistantMessageRecord', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.findFirst.mockResolvedValueOnce({
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      mode: 'localMachine',
      backend: null,
      model: null,
      latencyMs: null,
      tokensIn: null,
      tokensOut: null,
      estimatedCostCents: null,
      hadFallback: false,
      retryCount: 0,
      status: 'completed',
      clientRequestId: 'req-abc',
      responseToMessageId: null,
      error: null,
      createdAt: now,
    });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const result = await store.findUserMessageByRequest('sess-1', 'req-abc');
    expect(result).toMatchObject({ id: 'msg-1', content: 'hello', clientRequestId: 'req-abc' });
  });
});

describe('findAssistantResponseForUser', () => {
  it('queries with status="completed"', async () => {
    prismaMock.internalAiMessage.findFirst.mockResolvedValueOnce(null);
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.findAssistantResponseForUser('sess-1', 'msg-1');
    expect(prismaMock.internalAiMessage.findFirst).toHaveBeenCalledWith({
      where: {
        sessionId: 'sess-1',
        role: 'assistant',
        responseToMessageId: 'msg-1',
        status: 'completed',
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  });

  it('returns null when no completed assistant response exists', async () => {
    prismaMock.internalAiMessage.findFirst.mockResolvedValueOnce(null);
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const result = await store.findAssistantResponseForUser('sess-1', 'msg-1');
    expect(result).toBeNull();
  });
});

describe('deleteSession', () => {
  it('deletes the session row (FK cascade handles messages, SetNull handles audits)', async () => {
    prismaMock.internalAiSession.delete.mockResolvedValueOnce({ id: 'sess-1' });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.deleteSession('sess-1');
    expect(prismaMock.internalAiSession.delete).toHaveBeenCalledWith({ where: { id: 'sess-1' } });
  });
});

describe('purgeOldToolAudits', () => {
  it('deletes audits older than retentionDays', async () => {
    prismaMock.internalAiToolAudit.deleteMany.mockResolvedValueOnce({ count: 17 });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const deleted = await store.purgeOldToolAudits(7);
    expect(deleted).toBe(17);
    const firstCall = prismaMock.internalAiToolAudit.deleteMany.mock.calls[0];
    if (!firstCall) throw new Error('Expected deleteMany to be called');
    const call = firstCall[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = call.where.createdAt.lt as Date;
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(60_000);
  });

  it('coerces invalid retention values to 90 days', async () => {
    prismaMock.internalAiToolAudit.deleteMany.mockResolvedValueOnce({ count: 0 });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.purgeOldToolAudits(-1);
    const firstCall = prismaMock.internalAiToolAudit.deleteMany.mock.calls[0];
    if (!firstCall) throw new Error('Expected deleteMany to be called');
    const call = firstCall[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = call.where.createdAt.lt as Date;
    const expected = Date.now() - 90 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(60_000);
  });
});

describe('chat content redaction', () => {
  it('redacts message content before create', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.create.mockResolvedValueOnce({
      id: 'msg-1',
      role: 'user',
      content: '[REDACTED_EMAIL]',
      mode: 'localMachine',
      backend: null,
      model: null,
      latencyMs: null,
      tokensIn: null,
      tokensOut: null,
      estimatedCostCents: 0,
      hadFallback: false,
      retryCount: 0,
      status: 'completed',
      clientRequestId: null,
      responseToMessageId: null,
      error: null,
      createdAt: now,
    });
    prismaMock.internalAiSession.update.mockResolvedValueOnce({ id: 'sess-1' });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.createMessage({
      sessionId: 'sess-1',
      role: 'user',
      content: 'contact me at test@example.com',
    });
    expect(prismaMock.internalAiMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.not.stringContaining('test@example.com'),
        }),
      }),
    );
  });

  it('redacts message content before update', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.update.mockResolvedValueOnce({
      id: 'msg-1',
      role: 'assistant',
      content: 'Bearer [REDACTED]',
      mode: 'localMachine',
      backend: null,
      model: null,
      latencyMs: null,
      tokensIn: null,
      tokensOut: null,
      estimatedCostCents: 0,
      hadFallback: false,
      retryCount: 0,
      status: 'completed',
      clientRequestId: null,
      responseToMessageId: null,
      error: null,
      createdAt: now,
    });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.updateMessage('msg-1', { content: 'Bearer sk-secret-token' });
    expect(prismaMock.internalAiMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.not.stringContaining('sk-secret-token'),
        }),
      }),
    );
  });
});

describe('actionsJson round-trip', () => {
  const proposalsJson = JSON.stringify([
    { id: 'sap_a', intent: 'job_replay', params: { id: 'cmrezggie001m11h4wulhkams' }, label: 'Replay', reason: 'r' },
  ]);

  it('forwards actionsJson into the create data', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.create.mockResolvedValueOnce({
      id: 'msg-a', role: 'assistant', content: 'ok', mode: 'localMachine', backend: null, model: null,
      latencyMs: null, tokensIn: null, tokensOut: null, estimatedCostCents: 0, hadFallback: false,
      retryCount: 0, status: 'completed', clientRequestId: null, responseToMessageId: 'user-1',
      error: null, actionsJson: proposalsJson, createdAt: now,
    });
    prismaMock.internalAiSession.update.mockResolvedValueOnce({ id: 'sess-1' });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const record = await store.createMessage({
      sessionId: 'sess-1', role: 'assistant', content: 'ok', actionsJson: proposalsJson,
    });
    expect(prismaMock.internalAiMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actionsJson: proposalsJson }) }),
    );
    expect(record.actionsJson).toBe(proposalsJson);
  });

  it('only writes actionsJson on update when provided (undefined leaves it untouched)', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.update.mockResolvedValue({
      id: 'msg-a', role: 'assistant', content: 'x', mode: 'localMachine', backend: null, model: null,
      latencyMs: null, tokensIn: null, tokensOut: null, estimatedCostCents: 0, hadFallback: false,
      retryCount: 0, status: 'completed', clientRequestId: null, responseToMessageId: 'user-1',
      error: null, actionsJson: proposalsJson, createdAt: now,
    });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();

    await store.updateMessage('msg-a', { status: 'streaming' });
    const dataWithout = prismaMock.internalAiMessage.update.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect('actionsJson' in dataWithout.data).toBe(false);

    await store.updateMessage('msg-a', { actionsJson: proposalsJson });
    const dataWith = prismaMock.internalAiMessage.update.mock.calls[1]![0] as { data: Record<string, unknown> };
    expect(dataWith.data.actionsJson).toBe(proposalsJson);
  });

  it('maps row.actionsJson through listMessages', async () => {
    const now = new Date();
    prismaMock.internalAiMessage.findMany.mockResolvedValueOnce([
      {
        id: 'msg-a', role: 'assistant', content: 'x', mode: 'localMachine', backend: null, model: null,
        latencyMs: null, tokensIn: null, tokensOut: null, estimatedCostCents: 0, hadFallback: false,
        retryCount: 0, status: 'completed', clientRequestId: null, responseToMessageId: 'user-1',
        error: null, actionsJson: proposalsJson, createdAt: now,
      },
    ]);
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const rows = await store.listMessages('sess-1');
    expect(rows[0]!.actionsJson).toBe(proposalsJson);
  });
});

describe('purgeOldMessages', () => {
  it('deletes chat messages older than retentionDays', async () => {
    prismaMock.internalAiMessage.deleteMany.mockResolvedValueOnce({ count: 11 });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    const deleted = await store.purgeOldMessages(7);
    expect(deleted).toBe(11);
    const firstCall = prismaMock.internalAiMessage.deleteMany.mock.calls[0];
    if (!firstCall) throw new Error('Expected deleteMany to be called');
    const call = firstCall[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = call.where.createdAt.lt as Date;
    const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(60_000);
  });

  it('coerces invalid retention values to 30 days', async () => {
    prismaMock.internalAiMessage.deleteMany.mockResolvedValueOnce({ count: 0 });
    const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
    const store = new InternalAssistantStoreService();
    await store.purgeOldMessages(0);
    const firstCall = prismaMock.internalAiMessage.deleteMany.mock.calls[0];
    if (!firstCall) throw new Error('Expected deleteMany to be called');
    const call = firstCall[0] as {
      where: { createdAt: { lt: Date } };
    };
    const cutoff = call.where.createdAt.lt as Date;
    const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(60_000);
  });
});
