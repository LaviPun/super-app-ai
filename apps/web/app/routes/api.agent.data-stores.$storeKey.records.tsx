import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { getPrisma } from '~/db.server';

/**
 * Agent API: DataStoreRecord list.
 *
 * GET /api/agent/data-stores/:storeKey/records?limit=50&offset=0
 *   → list records for a data store with pagination
 *
 * Returns: { ok, storeKey, storeId, label, total, records[], pagination }
 * READ-ONLY.
 */
export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { storeKey?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const storeKey = params.storeKey;
  if (!storeKey) return json({ error: 'Missing storeKey' }, { status: 400 });

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ ok: true, storeKey, total: 0, records: [] });

  const svc = new DataStoreService();
  const result = await svc.listRecords(shopRow.id, storeKey, { limit, offset });
  if (!result) return json({ error: 'Store not found' }, { status: 404 });

  return json({
    ok: true,
    storeKey: result.storeKey,
    storeId: result.storeId,
    label: result.label,
    total: result.total,
    records: result.records,
    pagination: { limit, offset, hasMore: offset + limit < result.total },
  });
}
