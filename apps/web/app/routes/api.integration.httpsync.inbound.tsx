import { json } from '@remix-run/node';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { DataStoreService } from '~/services/data/data-store.service';
import { provisionModuleDataStore } from '~/services/publish/provision-data-store.server';
import {
  verifyHttpSyncSignature,
  HTTP_SYNC_SIGNATURE_HEADER,
  HTTP_SYNC_SHOP_HEADER,
  HTTP_SYNC_TIMESTAMP_HEADER,
} from '~/services/integration/http-sync-signature.server';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';

/**
 * POST /api/integration/httpsync/inbound  (build #7a — the "connected service → store"
 * inbound reconciliation leg of integration.httpSync).
 *
 * The merchant's connected tool (or a party holding the shared secret) POSTs data back
 * to the app; we verify the SuperApp signature (same HMAC scheme we sign outbound with,
 * so only a holder of the per-shop secret can write) and record the payload into the
 * module's typed data store — reusing the SAME provisionModuleDataStore path publish
 * uses, so the inbound store and the module-declared store never drift.
 *
 * The body must carry `moduleId` (which PUBLISHED integration.httpSync module this
 * reconciles) plus a `data` object (the record payload). Headers:
 *   X-SuperApp-Shop / X-SuperApp-Signature / X-SuperApp-Timestamp — the signature is
 *   over `timestamp.rawBody`, so it covers the exact bytes including moduleId + data.
 *
 * Honest scope: the store must be provisioned (the module declares `spec.dataModel`).
 * A module WITHOUT a declared data store has nowhere to reconcile into — we 422 with a
 * clear reason rather than inventing an untyped store.
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const rawBody = await request.text();
  const shopDomain = request.headers.get(HTTP_SYNC_SHOP_HEADER) ?? '';
  if (!shopDomain) {
    return json({ error: `Missing ${HTTP_SYNC_SHOP_HEADER} header` }, { status: 401 });
  }

  const valid = verifyHttpSyncSignature({
    shopDomain,
    body: rawBody,
    signature: request.headers.get(HTTP_SYNC_SIGNATURE_HEADER),
    timestamp: request.headers.get(HTTP_SYNC_TIMESTAMP_HEADER),
  });
  if (!valid) {
    return json({ error: 'Invalid or stale signature' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const moduleId = typeof body.moduleId === 'string' ? body.moduleId : '';
  if (!moduleId) {
    return json({ error: 'Missing moduleId' }, { status: 400 });
  }
  const data = body.data ?? body;
  const externalId = typeof body.externalId === 'string' ? body.externalId : undefined;
  const title = typeof body.title === 'string' ? body.title : undefined;

  const prisma = getPrisma();
  const mod = await prisma.module.findFirst({
    where: { id: moduleId, shop: { shopDomain }, type: 'integration.httpSync' },
    include: { activeVersion: true, shop: { select: { id: true } } },
  });
  if (!mod || !mod.shop) {
    return json({ error: 'Module not found for this shop' }, { status: 404 });
  }
  if (mod.status !== 'PUBLISHED' || !mod.activeVersion) {
    return json({ error: 'Module is not published' }, { status: 409 });
  }

  let dataModel;
  try {
    const spec = new RecipeService().parse(mod.activeVersion.specJson);
    if (spec.type !== 'integration.httpSync') {
      return json({ error: 'Module is not an integration.httpSync' }, { status: 409 });
    }
    dataModel = spec.dataModel;
  } catch {
    return json({ error: 'Module spec is malformed' }, { status: 422 });
  }

  // Reuse the canonical provisioning path so the inbound store matches the declared one.
  const provisioned = await provisionModuleDataStore(mod.shop.id, mod.id, dataModel);
  if (!provisioned) {
    return json(
      {
        error:
          'This module has no typed data store to reconcile into. Declare a data model on the module to enable inbound sync.',
      },
      { status: 422 },
    );
  }

  try {
    const dss = new DataStoreService();
    const store = await dss.getStoreByKey(mod.shop.id, provisioned.storeKey);
    if (!store) {
      return json({ error: 'Data store not found after provisioning' }, { status: 500 });
    }
    const record = await dss.createRecord(store.id, { externalId, title, payload: data });
    return json({ ok: true, storeKey: provisioned.storeKey, recordId: record.id });
  } catch (err) {
    // A typed-schema validation failure is a 422 (the sender sent an out-of-schema row);
    // anything else is a 500.
    const isValidation = (err as { code?: string } | null)?.code === 'RECORD_VALIDATION_FAILED';
    logger.warn('[httpSync/inbound] failed to record inbound payload', {
      shopDomain,
      moduleId,
      ...safeErrorMeta(err),
    });
    return json(
      { error: err instanceof Error ? err.message : 'Failed to record inbound payload' },
      { status: isValidation ? 422 : 500 },
    );
  }
}
