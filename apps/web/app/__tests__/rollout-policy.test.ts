import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLLOUT_POLICY, RolloutPolicyService } from '~/services/releases/rollout-policy.service';

describe('RolloutPolicyService', () => {
  it('holds when sample size is below threshold', () => {
    const service = new RolloutPolicyService();
    const result = service.evaluate({
      sampleSize: DEFAULT_ROLLOUT_POLICY.minSampleSize - 1,
      errorRate: 0.0,
      p95LatencyMs: 200,
    });
    expect(result.decision).toBe('HOLD');
  });

  it('aborts when error rate exceeds threshold', () => {
    const service = new RolloutPolicyService();
    const result = service.evaluate({
      sampleSize: DEFAULT_ROLLOUT_POLICY.minSampleSize + 20,
      errorRate: DEFAULT_ROLLOUT_POLICY.maxErrorRate + 0.01,
      p95LatencyMs: 200,
    });
    expect(result.decision).toBe('ABORT');
  });

  it('aborts when latency exceeds threshold', () => {
    const service = new RolloutPolicyService();
    const result = service.evaluate({
      sampleSize: DEFAULT_ROLLOUT_POLICY.minSampleSize + 20,
      errorRate: 0.0,
      p95LatencyMs: DEFAULT_ROLLOUT_POLICY.maxP95LatencyMs + 200,
    });
    expect(result.decision).toBe('ABORT');
  });

  it('promotes when all thresholds pass', () => {
    const service = new RolloutPolicyService();
    const result = service.evaluate({
      sampleSize: DEFAULT_ROLLOUT_POLICY.minSampleSize + 20,
      errorRate: DEFAULT_ROLLOUT_POLICY.maxErrorRate / 2,
      p95LatencyMs: DEFAULT_ROLLOUT_POLICY.maxP95LatencyMs - 100,
    });
    expect(result.decision).toBe('PROMOTE');
  });
});

