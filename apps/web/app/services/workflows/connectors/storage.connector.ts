import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';
import { getPrisma } from '~/db.server';

/**
 * Storage connector — reads/writes records in SuperApp's DataStore system.
 * This bridges the workflow engine with the app's built-in data stores.
 */
export class StorageConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'storage',
      displayName: 'SuperApp Data Store',
      version: '1.0.0',
      description: 'Read and write records to SuperApp data stores (Product, Inventory, Order, Analytics, Marketing, Customer, or custom).',
      icon: 'database',
      auth: {
        type: 'none',
      },
      operations: [
        {
          name: 'write',
          displayName: 'Write record',
          description: 'Create a new record in a data store. Auto-provisions the store if it doesn\'t exist.',
          inputSchema: {
            type: 'object',
            required: ['storeKey'],
            properties: {
              storeKey: { type: 'string', description: 'Data store key (e.g. "order", "analytics", or custom key)' },
              title: { type: 'string', description: 'Record title' },
              externalId: { type: 'string', description: 'External reference ID' },
              payload: { type: 'object', description: 'JSON payload to store' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              recordId: { type: 'string' },
              storeId: { type: 'string' },
              created: { type: 'boolean' },
            },
          },
          idempotency: { supported: false },
        },
        {
          name: 'read',
          displayName: 'Read records',
          description: 'Retrieve records from a data store.',
          inputSchema: {
            type: 'object',
            required: ['storeKey'],
            properties: {
              storeKey: { type: 'string' },
              externalId: { type: 'string', description: 'Filter by external ID' },
              limit: { type: 'number', description: 'Max records to return (default 50)' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              records: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    externalId: { type: 'string' },
                    payload: { type: 'object' },
                    createdAt: { type: 'string' },
                  },
                },
              },
              count: { type: 'number' },
            },
          },
          idempotency: { supported: true, keyHint: 'Read operations are naturally idempotent' },
        },
        {
          name: 'delete',
          displayName: 'Delete record',
          description: 'Delete a record from a data store by ID.',
          inputSchema: {
            type: 'object',
            required: ['recordId'],
            properties: {
              recordId: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { deleted: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'Delete by ID is idempotent' },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    const op = this.manifest().operations.find(o => o.name === operation);
    if (!op) return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };

    const errors: { path: string; message: string }[] = [];
    const required = (op.inputSchema as Record<string, unknown>).required as string[];
    for (const field of required) {
      if (inputs[field] === undefined || inputs[field] === null) {
        errors.push({ path: field, message: `"${field}" is required` });
      }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    switch (req.operation) {
      case 'write':
        return this.writeRecord(req);
      case 'read':
        return this.readRecords(req);
      case 'delete':
        return this.deleteRecord(req);
      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private async writeRecord(req: InvokeRequest): Promise<InvokeResult> {
    const prisma = getPrisma();
    const { storeKey, title, externalId, payload } = req.inputs;
    const tenantId = req.tenantId;

    try {
      let store = await prisma.dataStore.findFirst({
        where: { shopId: tenantId, key: String(storeKey) },
      });

      if (!store) {
        store = await prisma.dataStore.create({
          data: {
            shopId: tenantId,
            key: String(storeKey),
            label: String(storeKey).charAt(0).toUpperCase() + String(storeKey).slice(1),
            isEnabled: true,
          },
        });
      }

      const record = await prisma.dataStoreRecord.create({
        data: {
          dataStoreId: store.id,
          title: title ? String(title) : undefined,
          externalId: externalId ? String(externalId) : undefined,
          payload: JSON.stringify(payload ?? {}),
        },
      });

      return connectorSuccess({ recordId: record.id, storeId: store.id, created: true });
    } catch (err) {
      return connectorError('UNKNOWN', err instanceof Error ? err.message : String(err));
    }
  }

  private async readRecords(req: InvokeRequest): Promise<InvokeResult> {
    const prisma = getPrisma();
    const { storeKey, externalId, limit } = req.inputs;
    const tenantId = req.tenantId;

    try {
      const store = await prisma.dataStore.findFirst({
        where: { shopId: tenantId, key: String(storeKey) },
      });

      if (!store) {
        return connectorSuccess({ records: [], count: 0 });
      }

      const where: Record<string, unknown> = { dataStoreId: store.id };
      if (externalId) where.externalId = String(externalId);

      const records = await prisma.dataStoreRecord.findMany({
        where: where as any,
        take: typeof limit === 'number' ? limit : 50,
        orderBy: { createdAt: 'desc' },
      });

      return connectorSuccess({
        records: records.map(r => ({
          id: r.id,
          title: r.title,
          externalId: r.externalId,
          payload: safeJsonParse(r.payload),
          createdAt: r.createdAt.toISOString(),
        })),
        count: records.length,
      });
    } catch (err) {
      return connectorError('UNKNOWN', err instanceof Error ? err.message : String(err));
    }
  }

  private async deleteRecord(req: InvokeRequest): Promise<InvokeResult> {
    const prisma = getPrisma();
    const { recordId } = req.inputs;

    try {
      await prisma.dataStoreRecord.delete({ where: { id: String(recordId) } });
      return connectorSuccess({ deleted: true });
    } catch {
      return connectorSuccess({ deleted: false });
    }
  }
}

function safeJsonParse(str: string): unknown {
  try { return JSON.parse(str); } catch { return str; }
}
