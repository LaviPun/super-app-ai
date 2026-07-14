import { z } from 'zod';
import { isInternalAiLocalOnlyEnabled } from '~/env.server';
import { DEFAULT_ANTHROPIC_BASE_URL, type RouterRuntimeConfig } from '~/schemas/router-runtime-config.server';
import { isReferenceLocalPromptRouterBaseUrl } from '~/services/ai/assistant-router-local.server';
import type { AssistantMode } from '~/services/ai/internal-assistant-store.server';
import { formatToolContext, runAssistantTool, selectToolsForPrompt, type AssistantToolRunResult } from '~/services/ai/internal-assistant-tools.server';
import { getRouterRuntimeConfig } from '~/services/ai/router-runtime-config.server';
import { assertSafeTargetUrl as assertSafeUrl } from '~/services/security/ssrf.server';

const AssistantTargetSchema = z.enum(['localMachine', 'modalRemote']);

export type AssistantBackend = 'ollama' | 'openai' | 'qwen3' | 'custom' | 'anthropic';
export type AssistantTarget = z.infer<typeof AssistantTargetSchema>;

const AssistantMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export type AssistantChatResult = {
  target: AssistantTarget;
  backend: AssistantBackend;
  model: string;
  reply: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  hadFallback: boolean;
  toolResults: AssistantToolRunResult[];
};

export type AssistantStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_result'; tool: string; ok: boolean; data: Record<string, unknown> }
  | { type: 'done'; meta: Omit<AssistantChatResult, 'reply' | 'toolResults'> };

type ResolvedAssistantTargetConfig = {
  target: AssistantTarget;
  backend: AssistantBackend;
  model: string;
  url: string;
  token?: string;
  timeoutMs: number;
};

function defaultModelForBackend(backend: AssistantBackend): string {
  switch (backend) {
    case 'ollama':
      return 'qwen3:4b-instruct';
    case 'openai':
      return 'gpt-4o-mini';
    case 'qwen3':
      return 'Qwen/Qwen3-4B-Instruct';
    case 'anthropic':
      return process.env.ANTHROPIC_DEFAULT_MODEL?.trim() || 'claude-sonnet-4-6';
    default:
      return 'qwen3:4b-instruct';
  }
}

const ANTHROPIC_VERSION = '2023-06-01';

const SYSTEM_PROMPT = [
  'You are Qwen3, an internal operations copilot.',
  'Priorities: accuracy, concise reasoning, actionable output, no secrets leakage.',
  'If tool snapshots are provided, use them as source-of-truth system state.',
  'Tool safety: unscoped log/error tools only return aggregated redacted summaries. To get row-level details, include an explicit myshopify domain in the request.',
].join(' ');

function getTargetPrefix(target: AssistantTarget): 'LOCAL_ROUTER' | 'MODAL_ROUTER' {
  return target === 'localMachine' ? 'LOCAL_ROUTER' : 'MODAL_ROUTER';
}

/**
 * Floor for chat generation timeouts. The shared router target config defaults
 * to 3000ms, which is sized for prompt-router /route decisions — a chat
 * completion on a local 4B model takes >3s to first byte on a cold load, so
 * chat requests must not inherit that budget directly. Override with
 * INTERNAL_AI_CHAT_TIMEOUT_MS; keep below the ~90s Cloudflare tunnel limit.
 */
const CHAT_TIMEOUT_FLOOR_MS = 30_000;
/** Ceiling below the ~90s Cloudflare tunnel hard timeout. */
const CHAT_TIMEOUT_CEIL_MS = 90_000;

export function resolveChatTimeoutMs(configuredMs: number): number {
  const env = Number(process.env.INTERNAL_AI_CHAT_TIMEOUT_MS?.trim() || '');
  // A configured override must still respect the cold-start floor and the
  // tunnel ceiling — a too-small value silently undercuts local cold starts;
  // a too-large one loses the connection on the edge.
  if (Number.isFinite(env) && env > 0) {
    return Math.min(Math.max(env, CHAT_TIMEOUT_FLOOR_MS), CHAT_TIMEOUT_CEIL_MS);
  }
  return Math.max(configuredMs, CHAT_TIMEOUT_FLOOR_MS);
}

function getAllowedLocalHttpHosts(): string[] {
  const raw = process.env.INTERNAL_AI_ALLOW_HOSTS?.trim();
  if (!raw) return [];
  return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0);
}

export async function assertSafeTargetUrl(rawUrl: string): Promise<URL> {
  return assertSafeUrl(rawUrl, {
    allowHttpLocalhost: true,
    allowedHttpHostnames: getAllowedLocalHttpHosts(),
    context: 'Assistant target URL',
  });
}

async function resolveTargetConfig(target: AssistantTarget): Promise<ResolvedAssistantTargetConfig> {
  const runtimeResult = await getRouterRuntimeConfig();
  // Worker 2 changed getRouterRuntimeConfig to return { config, parseError? }.
  // Tolerate the legacy flat shape too so any stale mock or older caller path
  // still works during transition.
  const runtime: RouterRuntimeConfig =
    runtimeResult && typeof runtimeResult === 'object' && 'config' in runtimeResult
      ? (runtimeResult as { config: RouterRuntimeConfig; parseError?: string }).config
      : (runtimeResult as unknown as RouterRuntimeConfig);
  const parseError =
    runtimeResult && typeof runtimeResult === 'object' && 'parseError' in runtimeResult
      ? (runtimeResult as { parseError?: string }).parseError
      : undefined;
  if (parseError) {
    throw new Error(`Router runtime config unavailable: ${parseError}`);
  }
  const targetConfig = runtime.targets[target];
  const prefix = getTargetPrefix(target);
  const envUrl = process.env[`${prefix}_URL`]?.trim() || process.env.INTERNAL_AI_ROUTER_URL?.trim() || '';
  const envToken = process.env[`${prefix}_TOKEN`]?.trim() || process.env.INTERNAL_AI_ROUTER_TOKEN?.trim() || '';
  const envModel = process.env[`${prefix}_MODEL`]?.trim() || '';
  const backend = targetConfig.backend;
  if (backend === 'anthropic') {
    const url = targetConfig.url?.trim() || DEFAULT_ANTHROPIC_BASE_URL;
    await assertSafeTargetUrl(url);
    const token = targetConfig.token?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
    if (!token) {
      throw new Error(
        `Target "${target}" uses the Anthropic backend but no API key is configured. Set ANTHROPIC_API_KEY or add a token in /internal/model-setup.`,
      );
    }
    return {
      target,
      backend,
      model: targetConfig.model?.trim() || envModel || defaultModelForBackend(backend),
      token,
      timeoutMs: resolveChatTimeoutMs(targetConfig.timeoutMs),
      url,
    };
  }
  const url = targetConfig.url?.trim() || envUrl;
  if (!url) throw new Error(`Target "${target}" is not configured with a URL`);
  await assertSafeTargetUrl(url);

  return {
    target,
    backend,
    model: targetConfig.model?.trim() || envModel || defaultModelForBackend(backend),
    token: targetConfig.token?.trim() || envToken || undefined,
    timeoutMs: resolveChatTimeoutMs(targetConfig.timeoutMs),
    url,
  };
}

function normalizeMessages(messages: AssistantMessage[]) {
  return z.array(AssistantMessageSchema).min(1).max(60).parse(messages);
}

function buildPromptMessages(params: {
  messages: AssistantMessage[];
  memoryContext: Array<{ title: string; content: string; tags: string[] }>;
  memoryEnabled: boolean;
  toolResults: AssistantToolRunResult[];
}) {
  const normalized = normalizeMessages(params.messages);
  const out: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (params.memoryEnabled && params.memoryContext.length > 0) {
    const memoryBlock = params.memoryContext
      .map((m, index) => `Memory ${index + 1}: ${m.title} [${m.tags.join(', ')}]\n${m.content}`)
      .join('\n\n')
      .slice(0, 6000);
    out.push({
      role: 'system',
      content: `Long-term memory context (internal):\n${memoryBlock}`,
    });
  }
  const toolBlock = formatToolContext(params.toolResults);
  if (toolBlock) {
    out.push({
      role: 'system',
      content: toolBlock,
    });
  }
  for (const message of normalized) out.push({ role: message.role, content: message.content });
  return out;
}

async function runToolsIfNeeded(prompt: string) {
  const shopDomainMatch = prompt.match(/\b([a-z0-9][a-z0-9-]*\.myshopify\.com)\b/i);
  const shopDomain = shopDomainMatch?.[1]?.toLowerCase();
  const tools = selectToolsForPrompt(prompt);
  const results: AssistantToolRunResult[] = [];
  for (const tool of tools) {
    try {
      results.push(await runAssistantTool(tool, { shopDomain }));
    } catch (error) {
      results.push({
        toolName: tool,
        ok: false,
        data: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return results;
}

export class AssistantUpstreamHttpError extends Error {
  override readonly name = 'AssistantUpstreamHttpError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly bodySnippet: string,
  ) {
    super(message);
  }
}

type OllamaModelSelection = {
  requestedModel: string;
  selectedModel: string;
  availableModels: string[];
};

type OllamaSendResult = {
  response: Response;
  model: string;
};

async function sendViaOpenAiCompatible(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}) {
  const endpointCandidates = [
    '/v1/chat/completions',
    '/chat/completions',
    '/api/chat/completions',
  ];
  const baseUrl = params.config.url.replace(/\/+$/, '');
  const requestBody = {
    model: params.config.model,
    messages: params.messages,
    stream: params.stream === true,
    stream_options: params.stream ? { include_usage: true } : undefined,
    temperature: 0.2,
    max_tokens: 1400,
  };
  let lastBody = '';
  let lastStatus = 0;
  let lastEndpoint = endpointCandidates[0];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    for (const endpoint of endpointCandidates) {
      lastEndpoint = endpoint;
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(params.config.token ? { authorization: `Bearer ${params.config.token}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (response.ok) return response;

      lastStatus = response.status;
      lastBody = (await response.text()).slice(0, 300);
      if (response.status === 404) continue;
      throw new AssistantUpstreamHttpError(
        `Assistant upstream error ${response.status}: ${lastBody} (endpoint ${endpoint})`,
        response.status,
        endpoint,
        lastBody,
      );
    }
    throw new AssistantUpstreamHttpError(
      [
        `Assistant upstream error ${lastStatus || 404}: ${lastBody || 'Not Found'}`,
        `Configured URL (${baseUrl}) does not expose a compatible chat endpoint.`,
        `Tried: ${endpointCandidates.join(', ')}`,
        `Update target URL/backend in /internal/model-setup.`,
      ].join(' '),
      404,
      lastEndpoint ?? endpointCandidates[0]!,
      lastBody,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Anthropic Messages API transport. System-role prompt messages move to the
 * top-level `system` parameter; auth uses `x-api-key` + `anthropic-version`
 * (not Bearer). Streaming responses are SSE with `content_block_delta` /
 * `message_start` / `message_delta` events.
 */
async function sendViaAnthropic(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}): Promise<Response> {
  const baseUrl = params.config.url.replace(/\/+$/, '');
  const system = params.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const turns = params.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': params.config.token ?? '',
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: params.config.model,
        max_tokens: 2048,
        ...(system ? { system } : {}),
        messages: turns,
        stream: params.stream === true,
      }),
      signal: controller.signal,
    });
    if (response.ok) return response;
    const body = (await response.text()).slice(0, 400);
    throw new AssistantUpstreamHttpError(
      `Assistant upstream error ${response.status}: ${body} (Anthropic /v1/messages)`,
      response.status,
      '/v1/messages',
      body,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaOllama(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}): Promise<OllamaSendResult> {
  const baseUrl = params.config.url.replace(/\/+$/, '');
  const sendWithModel = async (model: string, controller: AbortController) =>
    fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(params.config.token ? { authorization: `Bearer ${params.config.token}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        stream: params.stream === true,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const initial = await sendWithModel(params.config.model, controller);
    if (initial.ok) return { response: initial, model: params.config.model };

    const body = (await initial.text()).slice(0, 400);
    const fallbackModel = await resolveOllamaMissingModelFallback({
      baseUrl,
      token: params.config.token,
      timeoutMs: params.config.timeoutMs,
      status: initial.status,
      body,
      requestedModel: params.config.model,
    });
    if (fallbackModel) {
      const retry = await sendWithModel(fallbackModel.selectedModel, controller);
      if (retry.ok) return { response: retry, model: fallbackModel.selectedModel };
      const retryBody = (await retry.text()).slice(0, 400);
      throw new AssistantUpstreamHttpError(
        `Assistant upstream error ${retry.status}: ${retryBody}`,
        retry.status,
        '/api/chat',
        retryBody,
      );
    }

    throw buildOllamaMissingModelError({
      status: initial.status,
      body,
      requestedModel: params.config.model,
      localOnly: isInternalAiLocalOnlyEnabled(),
      endpoint: '/api/chat',
      baseUrl,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readNonStreamingResponse(response: Response, backend: ResolvedAssistantTargetConfig['backend']) {
  if (backend === 'anthropic') {
    const payload = await response.json();
    const reply = Array.isArray(payload?.content)
      ? payload.content
          .filter((block: { type?: string }) => block?.type === 'text')
          .map((block: { text?: string }) => block?.text ?? '')
          .join('')
      : '';
    if (!reply.trim()) throw new Error('Assistant response was empty');
    return {
      reply: reply.trim(),
      tokensIn: Number(payload?.usage?.input_tokens ?? 0) || 0,
      tokensOut: Number(payload?.usage?.output_tokens ?? 0) || 0,
    };
  }
  if (backend === 'ollama') {
    const payload = await response.json();
    const reply = payload?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('Assistant response was empty');
    return {
      reply: reply.trim(),
      tokensIn: Number(payload?.prompt_eval_count ?? 0) || 0,
      tokensOut: Number(payload?.eval_count ?? 0) || 0,
    };
  }
  const payload = await response.json();
  const reply = payload?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('Assistant response was empty');
  return {
    reply: reply.trim(),
    tokensIn: Number(payload?.usage?.prompt_tokens ?? 0) || 0,
    tokensOut: Number(payload?.usage?.completion_tokens ?? 0) || 0,
  };
}

type AssistantStreamChunk = {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type AnthropicStreamEvent = {
  type?: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function* readStreamingResponse(response: Response, backend: ResolvedAssistantTargetConfig['backend']): AsyncGenerator<{ token?: string; tokensIn?: number; tokensOut?: number }> {
  if (!response.body) throw new Error('Streaming response body missing');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (backend === 'ollama') {
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let json: AssistantStreamChunk | undefined;
          try {
            json = JSON.parse(trimmed) as AssistantStreamChunk;
          } catch {
            continue;
          }
          const token = typeof json?.message?.content === 'string' ? json.message.content : '';
          if (token) yield { token };
          if (json?.done === true) {
            yield {
              tokensIn: Number(json?.prompt_eval_count ?? 0) || 0,
              tokensOut: Number(json?.eval_count ?? 0) || 0,
            };
          }
        }
      } else if (backend === 'anthropic') {
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          for (const rawLine of frame.split('\n')) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            let json: AnthropicStreamEvent | undefined;
            try {
              json = JSON.parse(data) as AnthropicStreamEvent;
            } catch {
              continue;
            }
            if (json?.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
              const token = json.delta.text;
              if (typeof token === 'string' && token) yield { token };
              continue;
            }
            if (json?.type === 'message_start' && json.message?.usage) {
              yield { tokensIn: Number(json.message.usage.input_tokens ?? 0) || 0 };
              continue;
            }
            if (json?.type === 'message_delta' && json.usage) {
              yield { tokensOut: Number(json.usage.output_tokens ?? 0) || 0 };
            }
          }
        }
      } else {
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          for (const rawLine of frame.split('\n')) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let json: AssistantStreamChunk | undefined;
            try {
              json = JSON.parse(data) as AssistantStreamChunk;
            } catch {
              continue;
            }
            const token = json?.choices?.[0]?.delta?.content;
            if (typeof token === 'string' && token) yield { token };
            if (json?.usage) {
              yield {
                tokensIn: Number(json.usage.prompt_tokens ?? 0) || 0,
                tokensOut: Number(json.usage.completion_tokens ?? 0) || 0,
              };
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

type ResolvedBackend = ResolvedAssistantTargetConfig['backend'];

type TrySendResult = { response: Response; streamBackend: ResolvedBackend; resolvedModel: string };

function isUseless422BodySnippet(snip: string): boolean {
  const t = snip.trim();
  if (t.length === 0) return true;
  if (t.length >= 32) return false;
  return true;
}

function shouldAttemptOllamaAfterOpenAiFailure(
  config: ResolvedAssistantTargetConfig,
  error: unknown,
): boolean {
  if (!isReferenceLocalPromptRouterBaseUrl(config.url)) return false;
  if (config.backend !== 'qwen3' && config.backend !== 'openai') return false;
  if (!(error instanceof AssistantUpstreamHttpError)) return false;
  if (error.status === 404) return false;
  if ([502, 503, 504, 401, 403].includes(error.status)) return true;
  if (error.status === 422) return isUseless422BodySnippet(error.bodySnippet);
  return false;
}

/**
 * Reference `internal-ai-router`: try OpenAI-compatible paths first (`/v1/chat/completions`,
 * `/chat/completions`, `/api/chat/completions`); on reference-local base only, if that fails with
 * 502/503/504/401/403 or a 422 with a useless body, one attempt via Ollama `POST /api/chat` before
 * surfacing the error. Remote hosts (e.g. Modal) never use this Ollama fallback.
 */
async function trySend(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}): Promise<TrySendResult> {
  if (params.config.backend === 'anthropic') {
    const response = await sendViaAnthropic(params);
    return { response, streamBackend: 'anthropic', resolvedModel: params.config.model };
  }
  if (params.config.backend === 'ollama') {
    const result = await sendViaOllama(params);
    return { response: result.response, streamBackend: 'ollama', resolvedModel: result.model };
  }
  if (params.config.backend === 'custom') {
    const response = await sendViaOpenAiCompatible(params);
    return { response, streamBackend: 'custom', resolvedModel: params.config.model };
  }
  try {
    const response = await sendViaOpenAiCompatible(params);
    return { response, streamBackend: params.config.backend, resolvedModel: params.config.model };
  } catch (error) {
    if (shouldAttemptOllamaAfterOpenAiFailure(params.config, error)) {
      const result = await sendViaOllama(params);
      return { response: result.response, streamBackend: 'ollama', resolvedModel: result.model };
    }
    throw error;
  }
}

async function resolveWithFailover(target: AssistantTarget, allowFallback: boolean) {
  const primary = await resolveTargetConfig(target);
  const fallbackTarget: AssistantTarget = target === 'localMachine' ? 'modalRemote' : 'localMachine';
  const fallback = allowFallback ? await resolveTargetConfig(fallbackTarget).catch(() => null) : null;
  return { primary, fallback };
}

export async function sendInternalAssistantChat(input: {
  target: AssistantTarget;
  messages: AssistantMessage[];
  memoryContext?: Array<{ title: string; content: string; tags: string[] }>;
  memoryEnabled?: boolean;
  allowFallback?: boolean;
}): Promise<AssistantChatResult> {
  const target = AssistantTargetSchema.parse(input.target);
  if (isInternalAiLocalOnlyEnabled() && target === 'modalRemote') {
    throw new Error(
      'Cloud assistant target is disabled while INTERNAL_AI_LOCAL_ONLY is set. Switch the session to Local or unset INTERNAL_AI_LOCAL_ONLY.',
    );
  }
  const allowCrossTargetFallback = (input.allowFallback ?? true) && !isInternalAiLocalOnlyEnabled();
  const prompt = input.messages[input.messages.length - 1]?.content ?? '';
  const toolResults = await runToolsIfNeeded(prompt);
  const promptMessages = buildPromptMessages({
    messages: input.messages,
    memoryContext: input.memoryContext ?? [],
    memoryEnabled: input.memoryEnabled ?? true,
    toolResults,
  });
  const startedAt = Date.now();
  const { primary, fallback } = await resolveWithFailover(target, allowCrossTargetFallback);
  let used = primary;
  let hadFallback = false;
  let response: Response;
  let streamBackend: ResolvedBackend = used.backend;
  let resolvedModel = used.model;
  try {
    ({ response, streamBackend, resolvedModel } = await trySend({ config: primary, messages: promptMessages, stream: false }));
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    used = fallback;
    hadFallback = true;
    try {
      ({ response, streamBackend, resolvedModel } = await trySend({ config: fallback, messages: promptMessages, stream: false }));
    } catch {
      throw primaryError;
    }
  }
  const parsed = await readNonStreamingResponse(response, streamBackend);
  return {
    target: used.target,
    backend: streamBackend,
    model: resolvedModel,
    reply: parsed.reply,
    latencyMs: Date.now() - startedAt,
    tokensIn: parsed.tokensIn,
    tokensOut: parsed.tokensOut,
    hadFallback,
    toolResults,
  };
}

export async function* streamInternalAssistantChat(input: {
  target: AssistantMode;
  messages: AssistantMessage[];
  memoryContext?: Array<{ title: string; content: string; tags: string[] }>;
  memoryEnabled?: boolean;
  allowFallback?: boolean;
}): AsyncGenerator<AssistantStreamEvent, AssistantChatResult, void> {
  const target = AssistantTargetSchema.parse(input.target);
  if (isInternalAiLocalOnlyEnabled() && target === 'modalRemote') {
    throw new Error(
      'Cloud assistant target is disabled while INTERNAL_AI_LOCAL_ONLY is set. Switch the session to Local or unset INTERNAL_AI_LOCAL_ONLY.',
    );
  }
  const allowCrossTargetFallback = (input.allowFallback ?? true) && !isInternalAiLocalOnlyEnabled();
  const prompt = input.messages[input.messages.length - 1]?.content ?? '';
  const toolResults = await runToolsIfNeeded(prompt);
  for (const result of toolResults) {
    yield { type: 'tool_result', tool: result.toolName, ok: result.ok, data: result.data };
  }

  const promptMessages = buildPromptMessages({
    messages: input.messages,
    memoryContext: input.memoryContext ?? [],
    memoryEnabled: input.memoryEnabled ?? true,
    toolResults,
  });

  const startedAt = Date.now();
  const { primary, fallback } = await resolveWithFailover(target, allowCrossTargetFallback);
  let used = primary;
  let hadFallback = false;
  let response: Response;
  let streamBackend: ResolvedBackend = used.backend;
  let resolvedModel = used.model;
  try {
    ({ response, streamBackend, resolvedModel } = await trySend({ config: primary, messages: promptMessages, stream: true }));
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    used = fallback;
    hadFallback = true;
    try {
      ({ response, streamBackend, resolvedModel } = await trySend({ config: fallback, messages: promptMessages, stream: true }));
    } catch {
      throw primaryError;
    }
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let reply = '';
  for await (const part of readStreamingResponse(response, streamBackend)) {
    if (typeof part.token === 'string' && part.token.length > 0) {
      reply += part.token;
      yield { type: 'token', text: part.token };
    }
    if (part.tokensIn !== undefined) tokensIn = part.tokensIn;
    if (part.tokensOut !== undefined) tokensOut = part.tokensOut;
  }

  if (!tokensIn) tokensIn = Math.ceil(promptMessages.map((m) => m.content).join('\n').length / 4);
  if (!tokensOut) tokensOut = Math.ceil(reply.length / 4);

  const result: AssistantChatResult = {
    target: used.target,
    backend: streamBackend,
    model: resolvedModel,
    reply: reply.trim(),
    latencyMs: Date.now() - startedAt,
    tokensIn,
    tokensOut,
    hadFallback,
    toolResults,
  };
  yield {
    type: 'done',
    meta: {
      target: result.target,
      backend: result.backend,
      model: result.model,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      hadFallback: result.hadFallback,
    },
  };
  return result;
}

function parseOllamaModelNotFoundMessage(body: string): { requestedModel: string } | null {
  const direct = body.match(/model\s+'([^']+)'\s+not found/i);
  if (direct?.[1]) return { requestedModel: direct[1] };
  const generic = body.match(/model\s+"([^"]+)"\s+not found/i);
  if (generic?.[1]) return { requestedModel: generic[1] };
  return null;
}

function chooseOllamaFallbackModel(requestedModel: string, availableModels: string[]): string | null {
  if (availableModels.length === 0) return null;
  const requested = requestedModel.trim().toLowerCase();
  const exactDefault = availableModels.find((m) => m.toLowerCase() === 'qwen3:4b-instruct');
  if (exactDefault && exactDefault.toLowerCase() !== requested) return exactDefault;
  const qwenVariant = availableModels.find((m) => m.toLowerCase().startsWith('qwen3:'));
  if (qwenVariant && qwenVariant.toLowerCase() !== requested) return qwenVariant;
  const first = availableModels[0];
  if (first && first.toLowerCase() !== requested) return first;
  return null;
}

async function listOllamaModels(params: {
  baseUrl: string;
  token?: string;
  timeoutMs: number;
}): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(params.timeoutMs, 5000));
  try {
    const response = await fetch(`${params.baseUrl}/api/tags`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = (await response.json()) as { models?: Array<{ name?: string }> };
    if (!Array.isArray(json.models)) return [];
    return json.models
      .map((entry) => (typeof entry?.name === 'string' ? entry.name.trim() : ''))
      .filter((name) => name.length > 0);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveOllamaMissingModelFallback(params: {
  baseUrl: string;
  token?: string;
  timeoutMs: number;
  status: number;
  body: string;
  requestedModel: string;
}): Promise<OllamaModelSelection | null> {
  if (params.status !== 404) return null;
  const parsed = parseOllamaModelNotFoundMessage(params.body);
  if (!parsed) return null;
  const availableModels = await listOllamaModels({
    baseUrl: params.baseUrl,
    token: params.token,
    timeoutMs: params.timeoutMs,
  });
  const selectedModel = chooseOllamaFallbackModel(parsed.requestedModel || params.requestedModel, availableModels);
  if (!selectedModel) return null;
  return {
    requestedModel: parsed.requestedModel || params.requestedModel,
    selectedModel,
    availableModels,
  };
}

function buildOllamaMissingModelError(params: {
  status: number;
  body: string;
  requestedModel: string;
  localOnly: boolean;
  endpoint: string;
  baseUrl: string;
}): AssistantUpstreamHttpError {
  const parsed = parseOllamaModelNotFoundMessage(params.body);
  if (params.status === 404 && parsed) {
    const requested = parsed.requestedModel || params.requestedModel;
    const fallbackHint = params.localOnly
      ? 'Cloud fallback is disabled while INTERNAL_AI_LOCAL_ONLY is set.'
      : 'If cloud target is enabled, assistant can fail over to Cloud automatically.';
    return new AssistantUpstreamHttpError(
      [
        `Local model "${requested}" is not installed on this Ollama host.`,
        `Pull it with: ollama pull ${requested}`,
        `Then retry, or change model in /internal/model-setup.`,
        fallbackHint,
      ].join(' '),
      404,
      params.endpoint,
      params.body,
    );
  }
  return new AssistantUpstreamHttpError(
    `Assistant upstream error ${params.status}: ${params.body}`,
    params.status,
    params.endpoint,
    params.body,
  );
}
