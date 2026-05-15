import {
  RolloutPolicyService,
  readRollbackBudgetThresholdsFromEnv,
  type RolloutMetrics,
} from '~/services/releases/rollout-policy.service';
import { assertReleaseTransition, type ReleaseState } from '~/services/releases/state-machine.server';

export type ProgressiveStage = 'canary' | 'ramp' | 'promote' | 'rollback';

export type ProgressivePublishDecision = {
  stage: ProgressiveStage;
  state: ReleaseState;
  decision: 'PROCEED' | 'HOLD' | 'ABORT';
  reasons: string[];
};

const DEFAULT_STAGES = [5, 25, 50, 100] as const;

export class ProgressivePublishService {
  constructor(
    private readonly rolloutPolicy = new RolloutPolicyService(
      readRollbackBudgetThresholdsFromEnv()
    )
  ) {}

  getStagePercentages(): readonly number[] {
    return DEFAULT_STAGES;
  }

  startCanary(): ProgressivePublishDecision {
    assertReleaseTransition('publish', 'stage');
    return {
      stage: 'canary',
      state: 'stage',
      decision: 'PROCEED',
      reasons: ['Started canary rollout at 5%.'],
    };
  }

  evaluateRamp(metrics: RolloutMetrics): ProgressivePublishDecision {
    assertReleaseTransition('stage', 'verify');
    const evaluation = this.rolloutPolicy.evaluate(metrics);
    if (evaluation.decision === 'ABORT') {
      return {
        stage: 'rollback',
        state: 'rollback',
        decision: 'ABORT',
        reasons: evaluation.reasons,
      };
    }
    if (evaluation.decision === 'HOLD') {
      return {
        stage: 'ramp',
        state: 'verify',
        decision: 'HOLD',
        reasons: evaluation.reasons,
      };
    }
    assertReleaseTransition('verify', 'promote');
    return {
      stage: 'promote',
      state: 'promote',
      decision: 'PROCEED',
      reasons: ['Canary checks passed. Promote rollout to 100%.'],
    };
  }
}

