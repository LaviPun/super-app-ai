import { json } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import { useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { RateLimitService } from '~/services/shopify/rate-limit.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { Card, PageHead, StatTile, fmtNum } from '~/components/superapp';

/**
 * Shopify Admin API usage — the live rate-limit threshold for this shop, captured
 * from `extensions.cost.throttleStatus` on every tracked Admin call. 100% real data:
 * renders an empty state until the first call is recorded — never fabricated numbers.
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ snapshot: null, throttled7d: 0 });

  const snapshot = await new RateLimitService().getByShopId(shop.id);

  // Real recent-failure signal: flow runs that hit the dead-letter queue (throttle or otherwise).
  const throttled7d = await prisma.flowDeadLetter.count({
    where: { shopId: shop.id, createdAt: { gte: new Date(Date.now() - 7 * 864e5) } },
  });

  return json({
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
  const { snapshot, throttled7d } = useLoaderData<typeof loader>();
  const { revalidate } = useRevalidator();

  // Bucket refills continuously — refresh the live view periodically.
  useEffect(() => {
    const t = setInterval(revalidate, 15_000);
    window.addEventListener('focus', revalidate);
    return () => { clearInterval(t); window.removeEventListener('focus', revalidate); };
  }, [revalidate]);

  const util = snapshot ? RateLimitService.utilization(snapshot) : null;
  const utilPct = util != null ? Math.round(util * 100) : null;
  const tone = utilPct == null ? 'info' : utilPct >= 80 ? 'critical' : utilPct >= 50 ? 'warning' : 'success';

  return (
    <MerchantShell>
      <div className="page">
        <PageHead
          title="API usage"
          sub="Live Shopify Admin API rate limit for your store, captured from every automation call. Updates every few seconds."
        />
        {!snapshot ? (
          <Card>
            <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>
              No Admin API calls recorded yet. Run a flow that calls Shopify (tag an order, route an
              order, adjust inventory…) and the live rate-limit threshold will appear here.
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-4" style={{ marginBottom: 18 }}>
              <StatTile
                label="Available now"
                value={snapshot.currentlyAvailable != null ? fmtNum(Math.round(snapshot.currentlyAvailable)) : '—'}
                sub={snapshot.maximumAvailable != null ? `of ${fmtNum(Math.round(snapshot.maximumAvailable))} points` : undefined}
                icon="bolt"
                tone={tone}
              />
              <StatTile
                label="Utilization"
                value={utilPct != null ? `${utilPct}%` : '—'}
                icon="chart"
                tone={tone}
              />
              <StatTile
                label="Restore rate"
                value={snapshot.restoreRate != null ? `${fmtNum(Math.round(snapshot.restoreRate))}/s` : '—'}
                icon="refresh"
                tone="info"
              />
              <StatTile
                label="Throttled (429s)"
                value={fmtNum(snapshot.throttledCount)}
                icon="clock"
                tone={snapshot.throttledCount > 0 ? 'warning' : 'success'}
              />
            </div>
            <Card>
              <div style={{ padding: 18, display: 'grid', gap: 10, fontSize: 14 }}>
                <Row label="Last query cost" value={snapshot.lastQueryCost != null ? `${snapshot.lastQueryCost} points` : '—'} />
                <Row label="Total tracked calls" value={fmtNum(snapshot.totalCalls)} />
                <Row label="Flow failures (dead-lettered, 7d)" value={fmtNum(throttled7d)} />
                <Row label="Last updated" value={new Date(snapshot.updatedAt).toLocaleString('en-US')} />
              </div>
            </Card>
          </>
        )}
      </div>
    </MerchantShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: 'var(--p-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
