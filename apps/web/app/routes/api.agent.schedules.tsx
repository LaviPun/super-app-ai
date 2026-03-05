import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ScheduleService } from '~/services/flows/schedule.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Flow schedule operations.
 *
 * GET  /api/agent/schedules   → list all schedules
 * POST /api/agent/schedules   → create / toggle / delete:
 *   { intent: 'create', name, cronExpr, eventJson? }
 *   { intent: 'update', scheduleId, name?, cronExpr?, eventJson? }
 *   { intent: 'toggle', scheduleId, isActive: boolean }
 *   { intent: 'delete', scheduleId }
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: true, schedules: [] });

  const schedules = await new ScheduleService().list(shop.id);
  return json({
    ok: true,
    schedules: schedules.map(s => ({
      id: s.id,
      name: s.name,
      cronExpr: s.cronExpr,
      isActive: s.isActive,
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid body' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const intent = String(body.intent ?? '');
  const svc = new ScheduleService();
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(body.name ?? '').trim();
    const cronExpr = String(body.cronExpr ?? '').trim();
    if (!name || !cronExpr) return json({ error: 'name and cronExpr are required' }, { status: 400 });
    let schedule;
    try {
      schedule = await svc.create({ shopId: shopRow.id, name, cronExpr, eventJson: body.eventJson ? String(body.eventJson) : '{}' });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Create failed' }, { status: 400 });
    }
    await activity.log({ actor: 'SYSTEM', action: 'SCHEDULE_CREATED', shopId: shopRow.id, details: { name, cronExpr, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, scheduleId: schedule.id, name, cronExpr }, { status: 201 });
  }

  if (intent === 'update') {
    const scheduleId = String(body.scheduleId ?? '');
    if (!scheduleId) return json({ error: 'Missing scheduleId' }, { status: 400 });
    const updateData: { name?: string; cronExpr?: string; eventJson?: string } = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.cronExpr !== undefined) updateData.cronExpr = String(body.cronExpr).trim();
    if (body.eventJson !== undefined) updateData.eventJson = String(body.eventJson);
    try {
      await svc.update(scheduleId, shopRow.id, updateData);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Update failed' }, { status: 400 });
    }
    await activity.log({ actor: 'SYSTEM', action: 'SCHEDULE_UPDATED', shopId: shopRow.id, details: { scheduleId, ...updateData, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, scheduleId, updated: true });
  }

  if (intent === 'toggle') {
    const scheduleId = String(body.scheduleId ?? '');
    const isActive = Boolean(body.isActive);
    if (!scheduleId) return json({ error: 'Missing scheduleId' }, { status: 400 });
    await svc.toggle(scheduleId, shopRow.id, isActive);
    await activity.log({ actor: 'SYSTEM', action: 'SCHEDULE_TOGGLED', shopId: shopRow.id, details: { scheduleId, isActive, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, scheduleId, isActive });
  }

  if (intent === 'delete') {
    const scheduleId = String(body.scheduleId ?? '');
    if (!scheduleId) return json({ error: 'Missing scheduleId' }, { status: 400 });
    await svc.remove(scheduleId, shopRow.id);
    await activity.log({ actor: 'SYSTEM', action: 'SCHEDULE_DELETED', shopId: shopRow.id, details: { scheduleId, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, scheduleId, deleted: true });
  }

  return json({ error: `Unknown intent: ${intent}. Valid: create, update, toggle, delete` }, { status: 400 });
}
