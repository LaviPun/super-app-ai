export type ReleaseState =
  | 'generate'
  | 'preview'
  | 'publish'
  | 'stage'
  | 'verify'
  | 'promote'
  | 'rollback';

const TRANSITIONS: Record<ReleaseState, ReleaseState[]> = {
  generate: ['preview'],
  preview: ['publish'],
  publish: ['stage', 'rollback'],
  stage: ['verify', 'rollback'],
  verify: ['promote', 'rollback'],
  promote: [],
  rollback: [],
};

export function getNextReleaseStates(state: ReleaseState): ReleaseState[] {
  return TRANSITIONS[state];
}

export function canTransitionReleaseState(from: ReleaseState, to: ReleaseState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertReleaseTransition(from: ReleaseState, to: ReleaseState): void {
  if (!canTransitionReleaseState(from, to)) {
    throw new Error(`Invalid release transition: ${from} -> ${to}`);
  }
}

