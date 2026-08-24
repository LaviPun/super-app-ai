import { redirect } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { PlanSyncService } from '~/services/billing/plan-sync.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

/**
 * App Pricing welcome link (configured per-plan in the Partner Dashboard as
 * the relative path "/billing/callback"). Shopify appends ?plan_handle=…
 * after the merchant approves a charge. The param is a HINT ONLY — the plan
 * of record is re-fetched from the Partner API, so a forged URL cannot
 * grant quota. A failed sync never strands the merchant: the cron sweep in
 * api.cron.tsx reconciles within a tick.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const planHandle = new URL(request.url).searchParams.get('plan_handle');
  try {
    const { plan } = await new PlanSyncService().syncShop(session.shop);
    logger.info('[billing.callback] plan synced', { shopDomain: session.shop, plan, planHandle });
  } catch (err) {
    logger.error('[billing.callback] plan sync failed — deferring to cron reconcile', {
      shopDomain: session.shop,
      planHandle,
      ...safeErrorMeta(err),
    });
  }
  return redirect('/billing');
}
