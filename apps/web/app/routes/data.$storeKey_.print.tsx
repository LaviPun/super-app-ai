/**
 * Print/PDF view for a data store. GET /data/:storeKey/print → printable HTML.
 * Browser "Print → Save as PDF" produces the PDF (no heavy server-side PDF dep).
 */
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { recordsToPrintHtml } from '~/services/data/export.service';
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

  const result = await svc.listRecordsByDataStoreId(store.id, { page: 1, pageSize: 200 });
  const model = parseDataModel((store as { schemaJson?: string | null }).schemaJson ?? null);
  const html = recordsToPrintHtml({
    title: store.label,
    subtitle: `${result.total} record(s) · ${storeKey}`,
    records: result.records.map((r) => ({
      title: r.title,
      externalId: r.externalId,
      createdAt: r.createdAt.toISOString(),
      payload: r.payload,
    })),
    model,
  });

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
