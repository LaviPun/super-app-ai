/**
 * Cron trigger endpoint — called periodically by an external scheduler
 * (e.g. Shopify Partner cron, GitHub Actions, Railway cron, or any HTTP cron service).
 *
 * Protection: requires `X-Cron-Secret` header matching CRON_SECRET env var.
 * If CRON_SECRET is not set, the endpoint is disabled.
 *
 * Fires all FlowSchedule records whose nextRunAt ≤ now.
 */
import { json } from '@remix-run/node';
import type { AdminApiContext } from '~/types/shopify';
import { ScheduleService } from '~/services/flows/schedule.service';
import { FlowRunnerService } from '~/services/flows/flow-runner.service';

export async function loader({ request }: { request: Request }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-cron-secret');
  if (provided !== secret) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scheduleService = new ScheduleService();
  const runner = new FlowRunnerService();

  const due = await scheduleService.claimDue();

  const results: Array<{ scheduleId: string; shopDomain: string; ok: boolean; error?: string }> = [];

  for (const item of due) {
    let event: unknown = { kind: 'schedule', scheduleId: item.id };
    try {
      event = { ...JSON.parse(item.eventJson), kind: 'schedule', scheduleId: item.id };
    } catch { /* keep default */ }

    try {
      // FlowRunnerService requires an admin context for Shopify API calls.
      // For scheduled runs we pass a minimal stub — steps using Shopify APIs
      // will fail gracefully and get retried; purely connector/HTTP steps work fine.
      await runner.runForTrigger(item.shopDomain, null as unknown as AdminApiContext['admin'], 'SCHEDULED', event);
      results.push({ scheduleId: item.id, shopDomain: item.shopDomain, ok: true });
    } catch (err) {
      results.push({ scheduleId: item.id, shopDomain: item.shopDomain, ok: false, error: String(err) });
    }
  }

  return json({ ran: results.length, results });
}
