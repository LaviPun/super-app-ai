import { describe, it, expect } from 'vitest';
import {
  RECIPE_SPEC_TYPES,
  getCapabilityNode,
  type DeployTarget,
  type DeployTargetKind,
  type ModuleType,
  type RecipeSpec,
} from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { IncompatibleCompileTargetError } from '~/services/recipes/compiler/types';

/**
 * Type↔target compatibility guard (035 honesty fix).
 *
 * `compileRecipe(spec, target)` MUST reject a spec compiled against a DeployTarget
 * its surface can never deploy to — a `functions.*` / `flow.*` recipe against a
 * THEME target, or a `theme.section` against PLATFORM, previously compiled silently
 * (the gap the eval `forbiddenSurfaceRejected` gate surfaced). The compatibility
 * table is the capability graph's `allowedTargetKinds` (single source of truth), so
 * this test iterates every RecipeSpec type against BOTH its correct and its
 * incompatible target.
 */

function targetOfKind(kind: DeployTargetKind): DeployTarget {
  return kind === 'THEME'
    ? { kind: 'THEME', themeId: 'guard-theme-id', moduleId: 'guard-module-id' }
    : { kind: 'PLATFORM', moduleId: 'guard-module-id' };
}

/** Minimal probe spec, mirroring module-deployability-audit.test.ts. */
function probeSpec(type: ModuleType): RecipeSpec {
  return { type, name: 'Probe', config: {} } as unknown as RecipeSpec;
}

describe('compileRecipe — type↔target compatibility guard', () => {
  for (const type of RECIPE_SPEC_TYPES) {
    const allowed = getCapabilityNode(type).allowedTargetKinds;

    it(`${type}: allows its compatible target (${allowed.join(', ')})`, () => {
      // The guard must NOT fire for a compatible target. The minimal probe config may
      // still trip a downstream config-validation throw (as the deployability audit
      // documents) — that is fine; we assert only that it is never the target guard.
      for (const kind of allowed) {
        let err: unknown;
        try {
          compileRecipe(probeSpec(type), targetOfKind(kind));
        } catch (e) {
          err = e;
        }
        expect(err).not.toBeInstanceOf(IncompatibleCompileTargetError);
      }
    });

    it(`${type}: rejects an incompatible target with IncompatibleCompileTargetError`, () => {
      const incompatible = (['THEME', 'PLATFORM'] as DeployTargetKind[]).filter(
        (kind) => !allowed.includes(kind),
      );
      // Every type is single-target today, so there is always exactly one forbidden kind.
      expect(incompatible.length).toBeGreaterThan(0);
      for (const kind of incompatible) {
        expect(() => compileRecipe(probeSpec(type), targetOfKind(kind))).toThrow(
          IncompatibleCompileTargetError,
        );
      }
    });
  }

  it('error names the type, surface, and forbidden target', () => {
    let caught: IncompatibleCompileTargetError | undefined;
    try {
      compileRecipe(probeSpec('functions.discountRules'), targetOfKind('THEME'));
    } catch (e) {
      caught = e as IncompatibleCompileTargetError;
    }
    expect(caught).toBeInstanceOf(IncompatibleCompileTargetError);
    expect(caught?.moduleType).toBe('functions.discountRules');
    expect(caught?.targetKind).toBe('THEME');
    expect(caught?.allowedTargetKinds).toEqual(['PLATFORM']);
    expect(caught?.message).toContain('functions.discountRules');
    expect(caught?.message).toContain('THEME');
  });

  it('proxy.widget deploys via PLATFORM (App Proxy), not the THEME target it shares a surface with', () => {
    // Regression: proxy.widget shares the THEME storefront *surface* but deploys via
    // App Proxy. Compiling it against a THEME target must now throw.
    expect(() => compileRecipe(probeSpec('proxy.widget'), targetOfKind('PLATFORM'))).not.toThrow(
      IncompatibleCompileTargetError,
    );
    expect(() => compileRecipe(probeSpec('proxy.widget'), targetOfKind('THEME'))).toThrow(
      IncompatibleCompileTargetError,
    );
  });
});
