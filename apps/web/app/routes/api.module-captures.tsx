import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { ModuleCaptureService } from '~/services/data/module-capture.service';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  return withApiLogging(
    {
      actor: 'MERCHANT',
      method: request.method,
      path: '/api/module-captures',
      request,
      // Capture payload can include customer PII; do not mirror full body in logs.
      captureRequestBody: false,
      captureResponseBody: true,
    },
    async () => {
      const prisma = getPrisma();
      const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
      if (!shop) return json({ error: 'Shop not found' }, { status: 404 });

      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });

      const moduleId = String(body.moduleId ?? '').trim();
      const captureType = String(body.captureType ?? '').trim();
      if (!moduleId) return json({ error: 'moduleId is required' }, { status: 400 });
      if (!captureType) return json({ error: 'captureType is required' }, { status: 400 });

      const svc = new ModuleCaptureService();
      const result = await svc.capture({
        shopId: shop.id,
        moduleId,
        captureType,
        payload: asRecord(body.payload),
        payloadSchemaVersion: body.payloadSchemaVersion ? String(body.payloadSchemaVersion) : undefined,
        piiFlags: body.piiFlags ? asRecord(body.piiFlags) : undefined,
        instanceId: body.instanceId ? String(body.instanceId) : undefined,
        storeKey: body.storeKey ? String(body.storeKey) : undefined,
        storeRecordTitle: body.storeRecordTitle ? String(body.storeRecordTitle) : undefined,
        externalId: body.externalId ? String(body.externalId) : undefined,
        source: body.source ? String(body.source) : 'api',
        sessionId: body.sessionId ? String(body.sessionId) : undefined,
        visitorId: body.visitorId ? String(body.visitorId) : undefined,
        userType: body.userType ? String(body.userType) : undefined,
      });

      return json({ ok: true, ...result });
    },
  );
}

