import type { RouterRuntimeTarget } from '~/schemas/router-runtime-config.server';

export type AssistantRouterBackend = 'ollama' | 'openai' | 'qwen3' | 'custom';

export type AssistantChatProbeResult = {
  ok: boolean;
  message: string;
};

export async function fetchWithTimeout(
  url: string,
  token: string | undefined,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function isChatEndpointStatus(status: number): boolean {
  return status === 200 || status === 400 || status === 401 || status === 403 || status === 405 || status === 422;
}

/** Cold-start friendly timeout for HTTPS edges vs fast localhost. */
function livenessTimeoutMs(url: string, configuredMs: number | undefined): number {
  const u = url.trim();
  const fallback = u.startsWith('https://') ? 12_000 : 4000;
  const base = typeof configuredMs === 'number' && configuredMs > 0 ? configuredMs : fallback;
  if (u.startsWith('https://')) return Math.max(base, 12_000);
  return base;
}

/**
 * Health row for internal UI: `/healthz` for router/OpenAI-style hosts; `GET /api/tags` for Ollama.
 */
export async function probeTargetLiveness(input: {
  backend: AssistantRouterBackend;
  url?: string;
  token?: string;
  timeoutMs?: number;
}): Promise<AssistantChatProbeResult> {
  const rawUrl = input.url?.trim();
  if (!rawUrl) return { ok: false, message: 'URL missing' };
  const baseUrl = rawUrl.replace(/\/+$/, '');
  const ms = livenessTimeoutMs(rawUrl, input.timeoutMs);

  if (input.backend === 'ollama') {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/tags`, input.token, ms, { method: 'GET' });
      if (response.ok) return { ok: true, message: `Ollama reachable (${response.status})` };
      return { ok: false, message: `Ollama /api/tags returned ${response.status}` };
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'unreachable';
      const aborted =
        /abor/i.test(raw) ? `${raw} (${ms}ms limit — HTTPS targets may need a cold-start retry)` : raw;
      return { ok: false, message: aborted };
    }
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/healthz`, input.token, ms, { method: 'GET' });
    if (response.ok) return { ok: true, message: `healthz ok (${response.status})` };
    return { ok: false, message: `healthz returned ${response.status}` };
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'unreachable';
    const aborted =
      /abor/i.test(raw) ? `${raw} (${ms}ms limit — HTTPS targets may need a cold-start retry)` : raw;
    return { ok: false, message: aborted };
  }
}

async function looksLikeRouterOnlyUrl(
  baseUrl: string,
  token: string | undefined,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const routeResponse = await fetchWithTimeout(
      `${baseUrl}/route`,
      token,
      timeoutMs,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'health-check',
          operationClass: 'P0_CREATE',
          classification: {
            moduleType: 'theme.popup',
            intent: 'promo.popup',
            surface: 'home',
            confidence: 0.7,
            alternatives: [],
          },
          intentPacket: {
            classification: {
              intent: 'promo.popup',
              surface: 'home',
              mode: 'create',
              confidence: 0.7,
            },
            routing: {
              prompt_profile: 'storefront_default',
              output_schema: 'recipe_spec_v1',
              model_tier: 'standard',
            },
          },
        }),
      },
    );
    return routeResponse.ok;
  } catch {
    return false;
  }
}

export async function validateAssistantChatTarget(input: {
  target: RouterRuntimeTarget;
  backend: AssistantRouterBackend;
  url?: string;
  token?: string;
  timeoutMs: number;
}): Promise<AssistantChatProbeResult> {
  const rawUrl = input.url?.trim();
  if (!rawUrl) {
    return { ok: false, message: `${input.target} URL missing` };
  }
  const baseUrl = rawUrl.replace(/\/+$/, '');

  if (input.backend === 'ollama') {
    try {
      const tags = await fetchWithTimeout(`${baseUrl}/api/tags`, input.token, input.timeoutMs, { method: 'GET' });
      if (isChatEndpointStatus(tags.status)) {
        return { ok: true, message: `${input.target} Ollama endpoint accepted (/api/tags ${tags.status})` };
      }
    } catch {
      // continue to router-only detection
    }
    const routerOnly = await looksLikeRouterOnlyUrl(baseUrl, input.token, input.timeoutMs);
    if (routerOnly) {
      return {
        ok: false,
        message: `${input.target} points to a router-only service (/route) and not an Ollama chat API. Use an Ollama URL exposing /api/tags and /api/chat.`,
      };
    }
    return {
      ok: false,
      message: `${input.target} is not reachable as Ollama chat API (expected /api/tags or /api/chat).`,
    };
  }

  const chatCandidates = ['/v1/chat/completions', '/chat/completions', '/api/chat/completions'];
  for (const endpoint of chatCandidates) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}${endpoint}`,
        input.token,
        input.timeoutMs,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'health-check',
            messages: [{ role: 'user', content: 'ping' }],
            stream: false,
            max_tokens: 4,
          }),
        },
      );
      if (isChatEndpointStatus(response.status)) {
        return { ok: true, message: `${input.target} chat endpoint accepted (${endpoint} ${response.status})` };
      }
    } catch {
      // try next candidate
    }
  }

  const routerOnly = await looksLikeRouterOnlyUrl(baseUrl, input.token, input.timeoutMs);
  if (routerOnly) {
    return {
      ok: false,
      message: `${input.target} points to a router-only service (/route) and not a chat completion API. Use an inference endpoint exposing /v1/chat/completions (or compatible).`,
    };
  }
  return {
    ok: false,
    message: `${input.target} chat endpoint not detected. Tried /v1/chat/completions, /chat/completions, /api/chat/completions.`,
  };
}
