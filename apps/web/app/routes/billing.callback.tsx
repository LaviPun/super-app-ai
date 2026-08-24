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
  const url = new URL(request.url);
  const planHandle = url.searchParams.get('plan_handle');
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

  // The welcome link is a top-level document navigation (not a fetch), so
  // this redirect is followed by the bare browser — any embedded/session
  // params dropped here are gone. shopify.authenticate.admin on the next
  // hit requires shop/host/embedded/id_token to be present or it throws its
  // own redirect to /auth/login, dead-ending the merchant right after they
  // paid. Carry every incoming param forward EXCEPT plan_handle, which is a
  // callback-only hint (already consumed above; re-sending it would just
  // shadow the next sync's Partner API source of truth).
  const dest = new URLSearchParams(url.searchParams);
  dest.delete('plan_handle');
  const qs = dest.toString();
  return redirect(qs ? `/billing?${qs}` : '/billing');
}
