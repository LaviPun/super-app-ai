import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  runAssistantStream,
  type SseFrame,
} from '~/routes/internal.ai-assistant.chat.stream';
import type { AssistantStreamEvent } from '~/services/ai/internal-assistant.server';

type StoreMock = {
  getSession: ReturnType<typeof vi.fn>;
  findUserMessageByRequest: ReturnType<typeof vi.fn>;
  findAssistantResponseForUser: ReturnType<typeof vi.fn>;
  createMessage: ReturnType<typeof vi.fn>;
  updateMessage: ReturnType<typeof vi.fn>;
  updateSession: ReturnType<typeof vi.fn>;
  listMessages: ReturnType<typeof vi.fn>;
  getEnabledMemoryContext: ReturnType<typeof vi.fn>;
  writeToolAudit: ReturnType<typeof vi.fn>;
};

function makeStore(): StoreMock {
  return {
    getSession: vi.fn(async () => ({
      id: 'sess-1',
      title: 'New chat',
      mode: 'localMachine',
      memoryEnabled: true,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      messageCount: 0,
    })),
    findUserMessageByRequest: vi.fn(async () => null),
    findAssistantResponseForUser: vi.fn(async () => null),
    createMessage: vi.fn(async (input: { role: string; content: string }) => ({
      id: input.role === 'user' ? 'user-msg-1' : 'assistant-msg-1',
      role: input.role,
      content: input.content,
      mode: 'localMachine',
      backend: null,
      model: null,
      latencyMs: null,
      tokensIn: null,
      tokensOut: null,
      estimatedCostCents: null,
      hadFallback: false,
      retryCount: 0,
      status: input.role === 'user' ? 'completed' : 'streaming',
      clientRequestId: null,
      responseToMessageId: null,
      error: null,
      createdAt: new Date().toISOString(),
    })),
    updateMessage: vi.fn(async (id: string, patch: Record<string, unknown>) => ({
      id,
      role: 'assistant',
      content: typeof patch.content === 'string' ? patch.content : '',
      mode: 'localMachine',
      backend: 'ollama',
      model: 'qwen3:4b',
      latencyMs: 10,
      tokensIn: 1,
      tokensOut: 1,
      estimatedCostCents: 0,
      hadFallback: false,
      retryCount: 0,
      status: typeof patch.status === 'string' ? patch.status : 'streaming',
      clientRequestId: null,
      responseToMessageId: 'user-msg-1',
      error: typeof patch.error === 'string' ? patch.error : null,
      createdAt: new Date().toISOString(),
    })),
    updateSession: vi.fn(async () => undefined),
    listMessages: vi.fn(async () => []),
    getEnabledMemoryContext: vi.fn(async () => []),
    writeToolAudit: vi.fn(async () => undefined),
  };
}

const activity = { log: vi.fn(async () => undefined) };

function makeAsyncStream(events: AssistantStreamEvent[]) {
  return async function* () {
    for (const event of events) {
      yield event;
    }
  };
}

function controllableStream() {
  let resolveQueue: ((value: AssistantStreamEvent | typeof DONE_SENTINEL) => void) | null = null;
  const buffer: Array<AssistantStreamEvent | typeof DONE_SENTINEL> = [];
  const DONE_SENTINEL = Symbol('done') as unknown as AssistantStreamEvent;
  const push = (event: AssistantStreamEvent | typeof DONE_SENTINEL) => {
    if (resolveQueue) {
      const r = resolveQueue;
      resolveQueue = null;
      r(event);
    } else {
      buffer.push(event);
    }
  };
  const generator = async function* () {
    while (true) {
      let next: AssistantStreamEvent | typeof DONE_SENTINEL;
      if (buffer.length > 0) {
        next = buffer.shift()!;
      } else {
        next = await new Promise<AssistantStreamEvent | typeof DONE_SENTINEL>((resolve) => {
          resolveQueue = resolve;
        });
      }
      if (next === DONE_SENTINEL) return;
      yield next as AssistantStreamEvent;
    }
  };
  return { generator, push, end: () => push(DONE_SENTINEL), DONE_SENTINEL };
}

async function collectFrames(gen: AsyncGenerator<SseFrame>, max = 50): Promise<SseFrame[]> {
  const out: SseFrame[] = [];
  for await (const frame of gen) {
    out.push(frame);
    if (out.length >= max) break;
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('runAssistantStream', () => {
  it('resumes from a completed assistant row when clientRequestId already has a response', async () => {
    const store = makeStore();
    store.findUserMessageByRequest.mockResolvedValueOnce({
      id: 'user-msg-1',
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
      clientRequestId: 'req-1',
      responseToMessageId: null,
      error: null,
      createdAt: new Date().toISOString(),
    });
    store.findAssistantResponseForUser.mockResolvedValueOnce({
      id: 'assistant-prior',
      role: 'assistant',
      content: 'prior reply text',
      mode: 'localMachine',
      backend: 'ollama',
      model: 'qwen3:4b',
      latencyMs: 42,
      tokensIn: 1,
      tokensOut: 4,
      estimatedCostCents: 0,
      hadFallback: false,
      retryCount: 0,
      status: 'completed',
      clientRequestId: 'req-1',
      responseToMessageId: 'user-msg-1',
      error: null,
      createdAt: new Date().toISOString(),
    });

    const streamChat = vi.fn(() => {
      throw new Error('streamChat must not run on resume');
    });

    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'hello', clientRequestId: 'req-1' },
        { store, activity, streamChat: streamChat as never },
      ),
    );

    expect(frames.map((f) => (f.kind === 'event' ? f.event : f.kind))).toEqual([
      'ready',
      'token',
      'done',
    ]);
    const tokenFrame = frames.find((f) => f.kind === 'event' && f.event === 'token');
    expect(tokenFrame).toBeDefined();
    expect((tokenFrame as { data: { text: string } }).data.text).toBe('prior reply text');
    expect(store.createMessage).not.toHaveBeenCalled();
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('persists partial progress as tokens arrive beyond 120 chars', async () => {
    const store = makeStore();
    const long = 'x'.repeat(150);
    const streamChat = vi.fn(makeAsyncStream([{ type: 'token', text: long }]));

    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'long please' },
        { store, activity, streamChat: streamChat as never },
      ),
    );

    expect(frames.some((f) => f.kind === 'event' && f.event === 'ready')).toBe(true);
    expect(frames.some((f) => f.kind === 'event' && f.event === 'token')).toBe(true);
    const updateCalls = store.updateMessage.mock.calls.filter(
      (call) => typeof call[1] === 'object' && call[1] && (call[1] as { content?: string }).content,
    );
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect((updateCalls[0][1] as { content: string }).content.length).toBeGreaterThanOrEqual(120);
  });

  it('emits error frame and persists status=error when streamChat throws', async () => {
    const store = makeStore();
    const boom = vi.fn(async function* () {
      throw new Error('upstream blew up');
      // eslint-disable-next-line @typescript-eslint/no-unreachable
      yield { type: 'token', text: '' } as AssistantStreamEvent;
    });
    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'fail' },
        { store, activity, streamChat: boom as never },
      ),
    );

    const errorFrame = frames.find((f) => f.kind === 'event' && f.event === 'error');
    expect(errorFrame).toBeDefined();
    const errPatch = store.updateMessage.mock.calls.find(
      (call) => (call[1] as { status?: string }).status === 'error',
    );
    expect(errPatch).toBeDefined();
    expect((errPatch?.[1] as { error?: string }).error).toContain('upstream blew up');
  });

  it('records tool audits + activity log when tool_result frames arrive', async () => {
    const store = makeStore();
    const streamChat = vi.fn(makeAsyncStream([
      {
        type: 'tool_result',
        tool: 'shop_lookup',
        ok: true,
        data: { hits: 2 },
      },
      { type: 'token', text: 'after tool' },
      {
        type: 'done',
        meta: {
          target: 'localMachine',
          backend: 'ollama',
          model: 'qwen3:4b',
          latencyMs: 7,
          tokensIn: 1,
          tokensOut: 2,
          hadFallback: false,
        },
      },
    ]));
    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'use the tool' },
        { store, activity, streamChat: streamChat as never },
      ),
    );

    expect(frames.some((f) => f.kind === 'event' && f.event === 'tool')).toBe(true);
    expect(store.writeToolAudit).toHaveBeenCalledTimes(1);
    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AI_ASSISTANT_TOOL_CALLED' }),
    );
  });

  it('emits AI_ASSISTANT_QUERY activity log on every attempt (3.17)', async () => {
    const store = makeStore();
    const streamChat = vi.fn(makeAsyncStream([
      { type: 'token', text: 'ok' },
      {
        type: 'done',
        meta: {
          target: 'localMachine',
          backend: 'ollama',
          model: 'qwen3:4b',
          latencyMs: 1,
          tokensIn: 1,
          tokensOut: 1,
          hadFallback: false,
        },
      },
    ]));

    await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'first' },
        { store, activity, streamChat: streamChat as never },
      ),
    );
    await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'second', retryCount: 1 },
        { store, activity, streamChat: streamChat as never },
      ),
    );
    const queryCalls = activity.log.mock.calls.filter(
      (c) => (c[0] as { action?: string }).action === 'AI_ASSISTANT_QUERY',
    );
    expect(queryCalls.length).toBe(2);
    const attempts = queryCalls.map((c) => (c[0] as { details: { attempt: number } }).details.attempt);
    expect(attempts).toEqual([1, 2]);
  });

  it('records an error when fullReply is empty on done (3.16)', async () => {
    const store = makeStore();
    const streamChat = vi.fn(makeAsyncStream([
      {
        type: 'done',
        meta: {
          target: 'localMachine',
          backend: 'ollama',
          model: 'qwen3:4b',
          latencyMs: 1,
          tokensIn: 0,
          tokensOut: 0,
          hadFallback: false,
        },
      },
    ]));
    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'sess-1', message: 'empty' },
        { store, activity, streamChat: streamChat as never },
      ),
    );
    const errorFrame = frames.find((f) => f.kind === 'event' && f.event === 'error');
    expect(errorFrame).toBeDefined();
    const errPatch = store.updateMessage.mock.calls.find(
      (call) => (call[1] as { status?: string }).status === 'error',
    );
    expect(errPatch).toBeDefined();
    expect((errPatch?.[1] as { error?: string }).error).toBe('Empty model response');
  });

  it('emits :keepalive comment frames while first token is delayed (3.15)', async () => {
    vi.useFakeTimers();
    const store = makeStore();
    const ctl = controllableStream();
    const streamChat = vi.fn(ctl.generator);

    const gen = runAssistantStream(
      {
        sessionId: 'sess-1',
        message: 'slow upstream',
      },
      { store, activity, streamChat: streamChat as never, heartbeatIntervalMs: 50 },
    );

    const collected: SseFrame[] = [];
    const drain = (async () => {
      for await (const frame of gen) {
        collected.push(frame);
        if (frame.kind === 'event' && frame.event === 'done') return;
        if (frame.kind === 'event' && frame.event === 'error') return;
      }
    })();

    // Let microtasks settle so ready frame is in the queue
    await vi.advanceTimersByTimeAsync(1);
    // Now advance through several heartbeat intervals with no token
    await vi.advanceTimersByTimeAsync(200);
    expect(
      collected.some((f) => f.kind === 'comment' && f.text === ':keepalive'),
    ).toBe(true);
    ctl.push({ type: 'token', text: 'hello' });
    ctl.push({
      type: 'done',
      meta: {
        target: 'localMachine',
        backend: 'ollama',
        model: 'qwen3:4b',
        latencyMs: 1,
        tokensIn: 1,
        tokensOut: 1,
        hadFallback: false,
      },
    });
    ctl.end();
    await vi.advanceTimersByTimeAsync(10);
    await drain;
  });

  it('yields session_missing when session does not exist', async () => {
    const store = makeStore();
    store.getSession.mockResolvedValueOnce(null);
    const frames = await collectFrames(
      runAssistantStream(
        { sessionId: 'missing', message: 'hi' },
        { store, activity, streamChat: (() => {}) as never },
      ),
    );
    expect(frames).toEqual([{ kind: 'session_missing' }]);
  });

  it('exposes HEARTBEAT_INTERVAL_MS', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(15_000);
  });
});
