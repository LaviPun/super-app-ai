/**
 * Blueprint planner — decides whether a classified request is a single module
 * (current behavior) or a multi-module blueprint, and if so, exactly which
 * modules + roles are required. Deterministic + DB-free (driven by
 * blueprint-catalog.ts), so it is predictable and unit-testable.
 */
import type { ModuleType } from '@superapp/core';
import type { CapabilitySurface } from '@superapp/core';
import { getBlueprintCatalogEntry, surfaceForModuleType } from '~/services/ai/blueprint-catalog';

export type PlannedModule = {
  role: string;
  moduleType: ModuleType;
  kindHint?: string;
  required: boolean;
  reason: string;
  surface: CapabilitySurface;
};

export type BlueprintPlan =
  | { kind: 'single'; primaryModuleType: ModuleType }
  | {
      kind: 'blueprint';
      intent: string;
      name: string;
      summary: string;
      primaryRole: string;
      modules: PlannedModule[];
    };

export type PlanInput = {
  moduleType: ModuleType;
  intent?: string | null;
};

/**
 * Plan the modules for a classified request. Returns a `blueprint` only when the
 * intent maps to a catalog entry with ≥2 modules; otherwise `single` (so every
 * uncatalogued request behaves exactly as today).
 */
export function planBlueprint(input: PlanInput): BlueprintPlan {
  const entry = getBlueprintCatalogEntry(input.intent);
  if (!entry || entry.modules.length < 2) {
    return { kind: 'single', primaryModuleType: input.moduleType };
  }

  const modules: PlannedModule[] = entry.modules.map((m) => ({
    ...m,
    surface: surfaceForModuleType(m.moduleType),
  }));

  return {
    kind: 'blueprint',
    intent: entry.intent,
    name: entry.name,
    summary: entry.summary,
    primaryRole: entry.primaryRole,
    modules,
  };
}

/** Convenience: how many modules a request will produce (1 for single). */
export function plannedModuleCount(plan: BlueprintPlan): number {
  return plan.kind === 'single' ? 1 : plan.modules.length;
}
