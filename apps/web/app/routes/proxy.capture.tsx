import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { ModuleCaptureService } from '~/services/data/module-capture.service';

function toPayloadFromFormData(fd: FormData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('contact[') && k.endsWith(']')) {
      const inner = k.slice('contact['.length, -1);
      payload[inner] = String(v);
    } else if (!k.startsWith('_')) {
      payload[k] = String(v);
    }
  }
  return payload;
}

export async function action({ request }: { request: Request }) {
  return withApiLogging(
    {
      actor: 'APP_PROXY',
      method: request.method,
      path: '/proxy/capture',
      request,
      // Capture payload may include customer PII.
      captureRequestBody: false,
      captureResponseBody: true,
    },
    async () => {
      const url = new URL(request.url);
      const shopDomain = String(url.searchParams.get('shop') ?? '').trim().toLowerCase();
      if (!shopDomain) return json({ error: 'Missing shop parameter' }, { status: 400 });

      const { admin: adminMaybe } = await shopify.authenticate.public.appProxy(request);
      if (!adminMaybe) return json({ error: 'App proxy auth failed' }, { status: 401 });

      const prisma = getPrisma();
      const shop = await prisma.shop.findUnique({ where: { shopDomain } });
      if (!shop) return json({ error: 'Shop not found' }, { status: 404 });

      const contentType = request.headers.get('content-type') ?? '';
      let moduleId = '';
      let captureType = 'form_submission';
      let payload: Record<string, unknown> = {};
      let storeKey = 'customer';
      let piiFlags: Record<string, unknown> = { contains_contact_pii: true };

      if (contentType.includes('application/json')) {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        if (!body) return json({ error: 'Invalid JSON body' }, { status: 400 });
        moduleId = String(body.moduleId ?? '').trim();
        captureType = String(body.captureType ?? captureType).trim();
        payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : {};
        storeKey = body.storeKey ? String(body.storeKey) : storeKey;
        if (body.piiFlags && typeof body.piiFlags === 'object' && !Array.isArray(body.piiFlags)) {
          piiFlags = body.piiFlags as Record<string, unknown>;
        }
      } else {
        const fd = await request.formData();
        moduleId = String(fd.get('moduleId') ?? '').trim();
        captureType = String(fd.get('captureType') ?? captureType).trim();
        storeKey = String(fd.get('storeKey') ?? storeKey).trim() || storeKey;
        const honeypotField = String(fd.get('honeypotFieldName') ?? '').trim();
        if (honeypotField) {
          const hpValue = String(fd.get(honeypotField) ?? '').trim();
          if (hpValue) return json({ ok: true, ignored: true });
        }
        payload = toPayloadFromFormData(fd);
      }

      if (!moduleId) return json({ error: 'moduleId is required' }, { status: 400 });
      if (!captureType) return json({ error: 'captureType is required' }, { status: 400 });

      const svc = new ModuleCaptureService();
      const result = await svc.capture({
        shopId: shop.id,
        moduleId,
        captureType,
        payload,
        customerId: typeof payload.customerId === 'string' || typeof payload.customerId === 'number'
          ? String(payload.customerId)
          : undefined,
        payloadSchemaVersion: 'v1',
        piiFlags,
        storeKey,
        storeRecordTitle: `${captureType} from storefront`,
        source: 'theme_proxy',
        visitorId: String(payload.visitorId ?? ''),
        sessionId: String(payload.sessionId ?? ''),
        userType: 'buyer',
      });

      return json({ ok: true, ...result });
    },
  );
}

