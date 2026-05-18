import { describe, expect, it, vi } from 'vitest';
import { applyImportSession, ImportSessionSchema } from '~/routes/internal.ai-assistant';

function buildStoreStub() {
  return {
    getSession: vi.fn<
      (sessionId: string) => Promise<{
        id: string;
        title: string;
        mode: 'localMachine' | 'modalRemote';
        memoryEnabled: boolean;
        createdAt: string;
        updatedAt: string;
        messageCount: number;
      } | null>
    >(async () => null),
    createSession: vi.fn(async () => ({
      id: 'sess-new',
      title: 'Imported',
      mode: 'localMachine',
      memoryEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    })),
    findUserMessageByRequest: vi.fn<
      (sessionId: string, clientRequestId: string) => Promise<{ id: string } | null>
    >(async () => null),
    createMessage: vi.fn(async () => ({ id: 'msg-1' })),
  };
}

describe('applyImportSession', () => {
  it('creates a new session when sessionId is missing', async () => {
    const store = buildStoreStub();
    const result = await applyImportSession(
      store as never,
      ImportSessionSchema.parse({
        title: 'Imported session',
        mode: 'localMachine',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );
    expect(store.createSession).toHaveBeenCalled();
    expect(store.createMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, sessionId: 'sess-new', inserted: 1, skipped: 0 });
  });

  it('reuses existing session when sessionId resolves', async () => {
    const store = buildStoreStub();
    store.getSession.mockResolvedValue({
      id: 'sess-existing',
      title: 'Existing',
      mode: 'localMachine',
      memoryEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    });
    const result = await applyImportSession(
      store as never,
      ImportSessionSchema.parse({
        title: 'Ignored title',
        mode: 'localMachine',
        sessionId: 'sess-existing',
        messages: [{ role: 'assistant', content: 'welcome' }],
      }),
    );
    expect(store.createSession).not.toHaveBeenCalled();
    expect(store.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-existing', role: 'assistant' }),
    );
    expect(result.sessionId).toBe('sess-existing');
  });

  it('deduplicates messages by clientRequestId', async () => {
    const store = buildStoreStub();
    store.findUserMessageByRequest.mockResolvedValueOnce({ id: 'already-here' });
    const result = await applyImportSession(
      store as never,
      ImportSessionSchema.parse({
        title: 'Imported',
        mode: 'localMachine',
        messages: [
          { role: 'user', content: 'first', clientRequestId: 'req-1' },
          { role: 'assistant', content: 'second' },
        ],
      }),
    );
    expect(store.createMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, sessionId: 'sess-new', inserted: 1, skipped: 1 });
  });
});

describe('ImportSessionSchema', () => {
  it('rejects messages above 4000 characters', () => {
    const oversized = 'x'.repeat(4001);
    expect(() =>
      ImportSessionSchema.parse({
        title: 'Too long',
        mode: 'localMachine',
        messages: [{ role: 'user', content: oversized }],
      }),
    ).toThrow(/4000/);
  });
});
