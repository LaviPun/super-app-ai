import { describe, expect, it } from 'vitest';
import { evaluateSurfaceCapabilityAllowlist } from '~/services/publish/capability-allowlist.server';
import {
  compilePolicySnapshot,
  invalidatePolicySnapshots,
} from '~/services/publish/policy-snapshot.server';
import {
  assertReleaseTransition,
  canTransitionReleaseState,
  getNextReleaseStates,
} from '~/services/releases/state-machine.server';
import { evaluateFeatureFlag } from '~/services/releases/feature-flags.server';
import { ProgressivePublishService } from '~/services/releases/progressive-publish.server';

describe('release controls', () => {
  it('enforces surface capability allowlist by target', () => {
    const result = evaluateSurfaceCapabilityAllowlist({
      moduleType: 'theme.banner',
      targetKind: 'PLATFORM',
      declaredCapabilities: ['THEME_ASSETS'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons[0]).toMatch(/not allowed/i);
  });

  it('builds and invalidates policy snapshots by shop/surface/revision', () => {
    const compiled = compilePolicySnapshot(
      {
        shopDomain: 'shop-a.myshopify.com',
        surface: 'THEME',
        revision: 'r1',
        targetKind: 'THEME',
        planTier: 'PLUS',
      },
      () => ({ allowed: true })
    );
    expect(compiled.value).toEqual({ allowed: true });

    const removed = invalidatePolicySnapshots({
      shopDomain: 'shop-a.myshopify.com',
      surface: 'THEME',
      revision: 'r1',
    });
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('allows canonical release transitions and rejects invalid jumps', () => {
    expect(canTransitionReleaseState('generate', 'preview')).toBe(true);
    expect(getNextReleaseStates('verify')).toContain('promote');
    expect(() => assertReleaseTransition('generate', 'publish')).toThrow(/Invalid release transition/);
  });

  it('applies flag precedence global kill > shop override > surface toggle', () => {
    const globalKill = evaluateFeatureFlag({
      topology: { globalKillSwitch: true },
      shopDomain: 'shop-a.myshopify.com',
      surface: 'THEME',
    });
    expect(globalKill.enabled).toBe(false);
    expect(globalKill.source).toBe('global_kill_switch');

    const shopOverride = evaluateFeatureFlag({
      topology: {
        globalKillSwitch: false,
        shopOverrides: {
          'shop-a.myshopify.com': { killSwitch: true },
        },
      },
      shopDomain: 'shop-a.myshopify.com',
      surface: 'THEME',
    });
    expect(shopOverride.enabled).toBe(false);
    expect(shopOverride.source).toBe('shop_override');
  });

  it('evaluates progressive publish canary/ramp decisions', () => {
    const service = new ProgressivePublishService();
    const canary = service.startCanary();
    expect(canary.decision).toBe('PROCEED');

    const hold = service.evaluateRamp({ sampleSize: 10, errorRate: 0.0, p95LatencyMs: 200 });
    expect(hold.decision).toBe('HOLD');

    const abort = service.evaluateRamp({ sampleSize: 300, errorRate: 0.2, p95LatencyMs: 2000 });
    expect(abort.decision).toBe('ABORT');
  });
});

