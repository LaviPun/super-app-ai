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
  /**
   * Optional dual-target fallback. Only set when `dualTargetEnabled` is true,
   * a non-active fallback target is configured, and that target has a URL.
   */
  fallback?: {
    target: RouterRuntimeTarget;
    url: string;
    token: string | null;
    timeoutMs: number;
  };
};

/**
 * Result of {@link getRouterRuntimeConfig}. `config` is always usable: when
 * ciphertext exists but fails decryption or schema validation, `config` is
 * the default config and `parseError` contains a short human-readable reason.
 * Worker 2 reads `parseError` to render an operator-visible banner.
 */
export type GetRouterRuntimeConfigResult = {
  config: RouterRuntimeConfig;
  parseError?: string;
};

const PRISMA_MISSING_ROUTER_CONFIG_FIELD = 'Unknown argument `routerRuntimeConfigEnc`';

function isMissingRouterConfigFieldError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PRISMA_MISSING_ROUTER_CONFIG_FIELD);
}

function envTruthy(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function logDebug(message: string, payload?: Record<string, unknown>): void {
  if (!envTruthy('INTERNAL_AI_ROUTER_DEBUG_LOG')) return;
  // eslint-disable-next-line no-console
  console.log(message, payload ? JSON.stringify(payload) : '');
}

type ParseResult = {
  config: RouterRuntimeConfig;
  /** Present when ciphertext existed but could not be decoded or parsed. */
  parseError?: string;
};

function parseConfigWithError(ciphertext: string | null): ParseResult {
  if (!ciphertext) return { config: { ...DEFAULT_ROUTER_RUNTIME_CONFIG } };
  try {
    const decoded = decryptJson<unknown>(ciphertext);
    const parsed = RouterRuntimeConfigSchema.parse(decoded);
    return {
      config: {
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
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown parse error';
    return { config: { ...DEFAULT_ROUTER_RUNTIME_CONFIG }, parseError: reason };
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

/**
 * Load the router runtime config. Always resolves; never throws on decryption
 * or schema-parse failures. Callers should destructure both fields:
 *
 * ```ts
 * const { config, parseError } = await getRouterRuntimeConfig();
 * if (parseError) { /* render operator banner *\/ }
 * ```
 */
export async function getRouterRuntimeConfig(): Promise<GetRouterRuntimeConfigResult> {
  const ciphertext = await readRuntimeConfigCiphertext();
  return parseConfigWithError(ciphertext);
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

function buildFallback(
  cfg: RouterRuntimeConfig,
  activeTarget: RouterRuntimeTarget,
): ResolvedRouterTarget['fallback'] {
  const fallbackTarget =
    cfg.fallbackTarget && cfg.fallbackTarget !== activeTarget
      ? cfg.fallbackTarget
      : activeTarget === 'localMachine'
        ? 'modalRemote'
        : 'localMachine';
  if (fallbackTarget === activeTarget) return undefined;
  const fallbackCfg = cfg.targets[fallbackTarget];
  const url = fallbackCfg.url?.trim();
  if (!url) return undefined;
  return {
    target: fallbackTarget,
    url,
    token: fallbackCfg.token?.trim() || null,
    timeoutMs: fallbackCfg.timeoutMs,
  };
}

export async function resolveRouterTargetConfig(): Promise<ResolvedRouterTarget> {
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
    const cfg: RouterRuntimeConfig = { ...DEFAULT_ROUTER_RUNTIME_CONFIG };
    cfg.dualTargetEnabled = cfg.dualTargetEnabled || envDualTargetEnabled;
    if (envDualTargetEnabled) {
      logDebug('[router-config] dual-target enabled via env');
    }
    if (!cfg.dualTargetEnabled) {
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
        releaseGateSchemaFailRateMax: cfg.releaseGateSchemaFailRateMax,
        releaseGateFallbackRateMax: cfg.releaseGateFallbackRateMax,
      };
    }
    const modalEnvUrl = process.env.MODAL_ROUTER_URL?.trim() || null;
    const modalEnvToken = process.env.MODAL_ROUTER_TOKEN?.trim() || null;
    const modalEnvTimeoutMs = Number(process.env.MODAL_ROUTER_TIMEOUT_MS?.trim() || `${envTimeoutMs}`);
    const fallback: ResolvedRouterTarget['fallback'] = modalEnvUrl
      ? {
          target: 'modalRemote',
          url: modalEnvUrl,
          token: modalEnvToken,
          timeoutMs: modalEnvTimeoutMs,
        }
      : undefined;
    return {
      target: 'localMachine',
      dualTargetEnabled: true,
      url: envUrl,
      token: envToken,
      timeoutMs: envTimeoutMs,
      shadowMode: shadowFromEnv,
      canaryShops: envCanary,
      circuitFailureThreshold: envCircuitFailureThreshold,
      circuitCooldownMs: envCircuitCooldownMs,
      releaseGateSchemaFailRateMax: cfg.releaseGateSchemaFailRateMax,
      releaseGateFallbackRateMax: cfg.releaseGateFallbackRateMax,
      fallback,
    };
  }

  const ciphertext = await readRuntimeConfigCiphertext();
  const { config: cfg } = parseConfigWithError(ciphertext);
  const hasStoredConfig = Boolean(ciphertext);
  if (!hasStoredConfig) {
    // Legacy env-only deployments: honor INTERNAL_AI_ROUTER_DUAL_TARGET_ENABLED.
    if (envDualTargetEnabled && !cfg.dualTargetEnabled) {
      cfg.dualTargetEnabled = true;
      logDebug('[router-config] dual-target enabled via env');
    }
  }
  if (!cfg.dualTargetEnabled) {
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
      releaseGateSchemaFailRateMax: cfg.releaseGateSchemaFailRateMax,
      releaseGateFallbackRateMax: cfg.releaseGateFallbackRateMax,
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
    fallback: buildFallback(cfg, cfg.activeTarget),
  };
}

export function maskToken(token?: string | null): string {
  if (!token) return '';
  if (token.length <= 4) return '••••';
  return `••••••••${token.slice(-4)}`;
}
