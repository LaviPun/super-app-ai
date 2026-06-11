import {
  parsePlatformV2RolloutFlags,
  resolveRemixTrafficTarget,
  type PlatformV2RolloutFlags,
  type RemixTrafficTarget,
} from '@superapp/platform-contracts';

export type PlatformV2CutoverConfig = PlatformV2RolloutFlags & {
  nextFrontendBaseUrl: string | null;
};

export function getPlatformV2CutoverConfig(env: NodeJS.ProcessEnv = process.env): PlatformV2CutoverConfig {
  const flags = parsePlatformV2RolloutFlags(env);
  const nextFrontendBaseUrl = env.FRONTEND_NEXT_BASE_URL?.trim() || null;
  return { ...flags, nextFrontendBaseUrl };
}

export function resolvePlatformV2TrafficTarget(input: {
  pathname: string;
  config?: PlatformV2CutoverConfig;
  isEmbeddedMerchantSurface?: boolean;
}): RemixTrafficTarget {
  const config = input.config ?? getPlatformV2CutoverConfig();
  return resolveRemixTrafficTarget({
    pathname: input.pathname,
    flags: config,
    isEmbeddedMerchantSurface: input.isEmbeddedMerchantSurface,
  });
}

export function buildNextFrontendRedirectUrl(pathname: string, config?: PlatformV2CutoverConfig): string | null {
  const cutover = config ?? getPlatformV2CutoverConfig();
  if (!cutover.nextFrontendBaseUrl) return null;
  const base = cutover.nextFrontendBaseUrl.replace(/\/$/, '');
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
