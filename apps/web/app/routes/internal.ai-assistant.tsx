import { json } from '@remix-run/node';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isReferenceLocalPromptRouterBaseUrl } from '~/services/ai/assistant-router-local';
import { buildAssistantReadinessSummary } from '~/services/ai/assistant-readiness-summary';
import type { InternalAssistantStoreService } from '~/services/ai/internal-assistant-store.server';
import type { RouterRuntimeConfig } from '~/schemas/router-runtime-config.server';
import { isInternalAiLocalOnlyEnabledFromEnv } from '~/services/ai/internal-ai-local-only';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  StatusDot,
  KV,
  MonoChip,
  ASSISTANT_SESSIONS,
  ASSISTANT_THREAD,
} from '~/components/admin/page-kit';

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

export const ImportSessionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  mode: z.enum(['localMachine', 'modalRemote']).default('localMachine'),
  memoryEnabled: z.boolean().optional(),
  sessionId: z.string().trim().min(1).max(120).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().trim().min(1).max(4000),
    mode: z.enum(['localMachine', 'modalRemote']).optional(),
    backend: z.string().optional(),
    model: z.string().optional(),
    error: z.string().optional(),
    retryCount: z.number().int().min(0).max(10).optional(),
    clientRequestId: z.string().trim().min(1).max(120).optional(),
  })).max(400),
});

export type ImportSessionResult = { ok: true; sessionId: string; inserted: number; skipped: number };

export function resolveSessionModeForCreate(
  requestedMode: 'localMachine' | 'modalRemote' | undefined,
  assistantLocalOnly: boolean,
): 'localMachine' | 'modalRemote' {
  if (assistantLocalOnly) return 'localMachine';
  if (requestedMode === 'modalRemote') return 'modalRemote';
  return 'localMachine';
}

export function resolveSearchParamsAfterCreateSession(
  current: URLSearchParams,
  createdSessionId: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set('sessionId', createdSessionId);
  return next;
}

export function resolveSearchParamsAfterDeleteSession(
  current: URLSearchParams,
  deletedSessionId: string,
  activeSessionId: string,
  fallbackSessionId?: string,
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (deletedSessionId === activeSessionId && next.get('sessionId') === deletedSessionId) {
    if (fallbackSessionId) next.set('sessionId', fallbackSessionId);
    else next.delete('sessionId');
  }
  return next;
}

/** FormData for `intent: createSession` (same shape as the route action expects). */
export function buildCreateSessionFormData(
  mode: 'localMachine' | 'modalRemote' = 'localMachine',
): FormData {
  const form = new FormData();
  form.set('intent', 'createSession');
  form.set('mode', mode);
  return form;
}

/** FormData for `intent: deleteSession`. */
export function buildDeleteSessionFormData(sessionId: string): FormData {
  const form = new FormData();
  form.set('intent', 'deleteSession');
  form.set('sessionId', sessionId);
  return form;
}

/** FormData for `intent: updateSession` (mode toggle). */
export function buildUpdateSessionModeFormData(
  sessionId: string,
  mode: 'localMachine' | 'modalRemote',
): FormData {
  const form = new FormData();
  form.set('intent', 'updateSession');
  form.set('sessionId', sessionId);
  form.set('mode', mode);
  return form;
}

/** FormData for toggling session memory flag. */
export function buildUpdateSessionMemoryFormData(sessionId: string, memoryEnabled: boolean): FormData {
  const form = new FormData();
  form.set('intent', 'updateSession');
  form.set('sessionId', sessionId);
  form.set('memoryEnabled', memoryEnabled ? 'true' : 'false');
  return form;
}

export function buildCreateMemoryFormData(input: {
  title: string;
  content: string;
  tags?: string;
  isEnabled?: boolean;
}): FormData {
  const form = new FormData();
  form.set('intent', 'createMemory');
  form.set('title', input.title);
  form.set('content', input.content);
  if (input.tags !== undefined) form.set('tags', input.tags);
  form.set('isEnabled', input.isEnabled === false ? 'false' : 'true');
  return form;
}

export function buildUpdateMemoryFormData(
  memoryId: string,
  input: {
    title?: string;
    content?: string;
    tags?: string;
    isEnabled?: boolean;
  },
): FormData {
  const form = new FormData();
  form.set('intent', 'updateMemory');
  form.set('memoryId', memoryId);
  if (input.title !== undefined) form.set('title', input.title);
  if (input.content !== undefined) form.set('content', input.content);
  if (input.tags !== undefined) form.set('tags', input.tags);
  if (input.isEnabled !== undefined) form.set('isEnabled', input.isEnabled ? 'true' : 'false');
  return form;
}

export function buildDeleteMemoryFormData(memoryId: string): FormData {
  const form = new FormData();
  form.set('intent', 'deleteMemory');
  form.set('memoryId', memoryId);
  return form;
}

export function buildImportSessionFormData(payload: z.infer<typeof ImportSessionSchema>): FormData {
  const form = new FormData();
  form.set('intent', 'importSession');
  form.set('payload', JSON.stringify(payload));
  return form;
}

export type AssistantSendDisabledInput = {
  draft: string;
  isStreaming: boolean;
  /** When `unavailable` (store init failed), send is blocked. Chat probe / readiness never gates send. */
  activeSessionId: string;
  /** Remix session CRUD fetcher is mid-flight. */
  sessionMutationBusy?: boolean;
  /** Route loader transition (session switch / search). */
  routeNavigationPending?: boolean;
  /** True from first send tap until stream `finally` (guards double-submit before `isStreaming` paints). */
  sendInFlight?: boolean;
};

/**
 * Single source of truth for composer send disabled + operator-visible reason copy.
 * Returns `null` when the user may send; otherwise a short sentence for UI (button title / subdued hint).
 */
export function computeAssistantSendDisabledReason(input: AssistantSendDisabledInput): string | null {
  const sessionMutationBusy = input.sessionMutationBusy ?? false;
  const routeNavigationPending = input.routeNavigationPending ?? false;
  const sendInFlight = input.sendInFlight ?? false;
  if (sendInFlight || input.isStreaming) return 'A response is in progress.';
  if (sessionMutationBusy) return 'Applying a session change…';
  if (routeNavigationPending) return 'Loading this chat…';
  if (input.activeSessionId === 'unavailable') return 'Assistant store is unavailable.';
  if (input.draft.trim().length === 0) return 'Enter a message to send.';
  return null;
}

export function canSendAssistantMessage(input: AssistantSendDisabledInput): boolean {
  return computeAssistantSendDisabledReason(input) === null;
}

export type AssistantRouteNavigationOverlayInput = {
  navigationState: 'idle' | 'loading' | 'submitting';
  navigationLocation: { pathname: string; search: string } | null | undefined;
  currentPathname: string;
  currentSearch: string;
};

/**
 * True while Remix is navigating to a *different* `/internal/ai-assistant` URL (pathname + search).
 * Loader-only revalidation (same URL after `useRevalidator().revalidate()`) keeps `navigation.state`
 * non-idle in some cases; that must not block the composer or send control.
 */
export function computeAssistantRouteNavigationOverlayPending(
  input: AssistantRouteNavigationOverlayInput,
): boolean {
  if (input.navigationState === 'idle') return false;
  const navLoc = input.navigationLocation;
  if (!navLoc || !navLoc.pathname.startsWith('/internal/ai-assistant')) return false;
  const navKey = `${navLoc.pathname}${navLoc.search}`;
  const curKey = `${input.currentPathname}${input.currentSearch}`;
  return navKey !== curKey;
}

export async function applyImportSession(
  store: InternalAssistantStoreService,
  payload: z.infer<typeof ImportSessionSchema>,
): Promise<ImportSessionResult> {
  let session = null as Awaited<ReturnType<InternalAssistantStoreService['getSession']>> | null;
  if (payload.sessionId) {
    session = await store.getSession(payload.sessionId);
  }
  if (!session) {
    session = await store.createSession({
      title: payload.title,
      mode: payload.mode,
      memoryEnabled: payload.memoryEnabled ?? true,
    });
  }
  let inserted = 0;
  let skipped = 0;
  for (const message of payload.messages) {
    if (message.clientRequestId) {
      const existing = await store.findUserMessageByRequest(session.id, message.clientRequestId);
      if (existing) {
        skipped += 1;
        continue;
      }
    }
    await store.createMessage({
      sessionId: session.id,
      role: message.role,
      content: message.content,
      mode: message.mode,
      backend: message.backend,
      model: message.model,
      error: message.error,
      retryCount: message.retryCount ?? 0,
      clientRequestId: message.clientRequestId,
    });
    inserted += 1;
  }
  return { ok: true, sessionId: session.id, inserted, skipped };
}

type MarkdownPart = { type: 'text'; value: string } | { type: 'code'; value: string; language: string };

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '--:--';
  return d.toISOString().slice(11, 16);
}

export function formatEstimatedCostLabel(costCents: number | null | undefined): string {
  const cents = Number.isFinite(costCents) ? Math.max(0, Math.floor(costCents as number)) : 0;
  return `$${(cents / 100).toFixed(2)}`;
}

/** Reference dev router default port (see `pnpm --filter web router:internal`). */

export async function loader({ request }: { request: Request }) {
  const { requireInternalAdmin } = await import('~/internal-admin/session.server');
  const { DEFAULT_ROUTER_RUNTIME_CONFIG } = await import('~/schemas/router-runtime-config.server');
  const {
    probeTargetLiveness,
    validateAssistantChatTarget,
  } = await import('~/services/ai/assistant-chat-target-probe.server');
  const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');
  const { getRouterRuntimeConfig } = await import('~/services/ai/router-runtime-config.server');

  await requireInternalAdmin(request);
  const assistantLocalOnly = isInternalAiLocalOnlyEnabledFromEnv();
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const requestedSessionId = url.searchParams.get('sessionId') ?? '';
  const store = new InternalAssistantStoreService();
  let runtime: RouterRuntimeConfig = DEFAULT_ROUTER_RUNTIME_CONFIG;
  let sessions: Awaited<ReturnType<InternalAssistantStoreService['listSessions']>> = [];
  let messages: Awaited<ReturnType<InternalAssistantStoreService['listMessages']>> = [];
  let memories: Awaited<ReturnType<InternalAssistantStoreService['listMemories']>> = [];
  let loaderWarning: string | null = null;
  let parseError: string | null = null;

  try {
    const raw = (await getRouterRuntimeConfig()) as unknown;
    if (raw && typeof raw === 'object' && 'config' in raw) {
      const wrapped = raw as { config: RouterRuntimeConfig; parseError?: unknown };
      runtime = wrapped.config;
      if (typeof wrapped.parseError === 'string' && wrapped.parseError.trim() !== '') {
        parseError = wrapped.parseError;
      }
    } else {
      runtime = raw as RouterRuntimeConfig;
    }
  } catch (error) {
    loaderWarning = `Runtime config unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    sessions = await store.listSessions(query);
  } catch (error) {
    loaderWarning = `Assistant store unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }

  let activeSession = sessions.find((s) => s.id === requestedSessionId) ?? sessions[0] ?? null;
  if (
    assistantLocalOnly &&
    activeSession &&
    activeSession.id !== 'unavailable' &&
    activeSession.mode === 'modalRemote'
  ) {
    try {
      activeSession = await store.updateSession(activeSession.id, { mode: 'localMachine' });
    } catch {
      activeSession = { ...activeSession, mode: 'localMachine' };
    }
  }
  if (!activeSession) {
    try {
      activeSession = await store.createSession({
        title: 'New chat',
        mode: resolveSessionModeForCreate(undefined, assistantLocalOnly),
        memoryEnabled: true,
      });
    } catch (error) {
      loaderWarning = `Session initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      activeSession = {
        id: 'unavailable',
        title: 'Assistant unavailable',
        mode: resolveSessionModeForCreate(undefined, assistantLocalOnly),
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
  const [localHealth, localChatProbe] = await Promise.all([
    probeTargetLiveness({
      backend: runtime.targets.localMachine.backend,
      url: runtime.targets.localMachine.url,
      token: runtime.targets.localMachine.token,
      timeoutMs: runtime.targets.localMachine.timeoutMs,
    }),
    validateAssistantChatTarget({
      target: 'localMachine',
      backend: runtime.targets.localMachine.backend,
      url: runtime.targets.localMachine.url,
      token: runtime.targets.localMachine.token,
      timeoutMs: runtime.targets.localMachine.timeoutMs,
    }),
  ]);
  const [modalHealth, modalChatProbe] = assistantLocalOnly
    ? [
        { ok: false, message: 'disabled (INTERNAL_AI_LOCAL_ONLY)' },
        { ok: false, message: 'disabled (INTERNAL_AI_LOCAL_ONLY)' },
      ]
    : await Promise.all([
        probeTargetLiveness({
          backend: runtime.targets.modalRemote.backend,
          url: runtime.targets.modalRemote.url,
          token: runtime.targets.modalRemote.token,
          timeoutMs: runtime.targets.modalRemote.timeoutMs,
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
    parseError,
    assistantLocalOnly,
  });
}

export async function action({ request }: { request: Request }) {
  const { requireInternalAdmin } = await import('~/internal-admin/session.server');
  const { InternalAssistantStoreService } = await import('~/services/ai/internal-assistant-store.server');

  await requireInternalAdmin(request);
  const form = await request.formData();
  const parsed = ActionSchema.parse(Object.fromEntries(form));
  const store = new InternalAssistantStoreService();
  const assistantLocalOnly = isInternalAiLocalOnlyEnabledFromEnv();

  if (parsed.intent === 'createSession') {
    const mode = resolveSessionModeForCreate(parsed.mode, assistantLocalOnly);
    if (assistantLocalOnly && mode === 'modalRemote') {
      return json(
        { ok: false, error: 'Cloud target is disabled while INTERNAL_AI_LOCAL_ONLY is set.' },
        { status: 400 },
      );
    }
    const session = await store.createSession({
      title: parsed.title?.trim() || 'New chat',
      mode,
      memoryEnabled: true,
    });
    return json({ ok: true, sessionId: session.id });
  }

  if (parsed.intent === 'updateSession') {
    if (!parsed.sessionId) return json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
    if (assistantLocalOnly && parsed.mode === 'modalRemote') {
      return json(
        { ok: false, error: 'Cloud target is disabled while INTERNAL_AI_LOCAL_ONLY is set.' },
        { status: 400 },
      );
    }
    await store.updateSession(parsed.sessionId, {
      title: parsed.title,
      mode: parsed.mode,
      memoryEnabled: parsed.memoryEnabled ? parsed.memoryEnabled === 'true' : undefined,
    });
    return json({ ok: true });
  }

  if (parsed.intent === 'deleteSession') {
    if (!parsed.sessionId) return json({ ok: false, error: 'Missing sessionId' }, { status: 400 });
    await store.deleteSession(parsed.sessionId);
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
    const result = await applyImportSession(store, imported);
    return json(result);
  }

  if (parsed.intent === 'deleteMemory') {
    if (!parsed.memoryId) return json({ ok: false, error: 'Missing memoryId' }, { status: 400 });
    await store.deleteMemory(parsed.memoryId);
    return json({ ok: true });
  }

  return json({ ok: false, error: `Unsupported intent: ${parsed.intent}` }, { status: 400 });
}

type LiveProbe = {
  health: { ok: boolean; message: string };
  chatProbe: { ok: boolean; message: string };
};

type AssistantSessionListRow = { id: string; title: string; messageCount: number };

type PendingSessionMutation =
  | { kind: 'create' }
  | { kind: 'delete'; deletedId: string; activeId: string; sessionsSnapshot: AssistantSessionListRow[] }
  | { kind: 'update' };

export type SessionMutationFollowUp =
  | { effect: 'revalidate' }
  | { effect: 'navigate'; href: string };

/** Pure follow-up for a completed session `useFetcher` POST (tests + single idle handler). */
export function computeSessionMutationFollowUp(input: {
  pending: PendingSessionMutation;
  raw: unknown;
  searchParams: URLSearchParams;
}): SessionMutationFollowUp {
  const { pending, raw, searchParams } = input;

  if (raw && typeof raw === 'object' && 'ok' in raw && raw.ok === false) {
    return { effect: 'revalidate' };
  }

  if (pending.kind === 'create') {
    if (
      raw &&
      typeof raw === 'object' &&
      'sessionId' in raw &&
      typeof (raw as { sessionId: unknown }).sessionId === 'string'
    ) {
      const createdSessionId = (raw as { sessionId: string }).sessionId;
      const params = resolveSearchParamsAfterCreateSession(searchParams, createdSessionId);
      return { effect: 'navigate', href: `/internal/ai-assistant?${params.toString()}` };
    }
    return { effect: 'revalidate' };
  }

  if (pending.kind === 'delete') {
    if (!raw || typeof raw !== 'object' || !('ok' in raw) || raw.ok !== true) {
      return { effect: 'revalidate' };
    }
    const fallbackSessionId =
      pending.deletedId === pending.activeId
        ? pending.sessionsSnapshot.find((candidate) => candidate.id !== pending.deletedId)?.id
        : undefined;
    const params = resolveSearchParamsAfterDeleteSession(
      searchParams,
      pending.deletedId,
      pending.activeId,
      fallbackSessionId,
    );
    const query = params.toString();
    return { effect: 'navigate', href: query ? `/internal/ai-assistant?${query}` : '/internal/ai-assistant' };
  }

  if (pending.kind === 'update') {
    return { effect: 'revalidate' };
  }

  return { effect: 'revalidate' };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mdLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

export default function AdminAssistant() {
  const ctx = useAdminCtx();
  const [sessions] = useState(ASSISTANT_SESSIONS);
  const [activeId, setActiveId] = useState(ASSISTANT_SESSIONS[0].id);
  const [mode, setMode] = useState('local');
  const [thread, setThread] = useState<any[]>(ASSISTANT_THREAD);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [showObs, setShowObs] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread, thinking]);

  const send = () => {
    if (!input.trim()) return;
    const q = input.trim();
    setThread((t) => [...t, { role: 'user', text: q }]);
    setInput('');
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setThread((t) => [
        ...t,
        {
          role: 'assistant',
          text:
            'I checked the live platform snapshot. Over the last 24h there are **3 failed jobs** in the DLQ — all `PUBLISH` type, all returning upstream 502s between 09:10–09:30. The theme assets API recovered after that window.\n\nThis looks like a transient upstream incident, not a code issue. I’d recommend a bulk **Replay** of those 3 jobs.',
          tools: ['get_jobs', 'get_errors'],
        },
      ]);
    }, 1500);
  };

  return (
    <div className="assistant-shell">
      <aside className="asst-sessions">
        <div style={{ padding: 14 }}>
          <Btn
            variant="primary"
            icon="plus"
            className="btn-block"
            onClick={() => {
              setThread([]);
              ctx.toast('New chat');
            }}
          >
            New chat
          </Btn>
        </div>
        <div className="asst-session-list">
          <div className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: '4px 14px' }}>
            Recent
          </div>
          {sessions.map((s) => (
            <button key={s.id} className={'asst-session' + (s.id === activeId ? ' sel' : '')} onClick={() => setActiveId(s.id)}>
              <Icon name="chat" size={15} className="t-muted" />
              <div className="grow stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="t-sm t-trunc">{s.title}</span>
                <span className="t-xs t-muted">
                  {s.updated} · {s.messages} msgs
                </span>
              </div>
              <span className="badge" style={{ height: 17, fontSize: 10 }}>
                {s.mode}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div className="asst-main">
        <header className="asst-head">
          <div className="stack" style={{ gap: 1 }}>
            <div className="row-2">
              <span className="t-h3">AI Assistant</span>
              <Badge tone="magic">Qwen3 · 4B</Badge>
            </div>
            <span className="t-xs t-muted">Internal copilot for ops, traces &amp; debugging</span>
          </div>
          <div className="row-3">
            <div className="seg">
              <button aria-selected={mode === 'local'} onClick={() => setMode('local')}>
                <Icon name="desktop" size={14} />
                Local
              </button>
              <button aria-selected={mode === 'cloud'} onClick={() => setMode('cloud')}>
                <Icon name="globe" size={14} />
                Cloud
              </button>
            </div>
            <span className="asst-health">
              <StatusDot ok />
              Chat ready
            </span>
            <Btn size="sm" icon="chart" onClick={() => setShowObs((o) => !o)}>
              Observability
            </Btn>
          </div>
        </header>
        <div className="asst-body" ref={bodyRef}>
          {thread.length === 0 && (
            <div className="asst-welcome">
              <span className="tile-ico" style={{ width: 52, height: 52, background: 'var(--p-magic-bg)', color: 'var(--p-magic)' }}>
                <Icon name="magic" size={26} />
              </span>
              <div className="t-h2" style={{ marginTop: 14 }}>
                How can I help you operate the platform?
              </div>
              <div className="t-sm t-muted" style={{ marginTop: 6, marginBottom: 20 }}>
                I can read live jobs, logs, traces and usage. Ask me anything.
              </div>
              <div className="asst-suggest">
                {['Why did the last publish job fail?', 'Summarize the 24h error spike', 'Which stores are near their AI quota?', 'Trace correlation cor_rs8f2'].map((s, i) => (
                  <button key={i} className="asst-chip" onClick={() => setInput(s)}>
                    <Icon name="arrowRight" size={14} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {thread.map((m, i) => (
            <div key={i} className={'asst-msg ' + m.role}>
              {m.role === 'assistant' && (
                <span className="asst-ava">
                  <Icon name="magic" size={15} />
                </span>
              )}
              <div className="asst-bubble">
                {m.tools && (
                  <div className="asst-tools">
                    {m.tools.map((t: string) => (
                      <span key={t} className="asst-tool">
                        <Icon name="bolt" size={12} />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="asst-text" dangerouslySetInnerHTML={{ __html: mdLite(m.text) }} />
              </div>
            </div>
          ))}
          {thinking && (
            <div className="asst-msg assistant">
              <span className="asst-ava">
                <Icon name="magic" size={15} />
              </span>
              <div className="asst-bubble">
                <div className="asst-typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="asst-input-wrap">
          <div className="asst-input">
            <textarea
              className="asst-textarea"
              placeholder="Ask about jobs, errors, traces, usage…"
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Btn variant="magic" icon="send" onClick={send} disabled={!input.trim()} />
          </div>
          <div className="t-xs t-muted" style={{ textAlign: 'center', marginTop: 7 }}>
            {mode === 'local' ? 'Local Ollama · qwen3:4b-instruct' : 'Cloud Qwen twin'} · responses are reviewable; tool calls are audited
          </div>
        </div>
      </div>
      {showObs && (
        <aside className="asst-obs">
          <div className="row spread" style={{ padding: '14px 16px', borderBottom: '1px solid var(--p-border)' }}>
            <span className="t-h3">Observability</span>
            <button className="btn btn-icon btn-sm btn-plain" onClick={() => setShowObs(false)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="asst-obs-body">
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                Active target
              </span>
              <KV
                rows={[
                  ['Backend', <Badge key="b" tone="magic">ollama</Badge>],
                  ['Model', <MonoChip key="m">qwen3:4b</MonoChip>],
                  [
                    'Health',
                    <span key="h" className="row-2">
                      <StatusDot ok />
                      Live
                    </span>,
                  ],
                  ['Latency', '420 ms'],
                ]}
              />
            </div>
            <div className="divider" />
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                This request
              </span>
              <KV
                rows={[
                  ['Request ID', <MonoChip key="r">req_8a21f</MonoChip>],
                  ['Attempts', '1'],
                  ['Reconnects', '0'],
                  ['Tokens', '1,284'],
                  ['Est. cost', '$0.00'],
                ]}
              />
            </div>
            <div className="divider" />
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                Tool audit
              </span>
              {([
                ['get_jobs', 'ok', '38ms'],
                ['get_errors', 'ok', '22ms'],
                ['get_trace', 'ok', '51ms'],
              ] as Array<[string, string, string]>).map((t, i) => (
                <div key={i} className="row spread t-sm">
                  <span className="row-2">
                    <StatusDot ok />
                    <span className="t-mono t-xs">{t[0]}</span>
                  </span>
                  <span className="t-xs t-muted">{t[2]}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

