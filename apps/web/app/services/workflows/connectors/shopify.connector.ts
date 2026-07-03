import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';
import { adminGraphqlUrl } from '~/shopify-api.server';

/**
 * Built-in Shopify connector — executes Shopify Admin API operations.
 *
 * Operations:
 *   order.addTags           — Add tags to an order
 *   order.addNote           — Add a note to an order
 *   order.routeToLocation   — Our own order routing (fulfillmentOrderMove)
 *   order.cancel            — Cancel an order
 *   customer.addTags        — Add tags to a customer
 *   customer.updateNote     — Update a customer's note
 *   product.updateStatus    — Set a product's status (ACTIVE/DRAFT/ARCHIVED)
 *   inventory.adjust        — Adjust available inventory at a location
 *   metafield.set           — Set a shop metafield
 */
export class ShopifyConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'shopify',
      displayName: 'Shopify Admin',
      version: '1.0.0',
      description: 'Native Shopify Admin API operations (tags, notes, routing, inventory, metafields).',
      icon: 'shopify',
      auth: {
        type: 'shopify',
        scopes: [
          'read_orders', 'write_orders', 'read_customers', 'write_customers',
          'write_products', 'write_inventory', 'read_fulfillments', 'write_fulfillments',
        ],
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
          name: 'order.routeToLocation',
          displayName: 'Route order to location',
          inputSchema: {
            type: 'object',
            required: ['orderId', 'newLocationId'],
            properties: {
              orderId: { type: 'string', description: 'Shopify order GID' },
              newLocationId: { type: 'string', description: 'Destination location GID' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              movedFulfillmentOrderId: { type: 'string' },
              locationId: { type: 'string' },
            },
          },
          idempotency: { supported: true, keyHint: 'orderId + newLocationId' },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'], rateLimitStrategy: 'respect-retry-after' },
        },
        {
          name: 'order.cancel',
          displayName: 'Cancel order',
          inputSchema: {
            type: 'object',
            required: ['orderId'],
            properties: {
              orderId: { type: 'string' },
              reason: { type: 'string', enum: ['CUSTOMER', 'DECLINED', 'FRAUD', 'INVENTORY', 'OTHER', 'STAFF'] },
              refund: { type: 'boolean' },
              restock: { type: 'boolean' },
              notifyCustomer: { type: 'boolean' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'orderId' },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
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
          name: 'customer.updateNote',
          displayName: 'Update customer note',
          inputSchema: {
            type: 'object',
            required: ['customerId', 'note'],
            properties: {
              customerId: { type: 'string' },
              note: { type: 'string', maxLength: 5000 },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'customerId + note' },
        },
        {
          name: 'product.updateStatus',
          displayName: 'Update product status',
          inputSchema: {
            type: 'object',
            required: ['productId', 'status'],
            properties: {
              productId: { type: 'string' },
              status: { type: 'string', enum: ['ACTIVE', 'DRAFT', 'ARCHIVED'] },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: true, keyHint: 'productId + status' },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
        },
        {
          name: 'inventory.adjust',
          displayName: 'Adjust inventory',
          inputSchema: {
            type: 'object',
            required: ['inventoryItemId', 'locationId', 'delta'],
            properties: {
              inventoryItemId: { type: 'string' },
              locationId: { type: 'string' },
              delta: { type: 'number' },
              reason: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { success: { type: 'boolean' } },
          },
          idempotency: { supported: false },
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
    const apiUrl = adminGraphqlUrl(auth.shop);

    switch (req.operation) {
      case 'order.addTags': {
        const { orderId, tags } = req.inputs;
        const mutation = `mutation { tagsAdd(id: "${orderId}", tags: ${JSON.stringify(tags)}) { node { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'order.addNote': {
        const { orderId, note } = req.inputs;
        const mutation = `mutation { orderUpdate(input: { id: "${orderId}", note: ${JSON.stringify(note)} }) { order { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'order.routeToLocation': {
        // Our own order routing (docs/flow-automation.md §5): resolve the
        // order's fulfillment order, then fulfillmentOrderMove it.
        const { orderId, newLocationId } = req.inputs;
        const query = `#graphql
          query OrderFulfillmentOrders($id: ID!) {
            order(id: $id) {
              fulfillmentOrders(first: 10) {
                nodes { id assignedLocation { location { id } } }
              }
            }
          }
        `;
        const lookup = await this.graphqlInternal(apiUrl, headers, query, req.timeoutMs, { id: orderId });
        if (!lookup.ok) return lookup.result;
        const data = lookup.body as {
          data?: { order?: { fulfillmentOrders?: { nodes?: Array<{ id: string; assignedLocation?: { location?: { id?: string } } }> } } };
        };
        const fulfillmentOrders = data?.data?.order?.fulfillmentOrders?.nodes ?? [];
        // Prefer a fulfillment order not already assigned to the destination.
        const target = fulfillmentOrders.find(fo => fo?.assignedLocation?.location?.id !== newLocationId) ?? fulfillmentOrders[0];
        if (!target) {
          return connectorError('NOT_FOUND', `No fulfillment orders found for order ${String(orderId)}`);
        }

        const mutation = `#graphql
          mutation FulfillmentOrderMove($id: ID!, $newLocationId: ID!) {
            fulfillmentOrderMove(id: $id, newLocationId: $newLocationId) {
              movedFulfillmentOrder { id }
              userErrors { field message }
            }
          }
        `;
        const move = await this.graphqlInternal(apiUrl, headers, mutation, req.timeoutMs, {
          id: target.id,
          newLocationId,
        });
        if (!move.ok) return move.result;
        const moveData = move.body as {
          data?: { fulfillmentOrderMove?: { movedFulfillmentOrder?: { id?: string }; userErrors?: Array<{ field?: string[]; message: string }> } };
        };
        const payload = moveData?.data?.fulfillmentOrderMove;
        const userErrors = payload?.userErrors ?? [];
        if (userErrors.length > 0) {
          return connectorError('UPSTREAM', `fulfillmentOrderMove failed: ${userErrors.map(e => e.message).join('; ')}`);
        }
        return connectorSuccess(
          {
            movedFulfillmentOrderId: payload?.movedFulfillmentOrder?.id ?? target.id,
            locationId: newLocationId,
          },
          { statusCode: 200, meta: { durationMs: lookup.durationMs + move.durationMs } },
        );
      }

      case 'order.cancel': {
        const { orderId, reason, refund, restock, notifyCustomer } = req.inputs;
        const mutation = `#graphql
          mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean) {
            orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer) {
              job { id }
              orderCancelUserErrors { field message }
            }
          }
        `;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs, {
          orderId,
          reason: reason ?? 'OTHER',
          refund: refund ?? false,
          restock: restock ?? true,
          notifyCustomer: notifyCustomer ?? false,
        });
      }

      case 'customer.addTags': {
        const { customerId, tags } = req.inputs;
        const mutation = `mutation { tagsAdd(id: "${customerId}", tags: ${JSON.stringify(tags)}) { node { id } userErrors { field message } } }`;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs);
      }

      case 'customer.updateNote': {
        const { customerId, note } = req.inputs;
        const mutation = `#graphql
          mutation CustomerUpdateNote($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer { id }
              userErrors { field message }
            }
          }
        `;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs, {
          input: { id: customerId, note },
        });
      }

      case 'product.updateStatus': {
        const { productId, status } = req.inputs;
        const mutation = `#graphql
          mutation ProductUpdateStatus($product: ProductUpdateInput!) {
            productUpdate(product: $product) {
              product { id status }
              userErrors { field message }
            }
          }
        `;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs, {
          product: { id: productId, status },
        });
      }

      case 'inventory.adjust': {
        const { inventoryItemId, locationId, delta, reason } = req.inputs;
        const mutation = `#graphql
          mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!) {
            inventoryAdjustQuantities(input: $input) {
              userErrors { field message }
            }
          }
        `;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs, {
          input: {
            reason: reason ?? 'correction',
            name: 'available',
            changes: [{ inventoryItemId, locationId, delta }],
          },
        });
      }

      case 'metafield.set': {
        const { namespace, key, value, type } = req.inputs;
        const shopGid = await this.getShopGid(apiUrl, headers, req.timeoutMs);
        if (!shopGid) return connectorError('UPSTREAM', 'Failed to resolve shop ID');
        const mutation = `#graphql
          mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              userErrors { field message }
            }
          }
        `;
        return this.graphql(apiUrl, headers, mutation, req.timeoutMs, {
          metafields: [{ ownerId: shopGid, namespace, key, type, value }],
        });
      }

      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private async getShopGid(
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<string | null> {
    const query = `#graphql query ShopId { shop { id } }`;
    const out = await this.graphqlInternal(url, headers, query, timeoutMs, undefined);
    if (!out.ok || !out.body) return null;
    const data = out.body as { data?: { shop?: { id?: string } } };
    return data?.data?.shop?.id ?? null;
  }

  private async graphql(
    url: string,
    headers: Record<string, string>,
    query: string,
    timeoutMs: number,
    variables?: Record<string, unknown>,
  ): Promise<InvokeResult> {
    const start = Date.now();
    const res = await this.graphqlInternal(url, headers, query, timeoutMs, variables);
    if (!res.ok) return res.result;
    return connectorSuccess(res.body as Record<string, unknown>, {
      statusCode: 200,
      meta: { durationMs: res.durationMs },
    });
  }

  private async graphqlInternal(
    url: string,
    headers: Record<string, string>,
    query: string,
    timeoutMs: number,
    variables?: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    result: InvokeResult;
    body?: Record<string, unknown>;
    durationMs: number;
  }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(variables ? { query, variables } : { query }),
        signal: controller.signal,
      });

      const body = await res.json() as Record<string, unknown>;
      const durationMs = Date.now() - start;

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        return {
          ok: false,
          result: connectorError('RATE_LIMIT', 'Shopify rate limited', {
            retryable: true,
            retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000,
          }),
          durationMs,
        };
      }

      if (res.status >= 500) {
        return {
          ok: false,
          result: connectorError('UPSTREAM', `Shopify returned ${res.status}`, { retryable: true }),
          durationMs,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          result: connectorError('UPSTREAM', `Shopify returned ${res.status}: ${JSON.stringify(body)}`),
          durationMs,
        };
      }

      return { ok: true, result: connectorSuccess(body as Record<string, unknown>, { statusCode: res.status, meta: { durationMs } }), body, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      const result =
        err instanceof DOMException && err.name === 'AbortError'
          ? connectorError('TIMEOUT', 'Request timed out', { retryable: true })
          : connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
      return { ok: false, result, durationMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
