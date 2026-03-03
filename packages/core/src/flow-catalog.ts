/**
 * Flow Catalog — single source of truth for all Shopify Flow triggers,
 * conditions, actions, and connectors available in the SuperApp ecosystem.
 *
 * Sources:
 *   - Shopify Flow reference: https://help.shopify.com/en/manual/shopify-flow/reference
 *   - Triggers: https://help.shopify.com/en/manual/shopify-flow/reference/triggers
 *   - Conditions: https://help.shopify.com/en/manual/shopify-flow/reference/conditions
 *   - Actions: https://help.shopify.com/en/manual/shopify-flow/reference/actions
 *   - Connectors: https://help.shopify.com/en/manual/shopify-flow/reference/connectors
 *   - Send HTTP: https://help.shopify.com/en/manual/shopify-flow/reference/actions/send-http-request
 */

// ─── Types ────────────────────────────────────────────────────────────

export type CatalogSource = 'shopify' | 'superapp' | 'connector';

export interface FlowTriggerDef {
  id: string;
  label: string;
  description: string;
  category: string;
  source: CatalogSource;
  /** Reference fields the trigger provides (e.g. order_reference, customer_reference) */
  referenceFields?: string[];
}

export interface FlowConditionOperator {
  id: string;
  label: string;
  description: string;
  appliesTo: ('string' | 'number' | 'boolean' | 'date' | 'enum' | 'list')[];
}

export interface FlowConditionDataType {
  id: string;
  label: string;
  description: string;
}

export interface FlowActionDef {
  id: string;
  label: string;
  description: string;
  category: string;
  source: CatalogSource;
  inputFields?: Array<{ key: string; label: string; type: string; required: boolean }>;
}

export interface FlowConnectorDef {
  id: string;
  name: string;
  description: string;
  providesTriggers: boolean;
  providesActions: boolean;
  source: CatalogSource;
}

// ─── Triggers ─────────────────────────────────────────────────────────

export const FLOW_TRIGGERS: FlowTriggerDef[] = [
  // Orders
  { id: 'shopify.order.created', label: 'Order created', description: 'Fires when a new order is placed.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference', 'customer_reference'] },
  { id: 'shopify.order.cancelled', label: 'Order cancelled', description: 'Fires when an order is cancelled.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.order.fulfilled', label: 'Order fulfilled', description: 'Fires when all items in an order are fulfilled.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.order.paid', label: 'Order paid', description: 'Fires when an order is fully paid.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.order.risk_analyzed', label: 'Order risk analyzed', description: 'Fires after Shopify completes risk analysis on an order.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.order.refunded', label: 'Order refund created', description: 'Fires when a refund is issued for an order.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },

  // Draft Orders
  { id: 'shopify.draft_order.created', label: 'Draft order created', description: 'Fires when a draft order is created.', category: 'Orders', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.draft_order.deleted', label: 'Draft order deleted', description: 'Fires when a draft order is deleted.', category: 'Orders', source: 'shopify' },

  // Customers
  { id: 'shopify.customer.created', label: 'Customer created', description: 'Fires when a new customer account is created.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.deleted', label: 'Customer deleted', description: 'Fires when a customer account is deleted.', category: 'Customers', source: 'shopify' },
  { id: 'shopify.customer.disabled', label: 'Customer account disabled', description: 'Fires when a customer account is disabled.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.enabled', label: 'Customer account enabled', description: 'Fires when a customer account is enabled.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.email_subscribed', label: 'Customer subscribed to email', description: 'Fires when a customer subscribes to email marketing.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.tags_added', label: 'Customer tags added', description: 'Fires when tags are added to a customer.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.tags_removed', label: 'Customer tags removed', description: 'Fires when tags are removed from a customer.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.joined_segment', label: 'Customer joined segment', description: 'Fires when a customer joins a segment.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.left_segment', label: 'Customer left segment', description: 'Fires when a customer leaves a segment.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.payment_method_created', label: 'Payment method created', description: 'Fires when a customer creates a payment method.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.payment_method_revoked', label: 'Payment method revoked', description: 'Fires when a payment method is revoked.', category: 'Customers', source: 'shopify', referenceFields: ['customer_reference'] },

  // Fulfillment
  { id: 'shopify.fulfillment.created', label: 'Fulfillment created', description: 'Fires when a fulfillment is created.', category: 'Fulfillment', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.fulfillment.event_created', label: 'Fulfillment event created', description: 'Fires when a fulfillment tracking event is created.', category: 'Fulfillment', source: 'shopify' },
  { id: 'shopify.fulfillment.cancellation_accepted', label: 'Fulfillment cancellation accepted', description: 'Fires when a fulfillment cancellation request is accepted.', category: 'Fulfillment', source: 'shopify' },

  // Products & Inventory
  { id: 'shopify.product.created', label: 'Product created', description: 'Fires when a product is added to the store.', category: 'Products', source: 'shopify', referenceFields: ['product_reference'] },
  { id: 'shopify.product.updated', label: 'Product updated', description: 'Fires when a product is updated.', category: 'Products', source: 'shopify', referenceFields: ['product_reference'] },
  { id: 'shopify.product.deleted', label: 'Product deleted', description: 'Fires when a product is deleted.', category: 'Products', source: 'shopify' },
  { id: 'shopify.inventory.quantity_changed', label: 'Inventory quantity changed', description: 'Fires when inventory levels change for any variant.', category: 'Inventory', source: 'shopify', referenceFields: ['product_reference'] },

  // Collections
  { id: 'shopify.collection.created', label: 'Collection created', description: 'Fires when a new collection is created.', category: 'Collections', source: 'shopify' },
  { id: 'shopify.collection.deleted', label: 'Collection deleted', description: 'Fires when a collection is deleted.', category: 'Collections', source: 'shopify' },
  { id: 'shopify.collection.product_added', label: 'Product added to collection', description: 'Fires when a product is added to a collection.', category: 'Collections', source: 'shopify', referenceFields: ['product_reference'] },
  { id: 'shopify.collection.product_removed', label: 'Product removed from collection', description: 'Fires when a product is removed from a collection.', category: 'Collections', source: 'shopify', referenceFields: ['product_reference'] },

  // B2B / Company
  { id: 'shopify.company.created', label: 'Company created', description: 'Fires when a new B2B company is created.', category: 'B2B', source: 'shopify' },
  { id: 'shopify.company.contact_created', label: 'Company contact created', description: 'Fires when a B2B company contact is created.', category: 'B2B', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.company.contact_permission', label: 'Company contact assigned permission', description: 'Fires when a B2B contact is assigned a permission.', category: 'B2B', source: 'shopify' },
  { id: 'shopify.company.location_created', label: 'Company location created', description: 'Fires when a B2B company location is created.', category: 'B2B', source: 'shopify' },

  // Discounts & Financial
  { id: 'shopify.discount.automatic_created', label: 'Automatic discount created', description: 'Fires when an automatic discount is created.', category: 'Discounts', source: 'shopify' },
  { id: 'shopify.discount.code_created', label: 'Discount code created', description: 'Fires when a discount code is created.', category: 'Discounts', source: 'shopify' },
  { id: 'shopify.dispute.created', label: 'Dispute created', description: 'Fires when a payment dispute (chargeback) is created.', category: 'Financial', source: 'shopify' },

  // Checkout
  { id: 'shopify.checkout.abandoned', label: 'Checkout abandoned', description: 'Fires when a checkout is abandoned by a customer.', category: 'Checkout', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.customer.left_online_store', label: 'Customer left online store', description: 'Fires when a customer navigates away from the store.', category: 'Checkout', source: 'shopify', referenceFields: ['customer_reference'] },

  // Returns
  { id: 'shopify.return.requested', label: 'Return requested', description: 'Fires when a return is requested.', category: 'Returns', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.return.approved', label: 'Return approved', description: 'Fires when a return request is approved.', category: 'Returns', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.return.declined', label: 'Return declined', description: 'Fires when a return request is declined.', category: 'Returns', source: 'shopify', referenceFields: ['order_reference'] },
  { id: 'shopify.return.closed', label: 'Return closed', description: 'Fires when a return is closed.', category: 'Returns', source: 'shopify', referenceFields: ['order_reference'] },

  // Scheduled
  { id: 'shopify.scheduled.time', label: 'Scheduled time', description: 'Fires at a specific scheduled time or recurring interval.', category: 'Scheduling', source: 'shopify' },

  // Subscription
  { id: 'shopify.subscription.contract_created', label: 'Subscription contract created', description: 'Fires when a subscription contract is created.', category: 'Subscriptions', source: 'shopify', referenceFields: ['customer_reference'] },
  { id: 'shopify.subscription.billing_attempt_failed', label: 'Subscription billing failed', description: 'Fires when a subscription billing attempt fails.', category: 'Subscriptions', source: 'shopify', referenceFields: ['customer_reference'] },

  // Tender transactions
  { id: 'shopify.tender_transaction.created', label: 'Tender transaction created', description: 'Fires when a tender transaction is created (payment captured).', category: 'Financial', source: 'shopify', referenceFields: ['order_reference'] },

  // ─── SuperApp triggers ───
  { id: 'superapp.module.published', label: 'SuperApp: Module published', description: 'Fires when a module is published in SuperApp.', category: 'SuperApp', source: 'superapp' },
  { id: 'superapp.connector.synced', label: 'SuperApp: Connector synced', description: 'Fires when a connector finishes syncing.', category: 'SuperApp', source: 'superapp' },
  { id: 'superapp.data.record_created', label: 'SuperApp: Data record created', description: 'Fires when a new record is created in a SuperApp data store.', category: 'SuperApp', source: 'superapp' },
  { id: 'superapp.workflow.completed', label: 'SuperApp: Workflow completed', description: 'Fires when a SuperApp workflow run succeeds.', category: 'SuperApp', source: 'superapp' },
  { id: 'superapp.workflow.failed', label: 'SuperApp: Workflow failed', description: 'Fires when a SuperApp workflow run fails.', category: 'SuperApp', source: 'superapp' },
];

// ─── Conditions ───────────────────────────────────────────────────────

export const FLOW_CONDITION_OPERATORS: FlowConditionOperator[] = [
  { id: 'equal_to', label: 'Equal to', description: 'Value exactly equals the given value.', appliesTo: ['string', 'number', 'boolean', 'date', 'enum'] },
  { id: 'not_equal_to', label: 'Not equal to', description: 'Value does not equal the given value.', appliesTo: ['string', 'number', 'boolean', 'date', 'enum'] },
  { id: 'greater_than', label: 'Greater than', description: 'Value is greater than the given value.', appliesTo: ['number', 'date'] },
  { id: 'less_than', label: 'Less than', description: 'Value is less than the given value.', appliesTo: ['number', 'date'] },
  { id: 'greater_than_or_equal', label: 'Greater than or equal to', description: 'Value is greater than or equal to the given value.', appliesTo: ['number', 'date'] },
  { id: 'less_than_or_equal', label: 'Less than or equal to', description: 'Value is less than or equal to the given value.', appliesTo: ['number', 'date'] },
  { id: 'contains', label: 'Contains', description: 'String contains the given substring (case-insensitive).', appliesTo: ['string'] },
  { id: 'not_contains', label: 'Does not contain', description: 'String does not contain the given substring.', appliesTo: ['string'] },
  { id: 'starts_with', label: 'Starts with', description: 'String starts with the given prefix.', appliesTo: ['string'] },
  { id: 'ends_with', label: 'Ends with', description: 'String ends with the given suffix.', appliesTo: ['string'] },
  { id: 'is_set', label: 'Is set', description: 'Field has a non-null value.', appliesTo: ['string', 'number', 'boolean', 'date', 'enum'] },
  { id: 'is_not_set', label: 'Is not set', description: 'Field is null or empty.', appliesTo: ['string', 'number', 'boolean', 'date', 'enum'] },
  { id: 'at_least_one_of', label: 'At least one of', description: 'List contains at least one of the given values.', appliesTo: ['list'] },
  { id: 'none_of', label: 'None of', description: 'List contains none of the given values.', appliesTo: ['list'] },
  { id: 'all_of', label: 'All of', description: 'List contains all of the given values.', appliesTo: ['list'] },
];

export const FLOW_CONDITION_DATA_TYPES: FlowConditionDataType[] = [
  { id: 'string', label: 'String', description: 'Text value (case-insensitive comparisons).' },
  { id: 'number', label: 'Number', description: 'Integer or decimal number.' },
  { id: 'boolean', label: 'Boolean', description: 'True or false.' },
  { id: 'date', label: 'Date', description: 'ISO 8601 date/datetime.' },
  { id: 'enum', label: 'Enum', description: 'Predefined constant value.' },
  { id: 'list', label: 'List', description: 'Array of values (tags, line items, etc.).' },
];

// ─── Actions ──────────────────────────────────────────────────────────

export const FLOW_ACTIONS: FlowActionDef[] = [
  // Shopify native actions
  { id: 'shopify.order.add_tags', label: 'Add order tags', description: 'Add tags to an order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.order.remove_tags', label: 'Remove order tags', description: 'Remove tags from an order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.order.add_note', label: 'Add order note', description: 'Add a note to an order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.order.cancel', label: 'Cancel order', description: 'Cancel an order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.order.archive', label: 'Archive order', description: 'Archive an order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.order.capture_payment', label: 'Capture payment', description: 'Capture payment for an authorized order.', category: 'Orders', source: 'shopify' },
  { id: 'shopify.customer.add_tags', label: 'Add customer tags', description: 'Add tags to a customer.', category: 'Customers', source: 'shopify' },
  { id: 'shopify.customer.remove_tags', label: 'Remove customer tags', description: 'Remove tags from a customer.', category: 'Customers', source: 'shopify' },
  { id: 'shopify.customer.update_note', label: 'Update customer note', description: 'Update the note on a customer.', category: 'Customers', source: 'shopify' },
  { id: 'shopify.product.add_tags', label: 'Add product tags', description: 'Add tags to a product.', category: 'Products', source: 'shopify' },
  { id: 'shopify.product.remove_tags', label: 'Remove product tags', description: 'Remove tags from a product.', category: 'Products', source: 'shopify' },
  { id: 'shopify.product.update_status', label: 'Update product status', description: 'Set product status (active/draft/archived).', category: 'Products', source: 'shopify' },
  { id: 'shopify.product.update_variant_inventory', label: 'Update variant inventory', description: 'Adjust inventory quantity for a variant.', category: 'Inventory', source: 'shopify' },
  { id: 'shopify.collection.add_products', label: 'Add products to collection', description: 'Add products to a manual collection.', category: 'Collections', source: 'shopify' },
  { id: 'shopify.collection.remove_products', label: 'Remove products from collection', description: 'Remove products from a collection.', category: 'Collections', source: 'shopify' },
  { id: 'shopify.metafield.set', label: 'Set metafield value', description: 'Create or update a metafield on any resource.', category: 'Custom Data', source: 'shopify' },
  { id: 'shopify.metafield.delete', label: 'Delete metafield', description: 'Delete a metafield from a resource.', category: 'Custom Data', source: 'shopify' },

  // Flow built-in advanced actions
  { id: 'shopify.flow.send_http_request', label: 'Send HTTP request', description: 'Send an HTTP request to any external URL. Supports GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD with auth options.', category: 'Integrations', source: 'shopify',
    inputFields: [
      { key: 'url', label: 'URL', type: 'string', required: true },
      { key: 'method', label: 'HTTP Method', type: 'enum', required: true },
      { key: 'headers', label: 'Headers', type: 'object', required: false },
      { key: 'body', label: 'Body', type: 'string', required: false },
    ],
  },
  { id: 'shopify.flow.send_admin_api_request', label: 'Send Admin API request', description: 'Run a GraphQL mutation against the Shopify Admin API.', category: 'Integrations', source: 'shopify' },
  { id: 'shopify.flow.run_code', label: 'Run code', description: 'Execute JavaScript code to transform data or compute values.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.get_data', label: 'Get data', description: 'Query Shopify Admin API to retrieve additional resource data.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.wait', label: 'Wait', description: 'Pause the workflow for a specified duration.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.count', label: 'Count', description: 'Count items in a list and store as a variable.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.sum', label: 'Sum', description: 'Sum numeric values from a list.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.for_each', label: 'For each', description: 'Loop through items in a list and perform actions for each.', category: 'Logic', source: 'shopify' },
  { id: 'shopify.flow.log', label: 'Log output', description: 'Write output to the Flow run log for debugging.', category: 'Logic', source: 'shopify' },

  // Notification actions
  { id: 'shopify.flow.send_internal_email', label: 'Send internal email', description: 'Send an email to a store staff member.', category: 'Notifications', source: 'shopify' },
  { id: 'shopify.flow.send_customer_email', label: 'Send customer email', description: 'Send an email notification to a customer.', category: 'Notifications', source: 'shopify' },

  // Fulfillment
  { id: 'shopify.fulfillment.create', label: 'Create fulfillment', description: 'Create a fulfillment for an order.', category: 'Fulfillment', source: 'shopify' },
  { id: 'shopify.fulfillment.request', label: 'Request fulfillment', description: 'Send a fulfillment request to a fulfillment service.', category: 'Fulfillment', source: 'shopify' },

  // B2B
  { id: 'shopify.company.update_note', label: 'Update company note', description: 'Update the note on a B2B company.', category: 'B2B', source: 'shopify' },

  // ─── Third-party connector actions (reference only) ───
  { id: 'connector.slack.send_message', label: 'Send Slack message', description: 'Post a message to a Slack channel.', category: 'Integrations', source: 'connector' },
  { id: 'connector.google_sheets.add_row', label: 'Add row to Google Sheet', description: 'Append a row to a Google Sheets spreadsheet.', category: 'Integrations', source: 'connector' },
  { id: 'connector.asana.create_task', label: 'Create Asana task', description: 'Create a new task in Asana.', category: 'Integrations', source: 'connector' },
  { id: 'connector.trello.create_card', label: 'Create Trello card', description: 'Create a new card on a Trello board.', category: 'Integrations', source: 'connector' },
  { id: 'connector.airtable.create_record', label: 'Create Airtable record', description: 'Create a record in an Airtable base.', category: 'Integrations', source: 'connector' },

  // ─── SuperApp actions (app-provided) ───
  { id: 'superapp.order.tag', label: 'SuperApp: Tag Order', description: 'Add tags to an order via SuperApp.', category: 'SuperApp', source: 'superapp',
    inputFields: [
      { key: 'orderId', label: 'Order ID', type: 'string', required: true },
      { key: 'tags', label: 'Tags (comma-separated)', type: 'string', required: true },
    ],
  },
  { id: 'superapp.data.write', label: 'SuperApp: Write to Data Store', description: 'Save data to a SuperApp data store.', category: 'SuperApp', source: 'superapp',
    inputFields: [
      { key: 'storeKey', label: 'Store key', type: 'string', required: true },
      { key: 'title', label: 'Record title', type: 'string', required: false },
      { key: 'payload', label: 'JSON payload', type: 'string', required: true },
    ],
  },
  { id: 'superapp.http.send', label: 'SuperApp: Send HTTP Request', description: 'Send an HTTP request via SuperApp (with SSRF protection).', category: 'SuperApp', source: 'superapp',
    inputFields: [
      { key: 'url', label: 'URL (HTTPS)', type: 'string', required: true },
      { key: 'method', label: 'HTTP Method', type: 'string', required: true },
      { key: 'body', label: 'Request body (JSON)', type: 'string', required: false },
    ],
  },
  { id: 'superapp.notification.email', label: 'SuperApp: Send Email Notification', description: 'Send an email notification via SuperApp.', category: 'SuperApp', source: 'superapp',
    inputFields: [
      { key: 'to', label: 'Recipient email', type: 'string', required: true },
      { key: 'subject', label: 'Subject', type: 'string', required: true },
      { key: 'body', label: 'Body (HTML)', type: 'string', required: true },
    ],
  },
];

// ─── Connectors ───────────────────────────────────────────────────────

export const FLOW_CONNECTORS: FlowConnectorDef[] = [
  // Shopify built-in
  { id: 'shopify', name: 'Shopify', description: 'Shopify native triggers and actions (orders, customers, products, fulfillment, etc.).', providesTriggers: true, providesActions: true, source: 'shopify' },

  // SuperApp (our app)
  { id: 'superapp', name: 'SuperApp', description: 'SuperApp custom triggers (module published, connector synced, data record created, workflow events) and actions (tag order, write to store, send HTTP, email notification).', providesTriggers: true, providesActions: true, source: 'superapp' },

  // Well-known third-party connectors
  { id: 'slack', name: 'Slack', description: 'Send messages and notifications to Slack channels.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'google-sheets', name: 'Google Sheets', description: 'Add rows to Google Sheets spreadsheets.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'asana', name: 'Asana', description: 'Create and manage tasks in Asana.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'trello', name: 'Trello', description: 'Create cards on Trello boards.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'airtable', name: 'Airtable', description: 'Create records in Airtable bases.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'zapier', name: 'Zapier', description: 'Connect to thousands of apps via Zapier.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'klaviyo', name: 'Klaviyo', description: 'Sync customer and order data to Klaviyo for email marketing.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'judge-me', name: 'Judge.me', description: 'Product reviews and UGC platform.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'yotpo', name: 'Yotpo', description: 'Reviews, loyalty, and referrals.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'recharge', name: 'Recharge', description: 'Subscription management.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'loox', name: 'Loox', description: 'Photo reviews and referrals.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'gorgias', name: 'Gorgias', description: 'Customer support helpdesk.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'shipstation', name: 'ShipStation', description: 'Shipping and fulfillment management.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'aftership', name: 'AfterShip', description: 'Order tracking and delivery notifications.', providesTriggers: true, providesActions: true, source: 'connector' },
  { id: 'mailchimp', name: 'Mailchimp', description: 'Email marketing and automations.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM, marketing, and sales.', providesTriggers: false, providesActions: true, source: 'connector' },
  { id: 'segment', name: 'Segment', description: 'Customer data platform.', providesTriggers: false, providesActions: true, source: 'connector' },
];

// ─── Helpers ──────────────────────────────────────────────────────────

export function getTriggersByCategory(category: string): FlowTriggerDef[] {
  return FLOW_TRIGGERS.filter(t => t.category === category);
}

export function getTriggersBySource(source: CatalogSource): FlowTriggerDef[] {
  return FLOW_TRIGGERS.filter(t => t.source === source);
}

export function getActionsByCategory(category: string): FlowActionDef[] {
  return FLOW_ACTIONS.filter(a => a.category === category);
}

export function getActionsBySource(source: CatalogSource): FlowActionDef[] {
  return FLOW_ACTIONS.filter(a => a.source === source);
}

export function getConnectorsBySource(source: CatalogSource): FlowConnectorDef[] {
  return FLOW_CONNECTORS.filter(c => c.source === source);
}

export function getTriggerCategories(): string[] {
  return [...new Set(FLOW_TRIGGERS.map(t => t.category))];
}

export function getActionCategories(): string[] {
  return [...new Set(FLOW_ACTIONS.map(a => a.category))];
}
