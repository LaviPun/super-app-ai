import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';

export type AssertSafeTargetUrlOptions = {
  allowHttpLocalhost?: boolean;
  allowedHostnames?: string[];
  allowedHttpHostnames?: string[];
  context?: string;
};

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

const DEFAULT_LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const BLOCKED_METADATA_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'instance-data',
  'instance-data.ec2.internal',
  'metadata.azure.internal',
  'metadata.packet.net',
  'metadata.oraclecloud.com',
]);

function normalizeHostname(hostname: string): string {
  let value = hostname.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  return value;
}

function toOctets(address: string): number[] {
  return address.split('.').map((part) => Number(part));
}

function isIPv4MappedIPv6(address: string): boolean {
  return address.toLowerCase().startsWith('::ffff:');
}

function assertSafeIPv4(address: string): void {
  const octets = toOctets(address);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`);
  }
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;

  if (a === 0) throw new Error(`Blocked reserved IPv4 address: ${address}`);
  if (a === 10) throw new Error(`Blocked private IPv4 address: ${address}`);
  if (a === 127) throw new Error(`Blocked loopback IPv4 address: ${address}`);
  if (a === 169 && b === 254) throw new Error(`Blocked link-local IPv4 address: ${address}`);
  if (a === 172 && b >= 16 && b <= 31) throw new Error(`Blocked private IPv4 address: ${address}`);
  if (a === 192 && b === 168) throw new Error(`Blocked private IPv4 address: ${address}`);
  if (a === 100 && b >= 64 && b <= 127) throw new Error(`Blocked CGNAT IPv4 address: ${address}`);
  if (a >= 224) throw new Error(`Blocked reserved IPv4 address: ${address}`);

  if (a === 192 && b === 0 && octets[2] === 0) throw new Error(`Blocked reserved IPv4 address: ${address}`);
  if (a === 192 && b === 0 && octets[2] === 2) throw new Error(`Blocked reserved IPv4 address: ${address}`);
  if (a === 198 && (b === 18 || b === 19)) throw new Error(`Blocked reserved IPv4 address: ${address}`);
  if (a === 198 && b === 51 && octets[2] === 100) throw new Error(`Blocked reserved IPv4 address: ${address}`);
  if (a === 203 && b === 0 && octets[2] === 113) throw new Error(`Blocked reserved IPv4 address: ${address}`);
}

function assertSafeIPv6(address: string): void {
  const value = address.toLowerCase();
  if (isIPv4MappedIPv6(value)) {
    throw new Error(`Blocked IPv4-mapped IPv6 address: ${address}`);
  }
  if (value === '::') throw new Error(`Blocked reserved IPv6 address: ${address}`);
  if (value === '::1') throw new Error(`Blocked loopback IPv6 address: ${address}`);
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) {
    throw new Error(`Blocked link-local IPv6 address: ${address}`);
  }
  if (value.startsWith('fc') || value.startsWith('fd')) {
    throw new Error(`Blocked private IPv6 address: ${address}`);
  }
  if (value.startsWith('ff')) throw new Error(`Blocked reserved IPv6 address: ${address}`);
  if (value.startsWith('2001:db8:')) throw new Error(`Blocked reserved IPv6 address: ${address}`);
}

function assertSafeAddress(address: string, family: 4 | 6): void {
  if (family === 4) {
    assertSafeIPv4(address);
    return;
  }
  assertSafeIPv6(address);
}

async function resolveHostAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const hostIpFamily = isIP(hostname);
  if (hostIpFamily === 4 || hostIpFamily === 6) {
    return [{ address: hostname, family: hostIpFamily }];
  }
  const lookups = await dns.lookup(hostname, { all: true, verbatim: true });
  const resolved = lookups
    .map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }))
    .filter((entry) => entry.family === 4 || entry.family === 6);

  if (!resolved.length) throw new Error(`Unable to resolve target hostname: ${hostname}`);
  return resolved;
}

function assertAllowedHostname(hostname: string, options: AssertSafeTargetUrlOptions): void {
  if (!options.allowedHostnames?.length) return;
  const allow = new Set(options.allowedHostnames.map(normalizeHostname));
  if (!allow.has(hostname)) throw new Error(`Target hostname is not allowlisted: ${hostname}`);
}

function assertMetadataHostname(hostname: string): void {
  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    throw new Error(`Blocked cloud metadata hostname: ${hostname}`);
  }
}

function isExplicitlyAllowedLocalHttp(url: URL, hostname: string, options: AssertSafeTargetUrlOptions): boolean {
  if (url.protocol !== 'http:') return false;
  if (!options.allowHttpLocalhost) {
    throw new Error(`${options.context ?? 'Target URL'} must use https`);
  }
  const allowedHttp = new Set(DEFAULT_LOCAL_HTTP_HOSTS);
  for (const host of options.allowedHttpHostnames ?? []) {
    allowedHttp.add(normalizeHostname(host));
  }
  if (!allowedHttp.has(hostname)) {
    throw new Error(`${options.context ?? 'Target URL'} http is only allowed for localhost hosts`);
  }
  return true;
}

export async function assertSafeTargetUrl(
  rawUrl: string,
  options: AssertSafeTargetUrlOptions = {},
): Promise<URL> {
  const url = new URL(rawUrl);
  const hostname = normalizeHostname(url.hostname);

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${options.context ?? 'Target URL'} must use https or explicitly allowed localhost http`);
  }
  if (isExplicitlyAllowedLocalHttp(url, hostname, options)) {
    return url;
  }

  assertAllowedHostname(hostname, options);
  assertMetadataHostname(hostname);

  const resolved = await resolveHostAddresses(hostname);
  for (const entry of resolved) {
    assertSafeAddress(entry.address, entry.family);
  }

  return url;
}
