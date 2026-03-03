import type { Workflow } from './workflow.js';

export const WORKFLOW_CATEGORIES = [
  'B2B', 'Buyer experience', 'Custom data', 'Customers', 'Error monitoring',
  'Fulfillment', 'Inventory and merch', 'Loyalty', 'Orders',
  'Payment reminders', 'Promotions', 'Risk', 'Operations', 'Integrations', 'Fraud',
] as const;

// ─── Template Metadata ────────────────────────────────────────────────
export interface TemplateInputPrompt {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default?: unknown;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
}

export interface TemplateSafety {
  dataAccess: string[];
  pii: boolean;
  notes?: string;
}

export interface WorkflowTemplateMetadata {
  templateId: string;
  version: number;
  name: string;
  description: string;
  category: string[];
  tags: string[];
  minAppVersion?: string;
  requiresConnectors: Array<{
    provider: string;
    scopes?: string[];
  }>;
  inputPrompts: TemplateInputPrompt[];
  safety: TemplateSafety;
}

export interface WorkflowTemplateBundle {
  metadata: WorkflowTemplateMetadata;
  workflow: Workflow;
}

// ─── Template Approval Checklist ──────────────────────────────────────
export interface ApprovalChecklistItem {
  id: string;
  category: 'validity' | 'safety' | 'connector' | 'reliability' | 'ux' | 'observability';
  description: string;
  required: boolean;
}

export const APPROVAL_CHECKLIST: ApprovalChecklistItem[] = [
  // Workflow Validity
  { id: 'v1', category: 'validity', description: 'Exactly one trigger', required: true },
  { id: 'v2', category: 'validity', description: 'Graph is reachable from trigger start node', required: true },
  { id: 'v3', category: 'validity', description: 'Graph is acyclic (or cycles have guardrails)', required: true },
  { id: 'v4', category: 'validity', description: 'Every condition node has true and false outgoing edges', required: true },
  { id: 'v5', category: 'validity', description: 'Every action node has next edge (and optional error edge)', required: true },
  { id: 'v6', category: 'validity', description: 'No orphan nodes or dangling edges', required: true },

  // Safety & Data Handling
  { id: 's1', category: 'safety', description: 'Template declares data domains touched', required: true },
  { id: 's2', category: 'safety', description: 'PII usage declared and minimized', required: true },
  { id: 's3', category: 'safety', description: 'Secrets referenced via secret refs, never embedded', required: true },
  { id: 's4', category: 'safety', description: 'Logging redacts sensitive fields', required: true },

  // Connector Requirements
  { id: 'c1', category: 'connector', description: 'Each required connector listed with scopes', required: true },
  { id: 'c2', category: 'connector', description: 'Connector operations define input/output schemas', required: true },
  { id: 'c3', category: 'connector', description: 'Connector supports idempotency or is safe for retries', required: true },
  { id: 'c4', category: 'connector', description: 'Rate-limit behavior documented', required: false },
  { id: 'c5', category: 'connector', description: 'Auth model is supported (oauth/api_key/shopify)', required: true },

  // Reliability
  { id: 'r1', category: 'reliability', description: 'Timeouts set per action (default 30s)', required: true },
  { id: 'r2', category: 'reliability', description: 'Retry policy defined for network/5xx/429', required: true },
  { id: 'r3', category: 'reliability', description: 'Idempotency key strategy defined per action', required: true },
  { id: 'r4', category: 'reliability', description: '"Continue on error" used only when safe', required: false },

  // UX / Installability
  { id: 'u1', category: 'ux', description: 'Template has clear name, description, tags, category', required: true },
  { id: 'u2', category: 'ux', description: 'Inputs are minimal and have sensible defaults', required: true },
  { id: 'u3', category: 'ux', description: 'README / description includes prerequisites and test steps', required: false },

  // Observability
  { id: 'o1', category: 'observability', description: 'Run log shows trigger payload summary + step inputs (redacted)', required: true },
  { id: 'o2', category: 'observability', description: 'Each connector call includes correlationId', required: true },
  { id: 'o3', category: 'observability', description: 'Errors include stable codes + retryable flags', required: true },
];

// ─── Built-in Workflow Templates ──────────────────────────────────────
export const WORKFLOW_TEMPLATES: WorkflowTemplateBundle[] = [
  {
    metadata: {
      templateId: 'wftpl_high_value_order_tag',
      version: 1,
      name: 'High-Value Order Tagger',
      description: 'Tags orders above a threshold as "HighValue" and notifies via HTTP webhook.',
      category: ['Orders', 'Operations'],
      tags: ['tagging', 'orders', 'alerts'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'write_orders'] },
      ],
      inputPrompts: [
        { key: 'threshold', label: 'Order value threshold', type: 'number', default: 500 },
        { key: 'tag', label: 'Tag to apply', type: 'string', default: 'HighValue' },
      ],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_high_value_tag',
      version: 1,
      name: 'High-Value Order Tagger',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_high_value',
          type: 'condition',
          name: 'Is high value?',
          condition: {
            op: 'gt',
            args: [
              { $ref: '$.trigger.payload.total_price' },
              { $ref: '$.vars.threshold' },
            ],
          },
        },
        {
          id: 'act_tag_order',
          type: 'action',
          name: 'Tag order',
          action: {
            provider: 'shopify',
            operation: 'order.addTags',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              tags: [{ $ref: '$.vars.tag' }],
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 500, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
        },
        { id: 'end_done', type: 'end', name: 'Done' },
        { id: 'end_skip', type: 'end', name: 'Skipped (below threshold)' },
      ],
      edges: [
        { from: 'cond_high_value', to: 'act_tag_order', label: 'true' },
        { from: 'cond_high_value', to: 'end_skip', label: 'false' },
        { from: 'act_tag_order', to: 'end_done', label: 'next' },
      ],
      variables: {
        threshold: 500,
        tag: 'HighValue',
      },
    },
  },

  {
    metadata: {
      templateId: 'wftpl_order_erp_sync',
      version: 1,
      name: 'Order → ERP Sync',
      description: 'Sends order data to an ERP HTTP endpoint on every new order, with retry.',
      category: ['Orders', 'Integrations'],
      tags: ['erp', 'sync', 'http'],
      requiresConnectors: [
        { provider: 'http' },
      ],
      inputPrompts: [
        { key: 'erpEndpoint', label: 'ERP webhook URL', type: 'string' },
      ],
      safety: { dataAccess: ['orders'], pii: true, notes: 'Sends order payload including customer name to ERP.' },
    },
    workflow: {
      id: 'wf_tpl_order_erp_sync',
      version: 1,
      name: 'Order → ERP Sync',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'act_send_erp',
          type: 'action',
          name: 'Send to ERP',
          action: {
            provider: 'http',
            operation: 'request',
            inputs: {
              url: { $ref: '$.vars.erpEndpoint' },
              method: 'POST',
              body: { $ref: '$.trigger.payload' },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
          onError: { mode: 'fail_run', captureErrorAs: 'lastError' },
        },
        {
          id: 'act_store_result',
          type: 'action',
          name: 'Store sync result',
          action: {
            provider: 'storage',
            operation: 'write',
            inputs: {
              storeKey: 'order',
              title: { $tmpl: 'ERP sync: Order {{$.trigger.payload.name}}' },
              payload: {
                orderId: { $ref: '$.trigger.payload.id' },
                erpResponse: { $ref: '$.steps.act_send_erp.result' },
              },
            },
            timeoutMs: 5000,
          },
        },
        { id: 'end', type: 'end', name: 'Done' },
      ],
      edges: [
        { from: 'act_send_erp', to: 'act_store_result', label: 'next' },
        { from: 'act_store_result', to: 'end', label: 'next' },
      ],
      variables: {
        erpEndpoint: 'https://erp.example.com/api/orders',
      },
    },
  },

  {
    metadata: {
      templateId: 'wftpl_fraud_review_routing',
      version: 1,
      name: 'Fraud Review Router',
      description: 'Checks order risk level and routes high-risk orders to manual review (hold fulfillment + tag).',
      category: ['Orders', 'Fraud'],
      tags: ['fraud', 'risk', 'routing'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'write_orders'] },
      ],
      inputPrompts: [],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_fraud_router',
      version: 1,
      name: 'Fraud Review Router',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_risk',
          type: 'condition',
          name: 'Is high risk?',
          condition: {
            op: 'in',
            args: [
              { $ref: '$.trigger.payload.risk_level' },
              ['high', 'critical'],
            ],
          },
        },
        {
          id: 'act_tag_risky',
          type: 'action',
          name: 'Tag as risky',
          action: {
            provider: 'shopify',
            operation: 'order.addTags',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              tags: ['FraudReview'],
            },
            timeoutMs: 10000,
          },
        },
        {
          id: 'act_add_note',
          type: 'action',
          name: 'Add review note',
          action: {
            provider: 'shopify',
            operation: 'order.addNote',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              note: 'Flagged for manual fraud review by SuperApp workflow.',
            },
            timeoutMs: 10000,
          },
        },
        { id: 'end_flagged', type: 'end', name: 'Flagged for review' },
        { id: 'end_clean', type: 'end', name: 'Clean order' },
      ],
      edges: [
        { from: 'cond_risk', to: 'act_tag_risky', label: 'true' },
        { from: 'cond_risk', to: 'end_clean', label: 'false' },
        { from: 'act_tag_risky', to: 'act_add_note', label: 'next' },
        { from: 'act_add_note', to: 'end_flagged', label: 'next' },
      ],
    },
  },

  // ── 4. Low Stock Alert ───────────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_low_stock_alert',
      version: 1,
      name: 'Low Stock Alert',
      description: 'Sends an email notification when inventory quantity drops below a configurable threshold.',
      category: ['Inventory and merch'],
      tags: ['inventory', 'alerts', 'email'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_inventory'] },
        { provider: 'email' },
      ],
      inputPrompts: [
        { key: 'threshold', label: 'Low-stock threshold', type: 'number', default: 10, required: true },
        { key: 'recipientEmail', label: 'Notification email address', type: 'string', required: true },
      ],
      safety: { dataAccess: ['inventory'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_low_stock_alert',
      version: 1,
      name: 'Low Stock Alert',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'inventory_levels.update' },
      nodes: [
        {
          id: 'cond_low_qty',
          type: 'condition',
          name: 'Quantity below threshold?',
          condition: {
            op: 'lt',
            args: [
              { $ref: '$.trigger.payload.available' },
              { $ref: '$.vars.threshold' },
            ],
          },
        },
        {
          id: 'act_send_email',
          type: 'action',
          name: 'Send low-stock email',
          action: {
            provider: 'email',
            operation: 'send',
            inputs: {
              to: { $ref: '$.vars.recipientEmail' },
              subject: { $tmpl: 'Low Stock Alert: {{$.trigger.payload.sku}}' },
              body: { $tmpl: 'Inventory for SKU {{$.trigger.payload.sku}} dropped to {{$.trigger.payload.available}} units.' },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
        },
        { id: 'end_alerted', type: 'end', name: 'Alert sent' },
        { id: 'end_ok', type: 'end', name: 'Stock OK' },
      ],
      edges: [
        { from: 'cond_low_qty', to: 'act_send_email', label: 'true' },
        { from: 'cond_low_qty', to: 'end_ok', label: 'false' },
        { from: 'act_send_email', to: 'end_alerted', label: 'next' },
      ],
      variables: {
        threshold: 10,
        recipientEmail: '',
      },
    },
  },

  // ── 5. Cancel High-Risk Orders ───────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_cancel_high_risk',
      version: 1,
      name: 'Cancel High-Risk Orders',
      description: 'Automatically tags and adds a cancellation note to orders flagged as high risk.',
      category: ['Risk'],
      tags: ['fraud', 'cancel', 'risk'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'write_orders'] },
      ],
      inputPrompts: [],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_cancel_high_risk',
      version: 1,
      name: 'Cancel High-Risk Orders',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_is_high_risk',
          type: 'condition',
          name: 'Is high risk?',
          condition: {
            op: 'eq',
            args: [
              { $ref: '$.trigger.payload.risk_level' },
              'high',
            ],
          },
        },
        {
          id: 'act_tag_cancel',
          type: 'action',
          name: 'Tag order for cancellation',
          action: {
            provider: 'shopify',
            operation: 'order.addTags',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              tags: ['HighRisk-Cancel'],
            },
            timeoutMs: 10000,
          },
        },
        {
          id: 'act_cancel_note',
          type: 'action',
          name: 'Add cancellation note',
          action: {
            provider: 'shopify',
            operation: 'order.addNote',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              note: 'Order flagged as high-risk and marked for cancellation by SuperApp workflow.',
            },
            timeoutMs: 10000,
          },
        },
        { id: 'end_cancelled', type: 'end', name: 'Marked for cancellation' },
        { id: 'end_safe', type: 'end', name: 'Order is safe' },
      ],
      edges: [
        { from: 'cond_is_high_risk', to: 'act_tag_cancel', label: 'true' },
        { from: 'cond_is_high_risk', to: 'end_safe', label: 'false' },
        { from: 'act_tag_cancel', to: 'act_cancel_note', label: 'next' },
        { from: 'act_cancel_note', to: 'end_cancelled', label: 'next' },
      ],
    },
  },

  // ── 6. Customer Welcome Email ────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_customer_welcome_email',
      version: 1,
      name: 'Customer Welcome Email',
      description: 'Sends a welcome email when a new customer account is created.',
      category: ['Customers'],
      tags: ['email', 'customers', 'welcome'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_customers'] },
        { provider: 'email' },
      ],
      inputPrompts: [
        { key: 'fromName', label: 'Sender name', type: 'string', default: 'Our Store' },
        { key: 'subject', label: 'Email subject', type: 'string', default: 'Welcome to our store!' },
      ],
      safety: { dataAccess: ['customers'], pii: true, notes: 'Sends email to customer address.' },
    },
    workflow: {
      id: 'wf_tpl_customer_welcome',
      version: 1,
      name: 'Customer Welcome Email',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'customer.created' },
      nodes: [
        {
          id: 'act_welcome_email',
          type: 'action',
          name: 'Send welcome email',
          action: {
            provider: 'email',
            operation: 'send',
            inputs: {
              to: { $ref: '$.trigger.payload.email' },
              subject: { $ref: '$.vars.subject' },
              body: { $tmpl: 'Hi {{$.trigger.payload.first_name}}, welcome to our store! We are excited to have you.' },
              fromName: { $ref: '$.vars.fromName' },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
        },
        { id: 'end_sent', type: 'end', name: 'Welcome email sent' },
      ],
      edges: [
        { from: 'act_welcome_email', to: 'end_sent', label: 'next' },
      ],
      variables: {
        fromName: 'Our Store',
        subject: 'Welcome to our store!',
      },
    },
  },

  // ── 7. Abandoned Checkout Reminder ───────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_abandoned_checkout_reminder',
      version: 1,
      name: 'Abandoned Checkout Reminder',
      description: 'Waits 1 hour after a checkout is abandoned, then sends a reminder via HTTP to an email service.',
      category: ['Orders', 'Buyer experience'],
      tags: ['checkout', 'abandoned', 'email'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_checkouts'] },
        { provider: 'http' },
      ],
      inputPrompts: [
        { key: 'emailServiceUrl', label: 'Email service endpoint URL', type: 'string', required: true },
        { key: 'delayMinutes', label: 'Delay before sending (minutes)', type: 'number', default: 60 },
      ],
      safety: { dataAccess: ['checkouts'], pii: true, notes: 'Sends checkout email and cart data to external email service.' },
    },
    workflow: {
      id: 'wf_tpl_abandoned_checkout',
      version: 1,
      name: 'Abandoned Checkout Reminder',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'checkout.abandoned' },
      nodes: [
        {
          id: 'delay_wait',
          type: 'delay',
          name: 'Wait 1 hour',
          delay: { mode: 'duration', durationMs: 3600000 },
        },
        {
          id: 'act_send_reminder',
          type: 'action',
          name: 'Send reminder via HTTP',
          action: {
            provider: 'http',
            operation: 'request',
            inputs: {
              url: { $ref: '$.vars.emailServiceUrl' },
              method: 'POST',
              body: {
                email: { $ref: '$.trigger.payload.email' },
                checkoutUrl: { $ref: '$.trigger.payload.abandoned_checkout_url' },
                cartTotal: { $ref: '$.trigger.payload.total_price' },
              },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
        },
        { id: 'end_reminded', type: 'end', name: 'Reminder sent' },
      ],
      edges: [
        { from: 'delay_wait', to: 'act_send_reminder', label: 'next' },
        { from: 'act_send_reminder', to: 'end_reminded', label: 'next' },
      ],
      variables: {
        emailServiceUrl: '',
        delayMinutes: 60,
      },
    },
  },

  // ── 8. Auto-fulfill Digital Orders ───────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_auto_fulfill_digital',
      version: 1,
      name: 'Auto-fulfill Digital Orders',
      description: 'Tags orders containing only digital items as "DigitalOrder" and marks them eligible for auto-fulfillment.',
      category: ['Fulfillment', 'Orders'],
      tags: ['fulfillment', 'digital', 'auto'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'write_orders'] },
      ],
      inputPrompts: [],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_auto_fulfill_digital',
      version: 1,
      name: 'Auto-fulfill Digital Orders',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_all_digital',
          type: 'condition',
          name: 'All items digital?',
          condition: {
            op: 'eq',
            args: [
              { $ref: '$.trigger.payload.requires_shipping' },
              false,
            ],
          },
        },
        {
          id: 'act_tag_digital',
          type: 'action',
          name: 'Tag as DigitalOrder',
          action: {
            provider: 'shopify',
            operation: 'order.addTags',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              tags: ['DigitalOrder'],
            },
            timeoutMs: 10000,
          },
        },
        {
          id: 'act_digital_note',
          type: 'action',
          name: 'Add auto-fulfill note',
          action: {
            provider: 'shopify',
            operation: 'order.addNote',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              note: 'Auto-fulfill eligible',
            },
            timeoutMs: 10000,
          },
        },
        { id: 'end_tagged', type: 'end', name: 'Tagged for auto-fulfillment' },
        { id: 'end_physical', type: 'end', name: 'Physical order — skip' },
      ],
      edges: [
        { from: 'cond_all_digital', to: 'act_tag_digital', label: 'true' },
        { from: 'cond_all_digital', to: 'end_physical', label: 'false' },
        { from: 'act_tag_digital', to: 'act_digital_note', label: 'next' },
        { from: 'act_digital_note', to: 'end_tagged', label: 'next' },
      ],
    },
  },

  // ── 9. VIP Customer Tagger ───────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_vip_customer_tagger',
      version: 1,
      name: 'VIP Customer Tagger',
      description: 'Tags customers as "VIP" when they place an order above a configurable total.',
      category: ['Customers', 'Loyalty'],
      tags: ['vip', 'tagging', 'loyalty'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'read_customers', 'write_customers'] },
      ],
      inputPrompts: [
        { key: 'vipThreshold', label: 'Minimum order total for VIP', type: 'number', default: 500 },
      ],
      safety: { dataAccess: ['orders', 'customers'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_vip_tagger',
      version: 1,
      name: 'VIP Customer Tagger',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_vip_total',
          type: 'condition',
          name: 'Order total above VIP threshold?',
          condition: {
            op: 'gt',
            args: [
              { $ref: '$.trigger.payload.total_price' },
              { $ref: '$.vars.vipThreshold' },
            ],
          },
        },
        {
          id: 'act_tag_vip',
          type: 'action',
          name: 'Tag customer as VIP',
          action: {
            provider: 'shopify',
            operation: 'customer.addTags',
            inputs: {
              customerId: { $ref: '$.trigger.payload.customer.admin_graphql_api_id' },
              tags: ['VIP'],
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 500, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 10000,
          },
        },
        { id: 'end_vip', type: 'end', name: 'Customer tagged VIP' },
        { id: 'end_regular', type: 'end', name: 'Regular customer' },
      ],
      edges: [
        { from: 'cond_vip_total', to: 'act_tag_vip', label: 'true' },
        { from: 'cond_vip_total', to: 'end_regular', label: 'false' },
        { from: 'act_tag_vip', to: 'end_vip', label: 'next' },
      ],
      variables: {
        vipThreshold: 500,
      },
    },
  },

  // ── 10. Order to Slack ───────────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_order_to_slack',
      version: 1,
      name: 'Order to Slack',
      description: 'Posts a Slack message with order details every time a new order is placed.',
      category: ['Orders', 'Operations'],
      tags: ['slack', 'notifications', 'orders'],
      requiresConnectors: [
        { provider: 'slack' },
      ],
      inputPrompts: [
        { key: 'slackChannel', label: 'Slack channel ID', type: 'string', required: true },
      ],
      safety: { dataAccess: ['orders'], pii: true, notes: 'Posts order summary including customer name to Slack channel.' },
    },
    workflow: {
      id: 'wf_tpl_order_slack',
      version: 1,
      name: 'Order to Slack',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'act_slack_msg',
          type: 'action',
          name: 'Post to Slack',
          action: {
            provider: 'slack',
            operation: 'chat.postMessage',
            inputs: {
              channel: { $ref: '$.vars.slackChannel' },
              text: { $tmpl: 'New order {{$.trigger.payload.name}} — {{$.trigger.payload.total_price}} {{$.trigger.payload.currency}} from {{$.trigger.payload.customer.first_name}} {{$.trigger.payload.customer.last_name}}' },
            },
            retry: { maxAttempts: 2, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 15000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 15000,
          },
        },
        { id: 'end_notified', type: 'end', name: 'Slack notification sent' },
      ],
      edges: [
        { from: 'act_slack_msg', to: 'end_notified', label: 'next' },
      ],
      variables: {
        slackChannel: '',
      },
    },
  },

  // ── 11. Product Update Sync ──────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_product_update_sync',
      version: 1,
      name: 'Product Update Sync',
      description: 'Forwards product update events to an external system via HTTP webhook.',
      category: ['Inventory and merch', 'Integrations'],
      tags: ['product', 'sync', 'webhook'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_products'] },
        { provider: 'http' },
      ],
      inputPrompts: [
        { key: 'syncEndpoint', label: 'External sync endpoint URL', type: 'string', required: true },
      ],
      safety: { dataAccess: ['products'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_product_sync',
      version: 1,
      name: 'Product Update Sync',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'product.updated' },
      nodes: [
        {
          id: 'act_http_sync',
          type: 'action',
          name: 'Send product data',
          action: {
            provider: 'http',
            operation: 'request',
            inputs: {
              url: { $ref: '$.vars.syncEndpoint' },
              method: 'POST',
              body: { $ref: '$.trigger.payload' },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
          onError: { mode: 'fail_run', captureErrorAs: 'lastError' },
        },
        { id: 'end_synced', type: 'end', name: 'Product synced' },
      ],
      edges: [
        { from: 'act_http_sync', to: 'end_synced', label: 'next' },
      ],
      variables: {
        syncEndpoint: '',
      },
    },
  },

  // ── 12. B2B Order Review ─────────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_b2b_order_review',
      version: 1,
      name: 'B2B Order Review',
      description: 'Flags orders from B2B-tagged customers for manual review by tagging the order and adding a note.',
      category: ['B2B', 'Orders'],
      tags: ['b2b', 'review', 'orders'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders', 'write_orders', 'read_customers'] },
      ],
      inputPrompts: [],
      safety: { dataAccess: ['orders', 'customers'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_b2b_review',
      version: 1,
      name: 'B2B Order Review',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'cond_is_b2b',
          type: 'condition',
          name: 'Customer tagged b2b?',
          condition: {
            op: 'contains',
            args: [
              { $ref: '$.trigger.payload.customer.tags' },
              'b2b',
            ],
          },
        },
        {
          id: 'act_tag_b2b',
          type: 'action',
          name: 'Tag order B2B-Review',
          action: {
            provider: 'shopify',
            operation: 'order.addTags',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              tags: ['B2B-Review'],
            },
            timeoutMs: 10000,
          },
        },
        {
          id: 'act_b2b_note',
          type: 'action',
          name: 'Add B2B review note',
          action: {
            provider: 'shopify',
            operation: 'order.addNote',
            inputs: {
              orderId: { $ref: '$.trigger.payload.admin_graphql_api_id' },
              note: 'B2B order flagged for review by SuperApp workflow.',
            },
            timeoutMs: 10000,
          },
        },
        { id: 'end_b2b_flagged', type: 'end', name: 'B2B order flagged' },
        { id: 'end_not_b2b', type: 'end', name: 'Non-B2B order' },
      ],
      edges: [
        { from: 'cond_is_b2b', to: 'act_tag_b2b', label: 'true' },
        { from: 'cond_is_b2b', to: 'end_not_b2b', label: 'false' },
        { from: 'act_tag_b2b', to: 'act_b2b_note', label: 'next' },
        { from: 'act_b2b_note', to: 'end_b2b_flagged', label: 'next' },
      ],
    },
  },

  // ── 13. Payment Reminder ─────────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_payment_reminder',
      version: 1,
      name: 'Payment Reminder',
      description: 'Waits 3 days after an order is created, checks if payment is still pending via tag, then sends a reminder email.',
      category: ['Orders', 'Payment reminders'],
      tags: ['payment', 'reminder', 'email'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders'] },
        { provider: 'email' },
      ],
      inputPrompts: [
        { key: 'delayDays', label: 'Days to wait before reminder', type: 'number', default: 3 },
        { key: 'recipientEmail', label: 'Merchant notification email', type: 'string', required: true },
      ],
      safety: { dataAccess: ['orders'], pii: true, notes: 'Sends order details including customer email.' },
    },
    workflow: {
      id: 'wf_tpl_payment_reminder',
      version: 1,
      name: 'Payment Reminder',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'delay_3d',
          type: 'delay',
          name: 'Wait 3 days',
          delay: { mode: 'duration', durationMs: 259200000 },
        },
        {
          id: 'cond_pending',
          type: 'condition',
          name: 'Payment still pending?',
          condition: {
            op: 'eq',
            args: [
              { $ref: '$.trigger.payload.financial_status' },
              'pending',
            ],
          },
        },
        {
          id: 'act_reminder_email',
          type: 'action',
          name: 'Send payment reminder',
          action: {
            provider: 'email',
            operation: 'send',
            inputs: {
              to: { $ref: '$.vars.recipientEmail' },
              subject: { $tmpl: 'Payment Reminder: Order {{$.trigger.payload.name}}' },
              body: { $tmpl: 'Order {{$.trigger.payload.name}} totalling {{$.trigger.payload.total_price}} {{$.trigger.payload.currency}} is still pending payment after 3 days.' },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 1000, maxDelayMs: 30000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 30000,
          },
        },
        { id: 'end_reminded', type: 'end', name: 'Reminder sent' },
        { id: 'end_paid', type: 'end', name: 'Already paid' },
      ],
      edges: [
        { from: 'delay_3d', to: 'cond_pending', label: 'next' },
        { from: 'cond_pending', to: 'act_reminder_email', label: 'true' },
        { from: 'cond_pending', to: 'end_paid', label: 'false' },
        { from: 'act_reminder_email', to: 'end_reminded', label: 'next' },
      ],
      variables: {
        delayDays: 3,
        recipientEmail: '',
      },
    },
  },

  // ── 14. Loyalty Points Logger ────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_loyalty_points_logger',
      version: 1,
      name: 'Loyalty Points Logger',
      description: 'Logs order totals to the "analytics" storage store for loyalty points tracking.',
      category: ['Loyalty', 'Custom data'],
      tags: ['loyalty', 'points', 'analytics'],
      requiresConnectors: [
        { provider: 'shopify', scopes: ['read_orders'] },
        { provider: 'storage' },
      ],
      inputPrompts: [
        { key: 'pointsMultiplier', label: 'Points per dollar spent', type: 'number', default: 1 },
      ],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_loyalty_logger',
      version: 1,
      name: 'Loyalty Points Logger',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'event', provider: 'shopify', event: 'order.created' },
      nodes: [
        {
          id: 'act_store_points',
          type: 'action',
          name: 'Write to analytics store',
          action: {
            provider: 'storage',
            operation: 'write',
            inputs: {
              storeKey: 'analytics',
              title: { $tmpl: 'Loyalty: Order {{$.trigger.payload.name}}' },
              payload: {
                orderId: { $ref: '$.trigger.payload.id' },
                customerId: { $ref: '$.trigger.payload.customer.id' },
                orderTotal: { $ref: '$.trigger.payload.total_price' },
                currency: { $ref: '$.trigger.payload.currency' },
                pointsMultiplier: { $ref: '$.vars.pointsMultiplier' },
              },
            },
            timeoutMs: 5000,
          },
        },
        { id: 'end_logged', type: 'end', name: 'Points logged' },
      ],
      edges: [
        { from: 'act_store_points', to: 'end_logged', label: 'next' },
      ],
      variables: {
        pointsMultiplier: 1,
      },
    },
  },

  // ── 15. Daily Order Summary ──────────────────────────────────────────
  {
    metadata: {
      templateId: 'wftpl_daily_order_summary',
      version: 1,
      name: 'Daily Order Summary',
      description: 'Runs on a daily schedule and sends an HTTP request to a reporting endpoint to generate an order summary.',
      category: ['Orders', 'Operations'],
      tags: ['reporting', 'daily', 'summary'],
      requiresConnectors: [
        { provider: 'http' },
      ],
      inputPrompts: [
        { key: 'reportEndpoint', label: 'Reporting endpoint URL', type: 'string', required: true },
        { key: 'cronSchedule', label: 'Cron schedule expression', type: 'string', default: '0 8 * * *' },
      ],
      safety: { dataAccess: ['orders'], pii: false },
    },
    workflow: {
      id: 'wf_tpl_daily_summary',
      version: 1,
      name: 'Daily Order Summary',
      status: 'draft',
      tenantId: '__TENANT__',
      trigger: { type: 'schedule', provider: 'superapp', event: 'cron.0_8_*_*_*' },
      nodes: [
        {
          id: 'act_report_http',
          type: 'action',
          name: 'Send report request',
          action: {
            provider: 'http',
            operation: 'request',
            inputs: {
              url: { $ref: '$.vars.reportEndpoint' },
              method: 'POST',
              body: {
                reportType: 'daily_order_summary',
                generatedAt: { $tmpl: '{{$.trigger.timestamp}}' },
              },
            },
            retry: { maxAttempts: 3, backoff: 'exponential', baseDelayMs: 2000, maxDelayMs: 60000, jitter: true, retryOn: ['timeout', 'network', '5xx', '429', 'connector_retryable'] },
            timeoutMs: 60000,
          },
          onError: { mode: 'fail_run', captureErrorAs: 'lastError' },
        },
        { id: 'end_reported', type: 'end', name: 'Report triggered' },
      ],
      edges: [
        { from: 'act_report_http', to: 'end_reported', label: 'next' },
      ],
      variables: {
        reportEndpoint: '',
        cronSchedule: '0 8 * * *',
      },
    },
  },
];

export function findWorkflowTemplate(templateId: string): WorkflowTemplateBundle | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.metadata.templateId === templateId);
}

export function getWorkflowTemplatesByCategory(category?: string): WorkflowTemplateBundle[] {
  if (!category) return WORKFLOW_TEMPLATES;
  return WORKFLOW_TEMPLATES.filter(t => t.metadata.category.includes(category));
}

/**
 * Install a template: clone the workflow, replace tenant ID, and resolve input variables.
 */
export function installTemplate(
  bundle: WorkflowTemplateBundle,
  tenantId: string,
  inputs: Record<string, unknown>,
  workflowId: string,
): Workflow {
  const wf = structuredClone(bundle.workflow);
  wf.id = workflowId;
  wf.tenantId = tenantId;
  wf.status = 'draft';
  wf.createdAt = new Date().toISOString();
  wf.updatedAt = new Date().toISOString();

  const merged = { ...wf.variables };
  for (const prompt of bundle.metadata.inputPrompts) {
    if (inputs[prompt.key] !== undefined) {
      merged[prompt.key] = inputs[prompt.key];
    } else if (prompt.default !== undefined) {
      merged[prompt.key] = prompt.default;
    }
  }
  wf.variables = merged;

  return wf;
}
