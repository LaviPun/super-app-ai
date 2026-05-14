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
  dualTargetEnabled: boolean;
  url: string | null;
  token: string | null;
  timeoutMs: number;
  shadowMode: boolean;
  canaryShops: string[];
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  releaseGateSchemaFailRateMax: number;
  releaseGateFallbackRateMax: number;
};

const PRISMA_MISSING_ROUTER_CONFIG_FIELD = 'Unknown argument `routerRuntimeConfigEnc`';

function isMissingRouterConfigFieldError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PRISMA_MISSING_ROUTER_CONFIG_FIELD);
}

function parseConfig(ciphertext: string | null): RouterRuntimeConfig {
  if (!ciphertext) return { ...DEFAULT_ROUTER_RUNTIME_CONFIG };
  try {
    const decoded = decryptJson<unknown>(ciphertext);
    const parsed = RouterRuntimeConfigSchema.parse(decoded);
    return {
      ...parsed,
      targets: {
        localMachine: {
          ...parsed.targets.localMachine,
          model: parsed.targets.localMachine.model?.trim() || 'qwen3:4b-instruct',
        },
        modalRemote: {
          ...parsed.targets.modalRemote,
          model: parsed.targets.modalRemote.model?.trim() || 'Qwen/Qwen3-4B-Instruct',
        },
      },
    };
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
  try {
    await prisma.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', routerRuntimeConfigEnc: encryptJson(normalized) },
      update: { routerRuntimeConfigEnc: encryptJson(normalized) },
    });
  } catch (error) {
    if (isMissingRouterConfigFieldError(error)) {
      throw new Error(
        'Router config storage is unavailable because Prisma Client is out of date. Run `pnpm exec prisma generate` in `apps/web` and restart the dev server.',
      );
    }
    throw error;
  }
  return normalized;
}

export async function resolveRouterTargetConfig(): Promise<ResolvedRouterTarget> {
  // Preserve env compatibility as fallback for existing deployments.
  const envUrl = process.env.INTERNAL_AI_ROUTER_URL?.trim() || null;
  const envToken = process.env.INTERNAL_AI_ROUTER_TOKEN?.trim() || null;
  const envTimeoutMs = Number(process.env.INTERNAL_AI_ROUTER_TIMEOUT_MS?.trim() || '3000');
  const envDualTargetEnabled = ['1', 'true', 'yes'].includes(
    (process.env.INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED?.trim() || '').toLowerCase(),
  );
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
      dualTargetEnabled: false,
      url: envUrl,
      token: envToken,
      timeoutMs: envTimeoutMs,
      shadowMode: shadowFromEnv,
      canaryShops: envCanary,
      circuitFailureThreshold: envCircuitFailureThreshold,
      circuitCooldownMs: envCircuitCooldownMs,
      releaseGateSchemaFailRateMax: 0.02,
      releaseGateFallbackRateMax: 0.05,
    };
  }

  const ciphertext = await readRuntimeConfigCiphertext();
  const cfg = parseConfig(ciphertext);
  const hasStoredConfig = Boolean(ciphertext);
  if (!hasStoredConfig || !cfg.dualTargetEnabled) {
    return {
      target: 'localMachine',
      dualTargetEnabled: false,
      url: envUrl,
      token: envToken,
      timeoutMs: envTimeoutMs,
      shadowMode: shadowFromEnv,
      canaryShops: envCanary,
      circuitFailureThreshold: envCircuitFailureThreshold,
      circuitCooldownMs: envCircuitCooldownMs,
      releaseGateSchemaFailRateMax: 0.02,
      releaseGateFallbackRateMax: 0.05,
    };
  }

  const active = cfg.targets[cfg.activeTarget];
  const targetPrefix = cfg.activeTarget === 'localMachine' ? 'LOCAL_ROUTER' : 'MODAL_ROUTER';
  const targetEnvUrl = process.env[`${targetPrefix}_URL`]?.trim() || null;
  const targetEnvToken = process.env[`${targetPrefix}_TOKEN`]?.trim() || null;
  const targetEnvTimeoutMs = Number(process.env[`${targetPrefix}_TIMEOUT_MS`]?.trim() || `${active.timeoutMs}`);

  return {
    target: cfg.activeTarget,
    dualTargetEnabled: true,
    url: active.url?.trim() || targetEnvUrl || envUrl,
    token: active.token?.trim() || targetEnvToken || envToken,
    timeoutMs: targetEnvTimeoutMs,
    shadowMode: cfg.shadowMode,
    canaryShops: cfg.canaryShops,
    circuitFailureThreshold: hasStoredConfig
      ? cfg.circuitFailureThreshold
      : envCircuitFailureThreshold,
    circuitCooldownMs: hasStoredConfig ? cfg.circuitCooldownMs : envCircuitCooldownMs,
    releaseGateSchemaFailRateMax: cfg.releaseGateSchemaFailRateMax,
    releaseGateFallbackRateMax: cfg.releaseGateFallbackRateMax,
  };
}

export function maskToken(token?: string | null): string {
  if (!token) return '';
  if (token.length <= 4) return '••••';
  return `••••••••${token.slice(-4)}`;
}
