import { describe, expect, it } from 'vitest';
import { JOB_EXECUTORS, isOwnedJobType } from '~/services/jobs/job-executors.server';

describe('JOB_EXECUTORS registry (Decision G8)', () => {
  it('covers exactly the owned job types (Task 14 six + Task 20 SUPPORT_TRIAGE_RUN), never AI_GENERATE/AI_HYDRATE/AI_MODIFY/PUBLISH', () => {
    const owned = Object.keys(JOB_EXECUTORS).sort();
    expect(owned).toEqual(
      [
        'CONNECTOR_TEST',
        'FLOW_RUN',
        'HTTP_SYNC_RUN',
        'LOYALTY_ACCRUAL_RUN',
        'MESSAGING_RUN',
        'RESTOCK_WATCH_RUN',
        'SUPPORT_TRIAGE_RUN',
      ].sort(),
    );
    for (const forbidden of ['AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH']) {
      expect(isOwnedJobType(forbidden)).toBe(false);
    }
  });
});
