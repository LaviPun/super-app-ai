import type { PlatformQueueName } from '@superapp/platform-contracts';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';
import { createAiGenerationJobHandler } from '~/services/jobs/processors/ai-generation.processor.server';
import { createAiHydrateJobHandler } from '~/services/jobs/processors/ai-hydrate.processor.server';
import { createPublishJobHandler } from '~/services/jobs/processors/publish.processor.server';
import { JobService } from '~/services/jobs/job.service';

/**
 * Registry of BullMQ job handlers, keyed by platform queue name. The
 * `ai-generation` queue carries multiple job TYPES (`AI_GENERATE`,
 * `AI_HYDRATE` — Task 8); one Worker per queue (Task 1) means one handler
 * per queue too, so this dispatches on `envelope.jobType` internally.
 *
 * `publish` (Task 9) carries `PUBLISH` (and, once a future task builds it,
 * `ROLLBACK` — both map to the same queue per
 * `PLATFORM_JOB_QUEUE_BY_TYPE`); this worker is always mounted (Task 1
 * mounts every registered queue regardless of `PUBLISH_ASYNC_ENABLED`) but
 * only ever receives a job when the route's flag check (C10) chose to
 * enqueue instead of publishing inline — with the flag off, nothing ever
 * lands on this queue.
 */
export function buildWorkerHandlers(): Partial<Record<PlatformQueueName, WebJobHandler>> {
  const aiGenerate = createAiGenerationJobHandler();
  const aiHydrate = createAiHydrateJobHandler();
  const publish = createPublishJobHandler();

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

  const dispatchPublish: WebJobHandler = async (envelope) => {
    switch (envelope.jobType) {
      case 'PUBLISH':
        return publish(envelope);
      default: {
        const message = `No handler registered for job type '${envelope.jobType}' on queue 'publish'.`;
        await new JobService().failWithPayload(envelope.id, {
          error: 'VALIDATION_ERROR',
          message,
          requestId: envelope.trace.requestId ?? envelope.id,
        });
        return { status: 'FAILED', result: { error: { message } } };
      }
    }
  };

  return { 'ai-generation': dispatchAiGeneration, publish: dispatchPublish };
}
