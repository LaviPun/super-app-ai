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
  | { kind: 'SEND_HTTP_REQUEST'; url: string; method: string; headers: Record<string, string>; body: string; authType: string; authConfig: AuthConfig }
  | { kind: 'TAG_CUSTOMER'; tag: string }
  | { kind: 'ADD_ORDER_NOTE'; note: string }
  | { kind: 'TAG_ORDER'; tags: string }
  | { kind: 'WRITE_TO_STORE'; storeKey: string; titleExpr: string; payloadMapping: Record<string, string> }
  | { kind: 'SEND_EMAIL_NOTIFICATION'; to: string; subject: string; body: string }
  | { kind: 'SEND_SLACK_MESSAGE'; channel: string; text: string }
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

const TRIGGER_OPTIONS = [
  { label: 'Manual', value: 'MANUAL' },
  { label: 'Order Created', value: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
  { label: 'Product Updated', value: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
  { label: 'Customer Created', value: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED' },
  { label: 'Fulfillment Created', value: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED' },
  { label: 'Draft Order Created', value: 'SHOPIFY_WEBHOOK_DRAFT_ORDER_CREATED' },
  { label: 'Collection Created', value: 'SHOPIFY_WEBHOOK_COLLECTION_CREATED' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'SuperApp: Module Published', value: 'SUPERAPP_MODULE_PUBLISHED' },
  { label: 'SuperApp: Connector Synced', value: 'SUPERAPP_CONNECTOR_SYNCED' },
  { label: 'SuperApp: Data Record Created', value: 'SUPERAPP_DATA_RECORD_CREATED' },
  { label: 'SuperApp: Workflow Completed', value: 'SUPERAPP_WORKFLOW_COMPLETED' },
  { label: 'SuperApp: Workflow Failed', value: 'SUPERAPP_WORKFLOW_FAILED' },
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

export function FlowBuilder({ initialSpec, connectors = [], onSave, saving }: Props) {
  const [trigger, setTrigger] = useState<TriggerType>(initialSpec?.trigger ?? 'MANUAL');
  const [steps, setSteps] = useState<FlowStep[]>(initialSpec?.steps ?? []);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepKind, setNewStepKind] = useState('HTTP_REQUEST');
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const updateStep = useCallback((idx: number, updated: Partial<FlowStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updated } as FlowStep : s));
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setEditIdx(null);
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
    setEditIdx(steps.length);
  }, [newStepKind, steps.length]);

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
                {step.kind === 'HTTP_REQUEST' && (
                  <>
                    <Select label="Connector" options={connectorOptions} value={step.connectorId} onChange={(v) => updateStep(idx, { connectorId: v })} />
                    <InlineStack gap="200">
                      <div style={{ width: 100 }}>
                        <Select label="Method" labelHidden options={METHOD_OPTIONS} value={step.method} onChange={(v) => updateStep(idx, { method: v })} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <TextField label="Path" labelHidden value={step.path} onChange={(v) => updateStep(idx, { path: v })} autoComplete="off" />
                      </div>
                    </InlineStack>
                  </>
                )}
                {step.kind === 'SEND_HTTP_REQUEST' && (
                  <>
                    <TextField label="URL" value={step.url} onChange={(v) => updateStep(idx, { url: v })} autoComplete="off" placeholder="https://api.example.com/endpoint" helpText="Must be HTTPS" />
                    <InlineStack gap="200">
                      <div style={{ width: 130 }}>
                        <Select label="Method" options={HTTP_METHOD_OPTIONS} value={step.method} onChange={(v) => updateStep(idx, { method: v })} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <Select label="Auth" options={AUTH_TYPE_OPTIONS} value={step.authType} onChange={(v) => updateStep(idx, { authType: v, authConfig: {} })} />
                      </div>
                    </InlineStack>
                    {step.authType === 'basic' && (
                      <InlineStack gap="200">
                        <div style={{ flex: 1 }}>
                          <TextField label="Username" value={step.authConfig?.username ?? ''} onChange={(v) => updateStep(idx, { authConfig: { ...step.authConfig, username: v } })} autoComplete="off" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField label="Password" type="password" value={step.authConfig?.password ?? ''} onChange={(v) => updateStep(idx, { authConfig: { ...step.authConfig, password: v } })} autoComplete="off" />
                        </div>
                      </InlineStack>
                    )}
                    {step.authType === 'bearer' && (
                      <TextField label="Bearer Token" value={step.authConfig?.token ?? ''} onChange={(v) => updateStep(idx, { authConfig: { ...step.authConfig, token: v } })} autoComplete="off" type="password" />
                    )}
                    {step.authType === 'custom_header' && (
                      <InlineStack gap="200">
                        <div style={{ flex: 1 }}>
                          <TextField label="Header Name" value={step.authConfig?.headerName ?? ''} onChange={(v) => updateStep(idx, { authConfig: { ...step.authConfig, headerName: v } })} autoComplete="off" placeholder="X-API-Key" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <TextField label="Header Value" value={step.authConfig?.headerValue ?? ''} onChange={(v) => updateStep(idx, { authConfig: { ...step.authConfig, headerValue: v } })} autoComplete="off" type="password" />
                        </div>
                      </InlineStack>
                    )}
                    <TextField label="Headers (JSON)" value={JSON.stringify(step.headers)} onChange={(v) => { try { updateStep(idx, { headers: JSON.parse(v) }); } catch { /* keep current */ } }} autoComplete="off" placeholder='{"Content-Type": "application/json"}' helpText="Key-value pairs as JSON object" />
                    <TextField label="Body" value={step.body} onChange={(v) => updateStep(idx, { body: v })} autoComplete="off" multiline={4} placeholder='{"key": "value"}' />
                  </>
                )}
                {step.kind === 'TAG_CUSTOMER' && (
                  <TextField label="Customer tag" value={step.tag} onChange={(v) => updateStep(idx, { tag: v })} autoComplete="off" placeholder="e.g. vip" />
                )}
                {step.kind === 'TAG_ORDER' && (
                  <TextField label="Tags (comma-separated)" value={step.tags} onChange={(v) => updateStep(idx, { tags: v })} autoComplete="off" placeholder="e.g. high-value, priority" />
                )}
                {step.kind === 'ADD_ORDER_NOTE' && (
                  <TextField label="Order note" value={step.note} onChange={(v) => updateStep(idx, { note: v })} autoComplete="off" multiline={2} />
                )}
                {step.kind === 'WRITE_TO_STORE' && (
                  <>
                    <TextField label="Store key" value={step.storeKey} onChange={(v) => updateStep(idx, { storeKey: v })} autoComplete="off" helpText="e.g. analytics, product, order" />
                    <TextField label="Record title expression" value={step.titleExpr} onChange={(v) => updateStep(idx, { titleExpr: v })} autoComplete="off" placeholder="e.g. Order {{order.name}}" />
                  </>
                )}
                {step.kind === 'SEND_EMAIL_NOTIFICATION' && (
                  <>
                    <TextField label="To" value={step.to} onChange={(v) => updateStep(idx, { to: v })} autoComplete="off" placeholder="recipient@example.com" type="email" />
                    <TextField label="Subject" value={step.subject} onChange={(v) => updateStep(idx, { subject: v })} autoComplete="off" />
                    <TextField label="Body (HTML)" value={step.body} onChange={(v) => updateStep(idx, { body: v })} autoComplete="off" multiline={3} />
                  </>
                )}
                {step.kind === 'SEND_SLACK_MESSAGE' && (
                  <>
                    <TextField label="Channel" value={step.channel} onChange={(v) => updateStep(idx, { channel: v })} autoComplete="off" placeholder="#general" />
                    <TextField label="Message" value={step.text} onChange={(v) => updateStep(idx, { text: v })} autoComplete="off" multiline={3} />
                  </>
                )}
                {step.kind === 'CONDITION' && (
                  <>
                    <TextField label="Field" value={step.field} onChange={(v) => updateStep(idx, { field: v })} autoComplete="off" placeholder="e.g. order.total_price" />
                    <Select label="Operator" options={CONDITION_OPERATOR_OPTIONS} value={step.operator} onChange={(v) => updateStep(idx, { operator: v })} />
                    <TextField label="Value" value={step.value} onChange={(v) => updateStep(idx, { value: v })} autoComplete="off" placeholder="e.g. 100" />
                    <Box paddingBlockStart="200">
                      <Text as="p" variant="bodySm" tone="subdued">Then/Else branches can be configured after saving.</Text>
                    </Box>
                  </>
                )}
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
