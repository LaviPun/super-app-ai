/**
 * CSV export for a data store. GET /data/:storeKey/export → text/csv download.
 * Resource route (trailing underscore on $storeKey opts out of page nesting).
 */
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { recordsToCsv } from '~/services/data/export.service';
import { parseDataModel } from '@superapp/core';

export async function loader({ request, params }: { request: Request; params: { storeKey?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const storeKey = params.storeKey;
  if (!storeKey) throw new Response('Missing storeKey', { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const svc = new DataStoreService();
  const store = await svc.getStoreByKey(shopRow.id, storeKey);
  if (!store) throw new Response('Store not found', { status: 404 });

  // Export every record, not just the first page. Pages of 500, hard cap of
  // 200 pages (100k records) as a runaway guard.
  const pageSize = 500;
  const allRecords: Awaited<ReturnType<DataStoreService['listRecordsByDataStoreId']>>['records'] = [];
  for (let page = 1; page <= 200; page++) {
    const result = await svc.listRecordsByDataStoreId(store.id, { page, pageSize });
    allRecords.push(...result.records);
    if (result.records.length < pageSize || allRecords.length >= result.total) break;
  }
  const model = parseDataModel((store as { schemaJson?: string | null }).schemaJson ?? null);
  const csv = recordsToCsv(
    allRecords.map((r) => ({
      title: r.title,
      externalId: r.externalId,
      createdAt: r.createdAt.toISOString(),
      payload: r.payload,
    })),
    model,
  );

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${storeKey}-export.csv"`,
    },
  });
}
