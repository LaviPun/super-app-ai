import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Flow operations.
 *
 * GET  /api/agent/flows                → list flow.automation modules
 * POST /api/agent/flows                → run flows manually for a trigger:
 *   { intent: 'run', trigger: string, payload?: Record<string, unknown> }
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: true, flows: [] });

  const flows = await prisma.module.findMany({
    where: { shopId: shop.id, type: 'flow.automation' },
    orderBy: { updatedAt: 'desc' },
    include: { activeVersion: true },
  });

  return json({
    ok: true,
    flows: flows.map(f => ({
      id: f.id,
      name: f.name,
      status: f.status,
      activeVersion: f.activeVersion?.version ?? null,
      updatedAt: f.updatedAt.toISOString(),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as { intent?: string; trigger?: string; payload?: Record<string, unknown> } | null;
  if (!body) return json({ error: 'Invalid body' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const intent = String(body.intent ?? 'run');

  if (intent === 'run') {
    const trigger = String(body.trigger ?? 'MANUAL');
    const payload = body.payload ?? {};

    const runner = new FlowRunnerService();
    const jobIds: string[] = [];
    try {
      await runner.runForTrigger(
        session.shop,
        admin,
        trigger as Parameters<FlowRunnerService['runForTrigger']>[2],
        payload
      );
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Run failed' }, { status: 500 });
    }

    await new ActivityLogService().log({
      actor: 'SYSTEM',
      action: 'FLOW_RUN',
      shopId: shopRow.id,
      details: { trigger, jobCount: jobIds.length, source: 'agent_api' },
    }).catch(() => {/* non-fatal */});

    return json({ ok: true, trigger });
  }

  return json({ error: `Unknown intent: ${intent}. Valid: run` }, { status: 400 });
}
