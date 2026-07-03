import { json } from '@remix-run/node';
import { useEffect, useRef, useState } from 'react';
import {
  useLoaderData,
  useFetcher,
  useNavigate,
  useNavigation,
  useLocation,
  useSearchParams,
  useRevalidator,
} from '@remix-run/react';
import { z } from 'zod';
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
  Toggle,
  Textarea,
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

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function newClientRequestId(): string {
  const c = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'req_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

type ThreadMsg = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  tools?: string[];
  status?: 'streaming' | 'completed' | 'error';
  error?: string | null;
};

function messagesToThread(messages: any[]): ThreadMsg[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.content ?? '',
      status: m.status,
      error: m.error,
    }));
}

/** Most recent assistant row carrying real provider metadata (for the idle observability panel). */
function deriveLastAssistantMeta(messages: any[]): any | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role === 'assistant' && (m.backend || m.model)) {
      return {
        assistantMessageId: m.id,
        backend: m.backend,
        model: m.model,
        latencyMs: m.latencyMs,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        hadFallback: m.hadFallback,
      };
    }
  }
  return null;
}

export default function AdminAssistant() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const revalidator = useRevalidator();

  const sessionFetcher = useFetcher<{ ok?: boolean; error?: string; sessionId?: string }>();
  const memoryFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const importFetcher = useFetcher<{ ok?: boolean; error?: string; sessionId?: string; inserted?: number }>();

  const activeSession = data.activeSession;
  const modeKey = activeSession.mode as 'localMachine' | 'modalRemote';
  const activeTarget = data.targets[modeKey];

  const [thread, setThread] = useState<ThreadMsg[]>(() => messagesToThread(data.messages));
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sendInFlight, setSendInFlight] = useState(false);
  const [showObs, setShowObs] = useState(true);
  const [toolCalls, setToolCalls] = useState<Array<{ tool: string; ok: boolean }>>([]);
  const [requestMeta, setRequestMeta] = useState<any>(null);

  const [memTitle, setMemTitle] = useState('');
  const [memContent, setMemContent] = useState('');
  const [memTags, setMemTags] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');

  const bodyRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingSessionRef = useRef<PendingSessionMutation | null>(null);
  const sessionToastRef = useRef<string>('');
  const memoryToastRef = useRef<string>('');
  const memoryWasAddRef = useRef(false);
  const importPendingRef = useRef(false);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thread, streaming]);

  // Re-sync the rendered thread whenever the loader delivers messages (session
  // switch or post-stream revalidation) — never while a live stream is writing.
  useEffect(() => {
    if (streamingRef.current) return;
    setThread(messagesToThread(data.messages));
  }, [data.messages]);

  // Session-scoped reset: abort any in-flight stream and clear per-request panels.
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
    setSendInFlight(false);
    setToolCalls([]);
    setRequestMeta(null);
    setInput('');
  }, [activeSession.id]);

  // Abort a live stream if the component unmounts mid-response.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Session CRUD follow-up (create / mode switch / memory toggle).
  useEffect(() => {
    if (sessionFetcher.state !== 'idle' || !sessionFetcher.data || !pendingSessionRef.current) return;
    const pending = pendingSessionRef.current;
    pendingSessionRef.current = null;
    const raw = sessionFetcher.data;
    if (raw && raw.ok === false) ctx.toast(raw.error || 'Action failed', true);
    else ctx.toast(sessionToastRef.current || 'Done');
    const followUp = computeSessionMutationFollowUp({ pending, raw, searchParams });
    if (followUp.effect === 'navigate') navigate(followUp.href);
    else revalidator.revalidate();
  }, [sessionFetcher.state, sessionFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memory CRUD follow-up.
  useEffect(() => {
    if (memoryFetcher.state !== 'idle' || !memoryFetcher.data) return;
    const raw = memoryFetcher.data;
    if (raw && raw.ok === false) {
      ctx.toast(raw.error || 'Memory action failed', true);
      return;
    }
    ctx.toast(memoryToastRef.current || 'Memory updated');
    if (memoryWasAddRef.current) {
      memoryWasAddRef.current = false;
      setMemTitle('');
      setMemContent('');
      setMemTags('');
    }
    revalidator.revalidate();
  }, [memoryFetcher.state, memoryFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import session follow-up.
  useEffect(() => {
    if (importFetcher.state !== 'idle' || !importFetcher.data || !importPendingRef.current) return;
    importPendingRef.current = false;
    const raw = importFetcher.data;
    if (raw && raw.ok === false) {
      ctx.toast(raw.error || 'Import failed', true);
      return;
    }
    ctx.toast(`Imported ${raw.inserted ?? 0} message(s)`);
    setImportJson('');
    setShowImport(false);
    if (raw.sessionId) {
      const params = new URLSearchParams(searchParams);
      params.set('sessionId', raw.sessionId);
      navigate('/internal/ai-assistant?' + params.toString());
    } else {
      revalidator.revalidate();
    }
  }, [importFetcher.state, importFetcher.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const routeNavigationPending = computeAssistantRouteNavigationOverlayPending({
    navigationState: navigation.state,
    navigationLocation: navigation.location,
    currentPathname: location.pathname,
    currentSearch: location.search,
  });
  const sendDisabledReason = computeAssistantSendDisabledReason({
    draft: input,
    isStreaming: streaming,
    activeSessionId: activeSession.id,
    sessionMutationBusy: sessionFetcher.state !== 'idle',
    routeNavigationPending,
    sendInFlight,
  });
  const canSend = sendDisabledReason === null;

  const patchLastMessage = (patch: (m: ThreadMsg) => Partial<ThreadMsg>) => {
    setThread((t) => {
      const last = t[t.length - 1];
      if (!last) return t;
      const copy = t.slice();
      copy[copy.length - 1] = { ...last, ...patch(last) };
      return copy;
    });
  };

  const send = async () => {
    if (!canSend) return;
    const sessionId = activeSession.id;
    if (sessionId === 'unavailable') return;
    const q = input.trim();
    const target = modeKey;
    const clientRequestId = newClientRequestId();

    setInput('');
    setSendInFlight(true);
    setStreaming(true);
    streamingRef.current = true;
    setToolCalls([]);
    setThread((t) => [
      ...t,
      { role: 'user', text: q },
      { role: 'assistant', text: '', status: 'streaming', tools: [] },
    ]);

    const ac = new AbortController();
    abortRef.current = ac;
    let sawError = false;

    const handleEvent = (eventName: string, payload: any) => {
      if (eventName === 'ready') {
        setRequestMeta({ assistantMessageId: payload.assistantMessageId, target, resumed: payload.resumed });
      } else if (eventName === 'token') {
        if (typeof payload.text === 'string') {
          patchLastMessage((m) => ({ text: (m.text || '') + payload.text, status: 'streaming' }));
        }
      } else if (eventName === 'tool') {
        const toolName = typeof payload.tool === 'string' ? payload.tool : 'tool';
        const ok = payload.ok !== false;
        setToolCalls((prev) => [...prev, { tool: toolName, ok }]);
        patchLastMessage((m) => ({ tools: [...(m.tools || []), toolName] }));
      } else if (eventName === 'done') {
        setRequestMeta({
          assistantMessageId: payload.assistantMessageId,
          target: payload.target ?? target,
          backend: payload.backend,
          model: payload.model,
          latencyMs: payload.latencyMs,
          tokensIn: payload.tokensIn,
          tokensOut: payload.tokensOut,
          hadFallback: payload.hadFallback,
          resumed: payload.resumed,
        });
        patchLastMessage(() => ({ status: 'completed' }));
      } else if (eventName === 'error') {
        sawError = true;
        const msg = typeof payload.message === 'string' ? payload.message : 'Response failed';
        patchLastMessage((m) => ({ status: 'error', error: msg, text: m.text || '' }));
        ctx.toast(msg, true);
      }
    };

    const handleFrame = (raw: string) => {
      if (!raw) return;
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue; // SSE comment / keepalive
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
      if (dataLines.length === 0) return;
      let payload: any;
      try {
        payload = JSON.parse(dataLines.join('\n'));
      } catch {
        return;
      }
      handleEvent(eventName, payload);
    };

    try {
      const res = await fetch('/internal/ai-assistant/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ sessionId, message: q, target, clientRequestId }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (j && typeof j.error === 'string') msg = j.error;
        } catch {
          /* non-JSON error body */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf('\n\n');
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          handleFrame(frame);
          sep = buffer.indexOf('\n\n');
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleFrame(buffer);
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      if (!aborted && !sawError) {
        const msg = err instanceof Error ? err.message : 'Chat request failed';
        patchLastMessage((m) => ({ status: 'error', error: msg, text: m.text || '' }));
        ctx.toast(msg, true);
      }
    } finally {
      streamingRef.current = false;
      setStreaming(false);
      setSendInFlight(false);
      abortRef.current = null;
      revalidator.revalidate();
    }
  };

  const startNewChat = () => {
    const mode: 'localMachine' | 'modalRemote' =
      data.assistantLocalOnly || activeSession.id === 'unavailable' ? 'localMachine' : modeKey;
    pendingSessionRef.current = { kind: 'create' };
    sessionToastRef.current = 'New chat started';
    sessionFetcher.submit(buildCreateSessionFormData(mode), { method: 'post' });
  };

  const switchSession = (id: string) => {
    if (id === activeSession.id) return;
    const params = new URLSearchParams(searchParams);
    params.set('sessionId', id);
    navigate('/internal/ai-assistant?' + params.toString());
  };

  const switchMode = (next: 'localMachine' | 'modalRemote') => {
    if (activeSession.id === 'unavailable' || next === modeKey) return;
    if (next === 'modalRemote' && data.assistantLocalOnly) {
      ctx.toast('Cloud target is disabled while local-only mode is set.', true);
      return;
    }
    pendingSessionRef.current = { kind: 'update' };
    sessionToastRef.current = next === 'modalRemote' ? 'Switched to Cloud' : 'Switched to Local';
    sessionFetcher.submit(buildUpdateSessionModeFormData(activeSession.id, next), { method: 'post' });
  };

  const toggleSessionMemory = () => {
    if (activeSession.id === 'unavailable') return;
    const next = !activeSession.memoryEnabled;
    pendingSessionRef.current = { kind: 'update' };
    sessionToastRef.current = next ? 'Memory enabled' : 'Memory disabled';
    sessionFetcher.submit(buildUpdateSessionMemoryFormData(activeSession.id, next), { method: 'post' });
  };

  const addMemory = () => {
    if (!memTitle.trim() || !memContent.trim()) return;
    memoryToastRef.current = 'Memory saved';
    memoryWasAddRef.current = true;
    memoryFetcher.submit(
      buildCreateMemoryFormData({ title: memTitle.trim(), content: memContent.trim(), tags: memTags.trim() }),
      { method: 'post' },
    );
  };

  const removeMemory = (id: string) => {
    memoryToastRef.current = 'Memory deleted';
    memoryWasAddRef.current = false;
    memoryFetcher.submit(buildDeleteMemoryFormData(id), { method: 'post' });
  };

  const submitImport = () => {
    let parsed: any;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      ctx.toast('Import payload is not valid JSON.', true);
      return;
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.title !== 'string' || !Array.isArray(parsed.messages)) {
      ctx.toast('Import needs a "title" and a "messages" array.', true);
      return;
    }
    importPendingRef.current = true;
    importFetcher.submit(
      buildImportSessionFormData({
        title: parsed.title,
        mode: parsed.mode === 'modalRemote' ? 'modalRemote' : 'localMachine',
        memoryEnabled: parsed.memoryEnabled,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
        messages: parsed.messages,
      }),
      { method: 'post' },
    );
  };

  const sessionRows =
    activeSession.id === 'unavailable' || data.sessions.some((s) => s.id === activeSession.id)
      ? data.sessions
      : [activeSession, ...data.sessions];

  const suggestions = [
    'Why did the last publish job fail?',
    'Summarize the last 24h of errors',
    'Which stores are near their AI quota?',
    'Show recent failed jobs in the DLQ',
  ];

  const chatReady = activeTarget.chatProbe.ok;
  const headerModel = activeTarget.model || activeTarget.backend;
  const reqMeta = requestMeta ?? deriveLastAssistantMeta(data.messages);
  const sessionBusy = sessionFetcher.state !== 'idle';

  return (
    <div className="assistant-shell">
      <aside className="asst-sessions">
        <div style={{ padding: 14 }}>
          <Btn variant="primary" icon="plus" className="btn-block" onClick={startNewChat} loading={sessionBusy}>
            New chat
          </Btn>
        </div>
        <div className="asst-session-list">
          <div className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: '4px 14px' }}>
            Recent
          </div>
          {sessionRows.length === 0 && (
            <div className="t-xs t-muted" style={{ padding: '4px 14px' }}>
              No conversations yet.
            </div>
          )}
          {sessionRows.map((s) => (
            <button
              key={s.id}
              className={'asst-session' + (s.id === activeSession.id ? ' sel' : '')}
              onClick={() => switchSession(s.id)}
            >
              <Icon name="chat" size={15} className="t-muted" />
              <div className="grow stack" style={{ gap: 0, minWidth: 0 }}>
                <span className="t-sm t-trunc">{s.title}</span>
                <span className="t-xs t-muted">
                  {formatRelativeTime(s.updatedAt)} · {s.messageCount} msgs
                </span>
              </div>
              <span className="badge" style={{ height: 17, fontSize: 10 }}>
                {s.mode === 'modalRemote' ? 'cloud' : 'local'}
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
              <Badge tone="magic">{headerModel}</Badge>
            </div>
            <span className="t-xs t-muted">Internal copilot for ops, traces &amp; debugging</span>
          </div>
          <div className="row-3">
            <div className="seg">
              <button
                aria-selected={modeKey === 'localMachine'}
                onClick={() => switchMode('localMachine')}
                disabled={sessionBusy || activeSession.id === 'unavailable'}
              >
                <Icon name="desktop" size={14} />
                Local
              </button>
              <button
                aria-selected={modeKey === 'modalRemote'}
                onClick={() => switchMode('modalRemote')}
                disabled={sessionBusy || activeSession.id === 'unavailable' || data.assistantLocalOnly}
                title={data.assistantLocalOnly ? 'Cloud target disabled (local-only mode)' : undefined}
              >
                <Icon name="globe" size={14} />
                Cloud
              </button>
            </div>
            <span className="asst-health" title={activeTarget.chatProbe.message}>
              <StatusDot ok={chatReady} />
              {chatReady ? 'Chat ready' : 'Chat unavailable'}
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
                {suggestions.map((s, i) => (
                  <button key={i} className="asst-chip" onClick={() => setInput(s)}>
                    <Icon name="arrowRight" size={14} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {thread.map((m, i) => {
            const isLast = i === thread.length - 1;
            const showTyping = streaming && isLast && m.role === 'assistant' && !m.text;
            return (
              <div key={m.id ?? i} className={'asst-msg ' + m.role}>
                {m.role === 'assistant' && (
                  <span className="asst-ava">
                    <Icon name="magic" size={15} />
                  </span>
                )}
                <div className="asst-bubble">
                  {m.tools && m.tools.length > 0 && (
                    <div className="asst-tools">
                      {m.tools.map((t, ti) => (
                        <span key={t + ti} className="asst-tool">
                          <Icon name="bolt" size={12} />
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {showTyping ? (
                    <div className="asst-typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : m.text ? (
                    <div className="asst-text" dangerouslySetInnerHTML={{ __html: mdLite(m.text) }} />
                  ) : m.status === 'error' ? null : (
                    <div className="asst-text t-muted">No response.</div>
                  )}
                  {m.status === 'error' && (
                    <div className="row-2 t-xs" style={{ color: 'var(--p-critical)', marginTop: m.text ? 8 : 0 }}>
                      <Icon name="alert" size={13} />
                      {m.error || 'Response failed.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
            <Btn
              variant="magic"
              icon="send"
              onClick={send}
              disabled={!canSend}
              loading={streaming}
              title={sendDisabledReason ?? undefined}
            />
          </div>
          <div className="t-xs t-muted" style={{ textAlign: 'center', marginTop: 7 }}>
            {activeTarget.backend}
            {activeTarget.model ? ' · ' + activeTarget.model : ''} · responses are reviewable; tool calls are audited
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
                  ['Backend', <Badge key="b" tone="magic">{activeTarget.backend}</Badge>],
                  ['Model', <MonoChip key="m">{activeTarget.model || '—'}</MonoChip>],
                  [
                    'Health',
                    <span key="h" className="row-2" title={activeTarget.health.message}>
                      <StatusDot ok={activeTarget.health.ok} />
                      {activeTarget.health.ok ? 'Live' : 'Down'}
                    </span>,
                  ],
                  [
                    'Chat',
                    <span key="c" className="row-2" title={activeTarget.chatProbe.message}>
                      <StatusDot ok={activeTarget.chatProbe.ok} />
                      {activeTarget.chatProbe.ok ? 'Ready' : 'Unavailable'}
                    </span>,
                  ],
                  activeTarget.configured
                    ? null
                    : ['Config', <span key="cf" className="t-xs t-muted">Not configured</span>],
                ]}
              />
            </div>
            <div className="divider" />
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                Last response
              </span>
              {reqMeta ? (
                <KV
                  rows={[
                    reqMeta.assistantMessageId
                      ? ['Message ID', <MonoChip key="r">{reqMeta.assistantMessageId}</MonoChip>]
                      : null,
                    reqMeta.backend ? ['Backend', reqMeta.backend] : null,
                    reqMeta.model ? ['Model', <MonoChip key="mm">{reqMeta.model}</MonoChip>] : null,
                    typeof reqMeta.latencyMs === 'number' ? ['Latency', `${reqMeta.latencyMs} ms`] : null,
                    reqMeta.tokensIn != null || reqMeta.tokensOut != null
                      ? ['Tokens', `${reqMeta.tokensIn ?? 0} in / ${reqMeta.tokensOut ?? 0} out`]
                      : null,
                    reqMeta.hadFallback ? ['Fallback', <Badge key="fb" tone="warning">used</Badge>] : null,
                  ]}
                />
              ) : (
                <span className="t-sm t-muted">No responses in this chat yet.</span>
              )}
            </div>
            <div className="divider" />
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                Chat usage
              </span>
              <KV
                rows={[
                  ['Messages', String(activeSession.messageCount)],
                  ['Tokens in', data.overview.tokensIn.toLocaleString()],
                  ['Tokens out', data.overview.tokensOut.toLocaleString()],
                  ['Est. cost', formatEstimatedCostLabel(data.overview.estimatedCostCents)],
                ]}
              />
            </div>
            <div className="divider" />
            <div className="stack-2">
              <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                Tool calls
              </span>
              {toolCalls.length === 0 ? (
                <span className="t-sm t-muted">No tool calls in this response.</span>
              ) : (
                toolCalls.map((t, i) => (
                  <div key={i} className="row spread t-sm">
                    <span className="row-2">
                      <StatusDot ok={t.ok} />
                      <span className="t-mono t-xs">{t.tool}</span>
                    </span>
                    <span className="t-xs t-muted">{t.ok ? 'ok' : 'error'}</span>
                  </div>
                ))
              )}
            </div>
            <div className="divider" />
            <div className="stack-2">
              <div className="row spread">
                <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                  Memory
                </span>
                <span className="row-2 t-xs t-muted">
                  {activeSession.memoryEnabled ? 'On' : 'Off'}
                  <Toggle
                    checked={activeSession.memoryEnabled}
                    onChange={toggleSessionMemory}
                    disabled={activeSession.id === 'unavailable' || sessionBusy}
                  />
                </span>
              </div>
              {data.memories.length === 0 ? (
                <span className="t-sm t-muted">No saved memories.</span>
              ) : (
                data.memories.map((mem) => (
                  <div key={mem.id} className="row spread t-sm" style={{ alignItems: 'flex-start', gap: 8 }}>
                    <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                      <span className="t-sm t-trunc">
                        {mem.title}
                        {!mem.isEnabled && <span className="t-xs t-muted"> (off)</span>}
                      </span>
                      <span className="t-xs t-muted t-trunc">{mem.content}</span>
                    </div>
                    <button
                      className="btn btn-icon btn-sm btn-plain"
                      title="Delete memory"
                      onClick={() => removeMemory(mem.id)}
                      disabled={memoryFetcher.state !== 'idle'}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))
              )}
              <input
                className="input"
                placeholder="Memory title"
                value={memTitle}
                onChange={(e) => setMemTitle(e.target.value)}
              />
              <Textarea
                rows={2}
                placeholder="What should the assistant always know?"
                value={memContent}
                onChange={(e: any) => setMemContent(e.target.value)}
              />
              <input
                className="input"
                placeholder="tags, comma separated"
                value={memTags}
                onChange={(e) => setMemTags(e.target.value)}
              />
              <Btn
                size="sm"
                icon="plus"
                onClick={addMemory}
                disabled={!memTitle.trim() || !memContent.trim() || memoryFetcher.state !== 'idle'}
              >
                Save memory
              </Btn>
            </div>
            <div className="divider" />
            <div className="stack-2">
              <div className="row spread">
                <span className="nav-sec-title" style={{ color: 'var(--p-text-secondary)', padding: 0 }}>
                  Import session
                </span>
                <Btn
                  size="sm"
                  icon={showImport ? 'chevronUp' : 'chevronDown'}
                  onClick={() => setShowImport((v) => !v)}
                />
              </div>
              {showImport && (
                <>
                  <Textarea
                    rows={4}
                    mono
                    placeholder='{"title":"Imported","mode":"localMachine","messages":[{"role":"user","content":"hi"}]}'
                    value={importJson}
                    onChange={(e: any) => setImportJson(e.target.value)}
                  />
                  <Btn
                    size="sm"
                    icon="upload"
                    onClick={submitImport}
                    disabled={!importJson.trim() || importFetcher.state !== 'idle'}
                    loading={importFetcher.state !== 'idle'}
                  >
                    Import
                  </Btn>
                </>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

