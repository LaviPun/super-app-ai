import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';

/**
 * Built-in Shopify connector — executes Shopify Admin API operations.
 *
 * Operations:
 *   order.addTags     — Add tags to an order
 *   order.addNote     — Add a note to an order
 *   customer.addTags  — Add tags to a customer
 *   metafield.set     — Set a shop metafield
 */
export class ShopifyConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'shopify',
      displayName: 'Shopify Admin',
      version: '1.0.0',
      description: 'Native Shopify Admin API operations (tags, notes, metafields).',
      icon: 'shopify',
      auth: {
        type: 'shopify',
        scopes: ['read_orders', 'write_orders', 'read_customers', 'write_customers'],
        tokenStore: 'tenant',
      },
      operations: [
        {
          name: 'order.addTags',
          displayName: 'Add order tags',
          inputSchema: {
            type: 'object',
            required: ['orderId', 'tags'],
            properties: {
              orderId: { type: 'string', description: 'Shopify order GID' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'orderId + tags' },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'], rateLimitStrategy: 'respect-retry-after' },
        },
        {
          name: 'order.addNote',
          displayName: 'Add order note',
          inputSchema: {
            type: 'object',
            required: ['orderId', 'note'],
            properties: {
              orderId: { type: 'string' },
              note: { type: 'string', maxLength: 5000 },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: false },
        },
        {
          name: 'customer.addTags',
          displayName: 'Add customer tags',
          inputSchema: {
            type: 'object',
            required: ['customerId', 'tags'],
            properties: {
              customerId: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'customerId + tags' },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
        },
        {
          name: 'metafield.set',
          displayName: 'Set shop metafield',
          inputSchema: {
            type: 'object',
            required: ['namespace', 'key', 'value', 'type'],
            properties: {
              namespace: { type: 'string' },
              key: { type: 'string' },
              value: { type: 'string' },
              type: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { metafieldId: { type: 'string' } },
          },
          idempotency: { supported: true, keyHint: 'namespace + key' },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    const ops = this.manifest().operations;
    const op = ops.find(o => o.name === operation);
    if (!op) return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };

    const errors: { path: string; message: string }[] = [];
    const required = (op.inputSchema as Record<string, unknown>).required as string[] | undefined;
    if (required) {
      for (const field of required) {
        if (inputs[field] === undefined || inputs[field] === null) {
          errors.push({ path: field, message: `Required field "${field}" is missing` });
        }
      }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (auth.type !== 'shopify') {
      return connectorError('AUTH', 'Shopify connector requires shopify auth context');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': auth.accessToken,
    };
    const apiUrl = `https://${auth.shop}/admin/api/2025-01/graphql.json`;

    switch (req.operation) {
      case 'order.addTags': {
        const { orderId, tags } = req.inputs;
        const mutation = `mutation { tagsAdd(id: "${orderId}", tags: ${JSON.stringify(tags)}) { node { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'order.addNote': {
        const { orderId, note } = req.inputs;
        const mutation = `mutation { orderUpdate(input: { id: "${orderId}", note: "${String(note).replace(/"/g, '\\"')}" }) { order { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'customer.addTags': {
        const { customerId, tags } = req.inputs;
        const mutation = `mutation { tagsAdd(id: "${customerId}", tags: ${JSON.stringify(tags)}) { node { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'metafield.set': {
        const { namespace, key, value, type } = req.inputs;
        const mutation = `mutation { metafieldsSet(metafields: [{ ownerId: "gid://shopify/Shop/1", namespace: "${namespace}", key: "${key}", value: "${String(value).replace(/"/g, '\\"')}", type: "${type}" }]) { metafields { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private async graphql(
    url: string,
    headers: Record<string, string>,
    query: string,
    timeoutMs: number,
  ): Promise<InvokeResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      const body = await res.json() as Record<string, unknown>;

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        return connectorError('RATE_LIMIT', 'Shopify rate limited', {
          retryable: true,
          retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000,
        });
      }

      if (res.status >= 500) {
        return connectorError('UPSTREAM', `Shopify returned ${res.status}`, { retryable: true });
      }

      if (!res.ok) {
        return connectorError('UPSTREAM', `Shopify returned ${res.status}: ${JSON.stringify(body)}`);
      }

      return connectorSuccess(body as Record<string, unknown>, {
        statusCode: res.status,
        meta: { durationMs: Date.now() - start },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'Request timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
