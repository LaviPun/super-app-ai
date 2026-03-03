/**
 * Shopify Flow Bridge — integration layer between SuperApp workflow engine
 * and Shopify Flow's native execution environment.
 *
 * ## Architecture
 *
 * SuperApp supports two execution modes for workflows:
 *
 * 1. **Local execution** (`executionMode: 'local'`)
 *    The WorkflowEngineService runs the workflow graph directly, executing
 *    each node (condition/action/transform/delay) in sequence. Uses the
 *    built-in connector registry (shopify, http, slack, email, storage).
 *
 * 2. **Shopify Flow delegation** (`executionMode: 'shopify_flow'`)
 *    The app emits a trigger event to Shopify Flow, which handles execution.
 *    SuperApp provides Flow trigger extensions and action extensions that
 *    Flow calls back into at runtime.
 *
 * ## How Shopify Flow Integration Works
 *
 * ### App-provided Triggers (SuperApp → Flow)
 * When an event happens in SuperApp (e.g., module published, connector synced,
 * data store record created), the app can emit a trigger event that starts
 * a Shopify Flow workflow.
 *
 * Runtime:
 *   SuperApp event → emitFlowTrigger(topic, payload)
 *     → Shopify Flow receives trigger
 *     → Flow evaluates conditions
 *     → Flow runs actions (including calling back to SuperApp)
 *
 * ### App-provided Actions (Flow → SuperApp)
 * SuperApp registers action extensions with Shopify Flow. When a merchant
 * uses these actions in their Flow workflows, Shopify calls our app's
 * action webhook endpoint with the payload.
 *
 * Runtime:
 *   Shopify Flow executes workflow step
 *     → calls POST /api/flow-actions/:actionId on SuperApp
 *     → SuperApp performs the action (tag, store data, HTTP call, etc.)
 *     → SuperApp returns result to Flow
 *
 * ### Workflow Templates in Flow
 * SuperApp's workflow templates can be exported as Shopify Flow templates
 * via the Shopify CLI. This allows merchants to install them directly
 * from Shopify Flow's template library.
 *
 * ## Trigger Topics
 */

export const FLOW_TRIGGER_TOPICS = {
  MODULE_PUBLISHED: 'superapp/module/published',
  CONNECTOR_SYNCED: 'superapp/connector/synced',
  DATA_RECORD_CREATED: 'superapp/data/record_created',
  WORKFLOW_COMPLETED: 'superapp/workflow/completed',
  WORKFLOW_FAILED: 'superapp/workflow/failed',
} as const;

export type FlowTriggerTopic = typeof FLOW_TRIGGER_TOPICS[keyof typeof FLOW_TRIGGER_TOPICS];

const TOPIC_TO_HANDLE: Record<FlowTriggerTopic, string> = {
  'superapp/module/published': 'superapp-module-published',
  'superapp/connector/synced': 'superapp-connector-synced',
  'superapp/data/record_created': 'superapp-data-record-created',
  'superapp/workflow/completed': 'superapp-workflow-completed',
  'superapp/workflow/failed': 'superapp-workflow-failed',
};

const HANDLE_TO_ACTION_ID: Record<string, string> = {
  'superapp-tag-order': 'superapp-tag-order',
  'superapp-write-to-store': 'superapp-write-to-store',
  'superapp-send-http': 'superapp-send-http',
  'superapp-send-notification': 'superapp-send-notification',
};

const MAX_PAYLOAD_BYTES = 50_000;

/**
 * Flow Action definitions that SuperApp exposes to Shopify Flow.
 * Each action corresponds to a connector operation that Flow can invoke.
 */
export const FLOW_ACTIONS = {
  TAG_ORDER: {
    id: 'superapp-tag-order',
    name: 'SuperApp: Tag Order',
    description: 'Add tags to an order via SuperApp.',
    inputFields: [
      { key: 'orderId', label: 'Order ID', type: 'string', required: true },
      { key: 'tags', label: 'Tags (comma-separated)', type: 'string', required: true },
    ],
  },
  WRITE_TO_STORE: {
    id: 'superapp-write-to-store',
    name: 'SuperApp: Write to Data Store',
    description: 'Save data to a SuperApp data store.',
    inputFields: [
      { key: 'storeKey', label: 'Store key', type: 'string', required: true },
      { key: 'title', label: 'Record title', type: 'string', required: false },
      { key: 'payload', label: 'JSON payload', type: 'string', required: true },
    ],
  },
  SEND_HTTP: {
    id: 'superapp-send-http',
    name: 'SuperApp: Send HTTP Request',
    description: 'Send an HTTP request via SuperApp (with SSRF protection).',
    inputFields: [
      { key: 'url', label: 'URL (HTTPS)', type: 'string', required: true },
      { key: 'method', label: 'HTTP Method', type: 'string', required: true },
      { key: 'body', label: 'Request body (JSON)', type: 'string', required: false },
    ],
  },
  SEND_NOTIFICATION: {
    id: 'superapp-send-notification',
    name: 'SuperApp: Send Email Notification',
    description: 'Send an email notification via SuperApp.',
    inputFields: [
      { key: 'to', label: 'Recipient email', type: 'string', required: true },
      { key: 'subject', label: 'Subject', type: 'string', required: true },
      { key: 'body', label: 'Body (HTML)', type: 'string', required: true },
    ],
  },
} as const;

/**
 * Emit a trigger event to Shopify Flow via the Admin API
 * `flowTriggerReceive` mutation. Requires a deployed Flow trigger extension.
 *
 * @see https://shopify.dev/docs/apps/build/flow/triggers/create#step-4-test-your-trigger
 */
export async function emitFlowTrigger(
  shop: string,
  accessToken: string,
  topic: FlowTriggerTopic,
  payload: Record<string, unknown>,
): Promise<{ emitted: boolean; flowTriggerId?: string; error?: string }> {
  const handle = TOPIC_TO_HANDLE[topic];
  if (!handle) {
    return { emitted: false, error: `Unknown trigger topic: ${topic}` };
  }

  const payloadJson = JSON.stringify(payload);
  if (new TextEncoder().encode(payloadJson).length > MAX_PAYLOAD_BYTES) {
    return { emitted: false, error: `Payload exceeds ${MAX_PAYLOAD_BYTES} byte limit` };
  }

  const mutation = `
    mutation flowTriggerReceive($handle: String!, $payload: JSON!) {
      flowTriggerReceive(handle: $handle, payload: $payload) {
        userErrors { field message }
      }
    }
  `;

  try {
    const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-01';
    const res = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: mutation, variables: { handle, payload } }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return { emitted: false, error: `Admin API ${res.status}: ${text.slice(0, 500)}` };
    }

    const json = await res.json() as {
      data?: { flowTriggerReceive?: { userErrors?: Array<{ field: string; message: string }> } };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      return { emitted: false, error: json.errors.map(e => e.message).join('; ') };
    }

    const userErrors = json.data?.flowTriggerReceive?.userErrors ?? [];
    if (userErrors.length) {
      return { emitted: false, error: userErrors.map(e => e.message).join('; ') };
    }

    return { emitted: true };
  } catch (err) {
    return { emitted: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Resolve a Flow action handle to an internal action ID.
 */
export function resolveFlowActionId(handle: string): string | undefined {
  return HANDLE_TO_ACTION_ID[handle];
}

/**
 * Verify Flow action webhook HMAC signature.
 * Shopify sends HMAC in `x-shopify-hmac-sha256` header.
 */
export async function verifyFlowActionHmac(
  rawBody: string,
  hmacHeader: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return computed === hmacHeader;
}

/**
 * Handle an incoming Flow action webhook.
 *
 * When Shopify Flow executes a SuperApp-provided action, it sends
 * a POST request to our app with the action payload. This function
 * routes to the appropriate connector.
 */
export async function handleFlowAction(
  actionId: string,
  payload: Record<string, unknown>,
  shopDomain: string,
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  const { getConnector } = await import('./connectors/index');

  switch (actionId) {
    case 'superapp-tag-order': {
      const connector = getConnector('shopify');
      if (!connector) return { success: false, error: 'Shopify connector not registered' };
      const result = await connector.invoke(
        { type: 'shopify', shop: shopDomain, accessToken: '' }, // token resolved separately
        {
          runId: `flow-action-${Date.now()}`,
          stepId: actionId,
          tenantId: shopDomain,
          operation: 'order.addTags',
          inputs: {
            orderId: payload.orderId,
            tags: typeof payload.tags === 'string' ? (payload.tags as string).split(',').map(t => t.trim()) : payload.tags,
          },
          timeoutMs: 10000,
        },
      );
      return { success: result.ok, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.message };
    }

    case 'superapp-write-to-store': {
      const connector = getConnector('storage');
      if (!connector) return { success: false, error: 'Storage connector not registered' };
      let parsedPayload: unknown;
      try {
        parsedPayload = typeof payload.payload === 'string' ? JSON.parse(payload.payload as string) : payload.payload;
      } catch {
        parsedPayload = { raw: payload.payload };
      }
      const result = await connector.invoke(
        { type: 'none' },
        {
          runId: `flow-action-${Date.now()}`,
          stepId: actionId,
          tenantId: shopDomain,
          operation: 'write',
          inputs: {
            storeKey: payload.storeKey,
            title: payload.title,
            payload: parsedPayload,
          },
          timeoutMs: 5000,
        },
      );
      return { success: result.ok, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.message };
    }

    case 'superapp-send-http': {
      const connector = getConnector('http');
      if (!connector) return { success: false, error: 'HTTP connector not registered' };
      let body: unknown;
      try {
        body = typeof payload.body === 'string' ? JSON.parse(payload.body as string) : payload.body;
      } catch {
        body = payload.body;
      }
      const result = await connector.invoke(
        { type: 'none' },
        {
          runId: `flow-action-${Date.now()}`,
          stepId: actionId,
          tenantId: shopDomain,
          operation: 'request',
          inputs: { url: payload.url, method: payload.method ?? 'POST', body },
          timeoutMs: 30000,
        },
      );
      return { success: result.ok, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.message };
    }

    case 'superapp-send-notification': {
      const connector = getConnector('email');
      if (!connector) return { success: false, error: 'Email connector not registered' };
      const result = await connector.invoke(
        { type: 'api_key', apiKey: process.env.EMAIL_API_KEY ?? '' },
        {
          runId: `flow-action-${Date.now()}`,
          stepId: actionId,
          tenantId: shopDomain,
          operation: 'send',
          inputs: { to: payload.to, subject: payload.subject, body: payload.body },
          timeoutMs: 10000,
        },
      );
      return { success: result.ok, output: result.ok ? result.output : undefined, error: result.ok ? undefined : result.message };
    }

    default:
      return { success: false, error: `Unknown action: ${actionId}` };
  }
}
