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

  async update(scheduleId: string, shopId: string, data: { name?: string; cronExpr?: string; eventJson?: string }) {
    if (data.cronExpr) validateCronExpr(data.cronExpr);
    const prisma = getPrisma();
    const existing = await prisma.flowSchedule.findFirst({ where: { id: scheduleId, shopId } });
    if (!existing) throw new Error('Schedule not found');
    const cronExpr = data.cronExpr ?? existing.cronExpr;
    const nextRunAt = existing.isActive ? computeNextRun(cronExpr) : existing.nextRunAt;
    return prisma.flowSchedule.updateMany({
      where: { id: scheduleId, shopId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.cronExpr !== undefined ? { cronExpr: data.cronExpr } : {}),
        ...(data.eventJson !== undefined ? { eventJson: data.eventJson } : {}),
        nextRunAt,
      },
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

    // Compare-and-swap claim: only the tick that advances nextRunAt from the
    // value it read owns the run — a concurrent cron tick loses the swap and
    // skips the schedule instead of double-running it.
    const claimed: typeof due = [];
    for (const s of due) {
      const next = computeNextRun(s.cronExpr);
      const res = await prisma.flowSchedule.updateMany({
        where: { id: s.id, isActive: true, nextRunAt: s.nextRunAt },
        data: { lastRunAt: now, nextRunAt: next },
      });
      if (res.count === 1) claimed.push(s);
    }

    return claimed.map(s => ({
      id: s.id,
      shopId: s.shopId,
      shopDomain: s.shop.shopDomain,
      eventJson: s.eventJson,
    }));
  }
}

/**
 * Next-run computation for standard 5-field cron expressions (UTC):
 *   minute  hour  day-of-month  month  day-of-week
 * Supports `*`, numbers, lists (`1,15`), ranges (`1-5`), and steps (`*​/15`, `1-5/2`).
 * Standard cron day semantics: when BOTH dom and dow are restricted, a day
 * matches if EITHER matches. Returns the next Date ≥ (now + 1 minute).
 */
type CronField = { any: boolean; values: Set<number> };

function parseCronField(field: string, min: number, max: number, label: string): CronField {
  if (field === '*') return { any: true, values: new Set() };
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart = '', stepPart] = part.split('/');
    const step = stepPart !== undefined ? parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid ${label} step in cron field "${field}"`);
    let lo: number;
    let hi: number;
    if (rangePart === '*' || rangePart === '') {
      lo = min; hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      lo = parseInt(a ?? '', 10); hi = parseInt(b ?? '', 10);
    } else {
      lo = parseInt(rangePart, 10);
      hi = stepPart !== undefined ? max : lo; // Vixie "5/15" = every 15 starting at 5
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid ${label} value in cron field "${field}" (expected ${min}-${max})`);
    }
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return { any: false, values };
}

function parseCronExpr(expr: string) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields (minute hour dom month dow), got: "${expr}"`);
  }
  const dow = parseCronField(parts[4]!, 0, 7, 'day-of-week');
  if (dow.values.has(7)) { dow.values.delete(7); dow.values.add(0); } // 7 ≡ Sunday
  return {
    minute: parseCronField(parts[0]!, 0, 59, 'minute'),
    hour: parseCronField(parts[1]!, 0, 23, 'hour'),
    dom: parseCronField(parts[2]!, 1, 31, 'day-of-month'),
    month: parseCronField(parts[3]!, 1, 12, 'month'),
    dow,
  };
}

function computeNextRun(expr: string): Date {
  const f = parseCronExpr(expr);
  const matchesDay = (d: Date): boolean => {
    if (!f.month.any && !f.month.values.has(d.getUTCMonth() + 1)) return false;
    const domMatch = f.dom.any || f.dom.values.has(d.getUTCDate());
    const dowMatch = f.dow.any || f.dow.values.has(d.getUTCDay());
    // Standard cron: both restricted ⇒ OR; otherwise the restricted one decides.
    if (!f.dom.any && !f.dow.any) return domMatch || dowMatch;
    return domMatch && dowMatch;
  };

  const MINUTE = 60_000;
  let t = Math.floor((Date.now() + MINUTE) / MINUTE) * MINUTE; // next whole minute
  // Scan up to 366 days; skip whole non-matching days to keep this fast.
  const limit = t + 366 * 24 * 3600_000;
  while (t < limit) {
    const d = new Date(t);
    if (!matchesDay(d)) {
      const nextDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      t = nextDay;
      continue;
    }
    if (!f.hour.any && !f.hour.values.has(d.getUTCHours())) {
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
      continue;
    }
    if (f.minute.any || f.minute.values.has(d.getUTCMinutes())) return d;
    t += MINUTE;
  }
  throw new Error(`Cron expression "${expr}" never matches within a year`);
}

function validateCronExpr(expr: string) {
  parseCronExpr(expr); // throws with a precise message on any invalid field
}
