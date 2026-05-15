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
  | 'FLOW';

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
  if (moduleType === 'integration.httpSync' || moduleType === 'analytics.pixel') return 'INTEGRATION';
  return 'FLOW';
}

function inferAllowedTargets(surface: CapabilitySurface): DeployTargetKind[] {
  return surface === 'THEME' ? ['THEME'] : ['PLATFORM'];
}

const capabilityGraph: Record<ModuleType, CapabilityNode> = RECIPE_SPEC_TYPES.reduce(
  (acc, moduleType) => {
    const surface = inferSurface(moduleType);
    acc[moduleType] = {
      moduleType,
      surface,
      allowedTargetKinds: inferAllowedTargets(surface),
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

