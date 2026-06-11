import { FlowRunPayloadSchema } from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { failureResult, successResult } from './handler-utils.js';

export function createFlowHandler(): JobHandler {
  return async (job) => {
    const parsed = FlowRunPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      return failureResult(job, 'flow', {
        code: 'INVALID_FLOW_PAYLOAD',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }, 'Flow worker rejected invalid payload');
    }

    const payload = parsed.data;
    return successResult(
      job,
      'flow',
      {
        jobId: payload.jobId,
        shopId: payload.shopId,
        flowId: payload.flowId,
        trigger: payload.trigger,
        status: 'completed',
        stepsExecuted: 1,
        emittedEvents: [
          {
            type: 'FLOW_RUN_STARTED',
            flowId: payload.flowId,
            trigger: payload.trigger,
          },
          {
            type: 'FLOW_RUN_COMPLETED',
            flowId: payload.flowId,
          },
        ],
      },
      `Flow ${payload.flowId} run completed`,
    );
  };
}
