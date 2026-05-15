import type { CapabilitySurface } from '@superapp/core';

export type FeatureFlagTopology = {
  globalKillSwitch: boolean;
  globalSurfaceToggles?: Partial<Record<CapabilitySurface, boolean>>;
  shopOverrides?: Record<
    string,
    {
      killSwitch?: boolean;
      surfaceToggles?: Partial<Record<CapabilitySurface, boolean>>;
    }
  >;
};

export type FeatureFlagDecision = {
  enabled: boolean;
  reason: string;
  source: 'global_kill_switch' | 'shop_override' | 'surface_toggle' | 'default';
};

export function evaluateFeatureFlag(input: {
  topology: FeatureFlagTopology;
  shopDomain: string;
  surface: CapabilitySurface;
}): FeatureFlagDecision {
  const { topology, shopDomain, surface } = input;
  const shopOverride = topology.shopOverrides?.[shopDomain];

  if (topology.globalKillSwitch) {
    return {
      enabled: false,
      reason: 'Global kill switch is enabled.',
      source: 'global_kill_switch',
    };
  }

  if (typeof shopOverride?.killSwitch === 'boolean') {
    return {
      enabled: !shopOverride.killSwitch,
      reason: shopOverride.killSwitch
        ? `Shop override disabled ${surface} surface.`
        : `Shop override explicitly enabled ${surface} surface.`,
      source: 'shop_override',
    };
  }

  if (typeof shopOverride?.surfaceToggles?.[surface] === 'boolean') {
    const enabled = Boolean(shopOverride.surfaceToggles[surface]);
    return {
      enabled,
      reason: enabled
        ? `Shop surface toggle enabled ${surface}.`
        : `Shop surface toggle disabled ${surface}.`,
      source: 'surface_toggle',
    };
  }

  if (typeof topology.globalSurfaceToggles?.[surface] === 'boolean') {
    const enabled = Boolean(topology.globalSurfaceToggles[surface]);
    return {
      enabled,
      reason: enabled
        ? `Global surface toggle enabled ${surface}.`
        : `Global surface toggle disabled ${surface}.`,
      source: 'surface_toggle',
    };
  }

  return {
    enabled: true,
    reason: 'No override found; default enabled.',
    source: 'default',
  };
}

