import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useRevalidator, useSearchParams } from '@remix-run/react';
import {
  Banner,
  Button,
  Page,
  Text,
} from '@shopify/polaris';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getRouterRuntimeConfig } from '~/services/ai/router-runtime-config.server';
import { DEFAULT_ROUTER_RUNTIME_CONFIG } from '~/schemas/router-runtime-config.server';
import {
  probeTargetLiveness,
  validateAssistantChatTarget,
} from '~/services/ai/assistant-chat-target-probe.server';
import { InternalAssistantStoreService } from '~/services/ai/internal-assistant-store.server';

const ActionSchema = z.object({
  intent: z.enum([
    'createSession',
    'updateSession',
    'deleteSession',
    'createMemory',
    'updateMemory',
    'deleteMemory',
    'importSession',
  ]),
  sessionId: z.string().optional(),
  title: z.string().optional(),
  mode: z.enum(['localMachine', 'modalRemote']).optional(),
  memoryEnabled: z.enum(['true', 'false']).optional(),
  memoryId: z.string().optional(),
  content: z.string().optional(),
  tags: z.string().optional(),
  isEnabled: z.enum(['true', 'false']).optional(),
  payload: z.string().optional(),
});

const ImportSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  mode: z.enum(['localMachine', 'modalRemote']).default('localMachine'),
  memoryEnabled: z.boolean().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().trim().min(1).max(8000),
    mode: z.enum(['localMachine', 'modalRemote']).optional(),
    backend: z.string().optional(),
    model: z.string().optional(),
    error: z.string().optional(),
    retryCount: z.number().int().min(0).max(10).optional(),
  })).max(400),
});

type MarkdownPart = { type: 'text'; value: string } | { type: 'code'; value: string; language: string };

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return d.toISOString().slice(11, 16);
}

/** Reference dev router default port (see `pnpm --filter web router:internal`). */
const REFERENCE_ROUTER_8787_HINT =
  'Tip: start `pnpm --filter web router:internal` and keep Ollama (`ROUTER_OLLAMA_BASE_URL`) or an OpenAI-compatible upstream (`ROUTER_OPENAI_BASE_URL`) reachable for your backend.';

function isReferenceInternalRouterUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /(^|[/:])8787(\/|$)/.test(url);
}

function parseMarkdown(content: string): MarkdownPart[] {
  const parts: MarkdownPart[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', language: match[1] || 'code', value: match[2] || '' });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts;
}

function MarkdownView({
  content,
  onCopyCode,
}: {
  content: string;
  onCopyCode?: (code: string) => void;
}) {
  const parts = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className="AiAssistant-markdown">
      {parts.map((part, idx) => {
        if (part.type === 'code') {
          return (
            <div key={`${idx}-code`} className="AiAssistant-codeBlock">
              <div className="AiAssistant-codeHeader">
                <span>{part.language}</span>
                <button type="button" onClick={() => onCopyCode?.(part.value)}>Copy</button>
              </div>
              <pre>{part.value}</pre>
            </div>
          );
        }
        return (
          <div key={`${idx}-text`} className="AiAssistant-paragraph">
            {part.value}
          </div>
        );
      })}
    </div>
  );
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const requestedSessionId = url.searchParams.get('sessionId') ?? '';
  const store = new InternalAssistantStoreService();
  let runtime = DEFAULT_ROUTER_RUNTIME_CONFIG;
  let sessions: Awaited<ReturnType<InternalAssistantStoreService['listSessions']>> = [];
  let messages: Awaited<ReturnType<InternalAssistantStoreService['listMessages']>> = [];
  let memories: Awaited<ReturnType<InternalAssistantStoreService['listMemories']>> = [];
  let loaderWarning: string | null = null;

  try {
    runtime = await getRouterRuntimeConfig();
  } catch (error) {
    loaderWarning = `Runtime config unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    sessions = await store.listSessions(query);
  } catch (error) {
    loaderWarning = `Assistant store unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }

  let activeSession = sessions.find((s) => s.id === requestedSessionId) ?? sessions[0] ?? null;
  if (!activeSession) {
    try {
      activeSession = await store.createSession({
        title: 'New chat',
        mode: runtime.activeTarget,
        memoryEnabled: true,
      });
    } catch (error) {
      loaderWarning = `Session initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      activeSession = {
        id: 'unavailable',
        title: 'Assistant unavailable',
        mode: runtime.activeTarget,
        memoryEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      };
    }
  }
  if (activeSession.id !== 'unavailable') {
    try {
      [messages, memories] = await Promise.all([
        store.listMessages(activeSession.id, 200),
        store.listMemories(),
      ]);
    } catch (error) {
      loaderWarning = `Assistant data load failed: ${error instanceof Error ? error.message : String(error)}`;
      messages = [];
      memories = [];
    }
  }

  const totalTokenStats = messages.reduce(
    (acc, m) => {
      acc.tokensIn += m.tokensIn ?? 0;
      acc.tokensOut += m.tokensOut ?? 0;
      acc.costCents += m.estimatedCostCents ?? 0;
      return acc;
    },
    { tokensIn: 0, tokensOut: 0, costCents: 0 },
  );
  const [localHealth, modalHealth, localChatProbe, modalChatProbe] = await Promise.all([
    probeTargetLiveness({
      backend: runtime.targets.localMachine.backend,
      url: runtime.targets.localMachine.url,
      token: runtime.targets.localMachine.token,
      timeoutMs: runtime.targets.localMachine.timeoutMs,
    }),
    probeTargetLiveness({
      backend: runtime.targets.modalRemote.backend,
      url: runtime.targets.modalRemote.url,
      token: runtime.targets.modalRemote.token,
      timeoutMs: runtime.targets.modalRemote.timeoutMs,
    }),
    validateAssistantChatTarget({
      target: 'localMachine',
      backend: runtime.targets.localMachine.backend,
      url: runtime.targets.localMachine.url,
      token: runtime.targets.localMachine.token,
      timeoutMs: runtime.targets.localMachine.timeoutMs,
    }),
    validateAssistantChatTarget({
      target: 'modalRemote',
      backend: runtime.targets.modalRemote.backend,
      url: runtime.targets.modalRemote.url,
      token: runtime.targets.modalRemote.token,
      timeoutMs: runtime.targets.modalRemote.timeoutMs,
    }),
  ]);

  return json({
    sessions,
    activeSession,
    messages,
    memories,
    query,
    targets: {
      localMachine: {
        configured: Boolean(runtime.targets.localMachine.url),
        url: runtime.targets.localMachine.url ?? '',
        backend: runtime.targets.localMachine.backend,
        model: runtime.targets.localMachine.model ?? '',
        health: localHealth,
        chatProbe: localChatProbe,
      },
      modalRemote: {
        configured: Boolean(runtime.targets.modalRemote.url),
        url: runtime.targets.modalRemote.url ?? '',
        backend: runtime.targets.modalRemote.backend,
        model: runtime.targets.modalRemote.model ?? '',
        health: modalHealth,
        chatProbe: modalChatProbe,
      },
    },
    overview: {
      tokensIn: totalTokenStats.tokensIn,
      tokensOut: totalTokenStats.tokensOut,
      estimatedCostCents: totalTokenStats.costCents,
    },
    loaderWarning,
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const parsed = ActionSchema.parse(Object.fromEntries(form));
  const store = new InternalAssistantStoreService();

  if (parsed.intent === 'createSession') {
    const session = await store.createSession({
      title: parsed.title?.trim() || 'New chat',
      mode: parsed.mode ?? 'localMachine',
      memoryEnabled: true,
    });
    return json({ ok: true, sessionId: session.id });
  }

  if (parsed.intent === 'updateSession') {
    if (!parsed.sessionId) return json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
    await store.updateSession(parsed.sessionId, {
      title: parsed.title,
      mode: parsed.mode,
      memoryEnabled: parsed.memoryEnabled ? parsed.memoryEnabled === 'true' : undefined,
    });
    return json({ ok: true });
  }

  if (parsed.intent === 'deleteSession') {
    if (!parsed.sessionId) return json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
    await store.archiveSession(parsed.sessionId);
    return json({ ok: true });
  }

  if (parsed.intent === 'createMemory') {
    if (!parsed.title || !parsed.content) return json({ ok: false, error: 'Title and content are required' }, { status: 400 });
    await store.createMemory({
      title: parsed.title,
      content: parsed.content,
      tags: (parsed.tags ?? '').split(',').map((v) => v.trim()).filter(Boolean),
      isEnabled: parsed.isEnabled ? parsed.isEnabled === 'true' : true,
    });
    return json({ ok: true });
  }

  if (parsed.intent === 'updateMemory') {
    if (!parsed.memoryId) return json({ ok: false, error: 'Missing memoryId' }, { status: 400 });
    await store.updateMemory(parsed.memoryId, {
      title: parsed.title,
      content: parsed.content,
      tags: parsed.tags !== undefined
        ? parsed.tags.split(',').map((v) => v.trim()).filter(Boolean)
        : undefined,
      isEnabled: parsed.isEnabled ? parsed.isEnabled === 'true' : undefined,
    });
    return json({ ok: true });
  }

  if (parsed.intent === 'importSession') {
    if (!parsed.payload) return json({ ok: false, error: 'Missing import payload' }, { status: 400 });
    const imported = ImportSessionSchema.parse(JSON.parse(parsed.payload));
    const session = await store.createSession({
      title: imported.title,
      mode: imported.mode,
      memoryEnabled: imported.memoryEnabled ?? true,
    });
    for (const message of imported.messages) {
      await store.createMessage({
        sessionId: session.id,
        role: message.role,
        content: message.content,
        mode: message.mode,
        backend: message.backend,
        model: message.model,
        error: message.error,
        retryCount: message.retryCount ?? 0,
      });
    }
    return json({ ok: true, sessionId: session.id });
  }

  if (!parsed.memoryId) return json({ ok: false, error: 'Missing memoryId' }, { status: 400 });
  await store.deleteMemory(parsed.memoryId);
  return json({ ok: true });
}

export default function InternalAiAssistantRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  const [streamMeta, setStreamMeta] = useState<{
    target: 'localMachine' | 'modalRemote';
    backend: string;
    model: string;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    hadFallback: boolean;
    resumed?: boolean;
    timestamp?: string;
  } | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<Array<{ name: string; ok: boolean; at: string }>>([]);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [searchDraft, setSearchDraft] = useState(data.query);
  const [showTopInfoMore, setShowTopInfoMore] = useState(false);

  const activeSessionId = data.activeSession.id;

  const runSessionMutation = useCallback(async (formData: FormData) => {
    await fetch('/internal/ai-assistant', { method: 'POST', body: formData });
    revalidator.revalidate();
  }, [revalidator]);

  const sendMessage = useCallback(async (overrideMessage?: string, overrideRetryCount?: number) => {
    const outgoing = (typeof overrideMessage === 'string' ? overrideMessage : draft).trim();
    if (!outgoing || isStreaming) return;
    const preferredTarget: 'localMachine' | 'modalRemote' = data.activeSession.mode;
    const preferred = data.targets[preferredTarget];
    const referenceRouterHint =
      preferredTarget === 'localMachine' && isReferenceInternalRouterUrl(preferred.url)
        ? ` ${REFERENCE_ROUTER_8787_HINT}`
        : '';
    if (!preferred.health.ok) {
      setStreamError(
        `${preferredTarget === 'modalRemote' ? 'Cloud' : 'Local'} target failed health check (${preferred.health.message}). Fix target URL in /internal/model-setup.${referenceRouterHint}`,
      );
      return;
    }
    if (!preferred.chatProbe.ok) {
      setStreamError(
        `Assistant chat API not ready for ${preferredTarget === 'modalRemote' ? 'cloud' : 'local'} (${preferred.chatProbe.message}). Run “Validate assistant targets” or fix URLs in /internal/model-setup.${referenceRouterHint}`,
      );
      return;
    }
    setIsStreaming(true);
    setStreamError(null);
    setStreamingReply('');
    setToolStatus('Starting response...');
    setToolEvents([]);
    setIsReconnecting(false);
    const retryCount = overrideRetryCount ?? 0;
    const clientRequestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const runOnce = async (overrideTarget?: 'localMachine' | 'modalRemote'): Promise<{ completed: boolean; interrupted: boolean; sawError: boolean; lastErrorMessage?: string }> => {
      let completed = false;
      let sawError = false;
      let lastErrorMessage: string | undefined;
      const response = await fetch('/internal/ai-assistant/chat/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: outgoing,
          target: overrideTarget ?? preferredTarget,
          retryCount,
          clientRequestId,
        }),
      });
      if (!response.ok || !response.body) {
        let message = `Streaming failed (${response.status})`;
        try {
          const body = await response.json();
          if (body?.error && typeof body.error === 'string') {
            message = body.error;
          }
        } catch {
          // ignore response parse errors
        }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (!overrideMessage) setDraft('');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const lines = frame.split('\n');
          const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
          const dataLine = lines.find((line) => line.startsWith('data:'))?.slice(5).trim();
          if (!eventName || !dataLine) continue;
          const payload = JSON.parse(dataLine);
          if (eventName === 'ready') {
            setToolStatus('Connected. Streaming tokens...');
          } else if (eventName === 'token' && typeof payload.text === 'string') {
            setStreamingReply((prev) => prev + payload.text);
          } else if (eventName === 'tool') {
            const toolName = typeof payload?.tool === 'string' ? payload.tool : 'tool';
            const ok = Boolean(payload?.ok);
            const statusMessage = toolName.toLowerCase().includes('db')
              ? 'Checking database...'
              : toolName.toLowerCase().includes('log')
                ? 'Fetching logs...'
                : `Running ${toolName}...`;
            setToolStatus(statusMessage);
            setToolEvents((prev) => [...prev, { name: toolName, ok, at: new Date().toISOString() }]);
          } else if (eventName === 'done') {
            completed = true;
            setStreamMeta({
              target: payload.target,
              backend: payload.backend,
              model: payload.model,
              latencyMs: payload.latencyMs,
              tokensIn: payload.tokensIn,
              tokensOut: payload.tokensOut,
              hadFallback: payload.hadFallback,
              resumed: Boolean(payload?.resumed),
              timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : undefined,
            });
            setToolStatus(null);
          } else if (eventName === 'error') {
            sawError = true;
            lastErrorMessage = payload.message ?? 'Streaming error';
            setStreamError(lastErrorMessage ?? 'Streaming error');
            setToolStatus(null);
          }
        }
      }
      return { completed, interrupted: !completed && !sawError, sawError, lastErrorMessage };
    };
    try {
      const first = await runOnce();
      if (first.interrupted) {
        setIsReconnecting(true);
        setStreamingReply('');
        setToolStatus('Connection interrupted. Reconnecting...');
        const second = await runOnce();
        if (second.interrupted) {
          setStreamError('Streaming interrupted after reconnect attempt');
        }
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : 'Streaming request failed');
    } finally {
      setIsReconnecting(false);
      setIsStreaming(false);
      if (!streamError) setToolStatus(null);
      revalidator.revalidate();
    }
  }, [
    activeSessionId,
    data.activeSession.mode,
    data.targets,
    draft,
    isStreaming,
    revalidator,
    streamError,
  ]);

  const copyToClipboard = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTextId(id);
      setTimeout(() => setCopiedTextId((prev) => (prev === id ? null : prev)), 1200);
    } catch {
      // ignore clipboard errors
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (isMeta && event.key === 'Enter' && !isStreaming) {
        event.preventDefault();
        void sendMessage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isStreaming, sendMessage]);

  const applySearch = useCallback((nextQuery: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    else params.delete('q');
    navigate(`/internal/ai-assistant?${params.toString()}`);
  }, [navigate, searchParams]);

  const isAssistantAvailable = data.activeSession.id !== 'unavailable';
  const maxInsightsTokens = streamMeta?.tokensOut ?? data.overview.tokensOut ?? 0;
  const modeLabel = data.activeSession.mode === 'localMachine' ? 'Local' : 'Cloud';
  const modeLatencyHint = streamMeta?.latencyMs
    ? `${modeLabel} latency ${streamMeta.latencyMs} ms`
    : `${modeLabel} latency pending...`;
  const latestToolEvent = toolEvents.length ? toolEvents[toolEvents.length - 1] : null;

  return (
    <Page title="AI Assistant" subtitle="Calm internal developer copilot">
      <style>{`
        .AiAssistant-root {
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          gap: 0;
          min-height: calc(100vh - 170px);
          border: 1px solid #e6e7e9;
          background: #fafafa;
          overflow: hidden;
        }
        .AiAssistant-sidebar {
          border-right: 1px solid #eceef1;
          background: #f7f7f7;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .AiAssistant-searchInput {
          width: 100%;
          border: 1px solid #e5e7eb;
          border-radius: 7px;
          padding: 7px 9px;
          font-size: 12px;
          background: #fff;
          outline: none;
        }
        .AiAssistant-searchInput:focus { border-color: #c8d2df; }
        .AiAssistant-historyList {
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
        }
        .AiAssistant-historyItem {
          border: none;
          width: 100%;
          text-align: left;
          border-radius: 7px;
          padding: 7px 9px;
          font-size: 11.5px;
          background: transparent;
          cursor: pointer;
          color: #404a56;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .AiAssistant-historyItem:hover { background: #f0f2f5; }
        .AiAssistant-historyItem.active { background: #e8edf3; color: #111827; }
        .AiAssistant-main {
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          background: #fafafa;
        }
        .AiAssistant-topbar {
          height: 46px;
          border-bottom: 1px solid #eceef1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          gap: 12px;
          background: #fafafa;
        }
        .AiAssistant-topInfoCard {
          margin: 0 0 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #fbfbfc;
          padding: 7px 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 11px;
          color: #4b5563;
        }
        .AiAssistant-topInfoItem {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding-right: 8px;
          border-right: 1px solid #eceff3;
          white-space: nowrap;
        }
        .AiAssistant-topInfoItem:last-child { border-right: none; padding-right: 0; }
        .AiAssistant-topInfoMoreBtn {
          border: none;
          background: transparent;
          color: #6b7280;
          font-size: 11px;
          cursor: pointer;
          padding: 0;
          text-transform: lowercase;
        }
        .AiAssistant-referenceHint {
          margin: 0 0 12px;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #fde68a;
          background: #fffbeb;
          font-size: 11.5px;
          color: #78350f;
          line-height: 1.45;
        }
        .AiAssistant-referenceHintLink {
          color: #b45309;
          font-weight: 600;
          text-decoration: underline;
        }
        .AiAssistant-select {
          border: 1px solid #dfe4ea;
          border-radius: 7px;
          background: #fff;
          font-size: 11.5px;
          padding: 4px 8px;
        }
        .AiAssistant-modelReadonly {
          font-size: 11.5px;
          color: #374151;
          padding: 4px 0;
          max-width: 220px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .AiAssistant-segmented {
          display: inline-flex;
          border: 1px solid #dfe4ea;
          border-radius: 7px;
          overflow: hidden;
          background: #fff;
        }
        .AiAssistant-segmented button {
          border: none;
          font-size: 11.5px;
          padding: 4px 9px;
          cursor: pointer;
          background: transparent;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .AiAssistant-segmented button.active { background: #eef2f7; color: #0f172a; }
        .AiAssistant-statusRow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          color: #4b5563;
        }
        .AiAssistant-dot {
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          display: inline-block;
          margin-right: 5px;
          background: #6b7280;
        }
        .AiAssistant-dot.green { background: #10b981; }
        .AiAssistant-dot.amber { background: #f59e0b; }
        .AiAssistant-dot.red { background: #ef4444; }
        .AiAssistant-conversationWrap {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 20px 16px 96px;
        }
        .AiAssistant-conversation {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .AiAssistant-message {
          display: grid;
          grid-template-columns: 86px minmax(0,1fr);
          gap: 9px;
          font-size: 13.5px;
          line-height: 1.52;
          color: #111827;
        }
        .AiAssistant-message.ai .AiAssistant-role { color: #374151; }
        .AiAssistant-message.user .AiAssistant-role { color: #111827; font-weight: 600; }
        .AiAssistant-role {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          padding-top: 2px;
        }
        .AiAssistant-meta {
          margin-top: 5px;
          font-size: 11px;
          color: #6b7280;
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .AiAssistant-markdown { display: flex; flex-direction: column; gap: 10px; }
        .AiAssistant-paragraph { white-space: pre-wrap; }
        .AiAssistant-codeBlock {
          border-radius: 7px;
          border: 1px solid #1f2937;
          background: #111827;
          color: #e5e7eb;
          overflow: hidden;
        }
        .AiAssistant-codeHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 9px;
          font-size: 10.5px;
          border-bottom: 1px solid #374151;
          color: #9ca3af;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .AiAssistant-codeHeader button {
          border: none;
          background: transparent;
          color: #cbd5e1;
          cursor: pointer;
          font-size: 10.5px;
        }
        .AiAssistant-codeBlock pre {
          margin: 0;
          padding: 9px;
          white-space: pre-wrap;
          overflow-x: auto;
          font-size: 11.5px;
          line-height: 1.48;
          font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .AiAssistant-composerDock {
          position: sticky;
          bottom: 0;
          padding: 10px 16px;
          border-top: 1px solid #eceef1;
          background: linear-gradient(180deg, rgba(250,250,250,0.88), #fafafa 44%);
        }
        .AiAssistant-composer {
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid #dfe4ea;
          border-radius: 9px;
          background: #fff;
          padding: 7px 10px;
          transition: border-color 120ms ease, box-shadow 160ms ease;
        }
        .AiAssistant-composer:focus-within {
          border-color: #cfd7e2;
          box-shadow: 0 0 0 1px rgba(17, 24, 39, 0.03);
        }
        .AiAssistant-composer textarea {
          width: 100%;
          border: none;
          resize: none;
          min-height: 58px;
          max-height: 180px;
          outline: none;
          font-size: 13.5px;
          line-height: 1.42;
          background: transparent;
          color: #111827;
        }
        .AiAssistant-composerMeta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #6b7280;
          margin-top: 5px;
        }
        .AiAssistant-send {
          border: none;
          border-radius: 7px;
          width: 28px;
          height: 28px;
          background: #111827;
          color: #fff;
          cursor: pointer;
          transition: transform 120ms ease, opacity 120ms ease, background-color 120ms ease;
        }
        .AiAssistant-send:hover:not(:disabled) {
          transform: translateY(-1px);
          background: #0b1220;
        }
        .AiAssistant-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .AiAssistant-inlineStatus {
          font-size: 12px;
          color: #4b5563;
          animation: AiAssistant-fadeIn 160ms ease;
        }
        @keyframes AiAssistant-fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 1280px) {
          .AiAssistant-root { grid-template-columns: 240px minmax(0,1fr); }
        }
        @media (max-width: 920px) {
          .AiAssistant-root { grid-template-columns: 1fr; }
          .AiAssistant-sidebar { border-right: none; border-bottom: 1px solid #eceef1; }
          .AiAssistant-message { grid-template-columns: 1fr; }
          .AiAssistant-role { margin-bottom: 4px; }
        }
      `}</style>

      <div className="AiAssistant-topInfoCard">
        <span
          className="AiAssistant-topInfoItem"
          title={`healthz: ${data.targets.localMachine.health.message}\nchat: ${data.targets.localMachine.chatProbe.message}`}
        >
          <span
            className={`AiAssistant-dot ${
              !data.targets.localMachine.health.ok
                ? 'red'
                : data.targets.localMachine.chatProbe.ok
                  ? 'green'
                  : 'amber'
            }`}
          />
          Local{' '}
          {!data.targets.localMachine.health.ok
            ? 'unhealthy'
            : data.targets.localMachine.chatProbe.ok
              ? 'ready'
              : 'chat blocked'}
        </span>
        <span
          className="AiAssistant-topInfoItem"
          title={`healthz: ${data.targets.modalRemote.health.message}\nchat: ${data.targets.modalRemote.chatProbe.message}`}
        >
          <span
            className={`AiAssistant-dot ${
              !data.targets.modalRemote.health.ok
                ? 'red'
                : data.targets.modalRemote.chatProbe.ok
                  ? 'green'
                  : 'amber'
            }`}
          />
          Cloud{' '}
          {!data.targets.modalRemote.health.ok
            ? 'unhealthy'
            : data.targets.modalRemote.chatProbe.ok
              ? 'ready'
              : 'chat blocked'}
        </span>
        <span className="AiAssistant-topInfoItem">
          Model {streamMeta?.model ?? (data.activeSession.mode === 'localMachine' ? data.targets.localMachine.model || 'local' : data.targets.modalRemote.model || 'cloud')}
        </span>
        <span className="AiAssistant-topInfoItem">Latency {streamMeta?.latencyMs ?? 0}ms</span>
        <button
          type="button"
          className="AiAssistant-topInfoMoreBtn"
          onClick={() => setShowTopInfoMore((prev) => !prev)}
        >
          {showTopInfoMore ? 'less' : 'more'}
        </button>
        {showTopInfoMore ? (
          <>
            <span className="AiAssistant-topInfoItem">Tokens {maxInsightsTokens}</span>
            <span className="AiAssistant-topInfoItem">Memory {data.activeSession.memoryEnabled ? 'ON' : 'OFF'}</span>
            {latestToolEvent ? (
              <span className="AiAssistant-topInfoItem">
                Tool {latestToolEvent.ok ? 'OK' : 'ERR'} {latestToolEvent.name}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {isReferenceInternalRouterUrl(data.targets.localMachine.url) &&
      (!data.targets.localMachine.health.ok || !data.targets.localMachine.chatProbe.ok) ? (
        <div className="AiAssistant-referenceHint" role="status">
          {REFERENCE_ROUTER_8787_HINT}{' '}
          <a className="AiAssistant-referenceHintLink" href="/internal/model-setup">
            Local AI Setting
          </a>
          .
        </div>
      ) : null}

      <div className="AiAssistant-root">
        <aside className="AiAssistant-sidebar">
          <Button
            fullWidth
            variant="primary"
            onClick={() => {
              const form = new FormData();
              form.set('intent', 'createSession');
              form.set('mode', data.activeSession.mode);
              void runSessionMutation(form);
            }}
          >
            + New Chat
          </Button>
          <input
            ref={searchInputRef}
            className="AiAssistant-searchInput"
            value={searchDraft}
            placeholder="Search chats"
            onChange={(event) => setSearchDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applySearch(searchDraft);
              }
            }}
          />
          <div className="AiAssistant-historyList">
            {data.sessions.map((session) => (
              <button
                type="button"
                key={session.id}
                className={`AiAssistant-historyItem ${session.id === data.activeSession.id ? 'active' : ''}`}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set('sessionId', session.id);
                  navigate(`/internal/ai-assistant?${params.toString()}`);
                }}
              >
                <div>{session.title}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{session.messageCount} messages</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="AiAssistant-main">
          <div className="AiAssistant-topbar">
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span
                className="AiAssistant-modelReadonly"
                title="Model comes from Setup the Model (runtime config)"
              >
                Model:{' '}
                {streamMeta?.model ??
                  (data.activeSession.mode === 'localMachine'
                    ? data.targets.localMachine.model || '—'
                    : data.targets.modalRemote.model || '—')}
              </span>
              <div className="AiAssistant-segmented">
                <button
                  type="button"
                  className={data.activeSession.mode === 'localMachine' ? 'active' : ''}
                  onClick={() => {
                    const form = new FormData();
                    form.set('intent', 'updateSession');
                    form.set('sessionId', data.activeSession.id);
                    form.set('mode', 'localMachine');
                    void runSessionMutation(form);
                  }}
                >
                  Local
                </button>
                <button
                  type="button"
                  className={data.activeSession.mode === 'modalRemote' ? 'active' : ''}
                  onClick={() => {
                    const form = new FormData();
                    form.set('intent', 'updateSession');
                    form.set('sessionId', data.activeSession.id);
                    form.set('mode', 'modalRemote');
                    void runSessionMutation(form);
                  }}
                >
                  Cloud
                </button>
              </div>
              <Button
                size="slim"
                variant="plain"
                onClick={() => {
                  const form = new FormData();
                  form.set('intent', 'updateSession');
                  form.set('sessionId', data.activeSession.id);
                  form.set('memoryEnabled', data.activeSession.memoryEnabled ? 'false' : 'true');
                  void runSessionMutation(form);
                }}
              >
                {data.activeSession.memoryEnabled ? 'Memory ON' : 'Memory OFF'}
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="AiAssistant-statusRow">
                <span><span className="AiAssistant-dot green" />Connected</span>
                <span><span className="AiAssistant-dot" />{modeLabel}</span>
              </div>
            </div>
          </div>
          {streamError ? (
            <Banner tone="critical" title="Streaming failed">
              <Text as="p">{streamError}</Text>
            </Banner>
          ) : null}
          {data.loaderWarning ? (
            <Banner tone="critical" title="Assistant service unavailable">
              <Text as="p">{data.loaderWarning}</Text>
            </Banner>
          ) : null}

          <div className="AiAssistant-conversationWrap">
            <div className="AiAssistant-conversation">
              {!data.messages.length ? (
                <Text as="p" tone="subdued">Start a conversation. Ask about logs, jobs, stores, or incident debugging.</Text>
              ) : null}
              {data.messages.map((message) => (
                <div key={message.id} className={`AiAssistant-message ${message.role === 'assistant' ? 'ai' : 'user'}`}>
                  <div className="AiAssistant-role">{message.role === 'assistant' ? 'Assistant' : 'You'}</div>
                  <div>
                    <MarkdownView
                      content={message.content}
                      onCopyCode={(code) => {
                        void copyToClipboard(`${message.id}-code`, code);
                      }}
                    />
                    <div className="AiAssistant-meta">
                      <span>{formatTimeLabel(message.createdAt)}</span>
                      {message.model ? <span>{message.model}</span> : null}
                      {message.backend ? <span>{message.backend}</span> : null}
                      {message.latencyMs ? <span>{message.latencyMs} ms</span> : null}
                      <button
                        type="button"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280' }}
                        onClick={() => void copyToClipboard(message.id, message.content)}
                      >
                        {copiedTextId === message.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {toolStatus ? (
                <div className="AiAssistant-inlineStatus">{toolStatus}</div>
              ) : null}
              {streamingReply ? (
                <div className="AiAssistant-message ai">
                  <div className="AiAssistant-role">Assistant</div>
                  <div>
                    <MarkdownView content={streamingReply} onCopyCode={(code) => { void copyToClipboard('stream-code', code); }} />
                    <div className="AiAssistant-meta">
                      <span>{isReconnecting ? 'Reconnecting stream…' : 'Streaming token-by-token…'}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="AiAssistant-composerDock">
            <div className="AiAssistant-composer">
              <textarea
                ref={composerRef}
                value={draft}
                placeholder="Ask anything..."
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (!isStreaming) void sendMessage();
                  }
                }}
              />
              <div className="AiAssistant-composerMeta">
                <span>{modeLatencyHint}</span>
                <span title={`Local: ${data.targets.localMachine.health.message} | Cloud: ${data.targets.modalRemote.health.message}`}>
                  {`Local: ${data.targets.localMachine.health.message} · Cloud: ${data.targets.modalRemote.health.message}`}
                </span>
                <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span title="Attach file">📎</span>
                  <button
                    type="button"
                    className="AiAssistant-send"
                    onClick={() => { void sendMessage(); }}
                    disabled={!isAssistantAvailable || !draft.trim() || isStreaming}
                    title="Send (Enter)"
                  >
                    ↵
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </Page>
  );
}
