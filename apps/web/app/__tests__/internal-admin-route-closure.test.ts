import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  mockDiscovery,
  mockAuthorizationCodeGrant,
  mockGetById,
  storeMocks,
  mockAiList,
} = vi.hoisted(() => ({
  prismaMock: {
    errorLog: { findUnique: vi.fn() },
    apiLog: { findUnique: vi.fn(), findMany: vi.fn() },
    shop: { findMany: vi.fn(), findUnique: vi.fn() },
    aiUsage: { findMany: vi.fn() },
  },
  mockDiscovery: vi.fn(),
  mockAuthorizationCodeGrant: vi.fn(),
  mockGetById: vi.fn(),
  storeMocks: {
    getSession: vi.fn(),
    findUserMessageByRequest: vi.fn(),
    createMessage: vi.fn(),
    findAssistantResponseForUser: vi.fn(),
    listMessages: vi.fn(),
    getEnabledMemoryContext: vi.fn(),
    updateMessage: vi.fn(),
    updateSession: vi.fn(),
    writeToolAudit: vi.fn(),
  },
  mockAiList: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

vi.mock('openid-client', () => ({
  discovery: (...args: unknown[]) => mockDiscovery(...args),
  authorizationCodeGrant: (...args: unknown[]) => mockAuthorizationCodeGrant(...args),
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    getById = mockGetById;
    log = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('~/services/ai/internal-assistant-store.server', () => ({
  InternalAssistantStoreService: class {
    getSession = storeMocks.getSession;
    findUserMessageByRequest = storeMocks.findUserMessageByRequest;
    createMessage = storeMocks.createMessage;
    findAssistantResponseForUser = storeMocks.findAssistantResponseForUser;
    listMessages = storeMocks.listMessages;
    getEnabledMemoryContext = storeMocks.getEnabledMemoryContext;
    updateMessage = storeMocks.updateMessage;
    updateSession = storeMocks.updateSession;
    writeToolAudit = storeMocks.writeToolAudit;
  },
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    list = mockAiList;
  },
}));

vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    get = vi.fn().mockResolvedValue({ templateSpecOverrides: null });
  },
}));

vi.mock('~/services/preview/preview.service', () => ({
  PreviewService: class {
    render = vi.fn().mockReturnValue({
      kind: 'HTML',
      html: '<!doctype html><html><head><title>Preview</title></head><body>ok</body></html>',
    });
  },
}));

import { internalSessionStorage } from '~/internal-admin/session.server';
import { loader as ssoCallbackLoader } from '../routes/internal.sso.callback';
import { loader as apiLogsStreamLoader } from '../routes/internal.api-logs.stream';
import { action as aiChatStreamAction } from '../routes/internal.ai-assistant.chat.stream';
import { loader as activityDetailLoader } from '../routes/internal.activity.$activityId';
import { loader as errorLogDetailLoader } from '../routes/internal.logs.$logId';
import { loader as apiLogDetailLoader } from '../routes/internal.api-logs.$logId';
import { loader as storeDetailLoader } from '../routes/internal.stores.$storeId';
import { loader as templateDetailLoader } from '../routes/internal.templates.$templateId';
import { loader as templatePreviewLoader } from '../routes/internal.templates.$templateId.preview';

const SESSION_SECRET = 'test-internal-admin-session-secret-32b';

async function adminRequest(url: string, init?: RequestInit): Promise<Request> {
  const session = await internalSessionStorage.getSession();
  session.set('internal_admin', true);
  const setCookie = await internalSessionStorage.commitSession(session);
  const cookiePair = setCookie.split(';')[0]?.trim() ?? '';
  return new Request(url, {
    ...init,
    headers: new Headers({
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      cookie: cookiePair,
    }),
  });
}

describe('internal admin route closure (scorecard certification harness)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_ADMIN_SESSION_SECRET = SESSION_SECRET;
    prismaMock.errorLog.findUnique.mockReset();
    prismaMock.apiLog.findUnique.mockReset();
    prismaMock.apiLog.findMany.mockReset();
    prismaMock.shop.findMany.mockReset();
    prismaMock.shop.findUnique.mockReset();
    prismaMock.aiUsage.findMany.mockReset();
    mockDiscovery.mockReset();
    mockAuthorizationCodeGrant.mockReset();
    mockGetById.mockReset();
    mockAiList.mockReset();
    Object.values(storeMocks).forEach((fn) => {
      if (typeof (fn as { mockReset?: () => void }).mockReset === 'function') {
        (fn as { mockReset: () => void }).mockReset();
      }
    });
  });

  it('internal.sso.callback: successful OIDC exchange redirects to /internal with session', async () => {
    process.env.INTERNAL_SSO_ISSUER = 'https://accounts.example.com';
    process.env.INTERNAL_SSO_CLIENT_ID = 'client';
    process.env.INTERNAL_SSO_CLIENT_SECRET = 'secret';
    process.env.INTERNAL_SSO_REDIRECT_URI = 'http://127.0.0.1:4000/internal/sso/callback';

    const session = await internalSessionStorage.getSession();
    session.set('oidc_state', 'state-abc');
    session.set('oidc_verifier', 'verifier-xyz');
    const cookieHeader = await internalSessionStorage.commitSession(session);
    const cookiePair = cookieHeader.split(';')[0]?.trim() ?? '';

    mockDiscovery.mockResolvedValue({});
    mockAuthorizationCodeGrant.mockResolvedValue({
      claims: () => ({ email: 'ops@example.com', name: 'Ops User' }),
    });

    const req = new Request('http://127.0.0.1/internal/sso/callback?code=c1&state=state-abc', {
      headers: { cookie: cookiePair },
    });

    const res = await ssoCallbackLoader({ request: req });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/internal');
    expect(mockAuthorizationCodeGrant).toHaveBeenCalled();
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('__superapp_internal');
  });

  it('internal.api-logs.stream: first SSE chunk is event ready', async () => {
    prismaMock.apiLog.findMany.mockResolvedValue([]);
    const req = await adminRequest('http://127.0.0.1/internal/api-logs/stream');
    const res = await apiLogsStreamLoader({ request: req });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: ready');
    reader.cancel();
  });

  it('internal.ai-assistant.chat.stream: resumed completed assistant emits ready and done SSE', async () => {
    storeMocks.getSession.mockResolvedValue({
      id: 'sess-1',
      mode: 'localMachine',
      memoryEnabled: false,
      title: 'New chat',
    });
    storeMocks.findUserMessageByRequest.mockResolvedValue(null);
    storeMocks.createMessage.mockResolvedValueOnce({
      id: 'um-1',
      content: 'hello',
      status: 'completed',
    });
    storeMocks.findAssistantResponseForUser.mockResolvedValue({
      id: 'as-done',
      status: 'completed',
      content: 'Already answered.',
      mode: 'localMachine',
      backend: 'ollama',
      model: 'qwen3:4b-instruct',
      latencyMs: 12,
      tokensIn: 3,
      tokensOut: 4,
      hadFallback: false,
    });

    const req = await adminRequest('http://127.0.0.1/internal/ai-assistant/chat/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-1', message: 'hello' }),
    });

    const res = await aiChatStreamAction({ request: req });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const chunks: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }
    reader.cancel();
    const joined = chunks.join('');
    expect(joined).toContain('event: ready');
    expect(joined).toContain('event: done');
  });

  it('internal.activity.$activityId: loader returns json for known id', async () => {
    mockGetById.mockResolvedValue({
      id: 'act-1',
      actor: 'INTERNAL_ADMIN',
      action: 'TEST',
      resource: 'x',
      shopId: null,
      details: null,
      shop: null,
      ip: null,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    const req = await adminRequest('http://127.0.0.1/internal/activity/act-1');
    const res = await activityDetailLoader({ request: req, params: { activityId: 'act-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('act-1');
  });

  it('internal.logs.$logId: loader returns json for error log', async () => {
    prismaMock.errorLog.findUnique.mockResolvedValue({
      id: 'err-1',
      level: 'ERROR',
      message: 'boom',
      stack: null,
      route: '/x',
      source: 'SERVER',
      shopId: null,
      shop: null,
      meta: null,
      requestId: null,
      correlationId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const req = await adminRequest('http://127.0.0.1/internal/logs/err-1');
    const res = await errorLogDetailLoader({ request: req, params: { logId: 'err-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('err-1');
  });

  it('internal.api-logs.$logId: loader returns json for api log', async () => {
    prismaMock.apiLog.findUnique.mockResolvedValue({
      id: 'api-1',
      shopId: null,
      shop: null,
      actor: 'INTERNAL',
      method: 'GET',
      path: '/healthz',
      status: 200,
      durationMs: 2,
      requestId: null,
      correlationId: null,
      success: true,
      meta: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      finishedAt: new Date('2026-01-02T00:00:00.010Z'),
    });
    const req = await adminRequest('http://127.0.0.1/internal/api-logs/api-1');
    const res = await apiLogDetailLoader({ request: req, params: { logId: 'api-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('api-1');
  });

  it('internal.stores.$storeId: loader returns json for shop', async () => {
    prismaMock.shop.findUnique.mockResolvedValue({
      id: 'shop-1',
      shopDomain: 'demo.myshopify.com',
      planTier: 'FREE',
      aiProviderOverrideId: null,
      retentionDaysDefault: 30,
      retentionDaysAi: 30,
      retentionDaysApi: 30,
      retentionDaysErrors: 30,
      modules: [],
      subscription: null,
      aiProviderOverride: null,
    });
    prismaMock.aiUsage.findMany.mockResolvedValue([]);
    mockAiList.mockResolvedValue([]);
    const req = await adminRequest('http://127.0.0.1/internal/stores/shop-1');
    const res = await storeDetailLoader({ request: req, params: { storeId: 'shop-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shop.id).toBe('shop-1');
  });

  it('internal.templates.$templateId: loader returns template payload', async () => {
    prismaMock.shop.findMany.mockResolvedValue([{ id: 'shop-1', shopDomain: 'demo.myshopify.com' }]);
    const req = await adminRequest('http://127.0.0.1/internal/templates/UAO-001');
    const res = await templateDetailLoader({ request: req, params: { templateId: 'UAO-001' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.template.id).toBe('UAO-001');
    expect(body.previewUrl).toContain('UAO-001');
  });

  it('internal.templates.$templateId.preview: loader returns HTML response', async () => {
    const req = await adminRequest('http://127.0.0.1/internal/templates/UAO-001/preview');
    const res = await templatePreviewLoader({ request: req, params: { templateId: 'UAO-001' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html.length).toBeGreaterThan(20);
  });
});
