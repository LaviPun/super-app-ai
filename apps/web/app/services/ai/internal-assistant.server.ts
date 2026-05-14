import { z } from 'zod';
import { getRouterRuntimeConfig } from '~/services/ai/router-runtime-config.server';
import type { RouterRuntimeConfig } from '~/schemas/router-runtime-config.server';
import type { AssistantMode } from '~/services/ai/internal-assistant-store.server';
import { formatToolContext, runAssistantTool, selectToolsForPrompt, type AssistantToolRunResult } from '~/services/ai/internal-assistant-tools.server';

const AssistantTargetSchema = z.enum(['localMachine', 'modalRemote']);
export type AssistantTarget = z.infer<typeof AssistantTargetSchema>;

const AssistantMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export type AssistantChatResult = {
  target: AssistantTarget;
  backend: 'ollama' | 'openai' | 'qwen3' | 'custom';
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
  | { type: 'done'; meta: Omit<AssistantChatResult, 'reply'> };

type ResolvedAssistantTargetConfig = {
  target: AssistantTarget;
  backend: 'ollama' | 'openai' | 'qwen3' | 'custom';
  model: string;
  url: string;
  token?: string;
  timeoutMs: number;
};

const DEFAULT_MODEL_BY_BACKEND: Record<'ollama' | 'openai' | 'qwen3' | 'custom', string> = {
  ollama: 'qwen3:4b-instruct',
  openai: 'gpt-4o-mini',
  qwen3: 'Qwen/Qwen3-4B-Instruct',
  custom: 'qwen3:4b-instruct',
};

const SYSTEM_PROMPT = [
  'You are Qwen3, an internal operations copilot.',
  'Priorities: accuracy, concise reasoning, actionable output, no secrets leakage.',
  'If tool snapshots are provided, use them as source-of-truth system state.',
].join(' ');

function getTargetPrefix(target: AssistantTarget): 'LOCAL_ROUTER' | 'MODAL_ROUTER' {
  return target === 'localMachine' ? 'LOCAL_ROUTER' : 'MODAL_ROUTER';
}

const LOCALHOST_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);
const BLOCKED_METADATA_HOSTS = new Set(['metadata.google.internal']);

function normalizeHostname(hostname: string): string {
  let h = hostname.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h;
}

function isLinkLocalIPv4(host: string): boolean {
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isLinkLocalIPv6(host: string): boolean {
  return host.startsWith('fe80:');
}

function getAllowedHosts(): Set<string> {
  const raw = process.env.INTERNAL_AI_ALLOW_HOSTS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

export function assertSafeTargetUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const hostname = normalizeHostname(url.hostname);
  const allowed = getAllowedHosts();
  const isAllowlisted = allowed.has(hostname);

  if (url.protocol === 'http:') {
    if (isAllowlisted) return url;
    if (!LOCALHOST_HOSTNAMES.has(hostname)) {
      throw new Error('Assistant target URL must be https or localhost http');
    }
    return url;
  }

  if (url.protocol !== 'https:') {
    throw new Error('Assistant target URL must be https or localhost http');
  }

  if (isAllowlisted) return url;
  if (isLinkLocalIPv4(hostname)) {
    throw new Error('Assistant target URL hostname is link-local and not allowlisted');
  }
  if (isLinkLocalIPv6(hostname)) {
    throw new Error('Assistant target URL hostname is link-local IPv6 and not allowlisted');
  }
  if (BLOCKED_METADATA_HOSTS.has(hostname)) {
    throw new Error('Assistant target URL hostname is a cloud metadata endpoint and not allowlisted');
  }
  return url;
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
  const url = targetConfig.url?.trim() || envUrl;
  if (!url) throw new Error(`Target "${target}" is not configured with a URL`);
  assertSafeTargetUrl(url);

  const backend = targetConfig.backend;
  return {
    target,
    backend,
    model: targetConfig.model?.trim() || envModel || DEFAULT_MODEL_BY_BACKEND[backend],
    token: targetConfig.token?.trim() || envToken || undefined,
    timeoutMs: targetConfig.timeoutMs,
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
  const tools = selectToolsForPrompt(prompt);
  const results: AssistantToolRunResult[] = [];
  for (const tool of tools) {
    try {
      results.push(await runAssistantTool(tool));
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
      if (response.status !== 404) {
        break;
      }
    }
    if (lastStatus === 404) {
      throw new Error(
        [
          `Assistant upstream error 404: ${lastBody || 'Not Found'}`,
          `Configured URL (${baseUrl}) does not expose a compatible chat endpoint.`,
          `Tried: ${endpointCandidates.join(', ')}`,
          `Update target URL/backend in /internal/model-setup.`,
        ].join(' '),
      );
    }
    throw new Error(`Assistant upstream error ${lastStatus}: ${lastBody} (endpoint ${lastEndpoint})`);
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaOllama(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
  try {
    const response = await fetch(`${params.config.url.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(params.config.token ? { authorization: `Bearer ${params.config.token}` } : {}),
      },
      body: JSON.stringify({
        model: params.config.model,
        messages: params.messages,
        stream: params.stream === true,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Assistant upstream error ${response.status}: ${body.slice(0, 300)}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function readNonStreamingResponse(response: Response, backend: ResolvedAssistantTargetConfig['backend']) {
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

async function trySend(params: {
  config: ResolvedAssistantTargetConfig;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  stream?: boolean;
}) {
  if (params.config.backend === 'ollama') return sendViaOllama(params);
  return sendViaOpenAiCompatible(params);
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
  const prompt = input.messages[input.messages.length - 1]?.content ?? '';
  const toolResults = await runToolsIfNeeded(prompt);
  const promptMessages = buildPromptMessages({
    messages: input.messages,
    memoryContext: input.memoryContext ?? [],
    memoryEnabled: input.memoryEnabled ?? true,
    toolResults,
  });
  const startedAt = Date.now();
  const { primary, fallback } = await resolveWithFailover(target, input.allowFallback ?? true);
  let used = primary;
  let hadFallback = false;
  let response: Response;
  try {
    response = await trySend({ config: primary, messages: promptMessages, stream: false });
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    used = fallback;
    hadFallback = true;
    try {
      response = await trySend({ config: fallback, messages: promptMessages, stream: false });
    } catch {
      throw primaryError;
    }
  }
  const parsed = await readNonStreamingResponse(response, used.backend);
  return {
    target: used.target,
    backend: used.backend,
    model: used.model,
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
  const { primary, fallback } = await resolveWithFailover(target, input.allowFallback ?? true);
  let used = primary;
  let hadFallback = false;
  let response: Response;
  try {
    response = await trySend({ config: primary, messages: promptMessages, stream: true });
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    used = fallback;
    hadFallback = true;
    try {
      response = await trySend({ config: fallback, messages: promptMessages, stream: true });
    } catch {
      throw primaryError;
    }
  }

  let tokensIn = 0;
  let tokensOut = 0;
  let reply = '';
  for await (const part of readStreamingResponse(response, used.backend)) {
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
    backend: used.backend,
    model: used.model,
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
      toolResults: result.toolResults,
    },
  };
  return result;
}
