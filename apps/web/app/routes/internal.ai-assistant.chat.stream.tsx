import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  streamInternalAssistantChat,
  type AssistantStreamEvent,
} from '~/services/ai/internal-assistant.server';
import {
  InternalAssistantStoreService,
  type AssistantMessageRecord,
} from '~/services/ai/internal-assistant-store.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { z } from 'zod';

const StreamRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  target: z.enum(['localMachine', 'modalRemote']).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  clientRequestId: z.string().trim().min(8).max(120).optional(),
});

export type StreamRequestInput = z.infer<typeof StreamRequestSchema>;

export type SseFrame =
  | { kind: 'event'; event: 'ready' | 'token' | 'tool' | 'done' | 'error'; data: unknown }
  | { kind: 'comment'; text: string }
  | { kind: 'session_missing' };

export const HEARTBEAT_INTERVAL_MS = 15_000;

export interface RunAssistantStreamDeps {
  store: Pick<
    InternalAssistantStoreService,
    | 'getSession'
    | 'findUserMessageByRequest'
    | 'findAssistantResponseForUser'
    | 'createMessage'
    | 'updateMessage'
    | 'updateSession'
    | 'listMessages'
    | 'getEnabledMemoryContext'
    | 'writeToolAudit'
  >;
  activity: Pick<ActivityLogService, 'log'>;
  streamChat: typeof streamInternalAssistantChat;
  heartbeatIntervalMs?: number;
}

function toSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function frameToText(frame: SseFrame): string | null {
  if (frame.kind === 'event') return toSseEvent(frame.event, frame.data);
  if (frame.kind === 'comment') return `${frame.text}\n\n`;
  return null;
}

function makeSseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * Pure async generator that owns the SSE producer lifecycle: ready, optional
 * resume replay, heartbeat while idle, token/tool streaming, persistence and
 * activity-log emission. Tests can drive it directly without a Remix runtime.
 */
export async function* runAssistantStream(
  input: StreamRequestInput,
  deps: RunAssistantStreamDeps,
): AsyncGenerator<SseFrame> {
  const { store, activity, streamChat } = deps;
  const heartbeatMs = deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;

  const session = await store.getSession(input.sessionId);
  if (!session) {
    yield { kind: 'session_missing' };
    return;
  }

  const target = input.target ?? session.mode;
  const retryCount = input.retryCount ?? 0;
  const clientRequestId = input.clientRequestId?.trim() || undefined;
  const attempt = retryCount + 1;

  let userMessage: AssistantMessageRecord | null = clientRequestId
    ? await store.findUserMessageByRequest(session.id, clientRequestId)
    : null;
  const isFirstAttempt = !userMessage;
  if (!userMessage) {
    userMessage = await store.createMessage({
      sessionId: session.id,
      role: 'user',
      content: input.message.trim(),
      mode: target,
      retryCount,
      status: 'completed',
      clientRequestId,
    });
  }
  // 3.17: fire activity log on every attempt, with attempt counter.
  await activity.log({
    actor: 'INTERNAL_ADMIN',
    action: 'AI_ASSISTANT_QUERY',
    resource: `session:${session.id}`,
    details: {
      sessionId: session.id,
      target,
      userMessageId: userMessage.id,
      attempt,
      retryCount,
      resumed: !isFirstAttempt,
    },
  });

  const existingAssistant = await store.findAssistantResponseForUser(session.id, userMessage.id);
  if (existingAssistant?.status === 'completed') {
    const readyAt = new Date().toISOString();
    yield {
      kind: 'event',
      event: 'ready',
      data: {
        sessionId: session.id,
        messageId: userMessage.id,
        assistantMessageId: existingAssistant.id,
        resumed: true,
        timestamp: readyAt,
      },
    };
    if (existingAssistant.content) {
      yield { kind: 'event', event: 'token', data: { text: existingAssistant.content } };
    }
    yield {
      kind: 'event',
      event: 'done',
      data: {
        target: existingAssistant.mode ?? target,
        backend: existingAssistant.backend ?? 'unknown',
        model: existingAssistant.model ?? 'unknown',
        latencyMs: existingAssistant.latencyMs ?? 0,
        tokensIn: existingAssistant.tokensIn ?? 0,
        tokensOut: existingAssistant.tokensOut ?? 0,
        hadFallback: existingAssistant.hadFallback,
        assistantMessageId: existingAssistant.id,
        resumed: true,
        timestamp: new Date().toISOString(),
      },
    };
    return;
  }

  let assistantMessage = existingAssistant;
  if (!assistantMessage) {
    assistantMessage = await store.createMessage({
      sessionId: session.id,
      role: 'assistant',
      content: '',
      mode: target,
      retryCount,
      status: 'streaming',
      responseToMessageId: userMessage.id,
      clientRequestId,
    });
  } else {
    assistantMessage = await store.updateMessage(assistantMessage.id, {
      status: 'streaming',
      error: null,
      retryCount,
      mode: target,
    });
  }

  const history = await store.listMessages(session.id, 80);
  const messages = [
    ...history
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          m.id !== userMessage.id &&
          m.status === 'completed',
      )
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage.content },
  ];
  const memoryContext = session.memoryEnabled ? await store.getEnabledMemoryContext(20) : [];

  // ---- Pump model stream + heartbeat into an internal queue. ----
  const queue: SseFrame[] = [];
  let waiter: (() => void) | null = null;
  const wake = () => {
    const w = waiter;
    waiter = null;
    if (w) w();
  };
  const push = (frame: SseFrame) => {
    queue.push(frame);
    wake();
  };
  let producerDone = false;
  let firstTokenSent = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      if (!firstTokenSent && !producerDone) {
        push({ kind: 'comment', text: ':keepalive' });
      }
    }, heartbeatMs);
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // emit ready
  push({
    kind: 'event',
    event: 'ready',
    data: {
      sessionId: session.id,
      messageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      resumed: !isFirstAttempt,
      timestamp: new Date().toISOString(),
    },
  });

  // replay any prior partial content before tokens start
  let fullReply = assistantMessage.content || '';
  let lastPersistedLength = fullReply.length;
  if (fullReply) {
    push({ kind: 'event', event: 'token', data: { text: fullReply } });
    firstTokenSent = true;
  } else {
    startHeartbeat();
  }

  const producer = (async () => {
    try {
      const assistantStream = streamChat({
        target,
        messages,
        memoryContext,
        memoryEnabled: session.memoryEnabled,
        allowFallback: true,
      });

      for await (const event of assistantStream as AsyncGenerator<AssistantStreamEvent>) {
        if (event.type === 'token') {
          if (!firstTokenSent) {
            firstTokenSent = true;
            stopHeartbeat();
          }
          fullReply += event.text;
          push({ kind: 'event', event: 'token', data: { text: event.text } });
          if (fullReply.length - lastPersistedLength >= 120) {
            await store.updateMessage(assistantMessage.id, {
              content: fullReply,
              status: 'streaming',
            });
            lastPersistedLength = fullReply.length;
          }
          continue;
        }
        if (event.type === 'tool_result') {
          await store.writeToolAudit({
            toolName: event.tool,
            sessionId: session.id,
            messageId: userMessage.id,
            argsJson: JSON.stringify({ message: input.message.slice(0, 200) }),
            resultJson: JSON.stringify(event.data).slice(0, 4000),
            success: event.ok,
            error: event.ok ? undefined : String((event.data as { error?: unknown }).error ?? 'tool failed'),
          });
          await activity.log({
            actor: 'INTERNAL_ADMIN',
            action: 'AI_ASSISTANT_TOOL_CALLED',
            resource: `tool:${event.tool}`,
            details: {
              sessionId: session.id,
              userMessageId: userMessage.id,
              ok: event.ok,
            },
          });
          push({ kind: 'event', event: 'tool', data: event });
          continue;
        }
        if (event.type === 'done') {
          // 3.16: empty model output is an error, not a synthetic placeholder.
          if (fullReply.trim() === '') {
            const failed = await store.updateMessage(assistantMessage.id, {
              mode: event.meta.target,
              backend: event.meta.backend,
              model: event.meta.model,
              latencyMs: event.meta.latencyMs,
              tokensIn: event.meta.tokensIn,
              tokensOut: event.meta.tokensOut,
              estimatedCostCents: 0,
              hadFallback: event.meta.hadFallback,
              retryCount,
              status: 'error',
              error: 'Empty model response',
            });
            stopHeartbeat();
            push({
              kind: 'event',
              event: 'error',
              data: {
                message: 'Empty model response',
                assistantMessageId: failed.id,
                resumed: !isFirstAttempt,
                timestamp: new Date().toISOString(),
              },
            });
            return;
          }
          const finalized = await store.updateMessage(assistantMessage.id, {
            content: fullReply,
            mode: event.meta.target,
            backend: event.meta.backend,
            model: event.meta.model,
            latencyMs: event.meta.latencyMs,
            tokensIn: event.meta.tokensIn,
            tokensOut: event.meta.tokensOut,
            estimatedCostCents: 0,
            hadFallback: event.meta.hadFallback,
            retryCount,
            status: 'completed',
            error: null,
          });
          await store.updateSession(session.id, {
            mode: event.meta.target,
            title:
              session.title === 'New chat'
                ? input.message.trim().slice(0, 48)
                : session.title,
          });
          stopHeartbeat();
          push({
            kind: 'event',
            event: 'done',
            data: {
              ...event.meta,
              assistantMessageId: finalized.id,
              resumed: !isFirstAttempt,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await store.updateMessage(assistantMessage.id, {
        content: fullReply,
        mode: target,
        status: 'error',
        error: message,
        retryCount,
      });
      stopHeartbeat();
      push({
        kind: 'event',
        event: 'error',
        data: {
          message,
          assistantMessageId: failed.id,
          resumed: !isFirstAttempt,
          timestamp: new Date().toISOString(),
        },
      });
    } finally {
      stopHeartbeat();
      producerDone = true;
      wake();
    }
  })();

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (producerDone) break;
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
  } finally {
    stopHeartbeat();
    // Surface any unhandled producer rejection (await also resolves on success).
    await producer.catch(() => undefined);
  }
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const body = await request.json().catch(() => ({}));
  const input = StreamRequestSchema.parse(body);

  const store = new InternalAssistantStoreService();
  const activity = new ActivityLogService();

  const session = await store.getSession(input.sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const generator = runAssistantStream(input, {
        store,
        activity,
        streamChat: streamInternalAssistantChat,
      });
      try {
        for await (const frame of generator) {
          if (frame.kind === 'session_missing') {
            controller.enqueue(
              encoder.encode(toSseEvent('error', { message: 'Session not found' })),
            );
            continue;
          }
          const text = frameToText(frame);
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(encoder.encode(toSseEvent('error', { message })));
      } finally {
        controller.close();
      }
    },
  });
  return makeSseResponse(stream);
}
