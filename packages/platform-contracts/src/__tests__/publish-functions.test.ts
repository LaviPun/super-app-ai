import { describe, expect, it } from 'vitest';
import {
  FunctionDeploymentContractSchema,
  ModulePublishPreflightResultSchema,
  computeRepublishDiff,
} from '../publish-functions.js';

describe('publish-functions contracts', () => {
  it('validates a two-layer function deployment contract', () => {
    const c = FunctionDeploymentContractSchema.parse({
      functionType: 'functions.discountRules',
      extensionHandle: 'discount-function',
      wasmDeployed: true,
      configMetaobjectType: 'app--module-discount-config',
    });
    expect(c.wasmDeployed).toBe(true);
  });

  it('validates a blocked preflight result', () => {
    const r = ModulePublishPreflightResultSchema.parse({
      moduleType: 'functions.fulfillmentConstraints',
      status: 'blocked',
      reasons: ['No deployed extension behind this function type'],
      requiresExtension: 'fulfillment-constraints-function',
      willDeploy: false,
    });
    expect(r.status).toBe('blocked');
    expect(r.willDeploy).toBe(false);
  });

  describe('idempotent republish (SC-002)', () => {
    const base = { moduleType: 'functions.discountRules', metaobjectType: 'app--discount-config' };

    it('create on first publish', () => {
      const diff = computeRepublishDiff({ ...base, existing: null, next: { rate: 10 } });
      expect(diff.action).toBe('create');
      expect(diff.changedFields).toEqual(['rate']);
    });

    it('noop when republishing identical config (no duplicate)', () => {
      const diff = computeRepublishDiff({
        ...base,
        existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
        next: { rate: 10 },
      });
      expect(diff.action).toBe('noop');
      expect(diff.metaobjectId).toBe('mo_1');
    });

    it('update in place by id when config changes', () => {
      const diff = computeRepublishDiff({
        ...base,
        existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
        next: { rate: 15 },
      });
      expect(diff.action).toBe('update');
      expect(diff.metaobjectId).toBe('mo_1');
      expect(diff.changedFields).toEqual(['rate']);
    });

    it('delete on unpublish, noop when nothing to delete', () => {
      expect(
        computeRepublishDiff({ ...base, existing: { metaobjectId: 'mo_1', config: {} }, next: null }).action,
      ).toBe('delete');
      expect(computeRepublishDiff({ ...base, existing: null, next: null }).action).toBe('noop');
    });

    it('create→republish→unpublish leaves a clean (single, then zero) metaobject set', () => {
      const create = computeRepublishDiff({ ...base, existing: null, next: { rate: 10 } });
      expect(create.action).toBe('create');
      // After create, the store has exactly one metaobject (mo_1).
      const republish = computeRepublishDiff({
        ...base,
        existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
        next: { rate: 10 },
      });
      expect(republish.action).toBe('noop'); // no duplicate created
      const unpublish = computeRepublishDiff({
        ...base,
        existing: { metaobjectId: 'mo_1', config: { rate: 10 } },
        next: null,
      });
      expect(unpublish.action).toBe('delete'); // set returns to zero
    });
  });
});
