import type { Prisma } from '@prisma/client';
import { getPrisma } from '~/db.server';
import { applyTelemetryBudget } from '~/services/observability/telemetry-budget.server';
import { getRequestContext } from '~/services/observability/correlation.server';

export type ActivityAction =
  | 'MODULE_CREATED'
  | 'MODULE_PUBLISHED'
  | 'MODULE_DELETED'
  | 'MODULE_ROLLED_BACK'
  | 'MODULE_STYLE_UPDATED'
  | 'CONNECTOR_CREATED'
  | 'CONNECTOR_DELETED'
  | 'CONNECTOR_TESTED'
  | 'SCHEDULE_CREATED'
  | 'SCHEDULE_UPDATED'
  | 'SCHEDULE_DELETED'
  | 'SCHEDULE_TOGGLED'
  | 'BILLING_PLAN_CHANGED'
  | 'AI_GENERATION'
  | 'THEME_ANALYZED'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PROVIDER_CREATED'
  | 'PROVIDER_ACTIVATED'
  | 'PROVIDER_EXTRA_CONFIG_UPDATED'
  | 'PRICE_ADDED'
  | 'STORE_SETTINGS_UPDATED'
  | 'FLOW_RUN'
  | 'WEBHOOK_PROCESSED'
  | 'MODULE_CREATED_FROM_TEMPLATE'
  | 'DATA_STORE_ENABLED'
  | 'DATA_STORE_DISABLED'
  | 'ENDPOINT_CREATED'
  | 'ENDPOINT_DELETED'
  | 'WORKFLOW_CREATED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'WORKFLOW_TEMPLATE_INSTALLED'
  | 'CONNECTOR_TOKEN_SAVED'
  | 'MODULE_SPEC_EDITED'
  | 'STORE_PLAN_CHANGED'
  | 'SERVER_STARTED'
  | 'APP_NAV'
  | 'PAGE_LOAD'
  // Activity log = everything: navigation, clicks, request outcomes, settings
  | 'PAGE_OPENED'
  | 'PAGE_REFRESHED'
  | 'BUTTON_CLICK'
  | 'LINK_CLICK'
  | 'SETTINGS_CHANGE'
  | 'REQUEST_SUCCESS'
  | 'REQUEST_ERROR'
  | 'CONNECTOR_UPDATED'
  | 'MODULE_MODIFIED_WITH_AI'
  | 'OPENAI_PROVIDER_UPDATED'
  | 'CLAUDE_PROVIDER_UPDATED'
  | 'DEFAULT_AI_PROVIDER_UPDATED'
  | 'MAIN_API_PROVIDER_SET'
  | 'PROVIDER_MODEL_CATALOG_SYNCED'
  | 'PROVIDER_UPDATES_SYNCED'
  | 'ALL_PROVIDER_UPDATES_SYNCED'
  | 'ENV_KEYS_IMPORTED_TO_PROVIDER_DB'
  | 'TEMPLATE_SETTINGS_UPDATED'
  | 'TEMPLATE_SANDBOX_CREATED';

export type ActivityActor = 'SYSTEM' | 'MERCHANT' | 'INTERNAL_ADMIN' | 'WEBHOOK' | 'CRON';

export interface LogActivityInput {
  actor: ActivityActor;
  action: ActivityAction;
  resource?: string;
  shopId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

/** Actions the client (merchant app) is allowed to log via POST /api/activity */
export const CLIENT_ALLOWED_ACTIONS: ActivityAction[] = [
  'PAGE_OPENED',
  'PAGE_REFRESHED',
  'BUTTON_CLICK',
  'LINK_CLICK',
  'SETTINGS_CHANGE',
  'REQUEST_SUCCESS',
  'REQUEST_ERROR',
];

/**
 * Log request outcome (success or error) so Activity Log shows every action result.
 * Call from route actions: on success after the domain log (e.g. MODULE_PUBLISHED), or in catch for errors.
 */
export async function logRequestOutcome(params: {
  shopId: string | undefined;
  pathOrIntent: string;
  success: boolean;
  details?: Record<string, unknown>;
}): Promise<void> {
  const activity = new ActivityLogService();
  await activity
    .log({
      actor: 'MERCHANT',
      action: params.success ? 'REQUEST_SUCCESS' : 'REQUEST_ERROR',
      resource: params.pathOrIntent,
      shopId: params.shopId,
      details: applyTelemetryBudget({ outcome: params.success ? 'success' : 'error', ...params.details }),
    })
    .catch(() => {});
}

export class ActivityLogService {
  async log(input: LogActivityInput): Promise<void> {
    const prisma = getPrisma();
    const ctx = getRequestContext();
    await prisma.activityLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        resource: input.resource,
        shopId: input.shopId,
        details: input.details ? JSON.stringify(input.details) : null,
        ip: input.ip,
        requestId: ctx?.requestId ?? null,
        correlationId: ctx?.correlationId ?? ctx?.requestId ?? null,
      },
    });
  }

  async list(opts: {
    take?: number;
    actor?: string;
    action?: string;
    shopId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    search?: string;
    cursorId?: string;
    correlationId?: string;
  } = {}) {
    const prisma = getPrisma();
    const where: Prisma.ActivityLogWhereInput = {};

    if (opts.actor) where.actor = opts.actor;
    if (opts.action) where.action = opts.action;
    if (opts.shopId) where.shopId = opts.shopId;
    if (opts.correlationId) where.correlationId = opts.correlationId;
    if (opts.dateFrom || opts.dateTo) {
      where.createdAt = {
        ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
        ...(opts.dateTo ? { lte: opts.dateTo } : {}),
      };
    }
    if (opts.search) {
      where.OR = [
        { action: { contains: opts.search } },
        { resource: { contains: opts.search } },
        { details: { contains: opts.search } },
      ];
    }

    return prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.take ?? 200,
      ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
      include: { shop: true },
    });
  }

  async getDistinctActions(): Promise<string[]> {
    const prisma = getPrisma();
    const rows = await prisma.activityLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' },
    });
    return rows.map(r => r.action);
  }

  async getById(id: string) {
    const prisma = getPrisma();
    return prisma.activityLog.findUnique({
      where: { id },
      include: { shop: true },
    });
  }
}
