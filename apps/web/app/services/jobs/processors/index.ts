import type { PlatformQueueName } from '@superapp/platform-contracts';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';

/**
 * Registry of BullMQ job handlers, keyed by platform queue name. Empty until
 * Task 5 registers the ai-generation / publish processors — until then the
 * worker entry boots in health-only mode (see scripts/worker.ts).
 */
export function buildWorkerHandlers(): Partial<Record<PlatformQueueName, WebJobHandler>> {
  return {};
}
