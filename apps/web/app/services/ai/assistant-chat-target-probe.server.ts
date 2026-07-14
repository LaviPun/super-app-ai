import type { RouterRuntimeTarget } from '~/schemas/router-runtime-config.server';
import { isReferenceLocalPromptRouterBaseUrl } from '~/services/ai/assistant-router-local.server';
import { assertSafeTargetUrl } from '~/services/ai/internal-assistant.server';

export type AssistantRouterBackend = 'ollama' | 'openai' | 'qwen3' | 'custom' | 'anthropic';

export type AssistantChatProbeResult = {
  ok: boolean;
  message: string;
};

/** Fallback model for the Anthropic `/v1/messages` handshake ping when a target has no configured model. */
export const ANTHROPIC_PROBE_MODEL = 'claude-haiku-4-5';

export async function fetchWithTimeout(
  url: string,
  token: string | undefined,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  await assertSafeTargetUrl(url);
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

/**
 * True when the HTTP server clearly handled the route (including upstream
 * failures). Used for assistant target validation so `internal-ai-router`
 * returning 502 (Ollama/OpenAI unreachable) still counts as "chat stack
 * reachable" vs connection refused / 404.
 */
export function isChatHandshakeStatus(status: number): boolean {
  return isChatEndpointStatus(status) || status === 502 || status === 503 || status === 504;
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

  if (input.backend === 'anthropic') {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/v1/models?limit=1`, undefined, ms, {
        method: 'GET',
        headers: {
          'x-api-key': input.token ?? '',
          'anthropic-version': '2023-06-01',
        },
      });
      if (response.ok) return { ok: true, message: `Anthropic API reachable (${response.status})` };
      if (response.status === 401) return { ok: false, message: 'Anthropic API key rejected (401)' };
      return { ok: false, message: `Anthropic /v1/models returned ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'unreachable' };
    }
  }

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
            moduleType: 'theme.section',
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
  /** Configured target model; falls back to ANTHROPIC_PROBE_MODEL for the anthropic ping. */
  model?: string;
}): Promise<AssistantChatProbeResult> {
  const rawUrl = input.url?.trim();
  if (!rawUrl) {
    return { ok: false, message: `${input.target} URL missing` };
  }
  const baseUrl = rawUrl.replace(/\/+$/, '');

  if (input.backend === 'anthropic') {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/v1/messages`, undefined, Math.max(input.timeoutMs, 12_000), {
        method: 'POST',
        headers: {
          'x-api-key': input.token ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: input.model?.trim() || ANTHROPIC_PROBE_MODEL,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      if (response.status === 401) {
        return { ok: false, message: `${input.target} Anthropic API key rejected (401). Check ANTHROPIC_API_KEY or the configured token.` };
      }
      if (isChatHandshakeStatus(response.status)) {
        return { ok: true, message: `${input.target} Anthropic Messages API accepted (/v1/messages ${response.status})` };
      }
      return { ok: false, message: `${input.target} Anthropic /v1/messages returned ${response.status}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : `${input.target} Anthropic API unreachable` };
    }
  }

  if (input.backend === 'ollama') {
    try {
      const tags = await fetchWithTimeout(`${baseUrl}/api/tags`, input.token, input.timeoutMs, { method: 'GET' });
      if (isChatHandshakeStatus(tags.status)) {
        const hint =
          tags.status === 502 || tags.status === 503 || tags.status === 504
            ? ' (upstream may be down — start Ollama or check ROUTER_OLLAMA_BASE_URL)'
            : '';
        return { ok: true, message: `${input.target} Ollama endpoint accepted (/api/tags ${tags.status})${hint}` };
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

  // Include `/api/chat` so targets pointing at `internal-ai-router` (Ollama
  // passthrough) validate when `backend` is `qwen3`/`openai` but the router
  // does not expose a working OpenAI-compatible upstream yet.
  const chatCandidates = ['/v1/chat/completions', '/chat/completions', '/api/chat/completions', '/api/chat'];
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
      if (isChatHandshakeStatus(response.status)) {
        const hint =
          response.status === 502 || response.status === 503 || response.status === 504
            ? ' (upstream may be down)'
            : '';
        const refHint = isReferenceLocalPromptRouterBaseUrl(baseUrl)
          ? ' Reference local router: validation tries OpenAI-style paths then POST /api/chat; chat sends prefer OpenAI paths then fall back to Ollama /api/chat when upstream is unset or errors (502/503/504/401/403 or trivial 422).'
          : '';
        return {
          ok: true,
          message: `${input.target} chat endpoint accepted (${endpoint} ${response.status})${hint}.${refHint}`,
        };
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
    message: `${input.target} chat endpoint not detected. Tried OpenAI-compatible paths (/v1/chat/completions, /chat/completions, /api/chat/completions) then POST /api/chat.${
      isReferenceLocalPromptRouterBaseUrl(baseUrl)
        ? ' On reference :8787 with backend qwen3/openai, start Ollama or configure the router OpenAI upstream; the assistant will try Ollama /api/chat automatically on common failures.'
        : ''
    }`,
  };
}
