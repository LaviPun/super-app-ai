import { requireInternalAdmin } from '~/internal-admin/session.server';
import { isInternalAiLocalOnlyEnabled } from '~/env.server';
import { AppError } from '~/services/errors/app-error.server';
import { streamInternalAssistantChat } from '~/services/ai/internal-assistant.server';
import {
  estimateCostCentsFromDbRates,
  providerKindsForAssistantBackend,
} from '~/services/ai/cost-estimate.server';
import { InternalAssistantStoreService } from '~/services/ai/internal-assistant-store.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { enforceInternalAiRateLimit } from '~/services/security/rate-limit.server';
import {
  StreamRequestSchema,
  runAssistantStream,
  toSseEvent,
  frameToText,
  makeSseResponse,
} from '~/services/ai/internal-assistant-stream.server';

// SSE resource route. This module exports ONLY `action` — the stream engine
// lives in internal-assistant-stream.server.ts. Any extra export here would be
// kept in the client bundle by Remix and drag the server-only graph into the
// client build (this exact mistake broke `pnpm build` before the split).
export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  try {
    await enforceInternalAiRateLimit(request, 'stream');
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') {
      const retryAfterSec = Number(error.details?.retryAfterSec ?? 60);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSec) },
      });
    }
    throw error;
  }
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
  if (isInternalAiLocalOnlyEnabled() && target === 'modalRemote') {
    return new Response(
      JSON.stringify({
        error:
          'Cloud assistant target is disabled while INTERNAL_AI_LOCAL_ONLY is set. Switch the session to Local or unset INTERNAL_AI_LOCAL_ONLY.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const generator = runAssistantStream(input, {
        store,
        activity,
        streamChat: streamInternalAssistantChat,
        estimateCostCents: (meta) =>
          estimateCostCentsFromDbRates({
            model: meta.model,
            tokensIn: meta.tokensIn,
            tokensOut: meta.tokensOut,
            providerKinds: providerKindsForAssistantBackend(meta.backend),
          }),
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
