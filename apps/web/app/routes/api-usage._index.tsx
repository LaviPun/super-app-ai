import { json } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { RateLimitService } from '~/services/shopify/rate-limit.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { StatTile, KV, Progress, EmptyState, fmtNum } from '~/components/merchant/polaris';

/**
 * Shopify Admin API usage — the live rate-limit threshold for this shop, captured
 * from `extensions.cost.throttleStatus` on every tracked Admin call. 100% real data:
 * renders an empty state until the first call is recorded — never fabricated numbers.
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ snapshot: null, throttled7d: 0, utilization: null });

  const snapshot = await new RateLimitService().getByShopId(shop.id);

  // Real recent-failure signal: flow runs that hit the dead-letter queue (throttle or otherwise).
  const throttled7d = await prisma.flowDeadLetter.count({
    where: { shopId: shop.id, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
  });

  return json({
    // Computed server-side: RateLimitService pulls in db.server, which must not
    // reach the client bundle via component code.
    utilization: snapshot ? RateLimitService.utilization(snapshot) : null,
    snapshot: snapshot
      ? {
          currentlyAvailable: snapshot.currentlyAvailable,
          maximumAvailable: snapshot.maximumAvailable,
          restoreRate: snapshot.restoreRate,
          lastQueryCost: snapshot.lastQueryCost,
          totalCalls: snapshot.totalCalls,
          throttledCount: snapshot.throttledCount,
          updatedAt: snapshot.updatedAt.toISOString(),
        }
      : null,
    throttled7d,
  });
}

export default function ApiUsageIndex() {
  const { snapshot, throttled7d, utilization } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();

  // Bucket refills continuously — refresh the live view periodically.
  useEffect(() => {
    const t = setInterval(revalidate, 15_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(t); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  const util = utilization;
  const utilPct = util != null ? Math.round(util * 100) : null;
  const utilTone = utilPct == null ? undefined : utilPct >= 80 ? ('critical' as const) : utilPct >= 50 ? ('warning' as const) : undefined;

  return (
    <MerchantShell polaris>
      <s-page heading="API usage" inlineSize="base">
        <s-paragraph color="subdued">
          Live Shopify Admin API rate limit for your store, captured from every automation call. Updates every few seconds.
        </s-paragraph>
        {!snapshot ? (
          <s-section>
            <EmptyState icon="chart-line" heading="No Admin API calls recorded yet">
              Run a flow that calls Shopify (tag an order, route an order, adjust inventory…) and the
              live rate-limit threshold will appear here.
            </EmptyState>
          </s-section>
        ) : (
          <s-stack gap="base">
            <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
              <StatTile
                label="Available now"
                value={snapshot.currentlyAvailable != null ? fmtNum(Math.round(snapshot.currentlyAvailable)) : '—'}
                sub={snapshot.maximumAvailable != null ? `of ${fmtNum(Math.round(snapshot.maximumAvailable))} points` : undefined}
              />
              <StatTile
                label="Utilization"
                value={utilPct != null ? `${utilPct}%` : '—'}
                sub={<Progress value={utilPct ?? 0} tone={utilTone} />}
              />
              <StatTile
                label="Restore rate"
                value={snapshot.restoreRate != null ? `${fmtNum(Math.round(snapshot.restoreRate))}/s` : '—'}
                sub="points restored per second"
              />
              <StatTile
                label="Throttled (429s)"
                value={fmtNum(snapshot.throttledCount)}
                sub={snapshot.throttledCount > 0 ? 'throttling observed' : 'no throttling'}
              />
            </s-grid>
            <s-section heading="Details">
              <KV
                rows={[
                  ['Last query cost', snapshot.lastQueryCost != null ? `${snapshot.lastQueryCost} points` : '—'],
                  ['Total tracked calls', fmtNum(snapshot.totalCalls)],
                  ['Flow failures (dead-lettered, 7d)', fmtNum(throttled7d)],
                  ['Last updated', new Date(snapshot.updatedAt).toLocaleString('en-US')],
                ]}
              />
            </s-section>
          </s-stack>
        )}
      </s-page>
    </MerchantShell>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
