import { assertSafeTargetUrl } from '~/services/security/ssrf.server';

export type ConnectorRequestPolicyInput = {
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

export function validateConnectorAllowlist(domains: string[]): string[] {
  const normalized = domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) throw new Error('Connector allowlist must include at least one domain');

  for (const domain of normalized) {
    if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error('Invalid allowlist domain');
    if (domain === 'localhost' || domain.endsWith('.local')) throw new Error('Local domains are not allowed');
  }

  return normalized;
}

export async function resolveConnectorRequestUrl(input: ConnectorRequestPolicyInput): Promise<URL> {
  const allowlist = validateConnectorAllowlist(input.allowlistDomains);
  const base = input.baseUrl.replace(/\/+$/, '');
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;

  return assertSafeTargetUrl(`${base}${path}`, {
    allowedHostnames: allowlist,
    context: 'Connector request URL',
  });
}
