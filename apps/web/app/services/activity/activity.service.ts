import { getPrisma } from '~/db.server';

export type ActivityAction =
  | 'MODULE_CREATED'
  | 'MODULE_PUBLISHED'
  | 'MODULE_ROLLED_BACK'
  | 'MODULE_STYLE_UPDATED'
  | 'CONNECTOR_CREATED'
  | 'CONNECTOR_DELETED'
  | 'CONNECTOR_TESTED'
  | 'SCHEDULE_CREATED'
  | 'SCHEDULE_DELETED'
  | 'SCHEDULE_TOGGLED'
  | 'BILLING_PLAN_CHANGED'
  | 'AI_GENERATION'
  | 'THEME_ANALYZED'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PROVIDER_CREATED'
  | 'PROVIDER_ACTIVATED'
  | 'PRICE_ADDED'
  | 'STORE_SETTINGS_UPDATED'
  | 'FLOW_RUN'
  | 'WEBHOOK_PROCESSED';

export type ActivityActor = 'SYSTEM' | 'MERCHANT' | 'INTERNAL_ADMIN' | 'WEBHOOK' | 'CRON';

export interface LogActivityInput {
  actor: ActivityActor;
  action: ActivityAction;
  resource?: string;
  shopId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

export class ActivityLogService {
  async log(input: LogActivityInput): Promise<void> {
    const prisma = getPrisma();
    await prisma.activityLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        resource: input.resource,
        shopId: input.shopId,
        details: input.details ? JSON.stringify(input.details) : null,
        ip: input.ip,
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
  } = {}) {
    const prisma = getPrisma();
    const where: Record<string, unknown> = {};

    if (opts.actor) where.actor = opts.actor;
    if (opts.action) where.action = opts.action;
    if (opts.shopId) where.shopId = opts.shopId;
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
      where: where as any,
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 200,
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
}
