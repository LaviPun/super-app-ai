import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, RECIPE_SPEC_TYPES, type RecipeSpec } from '@superapp/core';
import { computeRepublishDiff } from '@superapp/platform-contracts';
import {
  FUNCTION_EXTENSION_HANDLES,
  classifyModulePublishability,
} from '~/services/publish/publish-preflight.server';
import { PublishService } from '~/services/publish/publish.service';
import type { AdminApiContext } from '~/types/shopify';

function specForType(type: string): RecipeSpec | undefined {
  return MODULE_TEMPLATES.find((t) => t.spec.type === type)?.spec;
}

describe('WS5 publish preflight — SC-001 no silent no-op', () => {
  it('every type is either deployable or needs_runtime — never silently published', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      const spec = specForType(type);
      if (!spec) continue;
      // No deployed extensions in this fixture.
      const result = classifyModulePublishability(spec, { deployedExtensions: [] });
      expect(['deployable', 'needs_runtime']).toContain(result.status);
      // A non-deploying type must say WHY (fail loudly, never silently no-op).
      if (!result.willDeploy) {
        expect(result.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks a type with an unshipped runtime as needs_runtime (publishes nothing)', () => {
    // platform.extensionBlueprint has no runtime of its own (deploys only via its
    // members' co-deploy), so publishing it standalone is genuinely needs_runtime.
    // (flow.automation is now deployable — see compiler.flow.automation.test.ts.)
    const spec = specForType('platform.extensionBlueprint');
    if (!spec) return;
    const result = classifyModulePublishability(spec);
    expect(result.status).toBe('needs_runtime');
    expect(result.willDeploy).toBe(false);
  });

  it('marks analytics.pixel deployable (web pixel upsert wiring)', () => {
    const spec = specForType('analytics.pixel');
    if (!spec) return;
    const result = classifyModulePublishability(spec);
    expect(result.status).toBe('deployable');
    expect(result.willDeploy).toBe(true);
  });

  it('blocks a function type whose extension is not deployed (fail loudly)', () => {
    const spec = specForType('functions.discountRules');
    if (!spec) return;
    const blocked = classifyModulePublishability(spec, { deployedExtensions: [] });
    expect(blocked.status).toBe('needs_runtime');
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

  it('throws ModuleNotPublishableError (needs_runtime) for an unshipped runtime, doing no I/O', async () => {
    // platform.extensionBlueprint is the genuinely non-deployable standalone type
    // (no runtime of its own). flow.automation is now deployable via its compiler +
    // linear runner + durable-wait, so it no longer proves the gate.
    const spec = specForType('platform.extensionBlueprint');
    if (!spec) return;
    const svc = new PublishService(explodingAdmin);
    await expect(svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' })).rejects.toMatchObject({
      code: 'MODULE_NOT_PUBLISHABLE',
      preflight: { status: 'needs_runtime', willDeploy: false },
    });
  });

  it('throws ModuleNotPublishableError (needs_runtime) for a function type with no deployed extension', async () => {
    // orderRoutingLocationRule has no wasm extension in extensions/ (and none in
    // the deployed manifest), so it is the genuinely non-deployable function type.
    const spec = { type: 'functions.orderRoutingLocationRule', name: 'route', config: {} } as unknown as RecipeSpec;
    delete process.env.SHOPIFY_DEPLOYED_FUNCTION_EXTENSIONS;
    const svc = new PublishService(explodingAdmin);
    await expect(svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' })).rejects.toMatchObject({
      code: 'MODULE_NOT_PUBLISHABLE',
      preflight: { status: 'needs_runtime' },
    });
  });
});
