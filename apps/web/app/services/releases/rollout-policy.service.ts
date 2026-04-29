export type RolloutDecision = 'PROMOTE' | 'ABORT' | 'HOLD';

export type RolloutMetrics = {
  sampleSize: number;
  errorRate: number;
  p95LatencyMs: number;
};

export type RolloutPolicyDefaults = {
  minSampleSize: number;
  maxErrorRate: number;
  maxP95LatencyMs: number;
};

export const DEFAULT_ROLLOUT_POLICY: RolloutPolicyDefaults = {
  minSampleSize: 200,
  maxErrorRate: 0.02,
  maxP95LatencyMs: 1200,
};

export type RolloutEvaluation = {
  decision: RolloutDecision;
  reasons: string[];
  policy: RolloutPolicyDefaults;
};

export class RolloutPolicyService {
  constructor(private readonly defaults: RolloutPolicyDefaults = DEFAULT_ROLLOUT_POLICY) {}

  evaluate(metrics: RolloutMetrics): RolloutEvaluation {
    const reasons: string[] = [];

    if (metrics.sampleSize < this.defaults.minSampleSize) {
      reasons.push(
        `Insufficient sample size (${metrics.sampleSize} < ${this.defaults.minSampleSize}).`
      );
    }

    if (metrics.errorRate > this.defaults.maxErrorRate) {
      reasons.push(
        `Error rate too high (${metrics.errorRate.toFixed(4)} > ${this.defaults.maxErrorRate.toFixed(4)}).`
      );
    }

    if (metrics.p95LatencyMs > this.defaults.maxP95LatencyMs) {
      reasons.push(
        `P95 latency too high (${metrics.p95LatencyMs}ms > ${this.defaults.maxP95LatencyMs}ms).`
      );
    }

    if (metrics.errorRate > this.defaults.maxErrorRate || metrics.p95LatencyMs > this.defaults.maxP95LatencyMs) {
      return { decision: 'ABORT', reasons, policy: this.defaults };
    }

    if (metrics.sampleSize < this.defaults.minSampleSize) {
      return { decision: 'HOLD', reasons, policy: this.defaults };
    }

    return { decision: 'PROMOTE', reasons, policy: this.defaults };
  }
}

