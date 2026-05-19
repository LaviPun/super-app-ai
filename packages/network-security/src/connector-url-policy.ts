import { assertSafeTargetUrl } from './ssrf.js';

export const CONNECTOR_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type ConnectorHttpMethod = (typeof CONNECTOR_HTTP_METHODS)[number];

export type ConnectorUrlPolicyInput = {
  baseUrl: string;
  path: string;
  allowlistDomains: string[];
};

export function normalizeConnectorBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:') throw new Error('Connector baseUrl must be https');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function joinConnectorUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function validateConnectorAllowlist(domains: string[]): string[] {
  const normalized = domains.map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) throw new Error('Connector allowlist must include at least one domain');
  for (const domain of normalized) {
    if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid allowlist domain');
    if (domain === 'localhost' || domain.endsWith('.local')) {
      throw new Error('Local domains are not allowed');
    }
  }
  return normalized;
}

export async function assertConnectorTargetUrl(input: ConnectorUrlPolicyInput): Promise<URL> {
  const allowlist = validateConnectorAllowlist(input.allowlistDomains);
  const rawUrl = joinConnectorUrl(normalizeConnectorBaseUrl(input.baseUrl), input.path);
  return assertSafeTargetUrl(rawUrl, {
    allowedHostnames: allowlist,
    context: 'Connector request URL',
  });
}
