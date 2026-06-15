import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, RECIPE_SPEC_TYPES, type RecipeSpec } from '@superapp/core';
import { computeRepublishDiff } from '@superapp/platform-contracts';
import {
  AUDIT_ONLY_TYPES,
  FUNCTION_EXTENSION_HANDLES,
  classifyModulePublishability,
} from '~/services/publish/publish-preflight.server';
import { PublishService } from '~/services/publish/publish.service';
import type { AdminApiContext } from '~/types/shopify';

function specForType(type: string): RecipeSpec | undefined {
  return MODULE_TEMPLATES.find((t) => t.spec.type === type)?.spec;
}

describe('WS5 publish preflight — SC-001 no silent no-op', () => {
  it('every type is either deployable, gated, or blocked — never silently published', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      const spec = specForType(type);
      if (!spec) continue;
      // No deployed extensions in this fixture.
      const result = classifyModulePublishability(spec, { deployedExtensions: [] });
      expect(['deployable', 'gated', 'blocked']).toContain(result.status);
      // If it claims it will deploy, it must not be in the AUDIT-only set.
      if (result.willDeploy) {
        expect(AUDIT_ONLY_TYPES.has(type)).toBe(false);
      } else {
        expect(result.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it('gates AUDIT-only types as "not publishable yet" (publishes nothing)', () => {
    const spec = specForType('analytics.pixel');
    if (!spec) return;
    const result = classifyModulePublishability(spec);
    expect(result.status).toBe('gated');
    expect(result.willDeploy).toBe(false);
  });

  it('blocks a function type whose extension is not deployed (fail loudly)', () => {
    const spec = specForType('functions.discountRules');
    if (!spec) return;
    const blocked = classifyModulePublishability(spec, { deployedExtensions: [] });
    expect(blocked.status).toBe('blocked');
    expect(blocked.requiresExtension).toBe(FUNCTION_EXTENSION_HANDLES['functions.discountRules']);

    const ok = classifyModulePublishability(spec, {
      deployedExtensions: [FUNCTION_EXTENSION_HANDLES['functions.discountRules']!],
    });
    expect(ok.status).toBe('deployable');
    expect(ok.willDeploy).toBe(true);
  });

  it('marks theme.section deployable without an extension', () => {
    const spec = specForType('theme.section');
    if (!spec) return;
    expect(classifyModulePublishability(spec).status).toBe('deployable');
  });
});

describe('WS5 idempotent republish — SC-002', () => {
  it('create→republish→unpublish leaves a clean metaobject set', () => {
    const base = { moduleType: 'functions.discountRules', metaobjectType: 'app--discount-config' };
    const create = computeRepublishDiff({ ...base, existing: null, next: { rate: 10 } });
    expect(create.action).toBe('create');
    const republish = computeRepublishDiff({
      ...base,
      existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
      next: { rate: 10 },
    });
    expect(republish.action).toBe('noop');
    const unpublish = computeRepublishDiff({
      ...base,
      existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
      next: null,
    });
    expect(unpublish.action).toBe('delete');
  });
});

describe('WS5 PublishService gate — refuses to deploy gated/blocked (SC-001 wiring)', () => {
  // The gate short-circuits before any compile/GraphQL work, so a throwaway admin
  // that would explode if called proves nothing was attempted.
  const explodingAdmin = {
    graphql: () => {
      throw new Error('admin.graphql must not be called for a gated/blocked module');
    },
  } as unknown as AdminApiContext['admin'];

  it('throws ModuleNotPublishableError (gated) for an AUDIT-only type, doing no I/O', async () => {
    const spec = specForType('analytics.pixel');
    if (!spec) return;
    const svc = new PublishService(explodingAdmin);
    await expect(svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' })).rejects.toMatchObject({
      code: 'MODULE_NOT_PUBLISHABLE',
      preflight: { status: 'gated', willDeploy: false },
    });
  });

  it('throws ModuleNotPublishableError (blocked) for a function type with no deployed extension', async () => {
    const spec = specForType('functions.discountRules');
    if (!spec) return;
    delete process.env.SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS;
    const svc = new PublishService(explodingAdmin);
    await expect(svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' })).rejects.toMatchObject({
      code: 'MODULE_NOT_PUBLISHABLE',
      preflight: { status: 'blocked' },
    });
  });
});
