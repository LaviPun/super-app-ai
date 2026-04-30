import { getPrisma } from '~/db.server';
import { decryptJson, encryptJson } from '~/services/security/crypto.server';
import {
  DEFAULT_ROUTER_RUNTIME_CONFIG,
  RouterRuntimeConfigSchema,
  type RouterRuntimeConfig,
  type RouterRuntimeTarget,
} from '~/schemas/router-runtime-config.server';

export type ResolvedRouterTarget = {
  target: RouterRuntimeTarget;
  url: string | null;
  token: string | null;
  shadowMode: boolean;
  canaryShops: string[];
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
};

function parseConfig(ciphertext: string | null): RouterRuntimeConfig {
  if (!ciphertext) return { ...DEFAULT_ROUTER_RUNTIME_CONFIG };
  try {
    const decoded = decryptJson<unknown>(ciphertext);
    return RouterRuntimeConfigSchema.parse(decoded);
  } catch {
    return { ...DEFAULT_ROUTER_RUNTIME_CONFIG };
  }
}

async function readRuntimeConfigCiphertext(): Promise<string | null> {
  try {
    const prisma = getPrisma();
    const row = await prisma.appSettings.findUnique({
      where: { id: 'singleton' },
      select: { routerRuntimeConfigEnc: true },
    });
    return row?.routerRuntimeConfigEnc ?? null;
  } catch {
    return null;
  }
}

export async function getRouterRuntimeConfig(): Promise<RouterRuntimeConfig> {
  const ciphertext = await readRuntimeConfigCiphertext();
  return parseConfig(ciphertext);
}

export async function saveRouterRuntimeConfig(config: RouterRuntimeConfig): Promise<RouterRuntimeConfig> {
  const prisma = getPrisma();
  const normalized = RouterRuntimeConfigSchema.parse(config);
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', routerRuntimeConfigEnc: encryptJson(normalized) },
    update: { routerRuntimeConfigEnc: encryptJson(normalized) },
  });
  return normalized;
}

export async function resolveRouterTargetConfig(): Promise<ResolvedRouterTarget> {
  // Preserve env compatibility as fallback for existing deployments.
  const envUrl = process.env.INTERNAL_AI_ROUTER_URL?.trim() || null;
  const envToken = process.env.INTERNAL_AI_ROUTER_TOKEN?.trim() || null;
  const envShadow = (process.env.INTERNAL_AI_ROUTER_SHADOW?.trim() || '').toLowerCase();
  const envCanary = (process.env.INTERNAL_AI_ROUTER_CANARY_SHOPS?.trim() || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const envCircuitFailureThreshold = Number(
    process.env.INTERNAL_AI_ROUTER_CIRCUIT_FAILURE_THRESHOLD?.trim() || '5',
  );
  const envCircuitCooldownMs = Number(
    process.env.INTERNAL_AI_ROUTER_CIRCUIT_COOLDOWN_MS?.trim() || '30000',
  );

  const shadowFromEnv = envShadow === '1' || envShadow === 'true' || envShadow === 'yes';
  if (process.env.NODE_ENV === 'test') {
    return {
      target: 'localMachine',
      url: envUrl,
      token: envToken,
      shadowMode: shadowFromEnv,
      canaryShops: envCanary,
      circuitFailureThreshold: envCircuitFailureThreshold,
      circuitCooldownMs: envCircuitCooldownMs,
    };
  }

  const ciphertext = await readRuntimeConfigCiphertext();
  const cfg = parseConfig(ciphertext);
  const hasStoredConfig = Boolean(ciphertext);
  if (!hasStoredConfig) {
    return {
      target: 'localMachine',
      url: envUrl,
      token: envToken,
      shadowMode: shadowFromEnv,
      canaryShops: envCanary,
      circuitFailureThreshold: envCircuitFailureThreshold,
      circuitCooldownMs: envCircuitCooldownMs,
    };
  }

  const active = cfg.targets[cfg.activeTarget];

  return {
    target: cfg.activeTarget,
    url: active.url?.trim() || envUrl,
    token: active.token?.trim() || envToken,
    shadowMode: hasStoredConfig ? cfg.shadowMode : shadowFromEnv,
    canaryShops: hasStoredConfig ? cfg.canaryShops : envCanary,
    circuitFailureThreshold: hasStoredConfig
      ? cfg.circuitFailureThreshold
      : envCircuitFailureThreshold,
    circuitCooldownMs: hasStoredConfig ? cfg.circuitCooldownMs : envCircuitCooldownMs,
  };
}

export function maskToken(token?: string | null): string {
  if (!token) return '';
  if (token.length <= 4) return '••••';
  return `••••••••${token.slice(-4)}`;
}
