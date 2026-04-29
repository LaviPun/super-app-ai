import type { Capability, PlanTier } from '@superapp/core';
import { isCapabilityAllowed } from '@superapp/core';

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

const SNAPSHOT_TTL_MS = 60_000;
const policySnapshotCache = new Map<string, PublishPolicyResult>();

function buildSnapshotKey(input: PublishPolicyInput): string {
  return [
    input.shopDomain,
    input.versionId,
    input.planTier,
    input.specType,
    input.targetKind,
    input.requires.slice().sort().join(','),
  ].join('|');
}

export class PublishPolicyService {
  evaluate(input: PublishPolicyInput): PublishPolicyResult {
    const snapshotKey = buildSnapshotKey(input);
    const now = Date.now();
    const cached = policySnapshotCache.get(snapshotKey);
    if (cached && now - cached.evaluatedAt <= SNAPSHOT_TTL_MS) {
      return cached;
    }

    const blocked = input.requires.filter((cap) => !isCapabilityAllowed(input.planTier, cap));
    const reasons: string[] = [];

    if (blocked.length > 0) {
      reasons.push('One or more required capabilities are blocked by the current plan tier.');
    }

    // Surface capability allowlist boundary. Keep this explicit and centralized.
    const expectsThemeTarget = input.specType.startsWith('theme.');
    if (expectsThemeTarget && input.targetKind !== 'THEME') {
      reasons.push('Theme modules must publish to THEME target.');
    }
    if (!expectsThemeTarget && input.targetKind === 'THEME') {
      reasons.push('Non-theme modules cannot publish to THEME target.');
    }

    const result: PublishPolicyResult = {
      allowed: blocked.length === 0 && reasons.length === 0,
      blocked,
      reasons,
      snapshotKey,
      evaluatedAt: now,
    };
    policySnapshotCache.set(snapshotKey, result);
    return result;
  }
}

