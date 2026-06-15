import { json } from '@remix-run/node';
import {
  isRouteErrorResponse,
  useFetcher,
  useFormAction,
  useLoaderData,
  useNavigate,
  useNavigation,
  useLocation,
  useRevalidator,
  useRouteError,
  useSearchParams,
} from '@remix-run/react';
import {
  Banner,
  BlockStack,
  Button,
  Page,
  SkeletonBodyText,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { isReferenceLocalPromptRouterBaseUrl } from '~/services/ai/assistant-router-local';
import { buildAssistantReadinessSummary } from '~/services/ai/assistant-readiness-summary';
import type { InternalAssistantStoreService } from '~/services/ai/internal-assistant-store.server';
import type { RouterRuntimeConfig } from '~/schemas/router-runtime-config.server';
import { isInternalAiLocalOnlyEnabledFromEnv } from '~/services/ai/internal-ai-local-only';

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
const REFERENCE_ROUTER_8787_HINT =
  'Tip: start `pnpm --filter web router:internal` and keep Ollama (`ROUTER_OLLAMA_BASE_URL`) or an OpenAI-compatible upstream (`ROUTER_OPENAI_BASE_URL`) reachable for your backend.';

/** Injected via dangerouslySetInnerHTML so the browser does not normalize CSS text differently from React SSR text-node diff (hydration mismatch on style children). */
const AI_ASSISTANT_INLINE_CSS = `
        .AiAssistant-root {
          display: grid;
          grid-template-columns: 240px minmax(0,1fr);
          gap: 0;
          height: min(72dvh, 100dvh - 24px);
          max-height: min(72dvh, 100dvh - 24px);
          min-height: 0;
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
          min-height: 0;
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
          overflow: hidden;
        }
        .AiAssistant-topbar {
          height: 42px;
          border-bottom: 1px solid #eceef1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          gap: 10px;
          background: #fafafa;
        }
        .AiAssistant-topInfoCard {
          margin: 0 0 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #fbfbfc;
          padding: 6px 10px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
          font-size: 10.5px;
          color: #4b5563;
        }
        .AiAssistant-topSummary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          color: #111827;
          margin-right: 6px;
        }
        .AiAssistant-topSummaryDetail {
          font-weight: 400;
          color: #6b7280;
          max-width: 420px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .AiAssistant-topInfoItem {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding-right: 7px;
          border-right: 1px solid #eceff3;
          white-space: nowrap;
        }
        .AiAssistant-topInfoItem:last-child { border-right: none; padding-right: 0; }
        .AiAssistant-topInfoItem.bad { color: #b91c1c; }
        .AiAssistant-topInfoItem.warn { color: #92400e; }
        .AiAssistant-topInfoItem.good { color: #065f46; }
        .AiAssistant-recheckBtn {
          border: 1px solid #d9dee5;
          border-radius: 999px;
          background: #fff;
          padding: 3px 9px;
          font-size: 10.5px;
          color: #374151;
          cursor: pointer;
          transition: background-color 120ms ease, border-color 120ms ease;
        }
        .AiAssistant-recheckBtn:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #cfd6df;
        }
        .AiAssistant-recheckBtn:disabled { opacity: 0.6; cursor: default; }
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
          font-size: 11px;
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
          font-size: 11px;
          padding: 3px 8px;
          cursor: pointer;
          background: transparent;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .AiAssistant-segmented button.active { background: #eef2f7; color: #0f172a; }
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
          overscroll-behavior: contain;
          padding: 14px;
        }
        .AiAssistant-conversation {
          max-width: 760px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .AiAssistant-message {
          display: grid;
          grid-template-columns: 76px minmax(0,1fr);
          gap: 8px;
          font-size: 12.75px;
          line-height: 1.46;
          color: #111827;
        }
        .AiAssistant-message.ai .AiAssistant-role { color: #374151; }
        .AiAssistant-message.user .AiAssistant-role { color: #111827; font-weight: 600; }
        .AiAssistant-role {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          padding-top: 2px;
        }
        .AiAssistant-meta {
          margin-top: 5px;
          font-size: 10px;
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
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .AiAssistant-composerDock {
          flex-shrink: 0;
          padding: 8px 14px;
          border-top: 1px solid #eceef1;
          background: linear-gradient(180deg, rgba(250,250,250,0.88), #fafafa 44%);
        }
        .AiAssistant-composer {
          max-width: 760px;
          margin: 0 auto;
          border: 1px solid #dfe4ea;
          border-radius: 8px;
          background: #fff;
          padding: 6px 9px;
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
          max-height: 150px;
          outline: none;
          font-size: 12.5px;
          line-height: 1.38;
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
      `.trim();

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

export default function InternalAiAssistantRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const sessionMutationFetcher = useFetcher();
  const memoryMutationFetcher = useFetcher();
  const importSessionFetcher = useFetcher();
  const pendingSessionMutationRef = useRef<PendingSessionMutation | null>(null);
  const sessionMutationAction = useFormAction();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const importPayloadRef = useRef<HTMLTextAreaElement | null>(null);
  const sendLockRef = useRef(false);
  const [draft, setDraft] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  // Id of the assistant message a finished stream was persisted as. The transient
  // streaming bubble is cleared only once this message lands in the revalidated
  // loader data, so the reply never renders twice (bubble + persisted) or flickers.
  const [streamedAssistantId, setStreamedAssistantId] = useState<string | null>(null);
  const [liveProbes, setLiveProbes] = useState<{
    localMachine: LiveProbe;
    modalRemote: LiveProbe;
  }>({
    localMachine: {
      health: data.targets.localMachine.health,
      chatProbe: data.targets.localMachine.chatProbe,
    },
    modalRemote: {
      health: data.targets.modalRemote.health,
      chatProbe: data.targets.modalRemote.chatProbe,
    },
  });
  const [probeStatus, setProbeStatus] = useState<'idle' | 'checking'>('idle');
  const [streamMeta, setStreamMeta] = useState<{
    target: 'localMachine' | 'modalRemote';
    backend: string;
    model: string;
    latencyMs: number;
    tokensIn: number;
    tokensOut: number;
    hadFallback: boolean;
    estimatedCostCents?: number;
    resumed?: boolean;
    timestamp?: string;
  } | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [probeWarning, setProbeWarning] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sendInFlight, setSendInFlight] = useState(false);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<Array<{ name: string; ok: boolean; at: string }>>([]);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [searchDraft, setSearchDraft] = useState(data.query);
  const [showTopInfoMore, setShowTopInfoMore] = useState(false);
  const [memoryTitleDraft, setMemoryTitleDraft] = useState('');
  const [memoryContentDraft, setMemoryContentDraft] = useState('');
  const [memoryTagsDraft, setMemoryTagsDraft] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editMemoryTitleDraft, setEditMemoryTitleDraft] = useState('');
  const [editMemoryContentDraft, setEditMemoryContentDraft] = useState('');
  const [editMemoryTagsDraft, setEditMemoryTagsDraft] = useState('');
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPayloadDraft, setImportPayloadDraft] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);

  const activeSessionId = data.activeSession.id;

  const submitSessionMutation = useCallback(
    (formData: FormData, pending: PendingSessionMutation) => {
      pendingSessionMutationRef.current = pending;
      sessionMutationFetcher.submit(formData, { method: 'post', action: sessionMutationAction });
    },
    [sessionMutationAction, sessionMutationFetcher],
  );

  useEffect(() => {
    if (sessionMutationFetcher.state !== 'idle') return;
    const pending = pendingSessionMutationRef.current;
    if (!pending) return;
    pendingSessionMutationRef.current = null;
    const raw = sessionMutationFetcher.data;
    const followUp = computeSessionMutationFollowUp({ pending, raw, searchParams });
    if (followUp.effect === 'navigate') {
      navigate(followUp.href);
      return;
    }
    void revalidator.revalidate();
  }, [navigate, revalidator, searchParams, sessionMutationFetcher.data, sessionMutationFetcher.state]);

  useEffect(() => {
    if (memoryMutationFetcher.state !== 'idle') return;
    const payload = memoryMutationFetcher.data as { ok?: boolean; error?: string } | undefined;
    if (!payload) return;
    if (payload.ok) {
      setMemoryError(null);
      setEditingMemoryId(null);
      setMemoryTitleDraft('');
      setMemoryContentDraft('');
      setMemoryTagsDraft('');
      void revalidator.revalidate();
      return;
    }
    if (payload.error) setMemoryError(payload.error);
  }, [memoryMutationFetcher.data, memoryMutationFetcher.state, revalidator]);

  useEffect(() => {
    if (importSessionFetcher.state !== 'idle') return;
    const payload = importSessionFetcher.data as
      | { ok?: boolean; error?: string; sessionId?: string; inserted?: number; skipped?: number }
      | undefined;
    if (!payload) return;
    if (payload.ok && payload.sessionId) {
      const params = new URLSearchParams(searchParams);
      params.set('sessionId', payload.sessionId);
      setImportNotice(`Imported ${payload.inserted ?? 0} message(s); skipped ${payload.skipped ?? 0} duplicate(s).`);
      setShowImportModal(false);
      setImportPayloadDraft('');
      navigate(`/internal/ai-assistant?${params.toString()}`);
      return;
    }
    if (payload.error) setImportError(payload.error);
  }, [importSessionFetcher.data, importSessionFetcher.state, navigate, searchParams]);

  useEffect(() => {
    if (!showImportModal) return;
    const timer = window.setTimeout(() => {
      importPayloadRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [showImportModal]);

  const sessionMutationBusy = sessionMutationFetcher.state !== 'idle';
  const memoryMutationBusy = memoryMutationFetcher.state !== 'idle';

  const fetchProbes = useCallback(async (signal?: AbortSignal) => {
    setProbeStatus('checking');
    try {
      const response = await fetch('/internal/ai-assistant/probe', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        localMachine: LiveProbe;
        modalRemote: LiveProbe;
      };
      setLiveProbes({
        localMachine: body.localMachine,
        modalRemote: body.modalRemote,
      });
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return;
    } finally {
      setProbeStatus('idle');
    }
  }, []);

  const activeTargetKey: 'localMachine' | 'modalRemote' = data.activeSession.mode;
  const preferredLive = liveProbes[activeTargetKey];
  const preferredChatOk = preferredLive?.chatProbe?.ok ?? data.targets[activeTargetKey].chatProbe.ok;

  useEffect(() => {
    if (preferredChatOk) return;
    const controller = new AbortController();
    void fetchProbes(controller.signal);
    const timer = window.setInterval(() => {
      void fetchProbes(controller.signal);
    }, 20_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [preferredChatOk, fetchProbes]);

  const sendMessage = useCallback(async (overrideMessage?: string, overrideRetryCount?: number) => {
    const outgoing = (typeof overrideMessage === 'string' ? overrideMessage : draft).trim();
    if (!outgoing || isStreaming) return;
    if (sendLockRef.current) return;
    const preferredTarget: 'localMachine' | 'modalRemote' = data.activeSession.mode;
    if (data.assistantLocalOnly && preferredTarget === 'modalRemote') {
      setStreamError(
        'Cloud assistant is disabled while INTERNAL_AI_LOCAL_ONLY is set. Switch the session to Local above.',
      );
      return;
    }
    sendLockRef.current = true;
    setSendInFlight(true);
    setProbeWarning(null);
    const preferredStatic = data.targets[preferredTarget];
    const preferredLiveProbe = liveProbes[preferredTarget];
    const liveHealth = preferredLiveProbe?.health ?? preferredStatic.health;
    const liveChat = preferredLiveProbe?.chatProbe ?? preferredStatic.chatProbe;
    const referenceRouterHint =
      preferredTarget === 'localMachine' && isReferenceLocalPromptRouterBaseUrl(preferredStatic.url)
        ? ` ${REFERENCE_ROUTER_8787_HINT}`
        : '';
    if (!liveHealth.ok || !liveChat.ok) {
      // Surface diagnostics but still allow send; probe checks can be stale/noisy.
      setToolStatus(
        !liveHealth.ok
          ? `${preferredTarget === 'modalRemote' ? 'Cloud' : 'Local'} probe unhealthy; attempting send anyway.`
          : `Chat probe reported blocked; attempting send anyway.`,
      );
      const probeDetail = !liveHealth.ok ? liveHealth.message : liveChat.message;
      setProbeWarning(
        `${preferredTarget === 'modalRemote' ? 'Cloud' : 'Local'} probe warning (${probeDetail}).${referenceRouterHint}`.trim(),
      );
      setStreamError(null);
    } else {
      setProbeWarning(null);
      setStreamError(null);
    }
    setIsStreaming(true);
    setStreamingReply('');
    setStreamedAssistantId(null);
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
            setStreamError(null);
            setProbeWarning(null);
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
            if (typeof payload?.assistantMessageId === 'string') {
              setStreamedAssistantId(payload.assistantMessageId);
            }
            setStreamMeta({
              target: payload.target,
              backend: payload.backend,
              model: payload.model,
              latencyMs: payload.latencyMs,
              tokensIn: payload.tokensIn,
              tokensOut: payload.tokensOut,
              hadFallback: payload.hadFallback,
              estimatedCostCents:
                typeof payload?.estimatedCostCents === 'number'
                  ? payload.estimatedCostCents
                  : undefined,
              resumed: Boolean(payload?.resumed),
              timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : undefined,
            });
            setToolStatus(null);
          } else if (eventName === 'error') {
            sawError = true;
            lastErrorMessage = payload.message ?? 'Streaming error';
            setStreamError(lastErrorMessage ?? 'Streaming error');
            if (typeof payload?.assistantMessageId === 'string') {
              setStreamedAssistantId(payload.assistantMessageId);
            }
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
        setToolStatus('Connection interrupted. Reconnecting...');
        const second = await runOnce();
        if (second.interrupted) {
          setStreamError('Streaming interrupted after reconnect attempt');
        }
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : 'Streaming request failed');
    } finally {
      sendLockRef.current = false;
      setIsReconnecting(false);
      setIsStreaming(false);
      setSendInFlight(false);
      setToolStatus(null);
      revalidator.revalidate();
    }
  }, [
    activeSessionId,
    data.assistantLocalOnly,
    data.activeSession.mode,
    data.targets,
    draft,
    isStreaming,
    liveProbes,
    revalidator,
  ]);

  // Drop the transient streaming bubble once its persisted message is in loader
  // data — prevents the finished reply from rendering twice after revalidation.
  useEffect(() => {
    if (!streamedAssistantId) return;
    if (data.messages.some((m) => m.id === streamedAssistantId)) {
      setStreamingReply('');
      setStreamedAssistantId(null);
    }
  }, [streamedAssistantId, data.messages]);

  const copyToClipboard = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedTextId(id);
      setTimeout(() => setCopiedTextId((prev) => (prev === id ? null : prev)), 1200);
    } catch {
      // ignore clipboard errors
    }
  }, []);

  const applySearch = useCallback((nextQuery: string) => {
    const params = new URLSearchParams(searchParams);
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    else params.delete('q');
    navigate(`/internal/ai-assistant?${params.toString()}`);
  }, [navigate, searchParams]);

  const parseImportPayload = useCallback((rawPayload: string): z.infer<typeof ImportSessionSchema> => {
    const parsed = JSON.parse(rawPayload) as unknown;
    return ImportSessionSchema.parse(parsed);
  }, []);

  const submitImportPayload = useCallback(() => {
    setImportError(null);
    try {
      const imported = parseImportPayload(importPayloadDraft);
      importSessionFetcher.submit(buildImportSessionFormData(imported), {
        method: 'post',
        action: sessionMutationAction,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        setImportError('Import payload must be valid JSON.');
        return;
      }
      if (error instanceof z.ZodError) {
        setImportError(error.issues[0]?.message ?? 'Import payload failed validation.');
        return;
      }
      setImportError(error instanceof Error ? error.message : 'Unable to parse import payload.');
    }
  }, [importPayloadDraft, importSessionFetcher, parseImportPayload, sessionMutationAction]);

  const exportActiveSession = useCallback(() => {
    const payload = {
      title: data.activeSession.title,
      mode: data.activeSession.mode,
      memoryEnabled: data.activeSession.memoryEnabled,
      sessionId: data.activeSession.id === 'unavailable' ? undefined : data.activeSession.id,
      messages: data.messages.map((message) => ({
        role: message.role,
        content: message.content,
        mode: message.mode ?? undefined,
        backend: message.backend ?? undefined,
        model: message.model ?? undefined,
        error: message.error ?? undefined,
        retryCount: message.retryCount,
        clientRequestId: message.clientRequestId ?? undefined,
      })),
    } satisfies z.infer<typeof ImportSessionSchema>;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `assistant-session-${data.activeSession.id}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [data.activeSession.id, data.activeSession.memoryEnabled, data.activeSession.mode, data.activeSession.title, data.messages]);

  const maxInsightsTokens = streamMeta?.tokensOut ?? data.overview.tokensOut ?? 0;
  const estimatedCostCents =
    typeof streamMeta?.estimatedCostCents === 'number'
      ? streamMeta.estimatedCostCents
      : data.overview.estimatedCostCents;
  const estimatedCostLabel = formatEstimatedCostLabel(estimatedCostCents);
  const modeLatencyHint = streamMeta?.latencyMs
    ? `Latency ${streamMeta.latencyMs} ms`
    : 'Latency --';
  const latestToolEvent = toolEvents.length ? toolEvents[toolEvents.length - 1] : null;
  const readiness = useMemo(
    () =>
      buildAssistantReadinessSummary({
        activeTarget: data.activeSession.mode,
        assistantLocalOnly: data.assistantLocalOnly,
        probes: liveProbes,
      }),
    [data.activeSession.mode, data.assistantLocalOnly, liveProbes],
  );
  const readinessToneClass = readiness.tone === 'good' ? 'good' : readiness.tone === 'warn' ? 'warn' : 'bad';

  const assistantRoutePending = computeAssistantRouteNavigationOverlayPending({
    navigationState: navigation.state,
    navigationLocation: navigation.location,
    currentPathname: location.pathname,
    currentSearch: location.search,
  });

  const sendDisabledReason = useMemo(
    () =>
      computeAssistantSendDisabledReason({
        draft,
        isStreaming,
        activeSessionId: data.activeSession.id,
        sessionMutationBusy: sessionMutationFetcher.state !== 'idle',
        routeNavigationPending: assistantRoutePending,
        sendInFlight,
      }),
    [
      draft,
      isStreaming,
      data.activeSession.id,
      sessionMutationFetcher.state,
      assistantRoutePending,
      sendInFlight,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (isMeta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (isMeta && event.key === 'Enter') {
        if (sendDisabledReason !== null) return;
        event.preventDefault();
        void sendMessage();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendDisabledReason, sendMessage]);

  return (
    <Page title="AI Assistant" subtitle="Calm internal developer copilot">
      <div style={{ position: 'relative' }}>
        {assistantRoutePending ? (
          <div
            aria-busy="true"
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 240,
              background: 'rgba(246, 248, 251, 0.88)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <BlockStack gap="400" inlineAlign="center">
              <Spinner accessibilityLabel="Loading AI assistant" size="large" />
              <div style={{ width: 280 }}>
                <SkeletonBodyText lines={3} />
              </div>
            </BlockStack>
          </div>
        ) : null}
        <div
          style={{
            opacity: assistantRoutePending ? 0.35 : 1,
            pointerEvents: assistantRoutePending ? 'none' : 'auto',
            transition: 'opacity 160ms ease',
          }}
        >
      <style dangerouslySetInnerHTML={{ __html: AI_ASSISTANT_INLINE_CSS }} />

      <div className="AiAssistant-topInfoCard">
        <span className="AiAssistant-topSummary" title={readiness.detail}>
          <span className={`AiAssistant-dot ${readinessToneClass === 'good' ? 'green' : readinessToneClass === 'warn' ? 'amber' : 'red'}`} />
          {readiness.headline}
          <span className="AiAssistant-topSummaryDetail">{readiness.detail}</span>
        </span>
        {readiness.standby ? (
          <span
            className="AiAssistant-topInfoItem"
            title={`healthz: ${readiness.standby.health.message}\nchat: ${readiness.standby.chatProbe.message}`}
            data-testid={`${readiness.standby.target === 'localMachine' ? 'local' : 'cloud'}-status-pill`}
          >
            <span
              className={`AiAssistant-dot ${
                !readiness.standby.health.ok
                  ? 'red'
                  : readiness.standby.chatProbe.ok
                    ? 'green'
                    : 'amber'
              }`}
            />
            {readiness.standby.label}{' '}
            {!readiness.standby.health.ok
              ? 'unhealthy'
              : readiness.standby.chatProbe.ok
                ? 'ready'
                : 'chat blocked'}
          </span>
        ) : null}
        <span className="AiAssistant-topInfoItem">Est. cost {estimatedCostLabel}</span>
        <button
          type="button"
          className="AiAssistant-recheckBtn"
          onClick={() => {
            void fetchProbes();
          }}
          disabled={probeStatus === 'checking'}
          data-testid="recheck-probes"
        >
          {probeStatus === 'checking' ? 'Rechecking…' : 'Recheck'}
        </button>
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
            <span className="AiAssistant-topInfoItem">Est. cost {estimatedCostLabel}</span>
            <span className="AiAssistant-topInfoItem">Memory {data.activeSession.memoryEnabled ? 'ON' : 'OFF'}</span>
            {latestToolEvent ? (
              <span className="AiAssistant-topInfoItem">
                Tool {latestToolEvent.ok ? 'OK' : 'ERR'} {latestToolEvent.name}
              </span>
            ) : null}
            <span
              className="AiAssistant-topInfoItem"
              title={`healthz: ${readiness.diagnostics.active.health}\nchat: ${readiness.diagnostics.active.chat}`}
            >
              Active diagnostics
            </span>
            {readiness.diagnostics.standby ? (
              <span
                className="AiAssistant-topInfoItem"
                title={`healthz: ${readiness.diagnostics.standby.health}\nchat: ${readiness.diagnostics.standby.chat}`}
              >
                Standby diagnostics
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {isReferenceLocalPromptRouterBaseUrl(data.targets.localMachine.url) &&
      (!liveProbes.localMachine.health.ok || !liveProbes.localMachine.chatProbe.ok) ? (
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
            submit={false}
            disabled={sessionMutationBusy}
            onClick={() => {
              const mode = resolveSessionModeForCreate(undefined, data.assistantLocalOnly);
              submitSessionMutation(buildCreateSessionFormData(mode), { kind: 'create' });
            }}
          >
            + New Chat
          </Button>
          <label
            htmlFor="session-search"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            Search chats
          </label>
          <input
            id="session-search"
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
              <div
                key={session.id}
                className={`AiAssistant-historyItem ${session.id === data.activeSession.id ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set('sessionId', session.id);
                    navigate(`/internal/ai-assistant?${params.toString()}`);
                  }}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  <div>{session.title}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{session.messageCount} messages</div>
                </button>
                <button
                  type="button"
                  aria-label={`Delete session ${session.title}`}
                  data-testid={`delete-session-${session.id}`}
                  disabled={sessionMutationBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (typeof window !== 'undefined' && !window.confirm(`Delete session "${session.title}"? This cannot be undone.`)) {
                      return;
                    }
                    submitSessionMutation(buildDeleteSessionFormData(session.id), {
                      kind: 'delete',
                      deletedId: session.id,
                      activeId: data.activeSession.id,
                      sessionsSnapshot: data.sessions,
                    });
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid #e3e3e3',
                    borderRadius: 4,
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#a4321e',
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 10,
              borderTop: '1px solid #e5e7eb',
              paddingTop: 10,
              display: 'grid',
              gap: 8,
            }}
          >
            <Text as="h2" variant="bodySm" fontWeight="medium">
              Memories
            </Text>
            <div data-testid="memory-list" style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {data.memories.length === 0 ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  No memories yet.
                </Text>
              ) : null}
              {data.memories.map((memory) => (
                <div key={memory.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                  {editingMemoryId === memory.id ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input
                        value={editMemoryTitleDraft}
                        onChange={(event) => setEditMemoryTitleDraft(event.currentTarget.value)}
                        placeholder="Title"
                        aria-label="Edit memory title"
                      />
                      <textarea
                        value={editMemoryContentDraft}
                        onChange={(event) => setEditMemoryContentDraft(event.currentTarget.value)}
                        placeholder="Content"
                        aria-label="Edit memory content"
                        rows={3}
                      />
                      <input
                        value={editMemoryTagsDraft}
                        onChange={(event) => setEditMemoryTagsDraft(event.currentTarget.value)}
                        placeholder="tags, comma-separated"
                        aria-label="Edit memory tags"
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="micro"
                          disabled={memoryMutationBusy}
                          onClick={() => {
                            if (!editMemoryTitleDraft.trim() || !editMemoryContentDraft.trim()) {
                              setMemoryError('Memory title and content are required.');
                              return;
                            }
                            setMemoryError(null);
                            memoryMutationFetcher.submit(
                              buildUpdateMemoryFormData(memory.id, {
                                title: editMemoryTitleDraft.trim(),
                                content: editMemoryContentDraft.trim(),
                                tags: editMemoryTagsDraft,
                              }),
                              { method: 'post', action: sessionMutationAction },
                            );
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          size="micro"
                          variant="plain"
                          onClick={() => {
                            setEditingMemoryId(null);
                            setMemoryError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        {memory.title}
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        {memory.content}
                      </Text>
                      {memory.tags.length ? (
                        <Text as="p" tone="subdued" variant="bodySm">
                          {memory.tags.join(', ')}
                        </Text>
                      ) : null}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="micro"
                          variant="plain"
                          disabled={memoryMutationBusy}
                          onClick={() => {
                            setEditingMemoryId(memory.id);
                            setEditMemoryTitleDraft(memory.title);
                            setEditMemoryContentDraft(memory.content);
                            setEditMemoryTagsDraft(memory.tags.join(', '));
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="micro"
                          variant="plain"
                          disabled={memoryMutationBusy}
                          onClick={() => {
                            memoryMutationFetcher.submit(
                              buildUpdateMemoryFormData(memory.id, { isEnabled: !memory.isEnabled }),
                              { method: 'post', action: sessionMutationAction },
                            );
                          }}
                        >
                          {memory.isEnabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          size="micro"
                          tone="critical"
                          variant="plain"
                          disabled={memoryMutationBusy}
                          data-testid="memory-delete"
                          data-memory-id={memory.id}
                          onClick={() => {
                            if (typeof window !== 'undefined' && !window.confirm(`Delete memory "${memory.title}"?`)) {
                              return;
                            }
                            memoryMutationFetcher.submit(buildDeleteMemoryFormData(memory.id), {
                              method: 'post',
                              action: sessionMutationAction,
                            });
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div data-testid="memory-create" style={{ display: 'grid', gap: 6 }}>
              <input
                value={memoryTitleDraft}
                onChange={(event) => setMemoryTitleDraft(event.currentTarget.value)}
                placeholder="Memory title"
                aria-label="Memory title"
              />
              <textarea
                value={memoryContentDraft}
                onChange={(event) => setMemoryContentDraft(event.currentTarget.value)}
                placeholder="Memory content"
                aria-label="Memory content"
                rows={3}
              />
              <input
                value={memoryTagsDraft}
                onChange={(event) => setMemoryTagsDraft(event.currentTarget.value)}
                placeholder="tags, comma-separated"
                aria-label="Memory tags"
              />
              <Button
                size="slim"
                disabled={memoryMutationBusy}
                onClick={() => {
                  if (!memoryTitleDraft.trim() || !memoryContentDraft.trim()) {
                    setMemoryError('Memory title and content are required.');
                    return;
                  }
                  setMemoryError(null);
                  memoryMutationFetcher.submit(
                    buildCreateMemoryFormData({
                      title: memoryTitleDraft.trim(),
                      content: memoryContentDraft.trim(),
                      tags: memoryTagsDraft,
                      isEnabled: true,
                    }),
                    { method: 'post', action: sessionMutationAction },
                  );
                }}
              >
                Add memory
              </Button>
              {memoryError ? (
                <Text as="p" tone="critical" variant="bodySm">
                  {memoryError}
                </Text>
              ) : null}
            </div>
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
                  disabled={sessionMutationBusy}
                  onClick={() => {
                    submitSessionMutation(
                      buildUpdateSessionModeFormData(data.activeSession.id, 'localMachine'),
                      { kind: 'update' },
                    );
                  }}
                >
                  Local
                </button>
                <button
                  type="button"
                  className={data.activeSession.mode === 'modalRemote' ? 'active' : ''}
                  disabled={data.assistantLocalOnly || sessionMutationBusy}
                  title={
                    data.assistantLocalOnly
                      ? 'Cloud target disabled while INTERNAL_AI_LOCAL_ONLY is set'
                      : undefined
                  }
                  onClick={() => {
                    if (data.assistantLocalOnly) return;
                    submitSessionMutation(
                      buildUpdateSessionModeFormData(data.activeSession.id, 'modalRemote'),
                      { kind: 'update' },
                    );
                  }}
                >
                  Cloud
                </button>
              </div>
              <Button
                size="slim"
                variant="plain"
                submit={false}
                disabled={sessionMutationBusy}
                onClick={() => {
                  submitSessionMutation(
                    buildUpdateSessionMemoryFormData(
                      data.activeSession.id,
                      !data.activeSession.memoryEnabled,
                    ),
                    { kind: 'update' },
                  );
                }}
              >
                {data.activeSession.memoryEnabled ? 'Memory ON' : 'Memory OFF'}
              </Button>
              <span data-testid="memory-import">
                <Button
                  size="slim"
                  variant="plain"
                  submit={false}
                  onClick={() => {
                    setImportError(null);
                    setShowImportModal(true);
                  }}
                >
                  Import
                </Button>
              </span>
              <Button
                size="slim"
                variant="plain"
                submit={false}
                onClick={() => {
                  exportActiveSession();
                }}
              >
                Export
              </Button>
            </div>
          </div>
          {data.assistantLocalOnly ? (
            <Banner tone="info" title="Local-only assistant (INTERNAL_AI_LOCAL_ONLY)">
              <Text as="p">
                Cloud target and automatic failover to Modal are disabled. Use Local only, or unset INTERNAL_AI_LOCAL_ONLY to allow cloud again.
              </Text>
            </Banner>
          ) : null}
          {streamError ? (
            <Banner tone="critical" title="Streaming failed">
              <Text as="p">{streamError}</Text>
            </Banner>
          ) : null}
          {probeWarning ? (
            <Banner tone="warning" title="Live target warning">
              <Text as="p">{probeWarning}</Text>
            </Banner>
          ) : null}
          {importNotice ? (
            <Banner tone="success" title="Session import complete">
              <Text as="p">{importNotice}</Text>
            </Banner>
          ) : null}
          {data.loaderWarning ? (
            <Banner tone="critical" title="Assistant service unavailable">
              <Text as="p">{data.loaderWarning}</Text>
            </Banner>
          ) : null}
          {data.parseError ? (
            <button
              type="button"
              onClick={() => navigate('/internal/model-setup')}
              className="AiAssistant-routerConfigChip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                background: '#fff4e5',
                color: '#7a4d00',
                border: '1px solid #f1c27d',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
              title={data.parseError}
              data-testid="router-config-chip"
            >
              Router config load error — re-save in /internal/model-setup.
            </button>
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
                    if (sendDisabledReason === null) void sendMessage();
                  }
                }}
              />
              <div className="AiAssistant-composerMeta">
                <span>{modeLatencyHint}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {sendDisabledReason ? (
                    <Text as="span" tone="subdued" variant="bodySm">
                      {sendDisabledReason}
                    </Text>
                  ) : null}
                  {composerNotice ? (
                    <Text as="span" tone="subdued" variant="bodySm">
                      {composerNotice}
                    </Text>
                  ) : null}
                  <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="AiAssistant-send"
                      aria-disabled="true"
                      onClick={() => {
                        setComposerNotice('Attachments are not available yet.');
                      }}
                      title="Attachment support coming soon"
                    >
                      📎
                    </button>
                    <button
                      type="button"
                      className="AiAssistant-send"
                      onClick={() => { void sendMessage(); }}
                      disabled={sendDisabledReason !== null}
                      title={sendDisabledReason ?? 'Send (Enter)'}
                    >
                      ↵
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {showImportModal ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="assistant-import-title"
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.4)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 60,
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 'min(640px, 100%)',
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #d1d5db',
                  padding: 16,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <Text as="h2" variant="headingMd" id="assistant-import-title">
                  Import session JSON
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Paste JSON or load a local file, then import into this workspace.
                </Text>
                <label htmlFor="assistant-import-file">JSON file</label>
                <input
                  id="assistant-import-file"
                  type="file"
                  accept="application/json,.json,text/json"
                  onChange={async (event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setImportPayloadDraft(text);
                    setImportError(null);
                  }}
                />
                <label htmlFor="assistant-import-payload">Import payload</label>
                <textarea
                  id="assistant-import-payload"
                  ref={importPayloadRef}
                  value={importPayloadDraft}
                  onChange={(event) => setImportPayloadDraft(event.currentTarget.value)}
                  rows={12}
                />
                {importError ? (
                  <Text as="p" tone="critical" variant="bodySm">
                    {importError}
                  </Text>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportError(null);
                    }}
                    variant="plain"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={importSessionFetcher.state !== 'idle'}
                    onClick={() => {
                      submitImportPayload();
                    }}
                  >
                    Import
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

      </div>
        </div>
      </div>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let message = 'Something went wrong loading the AI Assistant.';
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error && error.message) {
    message = error.message;
  }
  return (
    <Page title="AI Assistant" subtitle="Operator console">
      <BlockStack gap="400">
        <Banner tone="critical" title="Unexpected error">
          <Text as="p">{message}</Text>
        </Banner>
        <Button url="/internal/ai-assistant">Reload AI Assistant</Button>
      </BlockStack>
    </Page>
  );
}
