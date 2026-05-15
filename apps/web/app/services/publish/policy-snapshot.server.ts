import type { PlanTier } from '@superapp/core';

export type PolicySnapshotInput = {
  shopDomain: string;
  surface: string;
  revision: string;
  targetKind: 'THEME' | 'PLATFORM';
  planTier: PlanTier;
};

export type PolicySnapshot<T> = {
  key: string;
  compiledAt: number;
  input: PolicySnapshotInput;
  value: T;
};

const SNAPSHOT_TTL_MS = 60_000;
const snapshots = new Map<string, PolicySnapshot<unknown>>();

function buildKey(input: PolicySnapshotInput): string {
  return [input.shopDomain, input.surface, input.revision, input.targetKind, input.planTier].join('|');
}

export function compilePolicySnapshot<T>(
  input: PolicySnapshotInput,
  compile: () => T
): PolicySnapshot<T> {
  const key = buildKey(input);
  const now = Date.now();
  const cached = snapshots.get(key) as PolicySnapshot<T> | undefined;
  if (cached && now - cached.compiledAt <= SNAPSHOT_TTL_MS) return cached;

  const snapshot: PolicySnapshot<T> = {
    key,
    compiledAt: now,
    input,
    value: compile(),
  };
  snapshots.set(key, snapshot);
  return snapshot;
}

export function invalidatePolicySnapshots(input: {
  shopDomain: string;
  surface?: string;
  revision?: string;
}): number {
  let removed = 0;
  for (const [key, snapshot] of snapshots.entries()) {
    if (snapshot.input.shopDomain !== input.shopDomain) continue;
    if (input.surface && snapshot.input.surface !== input.surface) continue;
    if (input.revision && snapshot.input.revision !== input.revision) continue;
    snapshots.delete(key);
    removed += 1;
  }
  return removed;
}

