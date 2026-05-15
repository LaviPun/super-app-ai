import type { Capability, ModuleType, PlanTier } from '@superapp/core';
import { isCapabilityAllowed } from '@superapp/core';
import { evaluateSurfaceCapabilityAllowlist } from '~/services/publish/capability-allowlist.server';
import { compilePolicySnapshot } from '~/services/publish/policy-snapshot.server';

type DeployKind = 'THEME' | 'PLATFORM';

type PublishPolicyInput = {
  shopDomain: string;
  versionId: string;
  planTier: PlanTier;
  requires: Capability[];
  specType: string;
  targetKind: DeployKind;
};

export type PublishPolicyResult = {
  allowed: boolean;
  blocked: Capability[];
  reasons: string[];
  snapshotKey: string;
  evaluatedAt: number;
};

export class PublishPolicyService {
  evaluate(input: PublishPolicyInput): PublishPolicyResult {
    const allowlist = evaluateSurfaceCapabilityAllowlist({
      moduleType: input.specType as ModuleType,
      targetKind: input.targetKind,
      declaredCapabilities: input.requires,
    });

    const snapshot = compilePolicySnapshot(
      {
        shopDomain: input.shopDomain,
        surface: allowlist.surface,
        revision: input.versionId,
        targetKind: input.targetKind,
        planTier: input.planTier,
      },
      () => {
        const blocked = input.requires.filter((cap) => !isCapabilityAllowed(input.planTier, cap));
        const reasons: string[] = [];

        if (blocked.length > 0) {
          reasons.push('One or more required capabilities are blocked by the current plan tier.');
        }
        reasons.push(...allowlist.reasons);

        return {
          allowed: blocked.length === 0 && reasons.length === 0,
          blocked,
          reasons,
        };
      }
    );

    return {
      ...snapshot.value,
      snapshotKey: snapshot.key,
      evaluatedAt: snapshot.compiledAt,
    };
  }
}

