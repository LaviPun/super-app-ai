import { getPrisma } from '~/db.server';
import { persistJsonSafely } from '~/services/observability/redact.server';
import { encryptJson, decryptJson } from '~/services/security/crypto.server';
import { assertSafeTargetUrl } from '~/services/security/ssrf.server';

export type ConnectorAuth =
  | { type: 'API_KEY'; headerName: string; apiKey: string }
  | { type: 'BASIC'; username: string; password: string }
  | { type: 'OAUTH2'; bearerToken: string };

export function parseConnectorAuth(input: unknown): ConnectorAuth | null {
  if (!input || typeof input !== 'object') return null;
  const a = input as Record<string, unknown>;
  switch (a.type) {
    case 'API_KEY':
      return typeof a.headerName === 'string' && typeof a.apiKey === 'string'
        ? { type: 'API_KEY', headerName: a.headerName, apiKey: a.apiKey }
        : null;
    case 'BASIC':
      return typeof a.username === 'string' && typeof a.password === 'string'
        ? { type: 'BASIC', username: a.username, password: a.password }
        : null;
    case 'OAUTH2':
      return typeof a.bearerToken === 'string'
        ? { type: 'OAUTH2', bearerToken: a.bearerToken }
        : null;
    default:
      return null;
  }
}

export type CreateConnectorInput = {
  shopDomain: string;
  name: string;
  baseUrl: string;
  allowlistDomains: string[];
  auth: ConnectorAuth;
};

export type UpdateConnectorInput = {
  shopDomain: string;
  connectorId: string;
  name?: string;
  baseUrl?: string;
  allowlistDomains?: string[];
  auth?: ConnectorAuth;
};

export type TestRequest = {
  connectorId: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
};

export class ConnectorService {
  async create(input: CreateConnectorInput) {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain: input.shopDomain } });
    if (!shop) throw new Error('Shop not found');

    const url = normalizeBaseUrl(input.baseUrl);
    const allowlist = input.allowlistDomains.length ? input.allowlistDomains : [new URL(url).hostname];

    validateAllowlist(allowlist);

    return prisma.connector.create({
      data: {
        shopId: shop.id,
        name: input.name,
        baseUrl: url,
        authType: input.auth.type,
        secretsEnc: encryptJson(input.auth),
        allowlistDomains: allowlist.join(','),
      },
    });
  }

  async update(input: UpdateConnectorInput) {
    const prisma = getPrisma();
    const connector = await prisma.connector.findFirst({
      where: { id: input.connectorId, shop: { shopDomain: input.shopDomain } },
    });
    if (!connector) throw new Error('Connector not found');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.baseUrl !== undefined) {
      const url = normalizeBaseUrl(input.baseUrl);
      data.baseUrl = url;
      if (!input.allowlistDomains) data.allowlistDomains = new URL(url).hostname;
    }
    if (input.allowlistDomains !== undefined) {
      validateAllowlist(input.allowlistDomains);
      data.allowlistDomains = input.allowlistDomains.join(',');
    }
    if (input.auth !== undefined) {
      data.authType = input.auth.type;
      data.secretsEnc = encryptJson(input.auth);
    }

    return prisma.connector.update({ where: { id: connector.id }, data });
  }

  async test(shopDomain: string, req: TestRequest) {
    const prisma = getPrisma();
    const connector = await prisma.connector.findFirst({
      where: { id: req.connectorId, shop: { shopDomain } },
    });
    if (!connector) throw new Error('Connector not found');

    const auth = decryptJson<ConnectorAuth>(connector.secretsEnc);
    const allowlist = connector.allowlistDomains
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const rawUrl = joinUrl(connector.baseUrl, req.path);
    const url = await assertSafeTargetUrl(rawUrl, {
      allowedHostnames: allowlist,
      context: 'Connector request URL',
    });

    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    applyAuth(headers, auth);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url.toString(), {
        method: req.method ?? 'GET',
        headers,
        body: req.body ? JSON.stringify(req.body) : undefined,
        signal: controller.signal,
      });

      const text = await res.text();
      const bodyPreview = text.slice(0, 50_000);

      await prisma.connector.update({
        where: { id: connector.id },
        data: {
          lastTestedAt: new Date(),
          sampleResponseJson: safeJsonOrNull(text),
        },
      });

      return {
        ok: res.ok,
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        bodyPreview,
      };
    } finally {
      clearTimeout(t);
    }
  }
}

function normalizeBaseUrl(input: string) {
  const u = new URL(input);
  if (u.protocol !== 'https:') throw new Error('Connector baseUrl must be https');
  u.pathname = u.pathname.replace(/\/+$/, '');
  u.search = '';
  u.hash = '';
  return u.toString();
}

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function validateAllowlist(domains: string[]) {
  for (const d of domains) {
    if (!/^[a-z0-9.-]+$/i.test(d)) throw new Error('Invalid allowlist domain');
    if (d === 'localhost' || d.endsWith('.local')) throw new Error('Local domains are not allowed');
  }
}

function applyAuth(headers: Record<string, string>, auth: ConnectorAuth) {
  if (auth.type === 'API_KEY') headers[auth.headerName] = auth.apiKey;
  if (auth.type === 'BASIC') headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  if (auth.type === 'OAUTH2') headers.Authorization = `Bearer ${auth.bearerToken}`;
  if (!headers['content-type']) headers['content-type'] = 'application/json';
}

function safeJsonOrNull(text: string): string | null {
  try {
    return persistJsonSafely(JSON.parse(text));
  } catch {
    return null;
  }
}
