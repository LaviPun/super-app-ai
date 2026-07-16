import { useCallback, useId, useState } from 'react';

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

/**
 * Internal builder representation: every step carries a stable `__id` so React
 * keys survive reorder/remove. Polaris web-component fields treat the `value`
 * attribute as a default (native-input semantics), so index keys would leave
 * stale text in fields after a reorder. Ids are stripped before `onSave`.
 */
type FlowStepWithId = FlowStep & { __id?: string };

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

const TRIGGER_OPTIONS: Array<{ label: string; value: TriggerType; disabled?: boolean }> = [
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

let stepIdSeq = 0;
const nextStepId = () => `fb-step-${++stepIdSeq}`;

function newStep(kind: string): FlowStepWithId {
  return { ...defaultStep(kind), __id: nextStepId() };
}

function withIds(steps: FlowStep[]): FlowStepWithId[] {
  return steps.map((s): FlowStepWithId => {
    if (s.kind === 'CONDITION') {
      return { ...s, __id: nextStepId(), thenSteps: withIds(s.thenSteps ?? []), elseSteps: withIds(s.elseSteps ?? []) };
    }
    return { ...s, __id: nextStepId() };
  });
}

function stripIds(steps: FlowStepWithId[]): FlowStep[] {
  return steps.map((s): FlowStep => {
    const { __id: _omitted, ...rest } = s;
    if (rest.kind === 'CONDITION') {
      return { ...rest, thenSteps: stripIds(rest.thenSteps ?? []), elseSteps: stripIds(rest.elseSteps ?? []) };
    }
    return rest;
  });
}

function kindLabel(kind: FlowStep['kind']): string {
  return kind.replace(/_/g, ' ');
}

function kindTone(kind: FlowStep['kind']): 'caution' | 'info' | 'warning' | 'success' {
  if (kind === 'HTTP_REQUEST' || kind === 'SEND_HTTP_REQUEST') return 'caution';
  if (kind === 'WRITE_TO_STORE') return 'info';
  if (kind === 'CONDITION') return 'warning';
  return 'success';
}

/** Compact vertical connector between builder rows. */
function Connector() {
  return (
    <s-stack alignItems="center">
      <s-icon type="arrow-down" color="subdued" size="small" />
    </s-stack>
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
          <s-select label="Connector" value={step.connectorId} onInput={(e) => onChange({ connectorId: e.currentTarget.value })}>
            {connectorOptions.map((o) => (
              <s-option key={o.value} value={o.value}>{o.label}</s-option>
            ))}
          </s-select>
          <s-grid gridTemplateColumns="8rem 1fr" gap="small-100">
            <s-select label="Method" labelAccessibilityVisibility="exclusive" value={step.method} onInput={(e) => onChange({ method: e.currentTarget.value })}>
              {METHOD_OPTIONS.map((o) => (
                <s-option key={o.value} value={o.value}>{o.label}</s-option>
              ))}
            </s-select>
            <s-text-field label="Path" labelAccessibilityVisibility="exclusive" value={step.path} onInput={(e) => onChange({ path: e.currentTarget.value })} autocomplete="off" />
          </s-grid>
        </>
      )}
      {step.kind === 'SEND_HTTP_REQUEST' && (
        <>
          <s-url-field label="URL" value={step.url} onInput={(e) => onChange({ url: e.currentTarget.value })} placeholder="https://api.example.com/endpoint" details="Must be HTTPS" />
          <s-grid gridTemplateColumns="9rem 1fr" gap="small-100">
            <s-select label="Method" value={step.method} onInput={(e) => onChange({ method: e.currentTarget.value })}>
              {HTTP_METHOD_OPTIONS.map((o) => (
                <s-option key={o.value} value={o.value}>{o.label}</s-option>
              ))}
            </s-select>
            <s-select label="Auth" value={step.authType} onInput={(e) => onChange({ authType: e.currentTarget.value, authConfig: {} })}>
              {AUTH_TYPE_OPTIONS.map((o) => (
                <s-option key={o.value} value={o.value}>{o.label}</s-option>
              ))}
            </s-select>
          </s-grid>
          {step.authType === 'basic' && (
            <s-grid key="auth-basic" gridTemplateColumns="1fr 1fr" gap="small-100">
              <s-text-field label="Username" value={step.authConfig?.username ?? ''} onInput={(e) => onChange({ authConfig: { ...step.authConfig, username: e.currentTarget.value } })} autocomplete="off" />
              <s-password-field label="Password" value={step.authConfig?.password ?? ''} onInput={(e) => onChange({ authConfig: { ...step.authConfig, password: e.currentTarget.value } })} autocomplete="off" />
            </s-grid>
          )}
          {step.authType === 'bearer' && (
            <s-password-field key="auth-bearer" label="Bearer Token" value={step.authConfig?.token ?? ''} onInput={(e) => onChange({ authConfig: { ...step.authConfig, token: e.currentTarget.value } })} autocomplete="off" />
          )}
          {step.authType === 'custom_header' && (
            <s-grid key="auth-custom-header" gridTemplateColumns="1fr 1fr" gap="small-100">
              <s-text-field label="Header Name" value={step.authConfig?.headerName ?? ''} onInput={(e) => onChange({ authConfig: { ...step.authConfig, headerName: e.currentTarget.value } })} autocomplete="off" placeholder="X-API-Key" />
              <s-password-field label="Header Value" value={step.authConfig?.headerValue ?? ''} onInput={(e) => onChange({ authConfig: { ...step.authConfig, headerValue: e.currentTarget.value } })} autocomplete="off" />
            </s-grid>
          )}
          <s-text-field
            label="Headers (JSON)"
            value={step.headersText ?? JSON.stringify(step.headers ?? {})}
            onInput={(e) => {
              const v = e.currentTarget.value;
              // Keep the raw text so typing through invalid intermediate
              // JSON isn't swallowed; commit to `headers` once it parses.
              try { onChange({ headersText: v, headers: JSON.parse(v) }); }
              catch { onChange({ headersText: v }); }
            }}
            error={(() => { try { JSON.parse(step.headersText ?? '{}'); return undefined; } catch { return 'Invalid JSON — last valid headers will be used'; } })()}
            autocomplete="off"
            placeholder='{"Content-Type": "application/json"}'
            details="Key-value pairs as JSON object"
          />
          <s-text-area label="Body" value={step.body} onInput={(e) => onChange({ body: e.currentTarget.value })} rows={4} placeholder='{"key": "value"}' />
        </>
      )}
      {step.kind === 'TAG_CUSTOMER' && (
        <s-text-field label="Customer tag" value={step.tag} onInput={(e) => onChange({ tag: e.currentTarget.value })} autocomplete="off" placeholder="e.g. vip" />
      )}
      {step.kind === 'TAG_ORDER' && (
        <s-text-field label="Tags (comma-separated)" value={step.tags} onInput={(e) => onChange({ tags: e.currentTarget.value })} autocomplete="off" placeholder="e.g. high-value, priority" />
      )}
      {step.kind === 'ADD_ORDER_NOTE' && (
        <s-text-area label="Order note" value={step.note} onInput={(e) => onChange({ note: e.currentTarget.value })} rows={2} />
      )}
      {step.kind === 'WRITE_TO_STORE' && (
        <>
          <s-text-field label="Store key" value={step.storeKey} onInput={(e) => onChange({ storeKey: e.currentTarget.value })} autocomplete="off" details="e.g. analytics, product, order" />
          <s-text-field label="Record title expression" value={step.titleExpr} onInput={(e) => onChange({ titleExpr: e.currentTarget.value })} autocomplete="off" placeholder="e.g. Order {{order.name}}" />
        </>
      )}
      {step.kind === 'SEND_EMAIL_NOTIFICATION' && (
        <>
          <s-email-field label="To" value={step.to} onInput={(e) => onChange({ to: e.currentTarget.value })} placeholder="recipient@example.com" />
          <s-text-field label="Subject" value={step.subject} onInput={(e) => onChange({ subject: e.currentTarget.value })} autocomplete="off" />
          <s-text-area label="Body (HTML)" value={step.body} onInput={(e) => onChange({ body: e.currentTarget.value })} rows={3} />
        </>
      )}
      {step.kind === 'SEND_SLACK_MESSAGE' && (
        <>
          <s-url-field label="Slack incoming webhook URL" value={step.webhookUrl ?? ''} onInput={(e) => onChange({ webhookUrl: e.currentTarget.value })} placeholder="https://hooks.slack.com/services/…" details="Create an Incoming Webhook in Slack; it posts to the channel you chose there. Leave blank to use the app-wide SLACK_WEBHOOK_URL." />
          <s-text-field label="Channel label (optional)" value={step.channel ?? ''} onInput={(e) => onChange({ channel: e.currentTarget.value })} autocomplete="off" placeholder="#general" details="Display only — the webhook URL determines the actual channel." />
          <s-text-area label="Message" value={step.text} onInput={(e) => onChange({ text: e.currentTarget.value })} rows={3} />
        </>
      )}
      {step.kind === 'CONDITION' && (
        <>
          <s-text-field label="Field" value={step.field} onInput={(e) => onChange({ field: e.currentTarget.value })} autocomplete="off" placeholder="e.g. total_price" details="Dot-path into the trigger event payload, e.g. customer.orders_count" />
          <s-select label="Operator" value={step.operator} onInput={(e) => onChange({ operator: e.currentTarget.value })}>
            {CONDITION_OPERATOR_OPTIONS.map((o) => (
              <s-option key={o.value} value={o.value}>{o.label}</s-option>
            ))}
          </s-select>
          {!NO_VALUE_OPERATORS.has(step.operator) && (
            <s-text-field label="Value" value={step.value} onInput={(e) => onChange({ value: e.currentTarget.value })} autocomplete="off" placeholder="e.g. 100" />
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
  steps: FlowStepWithId[];
  connectorOptions: ConnectorOption[];
  onChange: (steps: FlowStepWithId[]) => void;
}) {
  const menuId = useId();
  return (
    <s-box paddingInlineStart="small" borderWidth="none none none base" borderStyle="none none none solid" borderColor="subdued">
      <s-stack gap="small-100">
        <s-text type="strong">{`${title} (${steps.length} step${steps.length !== 1 ? 's' : ''})`}</s-text>
        {steps.map((s, i) => (
          <s-box key={s.__id ?? i} background="subdued" borderRadius="base" padding="small-100">
            <s-stack gap="small-100">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-100">
                <s-badge tone={kindTone(s.kind)}>{kindLabel(s.kind)}</s-badge>
                <s-button
                  variant="tertiary"
                  tone="critical"
                  icon="delete"
                  accessibilityLabel={`Remove ${title.toLowerCase()} step ${i + 1}`}
                  onClick={() => onChange(steps.filter((_, j) => j !== i))}
                />
              </s-stack>
              <StepFields
                step={s}
                connectorOptions={connectorOptions}
                onChange={(patch) => onChange(steps.map((x, j) => (j === i ? { ...x, ...patch } as FlowStepWithId : x)))}
              />
            </s-stack>
          </s-box>
        ))}
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="plus" commandFor={menuId}>
            {`Add ${title.toLowerCase()} step`}
          </s-button>
        </s-stack>
        <s-menu id={menuId} accessibilityLabel={`Add ${title.toLowerCase()} step`}>
          {NESTED_STEP_KINDS.map((k) => (
            <s-button key={k.value} onClick={() => onChange([...steps, newStep(k.value)])}>{k.label}</s-button>
          ))}
        </s-menu>
      </s-stack>
    </s-box>
  );
}

export function FlowBuilder({ initialSpec, connectors = [], onSave, saving }: Props) {
  const [trigger, setTrigger] = useState<TriggerType>(initialSpec?.trigger ?? 'MANUAL');
  const [steps, setSteps] = useState<FlowStepWithId[]>(() => withIds(initialSpec?.steps ?? []));
  const addMenuId = useId();

  const updateStep = useCallback((idx: number, updated: Partial<FlowStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updated } as FlowStepWithId : s));
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

  const addStep = useCallback((kind: string) => {
    setSteps(prev => [...prev, newStep(kind)]);
  }, []);

  const handleSave = useCallback(() => {
    onSave({ trigger, steps: stripIds(steps) });
  }, [trigger, steps, onSave]);

  const connectorOptions = [
    { label: 'Select connector...', value: '' },
    ...connectors.map(c => ({ label: c.name, value: c.id })),
  ];

  return (
    <s-stack gap="base">
      {/* ─── Toolbar ─── */}
      <s-section padding="base">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-100">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-heading>Flow builder</s-heading>
            <s-badge tone="info">{`${steps.length} step${steps.length !== 1 ? 's' : ''}`}</s-badge>
          </s-stack>
          <s-stack direction="inline" gap="small-100">
            <s-button icon="plus" commandFor={addMenuId}>Add step</s-button>
            <s-button variant="primary" loading={saving || undefined} onClick={handleSave}>Save flow</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* ─── Canvas: trigger → steps → add ─── */}
      <s-section padding="base">
        <s-stack gap="small-200">
          {/* Trigger node */}
          <s-box border="base" borderRadius="base" padding="small">
            <s-stack gap="small-100">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-text type="strong">Trigger</s-text>
                <s-badge tone="info">{trigger.replace('SHOPIFY_WEBHOOK_', '').replace(/_/g, ' ')}</s-badge>
              </s-stack>
              <s-select
                label="Trigger type"
                labelAccessibilityVisibility="exclusive"
                value={trigger}
                onInput={(e) => setTrigger(e.currentTarget.value as TriggerType)}
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <s-option key={o.value} value={o.value} disabled={o.disabled || undefined}>{o.label}</s-option>
                ))}
              </s-select>
              {!LIVE_TRIGGERS.has(trigger) && (
                <s-text tone="critical">
                  This trigger is not wired to deliver events yet — the flow will only run when started manually.
                </s-text>
              )}
            </s-stack>
          </s-box>

          {steps.map((step, idx) => (
            <s-stack key={step.__id ?? idx} gap="small-200">
              <Connector />
              <s-box border="base" borderRadius="base" padding="small">
                <s-stack gap="small-100">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="small-100">
                    <s-stack direction="inline" gap="small-100" alignItems="center">
                      <s-text type="strong">{`Step ${idx + 1}`}</s-text>
                      <s-badge tone={kindTone(step.kind)}>{kindLabel(step.kind)}</s-badge>
                    </s-stack>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        variant="tertiary"
                        icon="arrow-up"
                        accessibilityLabel={`Move step ${idx + 1} up`}
                        disabled={idx === 0 || undefined}
                        onClick={() => moveStep(idx, -1)}
                      />
                      <s-button
                        variant="tertiary"
                        icon="arrow-down"
                        accessibilityLabel={`Move step ${idx + 1} down`}
                        disabled={idx === steps.length - 1 || undefined}
                        onClick={() => moveStep(idx, 1)}
                      />
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        icon="delete"
                        accessibilityLabel={`Remove step ${idx + 1}`}
                        onClick={() => removeStep(idx)}
                      />
                    </s-stack>
                  </s-stack>
                  <StepFields
                    step={step}
                    connectorOptions={connectorOptions}
                    onChange={(patch) => updateStep(idx, patch)}
                  />
                </s-stack>
              </s-box>
            </s-stack>
          ))}

          {/* Add step tail */}
          <Connector />
          <s-stack alignItems="center">
            <s-button variant="tertiary" icon="plus" commandFor={addMenuId}>Add a step</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* Add-step menu (anchored to whichever button invoked it) */}
      <s-menu id={addMenuId} accessibilityLabel="Add step">
        {STEP_KINDS.map((k) => (
          <s-button key={k.value} onClick={() => addStep(k.value)}>{k.label}</s-button>
        ))}
      </s-menu>
    </s-stack>
  );
}
