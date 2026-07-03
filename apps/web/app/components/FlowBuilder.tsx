import { useState, useCallback } from 'react';
import {
  Card, BlockStack, Text, Button, InlineStack, Badge, Select,
  TextField, Modal, Box,
} from '@shopify/polaris';

type TriggerType =
  | 'MANUAL'
  | 'SHOPIFY_WEBHOOK_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED'
  | 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED'
  | 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED'
  | 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED'
  | 'SHOPIFY_WEBHOOK_COLLECTION_CREATED'
  | 'SCHEDULED'
  | 'SUPERAPP_MODULE_PUBLISHED'
  | 'SUPERAPP_CONNECTOR_SYNCED'
  | 'SUPERAPP_DATA_RECORD_CREATED'
  | 'SUPERAPP_WORKFLOW_COMPLETED'
  | 'SUPERAPP_WORKFLOW_FAILED';

type AuthConfig = {
  username?: string;
  password?: string;
  token?: string;
  headerName?: string;
  headerValue?: string;
};

type FlowStep =
  | { kind: 'HTTP_REQUEST'; connectorId: string; path: string; method: string; bodyMapping: Record<string, string> }
  | { kind: 'SEND_HTTP_REQUEST'; url: string; method: string; headers: Record<string, string>; headersText?: string; body: string; authType: string; authConfig: AuthConfig }
  | { kind: 'TAG_CUSTOMER'; tag: string }
  | { kind: 'ADD_ORDER_NOTE'; note: string }
  | { kind: 'TAG_ORDER'; tags: string }
  | { kind: 'WRITE_TO_STORE'; storeKey: string; titleExpr: string; payloadMapping: Record<string, string> }
  | { kind: 'SEND_EMAIL_NOTIFICATION'; to: string; subject: string; body: string }
  | { kind: 'SEND_SLACK_MESSAGE'; webhookUrl?: string; channel?: string; text: string }
  | { kind: 'CONDITION'; field: string; operator: string; value: string; thenSteps: FlowStep[]; elseSteps: FlowStep[] };

type FlowSpec = {
  trigger: TriggerType;
  steps: FlowStep[];
};

type Props = {
  initialSpec?: FlowSpec;
  connectors?: Array<{ id: string; name: string }>;
  onSave: (spec: FlowSpec) => void;
  saving?: boolean;
};

/**
 * Triggers that are actually delivered to the flow runner today:
 * - MANUAL           → /api/flow/run, /api/agent/flows
 * - ORDER_CREATED    → webhooks route (orders/create is subscribed in shopify.app.toml)
 * - PRODUCT_UPDATED  → webhooks route (products/update is subscribed)
 * - SCHEDULED        → /api/cron via FlowSchedule rows
 * Everything else is defined in the spec but no webhook subscription or event
 * emitter dispatches it yet — offering those silently would create flows that
 * never run, so they are shown disabled.
 */
const LIVE_TRIGGERS: ReadonlySet<string> = new Set([
  'MANUAL',
  'SHOPIFY_WEBHOOK_ORDER_CREATED',
  'SHOPIFY_WEBHOOK_PRODUCT_UPDATED',
  'SCHEDULED',
]);

const TRIGGER_OPTIONS = [
  { label: 'Manual', value: 'MANUAL' },
  { label: 'Order Created', value: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
  { label: 'Product Updated', value: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Customer Created — requires webhook wiring', value: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED', disabled: true },
  { label: 'Fulfillment Created — requires webhook wiring', value: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED', disabled: true },
  { label: 'Draft Order Created — requires webhook wiring', value: 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED', disabled: true },
  { label: 'Collection Created — requires webhook wiring', value: 'SHOPIFY_WEBHOOK_COLLECTION_CREATED', disabled: true },
  { label: 'SuperApp: Module Published — coming soon', value: 'SUPERAPP_MODULE_PUBLISHED', disabled: true },
  { label: 'SuperApp: Connector Synced — coming soon', value: 'SUPERAPP_CONNECTOR_SYNCED', disabled: true },
  { label: 'SuperApp: Data Record Created — coming soon', value: 'SUPERAPP_DATA_RECORD_CREATED', disabled: true },
  { label: 'SuperApp: Workflow Completed — coming soon', value: 'SUPERAPP_WORKFLOW_COMPLETED', disabled: true },
  { label: 'SuperApp: Workflow Failed — coming soon', value: 'SUPERAPP_WORKFLOW_FAILED', disabled: true },
];

const STEP_KINDS = [
  { label: 'Send HTTP Request', value: 'SEND_HTTP_REQUEST' },
  { label: 'HTTP Request (Connector)', value: 'HTTP_REQUEST' },
  { label: 'Condition', value: 'CONDITION' },
  { label: 'Tag Customer', value: 'TAG_CUSTOMER' },
  { label: 'Tag Order', value: 'TAG_ORDER' },
  { label: 'Add Order Note', value: 'ADD_ORDER_NOTE' },
  { label: 'Write to Data Store', value: 'WRITE_TO_STORE' },
  { label: 'Send Email Notification', value: 'SEND_EMAIL_NOTIFICATION' },
  { label: 'Send Slack Message', value: 'SEND_SLACK_MESSAGE' },
];

// Nested branch steps support everything except another Condition (the runner
// executes nested conditions, but the builder keeps branching one level deep).
const NESTED_STEP_KINDS = STEP_KINDS.filter(k => k.value !== 'CONDITION');

const HTTP_METHOD_OPTIONS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
  { label: 'OPTIONS', value: 'OPTIONS' },
  { label: 'HEAD', value: 'HEAD' },
];

const METHOD_OPTIONS = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
];

const AUTH_TYPE_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Custom Header', value: 'custom_header' },
];

const CONDITION_OPERATOR_OPTIONS = [
  { label: 'Equal to', value: 'equal_to' },
  { label: 'Not equal to', value: 'not_equal_to' },
  { label: 'Greater than', value: 'greater_than' },
  { label: 'Less than', value: 'less_than' },
  { label: 'Greater than or equal', value: 'greater_than_or_equal' },
  { label: 'Less than or equal', value: 'less_than_or_equal' },
  { label: 'Contains', value: 'contains' },
  { label: 'Not contains', value: 'not_contains' },
  { label: 'Starts with', value: 'starts_with' },
  { label: 'Ends with', value: 'ends_with' },
  { label: 'Is set', value: 'is_set' },
  { label: 'Is not set', value: 'is_not_set' },
];

const NO_VALUE_OPERATORS = new Set(['is_set', 'is_not_set']);

function defaultStep(kind: string): FlowStep {
  switch (kind) {
    case 'HTTP_REQUEST': return { kind: 'HTTP_REQUEST', connectorId: '', path: '/api/v1/resource', method: 'POST', bodyMapping: {} };
    case 'SEND_HTTP_REQUEST': return { kind: 'SEND_HTTP_REQUEST', url: 'https://', method: 'POST', headers: {}, body: '', authType: 'none', authConfig: {} };
    case 'TAG_CUSTOMER': return { kind: 'TAG_CUSTOMER', tag: '' };
    case 'TAG_ORDER': return { kind: 'TAG_ORDER', tags: '' };
    case 'ADD_ORDER_NOTE': return { kind: 'ADD_ORDER_NOTE', note: '' };
    case 'WRITE_TO_STORE': return { kind: 'WRITE_TO_STORE', storeKey: 'analytics', titleExpr: '', payloadMapping: {} };
    case 'SEND_EMAIL_NOTIFICATION': return { kind: 'SEND_EMAIL_NOTIFICATION', to: '', subject: '', body: '' };
    case 'SEND_SLACK_MESSAGE': return { kind: 'SEND_SLACK_MESSAGE', channel: '#general', text: '' };
    case 'CONDITION': return { kind: 'CONDITION', field: '', operator: 'equal_to', value: '', thenSteps: [], elseSteps: [] };
    default: return { kind: 'TAG_CUSTOMER', tag: '' };
  }
}

function NodeBox({ label, badge, tone, children, onDelete }: {
  label: string;
  badge?: string;
  tone?: 'success' | 'info' | 'attention' | 'critical' | 'magic';
  children?: React.ReactNode;
  onDelete?: () => void;
}) {
  return (
    <div style={{
      border: '2px solid #e1e3e5',
      borderRadius: 12,
      padding: 16,
      background: '#fff',
      position: 'relative',
      minWidth: 280,
    }}>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200">
            <Text as="h3" variant="headingSm">{label}</Text>
            {badge && <Badge tone={tone}>{badge}</Badge>}
          </InlineStack>
          {onDelete && (
            <Button size="slim" tone="critical" variant="plain" onClick={onDelete}>Remove</Button>
          )}
        </InlineStack>
        {children}
      </BlockStack>
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      <svg width="24" height="32" viewBox="0 0 24 32">
        <line x1="12" y1="0" x2="12" y2="24" stroke="#8c9196" strokeWidth="2" />
        <polygon points="6,24 18,24 12,32" fill="#8c9196" />
      </svg>
    </div>
  );
}

type ConnectorOption = { label: string; value: string };

/**
 * The per-kind configuration fields for one step. Shared between top-level
 * steps and nested Condition branch steps.
 */
function StepFields({ step, connectorOptions, onChange }: {
  step: FlowStep;
  connectorOptions: ConnectorOption[];
  onChange: (patch: Partial<FlowStep>) => void;
}) {
  return (
    <>
      {step.kind === 'HTTP_REQUEST' && (
        <>
          <Select label="Connector" options={connectorOptions} value={step.connectorId} onChange={(v) => onChange({ connectorId: v })} />
          <InlineStack gap="200">
            <div style={{ width: 100 }}>
              <Select label="Method" labelHidden options={METHOD_OPTIONS} value={step.method} onChange={(v) => onChange({ method: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="Path" labelHidden value={step.path} onChange={(v) => onChange({ path: v })} autoComplete="off" />
            </div>
          </InlineStack>
        </>
      )}
      {step.kind === 'SEND_HTTP_REQUEST' && (
        <>
          <TextField label="URL" value={step.url} onChange={(v) => onChange({ url: v })} autoComplete="off" placeholder="https://api.example.com/endpoint" helpText="Must be HTTPS" />
          <InlineStack gap="200">
            <div style={{ width: 130 }}>
              <Select label="Method" options={HTTP_METHOD_OPTIONS} value={step.method} onChange={(v) => onChange({ method: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <Select label="Auth" options={AUTH_TYPE_OPTIONS} value={step.authType} onChange={(v) => onChange({ authType: v, authConfig: {} })} />
            </div>
          </InlineStack>
          {step.authType === 'basic' && (
            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <TextField label="Username" value={step.authConfig?.username ?? ''} onChange={(v) => onChange({ authConfig: { ...step.authConfig, username: v } })} autoComplete="off" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Password" type="password" value={step.authConfig?.password ?? ''} onChange={(v) => onChange({ authConfig: { ...step.authConfig, password: v } })} autoComplete="off" />
              </div>
            </InlineStack>
          )}
          {step.authType === 'bearer' && (
            <TextField label="Bearer Token" value={step.authConfig?.token ?? ''} onChange={(v) => onChange({ authConfig: { ...step.authConfig, token: v } })} autoComplete="off" type="password" />
          )}
          {step.authType === 'custom_header' && (
            <InlineStack gap="200">
              <div style={{ flex: 1 }}>
                <TextField label="Header Name" value={step.authConfig?.headerName ?? ''} onChange={(v) => onChange({ authConfig: { ...step.authConfig, headerName: v } })} autoComplete="off" placeholder="X-API-Key" />
              </div>
              <div style={{ flex: 1 }}>
                <TextField label="Header Value" value={step.authConfig?.headerValue ?? ''} onChange={(v) => onChange({ authConfig: { ...step.authConfig, headerValue: v } })} autoComplete="off" type="password" />
              </div>
            </InlineStack>
          )}
          <TextField
            label="Headers (JSON)"
            value={step.headersText ?? JSON.stringify(step.headers ?? {})}
            onChange={(v) => {
              // Keep the raw text so typing through invalid intermediate
              // JSON isn't swallowed; commit to `headers` once it parses.
              try { onChange({ headersText: v, headers: JSON.parse(v) }); }
              catch { onChange({ headersText: v }); }
            }}
            error={(() => { try { JSON.parse(step.headersText ?? '{}'); return undefined; } catch { return 'Invalid JSON — last valid headers will be used'; } })()}
            autoComplete="off"
            placeholder='{"Content-Type": "application/json"}'
            helpText="Key-value pairs as JSON object"
          />
          <TextField label="Body" value={step.body} onChange={(v) => onChange({ body: v })} autoComplete="off" multiline={4} placeholder='{"key": "value"}' />
        </>
      )}
      {step.kind === 'TAG_CUSTOMER' && (
        <TextField label="Customer tag" value={step.tag} onChange={(v) => onChange({ tag: v })} autoComplete="off" placeholder="e.g. vip" />
      )}
      {step.kind === 'TAG_ORDER' && (
        <TextField label="Tags (comma-separated)" value={step.tags} onChange={(v) => onChange({ tags: v })} autoComplete="off" placeholder="e.g. high-value, priority" />
      )}
      {step.kind === 'ADD_ORDER_NOTE' && (
        <TextField label="Order note" value={step.note} onChange={(v) => onChange({ note: v })} autoComplete="off" multiline={2} />
      )}
      {step.kind === 'WRITE_TO_STORE' && (
        <>
          <TextField label="Store key" value={step.storeKey} onChange={(v) => onChange({ storeKey: v })} autoComplete="off" helpText="e.g. analytics, product, order" />
          <TextField label="Record title expression" value={step.titleExpr} onChange={(v) => onChange({ titleExpr: v })} autoComplete="off" placeholder="e.g. Order {{order.name}}" />
        </>
      )}
      {step.kind === 'SEND_EMAIL_NOTIFICATION' && (
        <>
          <TextField label="To" value={step.to} onChange={(v) => onChange({ to: v })} autoComplete="off" placeholder="recipient@example.com" type="email" />
          <TextField label="Subject" value={step.subject} onChange={(v) => onChange({ subject: v })} autoComplete="off" />
          <TextField label="Body (HTML)" value={step.body} onChange={(v) => onChange({ body: v })} autoComplete="off" multiline={3} />
        </>
      )}
      {step.kind === 'SEND_SLACK_MESSAGE' && (
        <>
          <TextField label="Slack incoming webhook URL" value={step.webhookUrl ?? ''} onChange={(v) => onChange({ webhookUrl: v })} autoComplete="off" placeholder="https://hooks.slack.com/services/…" helpText="Create an Incoming Webhook in Slack; it posts to the channel you chose there. Leave blank to use the app-wide SLACK_WEBHOOK_URL." />
          <TextField label="Channel label (optional)" value={step.channel ?? ''} onChange={(v) => onChange({ channel: v })} autoComplete="off" placeholder="#general" helpText="Display only — the webhook URL determines the actual channel." />
          <TextField label="Message" value={step.text} onChange={(v) => onChange({ text: v })} autoComplete="off" multiline={3} />
        </>
      )}
      {step.kind === 'CONDITION' && (
        <>
          <TextField label="Field" value={step.field} onChange={(v) => onChange({ field: v })} autoComplete="off" placeholder="e.g. total_price" helpText="Dot-path into the trigger event payload, e.g. customer.orders_count" />
          <Select label="Operator" options={CONDITION_OPERATOR_OPTIONS} value={step.operator} onChange={(v) => onChange({ operator: v })} />
          {!NO_VALUE_OPERATORS.has(step.operator) && (
            <TextField label="Value" value={step.value} onChange={(v) => onChange({ value: v })} autoComplete="off" placeholder="e.g. 100" />
          )}
          <BranchEditor
            title="Then"
            steps={step.thenSteps ?? []}
            connectorOptions={connectorOptions}
            onChange={(next) => onChange({ thenSteps: next })}
          />
          <BranchEditor
            title="Else"
            steps={step.elseSteps ?? []}
            connectorOptions={connectorOptions}
            onChange={(next) => onChange({ elseSteps: next })}
          />
        </>
      )}
    </>
  );
}

/** Editable list of nested steps for one Condition branch. */
function BranchEditor({ title, steps, connectorOptions, onChange }: {
  title: string;
  steps: FlowStep[];
  connectorOptions: ConnectorOption[];
  onChange: (steps: FlowStep[]) => void;
}) {
  const [newKind, setNewKind] = useState('TAG_ORDER');
  return (
    <Box paddingBlockStart="100">
      <BlockStack gap="200">
        <Text as="h4" variant="headingSm">{`${title} (${steps.length} step${steps.length !== 1 ? 's' : ''})`}</Text>
        {steps.map((s, i) => (
          <Box key={i} background="bg-surface-secondary" borderRadius="200" padding="200">
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Badge>{s.kind.replace(/_/g, ' ')}</Badge>
                <Button size="slim" variant="plain" tone="critical" onClick={() => onChange(steps.filter((_, j) => j !== i))}>Remove</Button>
              </InlineStack>
              <StepFields
                step={s}
                connectorOptions={connectorOptions}
                onChange={(patch) => onChange(steps.map((x, j) => (j === i ? { ...x, ...patch } as FlowStep : x)))}
              />
            </BlockStack>
          </Box>
        ))}
        <InlineStack gap="200" blockAlign="center">
          <div style={{ flex: 1 }}>
            <Select label={`Add ${title.toLowerCase()} step`} labelHidden options={NESTED_STEP_KINDS} value={newKind} onChange={setNewKind} />
          </div>
          <Button size="slim" onClick={() => onChange([...steps, defaultStep(newKind)])}>Add</Button>
        </InlineStack>
      </BlockStack>
    </Box>
  );
}

export function FlowBuilder({ initialSpec, connectors = [], onSave, saving }: Props) {
  const [trigger, setTrigger] = useState<TriggerType>(initialSpec?.trigger ?? 'MANUAL');
  const [steps, setSteps] = useState<FlowStep[]>(initialSpec?.steps ?? []);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepKind, setNewStepKind] = useState('HTTP_REQUEST');

  const updateStep = useCallback((idx: number, updated: Partial<FlowStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updated } as FlowStep : s));
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return next;
      const a = next[idx]!;
      const b = next[target]!;
      next[idx] = b;
      next[target] = a;
      return next;
    });
  }, []);

  const addStep = useCallback(() => {
    setSteps(prev => [...prev, defaultStep(newStepKind)]);
    setAddStepOpen(false);
  }, [newStepKind]);

  const handleSave = useCallback(() => {
    onSave({ trigger, steps });
  }, [trigger, steps, onSave]);

  const connectorOptions = [
    { label: 'Select connector...', value: '' },
    ...connectors.map(c => ({ label: c.name, value: c.id })),
  ];

  return (
    <BlockStack gap="400">
      {/* ─── Toolbar ─── */}
      <Card>
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200">
            <Text as="h2" variant="headingMd">Flow Builder</Text>
            <Badge tone="info">{`${steps.length} step${steps.length !== 1 ? 's' : ''}`}</Badge>
          </InlineStack>
          <InlineStack gap="200">
            <Button onClick={() => setAddStepOpen(true)}>Add step</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save flow</Button>
          </InlineStack>
        </InlineStack>
      </Card>

      {/* ─── Visual canvas ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0' }}>
        {/* Trigger node */}
        <NodeBox label="Trigger" badge={trigger.replace('SHOPIFY_WEBHOOK_', '')} tone="magic">
          <Select
            label="Trigger type"
            labelHidden
            options={TRIGGER_OPTIONS}
            value={trigger}
            onChange={(v) => setTrigger(v as TriggerType)}
          />
          {!LIVE_TRIGGERS.has(trigger) && (
            <Text as="p" variant="bodySm" tone="critical">
              This trigger is not wired to deliver events yet — the flow will only run when started manually.
            </Text>
          )}
        </NodeBox>

        {steps.map((step, idx) => (
          <div key={idx}>
            <Arrow />
            <NodeBox
              label={`Step ${idx + 1}`}
              badge={step.kind.replace(/_/g, ' ')}
              tone={step.kind === 'HTTP_REQUEST' || step.kind === 'SEND_HTTP_REQUEST' ? 'attention' : step.kind === 'WRITE_TO_STORE' ? 'info' : step.kind === 'CONDITION' ? 'magic' : 'success'}
              onDelete={() => removeStep(idx)}
            >
              <BlockStack gap="200">
                <StepFields
                  step={step}
                  connectorOptions={connectorOptions}
                  onChange={(patch) => updateStep(idx, patch)}
                />
                <InlineStack gap="100">
                  <Button size="slim" disabled={idx === 0} onClick={() => moveStep(idx, -1)}>Move up</Button>
                  <Button size="slim" disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)}>Move down</Button>
                </InlineStack>
              </BlockStack>
            </NodeBox>
          </div>
        ))}

        {/* Add step placeholder */}
        <Arrow />
        <div
          style={{
            border: '2px dashed #b5b5b5',
            borderRadius: 12,
            padding: '12px 24px',
            cursor: 'pointer',
            color: '#6d7175',
          }}
          onClick={() => setAddStepOpen(true)}
        >
          <Text as="p" tone="subdued">+ Add a step</Text>
        </div>
      </div>

      {/* Add step modal */}
      {addStepOpen && (
        <Modal
          open
          onClose={() => setAddStepOpen(false)}
          title="Add step"
          primaryAction={{ content: 'Add', onAction: addStep }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setAddStepOpen(false) }]}
        >
          <Modal.Section>
            <Select
              label="Step type"
              options={STEP_KINDS}
              value={newStepKind}
              onChange={setNewStepKind}
            />
          </Modal.Section>
        </Modal>
      )}
    </BlockStack>
  );
}
