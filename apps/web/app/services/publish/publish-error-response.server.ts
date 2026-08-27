import { json } from '@remix-run/node';
import type { PublishPartialFailureError } from '~/services/publish/publish.service';

/**
 * Shared JSON shape for a `PublishPartialFailureError` (WS-E finding 4). Both
 * publish routes — `api.publish.tsx` (Builder, redirect-based) and
 * `api.agent.modules.$moduleId.publish.tsx` (module-detail's own
 * Publish/Republish button, JSON-based) — run the SAME `PublishService.publish()`
 * and must surface a partial failure identically: `failedOp` + `completedOps` +
 * explicit republish guidance, never degraded to a flat error string. One
 * implementation so the two routes can't drift.
 */
export function publishPartialFailureResponse(e: PublishPartialFailureError) {
  return json(
    {
      error: e.message,
      code: e.code,
      failedOp: e.failedOp,
      completedOps: e.completed,
      guidance: 'Republish to converge — completed steps are idempotent and will not duplicate.',
    },
    { status: 502 },
  );
}
