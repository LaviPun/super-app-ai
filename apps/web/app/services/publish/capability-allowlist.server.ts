import {
  getCapabilityNode,
  isTargetAllowedForType,
  type Capability,
  type ModuleType,
} from '@superapp/core';

export type SurfaceCapabilityAllowlistResult = {
  allowed: boolean;
  surface: string;
  requiredCapabilities: Capability[];
  reasons: string[];
};

export function evaluateSurfaceCapabilityAllowlist(input: {
  moduleType: ModuleType;
  targetKind: 'THEME' | 'PLATFORM';
  declaredCapabilities: Capability[];
}): SurfaceCapabilityAllowlistResult {
  const node = getCapabilityNode(input.moduleType);
  const reasons: string[] = [];

  if (!isTargetAllowedForType(input.moduleType, input.targetKind)) {
    reasons.push(
      `Module type ${input.moduleType} is not allowed on ${input.targetKind} target.`
    );
  }

  const missingRequired = node.requiredCapabilities.filter(
    (capability) => !input.declaredCapabilities.includes(capability)
  );
  if (missingRequired.length > 0) {
    reasons.push(
      `Module is missing required capabilities: ${missingRequired.join(', ')}.`
    );
  }

  return {
    allowed: reasons.length === 0,
    surface: node.surface,
    requiredCapabilities: node.requiredCapabilities,
    reasons,
  };
}

