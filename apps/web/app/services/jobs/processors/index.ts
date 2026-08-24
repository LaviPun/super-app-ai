import type { PlatformQueueName } from '@superapp/platform-contracts';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';
import { createAiGenerationJobHandler } from '~/services/jobs/processors/ai-generation.processor.server';
import { createAiHydrateJobHandler } from '~/services/jobs/processors/ai-hydrate.processor.server';
import { JobService } from '~/services/jobs/job.service';

/**
 * Registry of BullMQ job handlers, keyed by platform queue name. The
 * `ai-generation` queue carries multiple job TYPES (`AI_GENERATE`,
 * `AI_HYDRATE` — Task 8); one Worker per queue (Task 1) means one handler
 * per queue too, so this dispatches on `envelope.jobType` internally.
 *
 * `publish` (Task 9) is still unregistered — the worker stays in
 * health-only mode for that queue until then.
 */
export function buildWorkerHandlers(): Partial<Record<PlatformQueueName, WebJobHandler>> {
  const aiGenerate = createAiGenerationJobHandler();
  const aiHydrate = createAiHydrateJobHandler();

  const dispatchAiGeneration: WebJobHandler = async (envelope) => {
    switch (envelope.jobType) {
      case 'AI_GENERATE':
        return aiGenerate(envelope);
      case 'AI_HYDRATE':
        return aiHydrate(envelope);
      default: {
        const message = `No handler registered for job type '${envelope.jobType}' on queue 'ai-generation'.`;
        await new JobService().failWithPayload(envelope.id, {
          error: 'VALIDATION_ERROR',
          message,
          requestId: envelope.trace.requestId ?? envelope.id,
        });
        return { status: 'FAILED', result: { error: { message } } };
      }
    }
  };

  return { 'ai-generation': dispatchAiGeneration };
}
