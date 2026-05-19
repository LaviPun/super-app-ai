import { describe, expect, it } from 'vitest';
import { createWorkerBootstrapState, QUEUE_NAMES } from '../bootstrap.js';

describe('worker bootstrap', () => {
  it('registers planned queue names', () => {
    const state = createWorkerBootstrapState();
    expect(state.queues).toEqual([...QUEUE_NAMES]);
    expect(state.supportedJobTypes).toContain('AI_GENERATE');
    expect(state.queues).toContain('theme-analyze');
    expect(state.registrations).toContainEqual({
      type: 'PUBLISH',
      queueName: 'publish-execution',
    });
    expect(state.registrations).toHaveLength(state.supportedJobTypes.length);
    expect(state.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
