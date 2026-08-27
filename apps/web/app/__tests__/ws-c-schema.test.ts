import type { Prisma } from '@prisma/client';
import { it, expect } from 'vitest';

it('WS-C additive schema surface exists', () => {
  const opt: Prisma.AiGenerationOptionCreateManyInput = {
    jobId: 'j', idx: 0, approach: 'polished', status: 'VALID',
  };
  const job: Prisma.JobUpdateInput = { stage: 'generating' };
  const mod: Prisma.ModuleUpdateInput = { generationCorrelationId: 'corr_1' };
  const settings: Prisma.AppSettingsUpdateInput = { qaPromotedBlockingIssueIds: '[]' };
  expect([opt, job, mod, settings]).toBeTruthy();
});
