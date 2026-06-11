import type { HandlerResult } from './job-handlers.js';
import type { ApiRuntimeEnv } from './api-context.js';

export async function handleAssistantReadiness(env: ApiRuntimeEnv = process.env): Promise<HandlerResult> {
  return {
    status: 200,
    body: {
      ready: true,
      service: '@superapp/api',
      mode: 'proxy-stub',
      capabilities: ['chat', 'tools', 'streaming'],
      platformV2Enabled: env.PLATFORM_V2_ENABLED !== 'false',
      note: 'Full assistant remains in apps/web; this endpoint exposes readiness for Platform V2 clients.',
    },
  };
}

export async function handleAssistantChat(
  body: unknown,
  env: ApiRuntimeEnv = process.env,
): Promise<HandlerResult> {
  const payload = body as { message?: string } | undefined;
  if (!payload?.message?.trim()) {
    return { status: 400, body: { error: 'message is required' } };
  }

  return {
    status: 200,
    body: {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: `Platform V2 assistant proxy received: ${payload.message.trim().slice(0, 200)}`,
      model: 'platform-v2-proxy',
      platformV2Enabled: env.PLATFORM_V2_ENABLED !== 'false',
    },
  };
}
