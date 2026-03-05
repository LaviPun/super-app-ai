import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Data store operations.
 *
 * GET  /api/agent/data-stores                  → list all data stores with record counts
 * POST /api/agent/data-stores                  → perform an operation:
 *   { intent: 'enable',        key: string }
 *   { intent: 'disable',       key: string }
 *   { intent: 'create-custom', key, label, description? }
 *   { intent: 'delete-store',  storeId: string }
 *   { intent: 'add-record',    storeKey, title?, externalId?, payload }
 *   { intent: 'update-record', storeKey, recordId, title?, externalId?, payload? }
 *   { intent: 'delete-record', storeKey, recordId }
 */
export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return json({ ok: true, stores: [] });

  const svc = new DataStoreService();
  const stores = await svc.listStores(shop.id);
  return json({ ok: true, stores });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Invalid body' }, { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const intent = String(body.intent ?? '');
  const svc = new DataStoreService();
  const activity = new ActivityLogService();

  if (intent === 'enable') {
    const key = String(body.key ?? '');
    if (!key) return json({ error: 'Missing key' }, { status: 400 });
    await svc.enableStore(shopRow.id, key);
    await activity.log({ actor: 'SYSTEM', action: 'DATA_STORE_ENABLED', shopId: shopRow.id, details: { key, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, intent, key });
  }

  if (intent === 'disable') {
    const key = String(body.key ?? '');
    if (!key) return json({ error: 'Missing key' }, { status: 400 });
    await svc.disableStore(shopRow.id, key);
    await activity.log({ actor: 'SYSTEM', action: 'DATA_STORE_DISABLED', shopId: shopRow.id, details: { key, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, intent, key });
  }

  if (intent === 'create-custom') {
    const key = String(body.key ?? '').trim();
    const label = String(body.label ?? '').trim();
    if (!key || !label) return json({ error: 'key and label are required' }, { status: 400 });
    const store = await svc.createCustomStore(shopRow.id, key, label, body.description ? String(body.description) : undefined);
    await activity.log({ actor: 'SYSTEM', action: 'DATA_STORE_ENABLED', shopId: shopRow.id, details: { key, label, custom: true, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, intent, storeId: store.id, key: store.key });
  }

  if (intent === 'delete-store') {
    const storeId = String(body.storeId ?? '');
    if (!storeId) return json({ error: 'Missing storeId' }, { status: 400 });
    try {
      await svc.deleteStore(shopRow.id, storeId);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Delete failed' }, { status: 404 });
    }
    await activity.log({ actor: 'SYSTEM', action: 'DATA_STORE_DISABLED', shopId: shopRow.id, details: { storeId, deleted: true, source: 'agent_api' } }).catch(() => {});
    return json({ ok: true, intent, storeId, deleted: true });
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
    return json({ ok: true, intent, recordId: record.id });
  }

  if (intent === 'update-record') {
    const storeKey = String(body.storeKey ?? '');
    const recordId = String(body.recordId ?? '');
    if (!storeKey || !recordId) return json({ error: 'storeKey and recordId are required' }, { status: 400 });
    const store = await svc.getStoreByKey(shopRow.id, storeKey);
    if (!store) return json({ error: 'Store not found' }, { status: 404 });
    await svc.updateRecord(recordId, store.id, {
      title: body.title !== undefined ? String(body.title) : undefined,
      externalId: body.externalId !== undefined ? String(body.externalId) : undefined,
      payload: body.payload,
    });
    return json({ ok: true, intent, recordId });
  }

  if (intent === 'delete-record') {
    const storeKey = String(body.storeKey ?? '');
    const recordId = String(body.recordId ?? '');
    if (!storeKey || !recordId) return json({ error: 'storeKey and recordId are required' }, { status: 400 });
    const store = await svc.getStoreByKey(shopRow.id, storeKey);
    if (!store) return json({ error: 'Store not found' }, { status: 404 });
    await svc.deleteRecord(recordId, store.id);
    return json({ ok: true, intent, recordId, deleted: true });
  }

  return json({ error: `Unknown intent: ${intent}. Valid: enable, disable, create-custom, delete-store, add-record, update-record, delete-record` }, { status: 400 });
}
