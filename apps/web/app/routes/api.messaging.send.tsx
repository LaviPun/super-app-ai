/**
 * Admin action for the messaging surface (R3.4): "Send now" / "Send test".
 * Mirrors api.flow.run.tsx — PUBLISHED-guarded by MessagingRunnerService.runCampaignById.
 *
 * Body:
 *   { moduleId: string, mode?: 'now' | 'test', testRecipient?: string, event?: object }
 *   - mode:'test' forces a single literal recipient (testRecipient, defaults to the
 *     current session's email context) with batchSize:1 and consent off, so a test
 *     never blasts the real list.
 */
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { MessagingRunnerService } from '~/services/messaging/messaging-runner.service';

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  await enforceRateLimit(`messaging:send:${session.shop}`);

  const body = (await request.json().catch(() => null)) as {
    moduleId?: string;
    mode?: string;
    testRecipient?: string;
    event?: Record<string, unknown>;
  } | null;

  const moduleId = body?.moduleId;
  if (!moduleId) {
    return json({ ok: false, error: 'moduleId is required' }, { status: 400 });
  }

  const isTest = body?.mode === 'test';
  const testRecipient = isTest ? (body?.testRecipient || undefined) : undefined;
  if (isTest && !testRecipient) {
    return json({ ok: false, error: 'testRecipient is required for a test send' }, { status: 400 });
  }

  const event = body?.event ?? { kind: isTest ? 'test' : 'manual' };

  const runner = new MessagingRunnerService();
  try {
    const result = await runner.runCampaignById(session.shop, admin, moduleId, event, {
      trigger: 'MANUAL',
      testRecipient,
    });
    return json({ ok: true, result });
  } catch (err) {
    // PUBLISHED-guard / channel-gate / not-found surface as a 400 with the message.
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
