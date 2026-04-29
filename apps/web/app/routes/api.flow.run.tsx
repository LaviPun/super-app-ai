import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  enforceRateLimit(`flow:run:${session.shop}`);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const event = (body?.event as Record<string, unknown>) ?? { kind: 'manual' };

  const runner = new FlowRunnerService();
  await runner.runForTrigger(session.shop, admin, 'MANUAL', event);

  return json({ ok: true });
}
