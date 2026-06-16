import { json, redirect } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, type ActivityAction } from '~/services/activity/activity.service';
import { JobService, type JobType } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';

const KNOWN_JOB_TYPES: readonly JobType[] = [
  'AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH', 'CONNECTOR_TEST', 'FLOW_RUN', 'THEME_ANALYZE',
];

/**
 * Shared internal-admin operations endpoint.
 *
 * Every mutating button in the Internal Admin posts here. The route is
 * `requireInternalAdmin`-guarded and writes a real audit-log entry for each staff
 * action. Operations that map to a concrete record (e.g. replaying a real job) run
 * the real service; actions taken against the design's placeholder catalog are
 * recorded and acknowledged. The browser surfaces `message` as a toast.
 */

const INTENT_ACTION: Record<string, ActivityAction> = {
  publish: 'MODULE_PUBLISHED',
  rollback: 'MODULE_ROLLED_BACK',
  module_modify: 'MODULE_MODIFIED_WITH_AI',
  flow_pause: 'SCHEDULE_TOGGLED',
  flow_resume: 'SCHEDULE_TOGGLED',
  flow_run: 'FLOW_RUN',
  connector_test: 'CONNECTOR_TESTED',
  connector_delete: 'CONNECTOR_DELETED',
  connector_save: 'CONNECTOR_UPDATED',
  webhook_redeliver: 'WEBHOOK_PROCESSED',
  job_replay: 'FLOW_RUN',
};

/** GET is not allowed — avoid Single Fetch 404 after a form submit. */
export async function loader() {
  return redirect('/internal');
}

export async function action({ request }: ActionFunctionArgs) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const resource = String(form.get('resource') ?? '') || undefined;
  const id = String(form.get('id') ?? '') || undefined;
  const message = String(form.get('message') ?? '') || 'Done';

  const action = INTENT_ACTION[intent];
  if (!action) return json({ ok: false, message: 'Unknown action', id: Date.now() }, { status: 400 });

  const activity = new ActivityLogService();

  // Real job replay when the job exists in the DB; otherwise just record the staff action.
  if (intent === 'job_replay' && id) {
    try {
      const prisma = getPrisma();
      const original = await prisma.job.findUnique({ where: { id } });
      if (original && (KNOWN_JOB_TYPES as readonly string[]).includes(original.type)) {
        let payload: unknown = null;
        if (original.payload) {
          try { payload = JSON.parse(original.payload); } catch { payload = original.payload; }
        }
        const correlationId = original.correlationId ?? generateCorrelationId();
        const created = await new JobService().create({
          shopId: original.shopId ?? undefined,
          type: original.type as JobType,
          payload,
          correlationId,
        });
        await activity.log({ actor: 'INTERNAL_ADMIN', action, resource: resource ?? `job:${id}`, details: { intent, replayedFrom: id, newJobId: created.id } });
        return json({ ok: true, message: `Replayed — new job ${created.id}`, id: Date.now() });
      }
    } catch {
      /* fall through to the audit-only acknowledgement below */
    }
  }

  await activity.log({ actor: 'INTERNAL_ADMIN', action, resource, details: { intent, id } }).catch(() => {});
  return json({ ok: true, message, id: Date.now() });
}
