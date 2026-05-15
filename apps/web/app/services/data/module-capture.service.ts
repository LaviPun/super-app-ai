import { getPrisma } from '~/db.server';
import { persistJsonSafely } from '~/services/observability/redact.server';
import { DataStoreService } from './data-store.service';

export type ModuleCaptureInput = {
  shopId: string;
  moduleId: string;
  captureType: string;
  payload: Record<string, unknown>;
  customerId?: string;
  payloadSchemaVersion?: string;
  piiFlags?: Record<string, unknown>;
  instanceId?: string;
  storeKey?: string;
  storeRecordTitle?: string;
  externalId?: string;
  source?: string;
  sessionId?: string;
  visitorId?: string;
  userType?: string;
};

function normalizeStoreKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}

function titleFromStoreKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCustomerId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function extractCustomerId(payload: Record<string, unknown>): string | undefined {
  const direct = normalizeCustomerId(payload.customerId ?? payload.customer_id);
  if (direct) return direct;

  const customer = payload.customer;
  if (customer && typeof customer === 'object' && !Array.isArray(customer)) {
    return normalizeCustomerId((customer as Record<string, unknown>).id);
  }

  return undefined;
}

export class ModuleCaptureService {
  async capture(input: ModuleCaptureInput): Promise<{ captureId: string; dataStoreRecordId?: string }> {
    const prisma = getPrisma();
    const dataStoreService = new DataStoreService();
    const customerId = normalizeCustomerId(input.customerId) ?? extractCustomerId(input.payload ?? {});

    const mod = await prisma.module.findFirst({
      where: {
        id: input.moduleId,
        shopId: input.shopId,
      },
      select: { id: true },
    });
    if (!mod) throw new Error('Module not found');

    let resolvedInstanceId = input.instanceId;
    if (resolvedInstanceId) {
      const instance = await prisma.moduleInstance.findFirst({
        where: { id: resolvedInstanceId, moduleId: input.moduleId, shopId: input.shopId },
        select: { id: true },
      });
      if (!instance) throw new Error('Module instance not found');
    } else {
      const fallback = await prisma.moduleInstance.findFirst({
        where: { moduleId: input.moduleId, shopId: input.shopId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!fallback) throw new Error('Capture requires a module instance (none found for module)');
      resolvedInstanceId = fallback.id;
    }

    const capture = await prisma.dataCapture.create({
      data: {
        shopId: input.shopId,
        moduleId: input.moduleId,
        instanceId: resolvedInstanceId,
        customerId: customerId ?? null,
        captureType: input.captureType,
        payloadSchemaVersion: input.payloadSchemaVersion ?? 'v1',
        payload: persistJsonSafely(input.payload ?? {}, { piiFlags: input.piiFlags }),
        piiFlags: input.piiFlags ? persistJsonSafely(input.piiFlags) : null,
      },
      select: { id: true },
    });

    await prisma.moduleEvent.create({
      data: {
        shopId: input.shopId,
        moduleId: input.moduleId,
        instanceId: resolvedInstanceId,
        customerId: customerId ?? null,
        sessionId: input.sessionId ?? null,
        visitorId: input.visitorId ?? null,
        userType: input.userType ?? null,
        eventName: `capture.${input.captureType}`,
        eventProperties: JSON.stringify({
          source: input.source ?? 'unknown',
          schemaVersion: input.payloadSchemaVersion ?? 'v1',
          hasStoreWrite: Boolean(input.storeKey),
        }),
      },
    });

    let dataStoreRecordId: string | undefined;
    if (input.storeKey && input.storeKey.trim()) {
      const key = normalizeStoreKey(input.storeKey);
      let store = await dataStoreService.getStoreByKey(input.shopId, key);

      if (!store) {
        await dataStoreService.createCustomStore(
          input.shopId,
          key,
          titleFromStoreKey(key) || 'Module Captures',
          'Auto-created from module capture ingestion',
        );
        store = await dataStoreService.getStoreByKey(input.shopId, key);
      } else if (!store.isEnabled) {
        await dataStoreService.enableStore(input.shopId, key);
        store = await dataStoreService.getStoreByKey(input.shopId, key);
      }

      if (!store) throw new Error('Could not initialize data store for capture');

      const record = await dataStoreService.createRecord(store.id, {
        customerId,
        externalId: input.externalId,
        title: input.storeRecordTitle ?? `${input.captureType} capture`,
        payload: {
          moduleId: input.moduleId,
          instanceId: resolvedInstanceId ?? null,
          captureType: input.captureType,
          schemaVersion: input.payloadSchemaVersion ?? 'v1',
          source: input.source ?? 'unknown',
          payload: input.payload ?? {},
        },
        piiFlags: input.piiFlags,
      });
      dataStoreRecordId = record.id;
    }

    return { captureId: capture.id, dataStoreRecordId };
  }
}

