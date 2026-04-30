import { requireInternalAdmin } from '~/internal-admin/session.server';
import { streamInternalAssistantChat } from '~/services/ai/internal-assistant.server';
import { InternalAssistantStoreService } from '~/services/ai/internal-assistant-store.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { z } from 'zod';

const StreamRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  target: z.enum(['localMachine', 'modalRemote']).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  clientRequestId: z.string().trim().min(8).max(120).optional(),
});

function toSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  const target = input.target ?? session.mode;
  const retryCount = input.retryCount ?? 0;
  const clientRequestId = input.clientRequestId?.trim() || undefined;

  let userMessage = clientRequestId
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
    await activity.log({
      actor: 'INTERNAL_ADMIN',
      action: 'AI_ASSISTANT_QUERY',
      resource: `session:${session.id}`,
      details: {
        sessionId: session.id,
        target,
        userMessageId: userMessage.id,
      },
    });
  }

  const existingAssistant = await store.findAssistantResponseForUser(session.id, userMessage.id);
  if (existingAssistant?.status === 'completed') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const readyAt = new Date().toISOString();
        controller.enqueue(encoder.encode(toSseEvent('ready', {
          sessionId: session.id,
          messageId: userMessage.id,
          assistantMessageId: existingAssistant.id,
          resumed: true,
          timestamp: readyAt,
        })));
        if (existingAssistant.content) {
          controller.enqueue(encoder.encode(toSseEvent('token', { text: existingAssistant.content })));
        }
        controller.enqueue(encoder.encode(toSseEvent('done', {
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
        })));
        controller.close();
      },
    });
    return makeSseResponse(stream);
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
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.id !== userMessage.id && m.status === 'completed')
      .map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage.content },
  ];

  const memoryContext = session.memoryEnabled
    ? await store.getEnabledMemoryContext(20)
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullReply = assistantMessage.content || '';
      let lastPersistedLength = fullReply.length;
      controller.enqueue(encoder.encode(toSseEvent('ready', {
        sessionId: session.id,
        messageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        resumed: !isFirstAttempt,
        timestamp: new Date().toISOString(),
      })));
      if (fullReply) {
        controller.enqueue(encoder.encode(toSseEvent('token', { text: fullReply })));
      }
      try {
        const assistantStream = streamInternalAssistantChat({
          target,
          messages,
          memoryContext,
          memoryEnabled: session.memoryEnabled,
          allowFallback: true,
        });

        for await (const event of assistantStream) {
          if (event.type === 'token') {
            fullReply += event.text;
            controller.enqueue(encoder.encode(toSseEvent('token', { text: event.text })));
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
              error: event.ok ? undefined : String(event.data.error ?? 'tool failed'),
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
            controller.enqueue(encoder.encode(toSseEvent('tool', event)));
            continue;
          }

          if (event.type === 'done') {
            const finalized = await store.updateMessage(assistantMessage.id, {
              content: fullReply || 'No response generated.',
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
              title: session.title === 'New chat'
                ? input.message.trim().slice(0, 48)
                : session.title,
            });
            controller.enqueue(encoder.encode(toSseEvent('done', {
              ...event.meta,
              assistantMessageId: finalized.id,
              resumed: !isFirstAttempt,
              timestamp: new Date().toISOString(),
            })));
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = await store.updateMessage(assistantMessage.id, {
          content: fullReply || 'Assistant request failed.',
          mode: target,
          status: 'error',
          error: message,
          retryCount,
        });
        controller.enqueue(encoder.encode(toSseEvent('error', {
          message,
          assistantMessageId: failed.id,
          resumed: !isFirstAttempt,
          timestamp: new Date().toISOString(),
        })));
      } finally {
        controller.close();
      }
    },
  });

  return makeSseResponse(stream);
}
