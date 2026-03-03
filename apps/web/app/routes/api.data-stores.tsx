import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/data-stores', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
      if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'Invalid body' }, { status: 400 });

      const intent = String(body.intent ?? '');
      const svc = new DataStoreService();

      if (intent === 'enable') {
        const key = String(body.key ?? '');
        if (!key) return json({ error: 'Missing key' }, { status: 400 });
        await svc.enableStore(shopRow.id, key);
        return json({ ok: true });
      }

      if (intent === 'disable') {
        const key = String(body.key ?? '');
        if (!key) return json({ error: 'Missing key' }, { status: 400 });
        await svc.disableStore(shopRow.id, key);
        return json({ ok: true });
      }

      if (intent === 'create-custom') {
        const key = String(body.key ?? '').trim();
        const label = String(body.label ?? '').trim();
        if (!key || !label) return json({ error: 'Key and label required' }, { status: 400 });
        await svc.createCustomStore(shopRow.id, key, label, body.description ? String(body.description) : undefined);
        return json({ ok: true });
      }

      if (intent === 'add-record') {
        const storeKey = String(body.storeKey ?? '');
        const store = await svc.getStoreByKey(shopRow.id, storeKey);
        if (!store) return json({ error: 'Store not found' }, { status: 404 });
        const record = await svc.createRecord(store.id, {
          externalId: body.externalId ? String(body.externalId) : undefined,
          title: body.title ? String(body.title) : undefined,
          payload: body.payload ?? {},
        });
        return json({ ok: true, recordId: record.id });
      }

      if (intent === 'delete-record') {
        const recordId = String(body.recordId ?? '');
        const storeKey = String(body.storeKey ?? '');
        const store = await svc.getStoreByKey(shopRow.id, storeKey);
        if (!store) return json({ error: 'Store not found' }, { status: 404 });
        await svc.deleteRecord(recordId, store.id);
        return json({ ok: true });
      }

      return json({ error: 'Unknown intent' }, { status: 400 });
    },
  );
}
