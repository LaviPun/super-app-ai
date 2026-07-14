import type { TemplateEntry } from '../types.js';

/**
 * integration.httpSync templates — back-office system-of-record syncs (Phase 6
 * vocab-hardening). Complements the marketing-platform syncs in
 * `integration-httpsync-outbound.ts` (Klaviyo/Omnisend/Recharge/…) with the three
 * classic ops integrations: order → ERP, product → sales feed, customer → CRM.
 *
 * Honesty posture (mirrors the sibling file, 034 §GAP-8): integration.httpSync is an
 * OUTBOUND dispatcher — on a subscribed Shopify webhook it forwards a mapped payload
 * to the merchant's connected connector endpoint. It does NOT stand up the ERP / feed
 * host / CRM, and it does NOT own auth or retry: authentication (API key / OAuth) and
 * retry/backoff are properties of the CONNECTOR the `connectorId` names (configured
 * once by the merchant), not of this per-module config — the schema deliberately
 * exposes only `{ connectorId, endpointPath, trigger, payloadMapping }`, so this tap
 * cannot fabricate an auth/retry story it doesn't run.
 *
 * Trigger discipline: only subscribed webhook triggers — ORDER_CREATED for the ERP
 * sync, PRODUCT_UPDATED for the feed, CUSTOMER_CREATED for the CRM. The barrel
 * modernize pass injects `payloadMapping.shop` / `.event` / `.createdAt`.
 */
export const INTEG_BACKOFFICE_TEMPLATES: TemplateEntry[] = [
  // INTEG-09 — Order → ERP. The canonical system-of-record sync: push each placed
  // order to the merchant's ERP (NetSuite/SAP/Business Central) as a sales order.
  {
    id: 'INTEG-09',
    name: 'ERP — Order → Sales Order Sync',
    description:
      'On order/create, forward the order (buyer, line items, totals, shipping address) to a connected ERP so it books a matching sales order for fulfilment and accounting.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tier: 'exemplar',
    tags: ['erp', 'netsuite', 'sync', 'order', 'sales-order', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'ERP — Order → Sales Order Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'erp',
        endpointPath: '/erp/sales-orders/create',
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        // Auth (API token / OAuth) + retry/backoff are the ERP connector's; this tap
        // only maps Shopify order fields → the ERP sales-order shape.
        payloadMapping: {
          'salesOrder.externalId': 'order.id',
          'salesOrder.number': 'order.name',
          'salesOrder.customerEmail': 'order.email',
          'salesOrder.currency': 'order.currency',
          'salesOrder.total': 'order.total_price',
          'salesOrder.lines': 'order.line_items',
          'salesOrder.shipTo': 'order.shipping_address',
          'salesOrder.placedAt': 'order.created_at',
        },
      },
    },
  },

  // INTEG-10 — Product → sales/marketplace feed. On product update, re-sync the
  // product to a connected feed host (Google Merchant / marketplace) for reconciliation.
  {
    id: 'INTEG-10',
    name: 'Product Feed — Product → Catalog Sync',
    description:
      'On product/update, forward the product (title, price, availability, image, GTIN) to a connected product-feed service so the merchant’s shopping/marketplace feed stays reconciled.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tier: 'standard',
    tags: ['feed', 'google-merchant', 'sync', 'product', 'catalog', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'Product Feed — Product → Catalog Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'product-feed',
        endpointPath: '/product-feed/items/upsert',
        trigger: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
        payloadMapping: {
          'item.id': 'product.id',
          'item.title': 'product.title',
          'item.description': 'product.body_html',
          'item.price': 'product.variants.0.price',
          'item.availability': 'product.variants.0.available',
          'item.gtin': 'product.variants.0.barcode',
          'item.imageLink': 'product.image.src',
          'item.link': 'product.handle',
        },
      },
    },
  },

  // INTEG-11 — Customer → CRM. On customer/create, push the new customer to a
  // connected CRM (HubSpot/Salesforce) as a contact.
  {
    id: 'INTEG-11',
    name: 'CRM — New Customer → Contact Sync',
    description:
      'On customer/create, forward the new customer (email, name, phone, marketing consent, lifetime spend) to a connected CRM so it creates or updates the contact record.',
    category: 'INTEGRATION',
    type: 'integration.httpSync',
    icon: 'integration',
    tier: 'standard',
    tags: ['crm', 'hubspot', 'salesforce', 'sync', 'customer', 'webhook'],
    spec: {
      type: 'integration.httpSync',
      name: 'CRM — New Customer → Contact Sync',
      category: 'INTEGRATION',
      requires: [],
      config: {
        connectorId: 'crm',
        endpointPath: '/crm/contacts/upsert',
        trigger: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        // CRM keys the contact by email; consent is forwarded and honored downstream
        // (the CRM only marks marketable when the consent state is subscribed).
        payloadMapping: {
          'contact.externalId': 'customer.id',
          'contact.email': 'customer.email',
          'contact.firstName': 'customer.first_name',
          'contact.lastName': 'customer.last_name',
          'contact.phone': 'customer.phone',
          'contact.marketingConsent': 'customer.email_marketing_consent.state',
          'contact.lifetimeValue': 'customer.total_spent',
          'contact.tags': 'customer.tags',
        },
      },
    },
  },
];
