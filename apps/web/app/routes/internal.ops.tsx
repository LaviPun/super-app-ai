import { json, redirect } from '@remix-run/node';
import type { ActionFunctionArgs } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService, type ActivityAction } from '~/services/activity/activity.service';
import { JobService, type JobType } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import { ModuleService } from '~/services/modules/module.service';
import { ScheduleService } from '~/services/flows/schedule.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import {
  ConnectorService,
  parseConnectorAuth,
  type UpdateConnectorInput,
} from '~/services/connectors/connector.service';
import type { AdminApiContext } from '~/types/shopify';

const KNOWN_JOB_TYPES: readonly JobType[] = [
  'AI_GENERATE', 'AI_HYDRATE', 'AI_MODIFY', 'PUBLISH', 'CONNECTOR_TEST', 'FLOW_RUN', 'THEME_ANALYZE',
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Shared internal-admin operations endpoint.
 *
 * Every mutating button in the Internal Admin posts here. The route is
 * `requireInternalAdmin`-guarded; each intent maps to the real service call
 * (publish, rollback, schedule/flow toggles, flow runs, connector CRUD, job
 * replay) and writes an audit-log entry. Responses carry a server-derived
 * `message` — failures return `ok: false` and the browser surfaces the message
 * as an error toast. Client-supplied success text is never echoed back.
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

function ok(message: string) {
  return json({ ok: true, message, id: Date.now() });
}

function fail(message: string, status = 400) {
  return json({ ok: false, message, id: Date.now() }, { status });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function action({ request }: ActionFunctionArgs) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');
  const resource = String(form.get('resource') ?? '') || undefined;
  const id = String(form.get('id') ?? '') || undefined;

  const action = INTENT_ACTION[intent];
  if (!action) return fail('Unknown action', 400);

  const activity = new ActivityLogService();
  // Audit logging is best-effort: a failed audit write must not flip the op's outcome.
  const audit = (details: Record<string, unknown>, opts?: { shopId?: string; resource?: string }) =>
    activity
      .log({
        actor: 'INTERNAL_ADMIN',
        action,
        shopId: opts?.shopId,
        resource: resource ?? opts?.resource,
        details: { intent, id, ...details },
      })
      .catch(() => {});

  try {
    switch (intent) {
      case 'job_replay': {
        if (!id) return fail('Missing job id');
        const prisma = getPrisma();
        const original = await prisma.job.findUnique({ where: { id } });
        if (!original) return fail(`Job ${id} not found`, 404);
        if (!(KNOWN_JOB_TYPES as readonly string[]).includes(original.type)) {
          return fail(`Job type ${original.type} cannot be replayed`);
        }

        let payload: unknown = null;
        if (original.payload) {
          try { payload = JSON.parse(original.payload); } catch { payload = original.payload; }
        }
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          payload = {
            ...(payload as Record<string, unknown>),
            replayOf: original.id,
            originalCorrelationId: original.correlationId ?? null,
          };
        }

        // Replays always run under a fresh correlationId (docs/internal-admin.md §Replay actions);
        // the original correlation is preserved in the payload above.
        const correlationId = generateCorrelationId();
        const created = await new JobService().create({
          shopId: original.shopId ?? undefined,
          type: original.type as JobType,
          payload,
          correlationId,
        });
        await audit(
          { replayedFrom: id, newJobId: created.id, correlationId },
          { shopId: original.shopId ?? undefined, resource: `job:${id}` },
        );
        return ok(`Replayed — new job ${created.id}`);
      }

      case 'publish': {
        if (!id) return fail('Missing module id');
        const prisma = getPrisma();
        const moduleRow = await prisma.module.findUnique({
          where: { id },
          include: { shop: true, versions: { orderBy: { version: 'desc' } } },
        });
        if (!moduleRow) return fail(`Module ${id} not found`, 404);

        const versionRow = moduleRow.versions.find((v) => v.status === 'DRAFT') ?? moduleRow.versions[0];
        if (!versionRow) return fail(`${moduleRow.name} has no versions to publish`);
        if (moduleRow.activeVersionId === versionRow.id && versionRow.status === 'PUBLISHED') {
          return ok(`${moduleRow.name} v${versionRow.version} is already published`);
        }

        await new ModuleService().markPublishedWithTransition({
          shopId: moduleRow.shopId,
          moduleId: moduleRow.id,
          versionId: versionRow.id,
          source: 'system',
          actor: 'INTERNAL_ADMIN',
          idempotencyKey: `internal-ops:publish:${generateCorrelationId()}`,
        });
        await audit(
          { versionId: versionRow.id, version: versionRow.version },
          { shopId: moduleRow.shopId, resource: `module:${moduleRow.id}` },
        );
        return ok(`Published ${moduleRow.name} v${versionRow.version}`);
      }

      case 'rollback': {
        if (!id) return fail('Missing module id');
        const prisma = getPrisma();
        const moduleRow = await prisma.module.findUnique({
          where: { id },
          include: { shop: true, activeVersion: true, versions: { orderBy: { version: 'desc' } } },
        });
        if (!moduleRow) return fail(`Module ${id} not found`, 404);

        const versionField = String(form.get('version') ?? '');
        let target: number;
        if (versionField) {
          target = Number(versionField);
          if (!Number.isInteger(target) || target < 1) return fail(`Invalid version "${versionField}"`);
          if (!moduleRow.versions.some((v) => v.version === target)) {
            return fail(`${moduleRow.name} has no version v${target}`, 404);
          }
        } else {
          const activeVersion = moduleRow.activeVersion?.version;
          if (activeVersion == null) {
            return fail(`${moduleRow.name} has no active version — specify a version to roll back to`);
          }
          // versions are ordered desc, so this is the newest previously-published version.
          const previous = moduleRow.versions.find((v) => v.publishedAt != null && v.version < activeVersion);
          if (!previous) return fail(`${moduleRow.name} has no earlier published version to roll back to`);
          target = previous.version;
        }

        await new ModuleService().rollbackToVersion(moduleRow.shop.shopDomain, moduleRow.id, target);
        await audit(
          { version: target },
          { shopId: moduleRow.shopId, resource: `module:${moduleRow.id}` },
        );
        return ok(`Rolled back ${moduleRow.name} to v${target}`);
      }

      case 'module_modify':
        // No safe generic server-side implementation — AI modify needs the editor's context.
        return fail('Use the module editor to modify this module');

      case 'flow_pause':
      case 'flow_resume': {
        if (!id) return fail('Missing flow id');
        const desired = intent === 'flow_resume';
        const prisma = getPrisma();
        // The id can be a FlowSchedule (cron flow) or a flow.automation Module.
        const [schedule, moduleRow] = await Promise.all([
          prisma.flowSchedule.findUnique({ where: { id } }),
          prisma.module.findUnique({ where: { id } }),
        ]);

        if (schedule) {
          await new ScheduleService().toggle(schedule.id, schedule.shopId, desired);
          await audit(
            { kind: 'schedule', isActive: desired },
            { shopId: schedule.shopId, resource: `schedule:${schedule.id}` },
          );
          return ok(`${schedule.name} ${desired ? 'resumed' : 'paused'}`);
        }

        if (moduleRow && moduleRow.type === 'flow.automation') {
          if (desired && !moduleRow.activeVersionId) {
            return fail(`${moduleRow.name} has no published version to resume`);
          }
          // PUBLISHED ⇔ active for flow modules (see flows._index.tsx); the flow
          // runner only picks up PUBLISHED modules, so DRAFT pauses it.
          await prisma.module.update({
            where: { id: moduleRow.id },
            data: { status: desired ? 'PUBLISHED' : 'DRAFT' },
          });
          await audit(
            { kind: 'module', status: desired ? 'PUBLISHED' : 'DRAFT' },
            { shopId: moduleRow.shopId, resource: `module:${moduleRow.id}` },
          );
          return ok(`${moduleRow.name} ${desired ? 'resumed' : 'paused'}`);
        }

        return fail(`Flow ${id} not found`, 404);
      }

      case 'flow_run': {
        if (!id) return fail('Missing flow id');
        const prisma = getPrisma();
        const moduleRow = await prisma.module.findUnique({ where: { id }, include: { shop: true } });
        if (!moduleRow || moduleRow.type !== 'flow.automation') return fail(`Flow ${id} not found`, 404);

        // The internal admin has no embedded Shopify admin session. Like api.cron.tsx,
        // pass an admin-less stub — Shopify API steps fail gracefully and get retried;
        // connector/HTTP steps run fine.
        const result = await new FlowRunnerService().runFlowById(
          moduleRow.shop.shopDomain,
          null as unknown as AdminApiContext['admin'],
          moduleRow.id,
          { kind: 'manual', source: 'internal-admin' },
        );
        await audit(
          { jobId: result.jobId, steps: result.steps },
          { shopId: moduleRow.shopId, resource: `module:${moduleRow.id}` },
        );
        return ok(`Run complete — ${result.steps} step${result.steps === 1 ? '' : 's'}, job ${result.jobId}`);
      }

      case 'connector_test': {
        if (!id) return fail('Missing connector id');
        const prisma = getPrisma();
        const connector = await prisma.connector.findUnique({ where: { id }, include: { shop: true } });
        if (!connector) return fail(`Connector ${id} not found`, 404);

        const path = String(form.get('path') ?? '') || '/';
        const methodRaw = String(form.get('method') ?? 'GET').toUpperCase();
        const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(methodRaw)
          ? (methodRaw as HttpMethod)
          : 'GET';

        const result = await new ConnectorService().test(connector.shop.shopDomain, {
          connectorId: connector.id,
          path,
          method,
        });
        await audit(
          { path, method, status: result.status },
          { shopId: connector.shopId, resource: `connector:${connector.id}` },
        );
        const message = `${connector.name} — HTTP ${result.status}`;
        return result.ok ? ok(message) : fail(message, 200);
      }

      case 'connector_save': {
        if (!id) return fail('Missing connector id');
        const prisma = getPrisma();
        const connector = await prisma.connector.findUnique({ where: { id }, include: { shop: true } });
        if (!connector) return fail(`Connector ${id} not found`, 404);

        const input: UpdateConnectorInput = { shopDomain: connector.shop.shopDomain, connectorId: connector.id };
        const name = String(form.get('name') ?? '').trim();
        if (name) input.name = name;
        const baseUrl = String(form.get('baseUrl') ?? '').trim();
        if (baseUrl) input.baseUrl = baseUrl;
        const allowlistRaw = String(form.get('allowlistDomains') ?? '').trim();
        if (allowlistRaw) {
          input.allowlistDomains = allowlistRaw.split(',').map((d) => d.trim()).filter(Boolean);
        }
        const authType = String(form.get('authType') ?? '').trim();
        if (authType) {
          const auth = parseConnectorAuth({
            type: authType,
            headerName: form.get('headerName') ?? undefined,
            apiKey: form.get('apiKey') ?? undefined,
            username: form.get('username') ?? undefined,
            password: form.get('password') ?? undefined,
            bearerToken: form.get('bearerToken') ?? undefined,
          });
          if (!auth) return fail(`Incomplete auth settings for ${authType}`);
          input.auth = auth;
        }

        if (!input.name && !input.baseUrl && !input.allowlistDomains && !input.auth) {
          return fail('No changes provided');
        }

        await new ConnectorService().update(input);
        await audit(
          { updatedFields: Object.keys(input).filter((k) => k !== 'shopDomain' && k !== 'connectorId') },
          { shopId: connector.shopId, resource: `connector:${connector.id}` },
        );
        return ok(`${connector.name} saved`);
      }

      case 'connector_delete': {
        if (!id) return fail('Missing connector id');
        const prisma = getPrisma();
        const connector = await prisma.connector.findUnique({ where: { id }, include: { shop: true } });
        if (!connector) return fail(`Connector ${id} not found`, 404);

        await prisma.connector.deleteMany({ where: { id: connector.id, shopId: connector.shopId } });
        await audit(
          { name: connector.name, shopDomain: connector.shop.shopDomain },
          { shopId: connector.shopId, resource: `connector:${connector.id}` },
        );
        return ok(`${connector.name} deleted`);
      }

      case 'webhook_redeliver':
        // WebhookEvent rows only store topic/eventId metadata — payloads are not
        // persisted, so there is nothing to redeliver. Do not fake it.
        return fail('Redelivery not supported yet — webhook payloads are not persisted');

      default:
        return fail('Unknown action', 400);
    }
  } catch (err) {
    return fail(errorMessage(err), 500);
  }
}
