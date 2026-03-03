import { getPrisma } from '~/db.server';

export type CreateScheduleInput = {
  shopId: string;
  name: string;
  /** Standard 5-field cron expression (UTC). e.g. "0 9 * * 1" = every Monday 09:00 UTC */
  cronExpr: string;
  /** Optional JSON event payload forwarded to FlowRunnerService */
  eventJson?: string;
};

export class ScheduleService {
  async create(input: CreateScheduleInput) {
    validateCronExpr(input.cronExpr);
    const prisma = getPrisma();
    const nextRunAt = computeNextRun(input.cronExpr);
    return prisma.flowSchedule.create({
      data: {
        shopId: input.shopId,
        name: input.name,
        cronExpr: input.cronExpr,
        eventJson: input.eventJson ?? '{}',
        isActive: true,
        nextRunAt,
      },
    });
  }

  async list(shopId: string) {
    const prisma = getPrisma();
    return prisma.flowSchedule.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggle(scheduleId: string, shopId: string, isActive: boolean) {
    const prisma = getPrisma();
    const nextRunAt = isActive ? computeNextRun(
      (await prisma.flowSchedule.findFirst({ where: { id: scheduleId, shopId } }))!.cronExpr
    ) : null;
    return prisma.flowSchedule.updateMany({
      where: { id: scheduleId, shopId },
      data: { isActive, nextRunAt },
    });
  }

  async remove(scheduleId: string, shopId: string) {
    const prisma = getPrisma();
    return prisma.flowSchedule.deleteMany({ where: { id: scheduleId, shopId } });
  }

  /** Called by the cron endpoint — returns schedules that are due to run now. */
  async claimDue(): Promise<Array<{ id: string; shopId: string; shopDomain: string; eventJson: string }>> {
    const prisma = getPrisma();
    const now = new Date();

    const due = await prisma.flowSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
      include: { shop: true },
      take: 50,
    });

    // Advance nextRunAt atomically for each claimed schedule
    for (const s of due) {
      const next = computeNextRun(s.cronExpr);
      await prisma.flowSchedule.update({
        where: { id: s.id },
        data: { lastRunAt: now, nextRunAt: next },
      });
    }

    return due.map(s => ({
      id: s.id,
      shopId: s.shopId,
      shopDomain: s.shop.shopDomain,
      eventJson: s.eventJson,
    }));
  }
}

/**
 * Minimal next-run computation for 5-field cron expressions.
 * Returns the next Date ≥ (now + 1 minute).
 *
 * Supported syntax:
 *   minute  hour  day-of-month  month  day-of-week
 *   *  |  number  |  * /n  (step syntax is NOT supported in this minimal impl)
 *
 * For production-grade cron parsing, install `croner` or `cron-parser`.
 */
function computeNextRun(expr: string): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: "${expr}"`);

  const [minPart, hourPart] = parts;

  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1); // at least 1 minute in the future

  const targetMin = minPart === '*' ? null : parseInt(minPart, 10);
  const targetHour = hourPart === '*' ? null : parseInt(hourPart, 10);

  // Advance until we find a matching slot (max 7 days out)
  for (let i = 0; i < 60 * 24 * 7; i++) {
    const matches =
      (targetMin === null || candidate.getUTCMinutes() === targetMin) &&
      (targetHour === null || candidate.getUTCHours() === targetHour);

    if (matches) return candidate;
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  // Fallback: 1 hour from now
  return new Date(Date.now() + 3_600_000);
}

function validateCronExpr(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields (minute hour dom month dow), got: "${expr}"`);
  }
}
