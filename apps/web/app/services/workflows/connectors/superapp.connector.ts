import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';
import { DataStoreService } from '~/services/data/data-store.service';

/**
 * SuperApp connector — links a flow to MODULE I/O. Any module that owns a typed
 * data store (see DataStoreService) can be both a source (read its records into
 * the flow) and a sink (write flow output into it). This is what lets a workflow
 * connect "every possible module's input/output": e.g. a reviews module's records
 * → flow → a loyalty module's store.
 *
 * `req.tenantId` is the shop id (the engine threads it through). Record writes go
 * through DataStoreService.createRecord, so they are validated against the store's
 * typed schema when one is declared.
 *
 * Operations:
 *   datastore.createRecord — write a record into a module's data store
 *   datastore.query        — read recent records from a module's data store
 *   datastore.getRecord    — read a single record by id
 */
export class SuperAppConnector implements Connector {
  constructor(private readonly data: DataStoreService = new DataStoreService()) {}

  manifest(): ConnectorManifest {
    return {
      provider: 'superapp',
      displayName: 'SuperApp Modules',
      version: '1.0.0',
      description: 'Read/write module data stores so flows can link module inputs and outputs.',
      icon: 'superapp',
      auth: { type: 'none' },
      operations: [
        {
          name: 'datastore.createRecord',
          displayName: 'Create module record',
          inputSchema: {
            type: 'object',
            required: ['storeKey', 'payload'],
            properties: {
              storeKey: { type: 'string', description: 'Data store key (e.g. module_<id> or a domain like customer)' },
              payload: { type: 'object', description: 'Record fields (validated against the store schema if typed)' },
              title: { type: 'string' },
              externalId: { type: 'string' },
            },
          },
          outputSchema: { type: 'object', properties: { recordId: { type: 'string' } } },
          idempotency: { supported: true, keyHint: 'externalId' },
        },
        {
          name: 'datastore.query',
          displayName: 'Query module records',
          inputSchema: {
            type: 'object',
            required: ['storeKey'],
            properties: {
              storeKey: { type: 'string' },
              limit: { type: 'number', default: 50 },
              offset: { type: 'number', default: 0 },
            },
          },
          outputSchema: { type: 'object', properties: { records: { type: 'array' }, total: { type: 'number' } } },
          idempotency: { supported: true },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    const op = this.manifest().operations.find((o) => o.name === operation);
    if (!op) return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };
    const required = (op.inputSchema as Record<string, unknown>).required as string[] | undefined;
    const errors = (required ?? [])
      .filter((f) => inputs[f] === undefined || inputs[f] === null)
      .map((f) => ({ path: f, message: `Required field "${f}" is missing` }));
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(_auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    const shopId = req.tenantId;
    if (!shopId) return connectorError('AUTH', 'SuperApp connector requires a tenant (shop) id');

    try {
      switch (req.operation) {
        case 'datastore.createRecord': {
          const storeKey = String(req.inputs.storeKey);
          const store = await this.data.getStoreByKey(shopId, normalizeKey(storeKey));
          if (!store) return connectorError('NOT_FOUND', `Data store "${storeKey}" not found for this shop`);
          const rec = await this.data.createRecord(store.id, {
            payload: (req.inputs.payload as unknown) ?? {},
            title: req.inputs.title ? String(req.inputs.title) : undefined,
            externalId: req.inputs.externalId ? String(req.inputs.externalId) : undefined,
          });
          return connectorSuccess({ recordId: rec.id });
        }

        case 'datastore.query': {
          const storeKey = normalizeKey(String(req.inputs.storeKey));
          const result = await this.data.listRecords(shopId, storeKey, {
            limit: req.inputs.limit ? Number(req.inputs.limit) : 50,
            offset: req.inputs.offset ? Number(req.inputs.offset) : 0,
          });
          if (!result) return connectorError('NOT_FOUND', `Data store "${storeKey}" not found for this shop`);
          return connectorSuccess({ records: result.records, total: result.total });
        }

        default:
          return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Schema validation failures are caller errors (not retryable).
      const code = message.includes('validation') ? 'VALIDATION' : 'UPSTREAM';
      return connectorError(code, message);
    }
  }
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
}
