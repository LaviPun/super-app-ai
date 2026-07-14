import type { Capability } from './capabilities.js';
import type { DeployTargetKind, ModuleType } from './allowed-values.js';
import { MODULE_TYPE_DEFAULT_REQUIRES, RECIPE_SPEC_TYPES } from './allowed-values.js';

export type CapabilitySurface =
  | 'THEME'
  | 'ADMIN'
  | 'CHECKOUT'
  | 'FUNCTIONS'
  | 'CUSTOMER_ACCOUNT'
  | 'POS'
  | 'INTEGRATION'
  | 'FLOW'
  // Agentic-commerce channel (M13): an app-served product-data feed for AI agents.
  | 'AGENTIC';

export type CapabilityNode = {
  moduleType: ModuleType;
  surface: CapabilitySurface;
  allowedTargetKinds: DeployTargetKind[];
  requiredCapabilities: Capability[];
};

function inferSurface(moduleType: ModuleType): CapabilitySurface {
  if (moduleType.startsWith('theme.') || moduleType === 'proxy.widget') return 'THEME';
  if (moduleType.startsWith('admin.') || moduleType === 'platform.extensionBlueprint') return 'ADMIN';
  if (moduleType.startsWith('checkout.') || moduleType.startsWith('postPurchase.')) return 'CHECKOUT';
  if (moduleType.startsWith('functions.')) return 'FUNCTIONS';
  if (moduleType === 'customerAccount.blocks') return 'CUSTOMER_ACCOUNT';
  if (moduleType === 'pos.extension') return 'POS';
  if (moduleType.startsWith('agentic.')) return 'AGENTIC';
  if (
    moduleType === 'integration.httpSync' ||
    moduleType === 'analytics.pixel' ||
    moduleType === 'messaging.campaign'
  )
    return 'INTEGRATION';
  return 'FLOW';
}

/**
 * A `THEME` DeployTarget means "write into a *specific merchant theme*" (themeId +
 * moduleId, via the theme app extension). Only `theme.section` deploys that way.
 *
 * Everything else — including `proxy.widget`, which shares the THEME storefront
 * *surface* but actually deploys via the App Proxy (no theme touched) — deploys
 * through `PLATFORM` extensions. So the allowed target kind cannot be derived from
 * `CapabilitySurface` alone (THEME surface ⊋ THEME target): `theme.section` and
 * `proxy.widget` are both surface THEME yet split across targets.
 *
 * This is the single source of truth for type↔DeployTarget compatibility, consumed
 * by the compiler guard (`compileRecipe`), the publish-policy allowlist, and the
 * eval forbidden-surface gate. It is keyed off the `theme.` type prefix — the exact
 * convention every real caller already uses to pick a target (`api.publish.tsx`,
 * `publish-worker`, `modules.$moduleId`, `tournament/verify`, `evals.server`) — so
 * it stays honest without a hand-authored 29-row table that could drift.
 */
function inferAllowedTargets(moduleType: ModuleType): DeployTargetKind[] {
  return moduleType.startsWith('theme.') ? ['THEME'] : ['PLATFORM'];
}

const capabilityGraph: Record<ModuleType, CapabilityNode> = RECIPE_SPEC_TYPES.reduce(
  (acc, moduleType) => {
    const surface = inferSurface(moduleType);
    acc[moduleType] = {
      moduleType,
      surface,
      allowedTargetKinds: inferAllowedTargets(moduleType),
      requiredCapabilities: [...(MODULE_TYPE_DEFAULT_REQUIRES[moduleType] as Capability[])],
    };
    return acc;
  },
  {} as Record<ModuleType, CapabilityNode>
);

export function getCapabilityNode(moduleType: ModuleType): CapabilityNode {
  return capabilityGraph[moduleType];
}

export function isTargetAllowedForType(moduleType: ModuleType, targetKind: DeployTargetKind): boolean {
  return getCapabilityNode(moduleType).allowedTargetKinds.includes(targetKind);
}

export function listCapabilitiesBySurface(surface: CapabilitySurface): Capability[] {
  const capabilities = new Set<Capability>();
  for (const moduleType of RECIPE_SPEC_TYPES) {
    const node = getCapabilityNode(moduleType);
    if (node.surface !== surface) continue;
    for (const capability of node.requiredCapabilities) capabilities.add(capability);
  }
  return [...capabilities];
}

