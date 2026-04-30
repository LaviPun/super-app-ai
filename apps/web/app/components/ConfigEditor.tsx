import { useState, useCallback, useEffect } from 'react';
import { useFetcher, useRevalidator } from '@remix-run/react';
import {
  Card, BlockStack, Text, InlineStack, Button, TextField, Select,
  Checkbox, Banner, Divider, Badge,
} from '@shopify/polaris';
import type { RecipeSpec } from '@superapp/core';

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'url' | 'textarea' | 'number' | 'boolean' | 'select' | 'readonly';
  options?: { label: string; value: string }[];
  helpText?: string;
  maxLength?: number;
  nested?: string;
};

const CONFIG_FIELDS: Record<string, FieldDef[]> = {
  'theme.banner': [
    { key: 'heading', label: 'Heading', type: 'text', maxLength: 80 },
    { key: 'subheading', label: 'Subheading', type: 'text', maxLength: 200 },
    { key: 'ctaText', label: 'Primary button text', type: 'text', maxLength: 40 },
    { key: 'ctaUrl', label: 'Primary button URL', type: 'url' },
    { key: 'imageUrl', label: 'Image URL', type: 'url', helpText: 'Banner hero image (recommended 800x400)' },
    { key: 'enableAnimation', label: 'Enable entrance animation', type: 'boolean' },
  ],
  'theme.popup': [
    { key: 'title', label: 'Title', type: 'text', maxLength: 60 },
    { key: 'body', label: 'Body text', type: 'textarea', maxLength: 240 },
    { key: 'trigger', label: 'Trigger', type: 'select', options: [
      { label: 'On page load', value: 'ON_LOAD' },
      { label: 'After delay (timed)', value: 'TIMED' },
      { label: 'On exit intent', value: 'ON_EXIT_INTENT' },
      { label: 'On 25% scroll', value: 'ON_SCROLL_25' },
      { label: 'On 50% scroll', value: 'ON_SCROLL_50' },
      { label: 'On 75% scroll', value: 'ON_SCROLL_75' },
      { label: 'On element click', value: 'ON_CLICK' },
    ]},
    { key: 'delaySeconds', label: 'Delay (seconds)', type: 'number', helpText: 'Wait this many seconds before showing the popup (0 = immediate)' },
    { key: 'frequency', label: 'Display frequency', type: 'select', options: [
      { label: 'Every visit', value: 'EVERY_VISIT' },
      { label: 'Once per session', value: 'ONCE_PER_SESSION' },
      { label: 'Once per day', value: 'ONCE_PER_DAY' },
      { label: 'Once per week', value: 'ONCE_PER_WEEK' },
      { label: 'Only once ever', value: 'ONCE_EVER' },
    ]},
    { key: 'maxShowsPerDay', label: 'Max shows per day', type: 'number', helpText: '0 = unlimited. Limits how many times popup shows per day per visitor.' },
    { key: 'showOnPages', label: 'Show on pages', type: 'select', options: [
      { label: 'All pages', value: 'ALL' },
      { label: 'Homepage only', value: 'HOMEPAGE' },
      { label: 'Collection pages', value: 'COLLECTION' },
      { label: 'Product pages', value: 'PRODUCT' },
      { label: 'Cart page', value: 'CART' },
      { label: 'Custom URLs', value: 'CUSTOM' },
    ], helpText: 'Control which pages this popup appears on' },
    { key: 'showCloseButton', label: 'Show close button', type: 'boolean' },
    { key: 'autoCloseSeconds', label: 'Auto-close after (seconds)', type: 'number', helpText: '0 = never auto-close' },
    { key: 'countdownEnabled', label: 'Show countdown timer', type: 'boolean' },
    { key: 'countdownSeconds', label: 'Countdown duration (seconds)', type: 'number', helpText: 'Duration for the countdown timer' },
    { key: 'countdownLabel', label: 'Countdown label', type: 'text', maxLength: 40, helpText: 'e.g. "Offer expires in"' },
    { key: 'ctaText', label: 'Primary button text', type: 'text', maxLength: 40 },
    { key: 'ctaUrl', label: 'Primary button URL', type: 'url' },
    { key: 'secondaryCtaText', label: 'Secondary button text', type: 'text', maxLength: 40, helpText: 'Optional second action button' },
    { key: 'secondaryCtaUrl', label: 'Secondary button URL', type: 'url' },
  ],
  'theme.notificationBar': [
    { key: 'message', label: 'Message', type: 'text', maxLength: 140 },
    { key: 'linkText', label: 'Link text', type: 'text', maxLength: 40 },
    { key: 'linkUrl', label: 'Link URL', type: 'url' },
    { key: 'dismissible', label: 'Dismissible', type: 'boolean' },
  ],
  'theme.contactForm': [
    { key: 'title', label: 'Form title', type: 'text', maxLength: 80 },
    { key: 'subtitle', label: 'Subtitle', type: 'textarea', maxLength: 200 },
    { key: 'submitLabel', label: 'Submit button text', type: 'text', maxLength: 40 },
    { key: 'successMessage', label: 'Success message', type: 'textarea', maxLength: 200 },
    { key: 'errorMessage', label: 'Error message', type: 'textarea', maxLength: 200 },
    { key: 'submissionMode', label: 'Submission mode', type: 'select', options: [
      { label: 'Shopify contact endpoint', value: 'SHOPIFY_CONTACT' },
      { label: 'App proxy endpoint', value: 'APP_PROXY' },
    ] },
    { key: 'proxyEndpointPath', label: 'App proxy endpoint path', type: 'text', helpText: 'Used when submission mode is APP_PROXY. Example: /apps/superapp/capture' },
    { key: 'recipientEmail', label: 'Notification recipient email', type: 'text', helpText: 'Optional. Useful for app-proxy submission mode.' },
    { key: 'showName', label: 'Show name field', type: 'boolean' },
    { key: 'showEmail', label: 'Show email field', type: 'boolean' },
    { key: 'showPhone', label: 'Show phone field', type: 'boolean' },
    { key: 'showCompany', label: 'Show company field', type: 'boolean' },
    { key: 'showOrderNumber', label: 'Show order number field', type: 'boolean' },
    { key: 'showSubject', label: 'Show subject field', type: 'boolean' },
    { key: 'showMessage', label: 'Show message field', type: 'boolean' },
    { key: 'nameRequired', label: 'Name is required', type: 'boolean' },
    { key: 'emailRequired', label: 'Email is required', type: 'boolean' },
    { key: 'phoneRequired', label: 'Phone is required', type: 'boolean' },
    { key: 'companyRequired', label: 'Company is required', type: 'boolean' },
    { key: 'orderNumberRequired', label: 'Order number is required', type: 'boolean' },
    { key: 'subjectRequired', label: 'Subject is required', type: 'boolean' },
    { key: 'messageRequired', label: 'Message is required', type: 'boolean' },
    { key: 'consentRequired', label: 'Require privacy consent', type: 'boolean' },
    { key: 'consentLabel', label: 'Consent label', type: 'text', maxLength: 120 },
    { key: 'sendCopyToCustomer', label: 'Send copy to customer (proxy mode)', type: 'boolean' },
    { key: 'includeCustomerContext', label: 'Include customer context metadata', type: 'boolean' },
    { key: 'spamProtection', label: 'Spam protection', type: 'select', options: [
      { label: 'None', value: 'NONE' },
      { label: 'Honeypot field', value: 'HONEYPOT' },
    ] },
    { key: 'honeypotFieldName', label: 'Honeypot field name', type: 'text', maxLength: 40 },
    { key: 'successRedirectUrl', label: 'Success redirect URL', type: 'url' },
  ],
  'theme.effect': [
    { key: 'effectKind', label: 'Effect kind', type: 'select', options: [
      { label: 'Snowfall', value: 'snowfall' },
      { label: 'Confetti', value: 'confetti' },
    ], helpText: 'Full-viewport decoration overlay' },
    { key: 'intensity', label: 'Intensity', type: 'select', options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ]},
    { key: 'speed', label: 'Speed', type: 'select', options: [
      { label: 'Slow', value: 'slow' },
      { label: 'Normal', value: 'normal' },
      { label: 'Fast', value: 'fast' },
    ]},
  ],
  'proxy.widget': [
    { key: 'widgetId', label: 'Widget ID', type: 'text', helpText: 'Lowercase alphanumeric + hyphens, 3-40 chars' },
    { key: 'mode', label: 'Output mode', type: 'select', options: [
      { label: 'HTML', value: 'HTML' },
      { label: 'JSON', value: 'JSON' },
    ]},
    { key: 'title', label: 'Title', type: 'text', maxLength: 80 },
    { key: 'message', label: 'Message', type: 'textarea', maxLength: 240 },
  ],
  'checkout.upsell': [
    { key: 'offerTitle', label: 'Offer title', type: 'text', maxLength: 60 },
    { key: 'productVariantGid', label: 'Product variant GID', type: 'text', helpText: 'e.g. gid://shopify/ProductVariant/123' },
    { key: 'discountPercent', label: 'Discount %', type: 'number' },
  ],
  'functions.discountRules': [
    { key: 'combineWithOtherDiscounts', label: 'Combine with other discounts', type: 'boolean' },
  ],
  'integration.httpSync': [
    { key: 'connectorId', label: 'Connector ID', type: 'text' },
    { key: 'endpointPath', label: 'Endpoint path', type: 'text', helpText: 'Must start with / (e.g. /api/orders)' },
    { key: 'trigger', label: 'Trigger', type: 'select', options: [
      { label: 'Manual', value: 'MANUAL' },
      { label: 'Order created', value: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
      { label: 'Product updated', value: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
      { label: 'Customer created', value: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED' },
      { label: 'Scheduled', value: 'SCHEDULED' },
    ]},
  ],
  'flow.automation': [
    { key: 'trigger', label: 'Trigger', type: 'select', options: [
      { label: 'Manual', value: 'MANUAL' },
      { label: 'Order created', value: 'SHOPIFY_WEBHOOK_ORDER_CREATED' },
      { label: 'Product updated', value: 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED' },
      { label: 'Customer created', value: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED' },
      { label: 'Fulfillment created', value: 'SHOPIFY_WEBHOOK_FULFILLMENT_CREATED' },
      { label: 'Scheduled', value: 'SCHEDULED' },
      { label: 'Module published', value: 'SUPERAPP_MODULE_PUBLISHED' },
      { label: 'Connector synced', value: 'SUPERAPP_CONNECTOR_SYNCED' },
      { label: 'Data record created', value: 'SUPERAPP_DATA_RECORD_CREATED' },
    ]},
  ],
  'platform.extensionBlueprint': [
    { key: 'surface', label: 'Surface', type: 'select', options: [
      { label: 'Checkout UI', value: 'CHECKOUT_UI' },
      { label: 'Theme App Extension', value: 'THEME_APP_EXTENSION' },
      { label: 'Function', value: 'FUNCTION' },
    ]},
    { key: 'goal', label: 'Goal', type: 'textarea', maxLength: 240 },
  ],
  'customerAccount.blocks': [
    { key: 'target', label: 'Target surface', type: 'select', options: [
      { label: 'Order status', value: 'customer-account.order-status.block.render' },
      { label: 'Order index', value: 'customer-account.order-index.block.render' },
      { label: 'Profile', value: 'customer-account.profile.block.render' },
      { label: 'Custom page', value: 'customer-account.page.render' },
    ]},
    { key: 'title', label: 'Title', type: 'text', maxLength: 80 },
    { key: 'b2bOnly', label: 'B2B customers only', type: 'boolean' },
  ],
};

const NAME_FIELD: FieldDef = { key: '__name', label: 'Module name', type: 'text', maxLength: 80 };

// Groups from the AI-generated admin config schema to skip in ConfigEditor
// (style is handled by StyleBuilder; analytics/performance are read-only)
const SKIP_GROUPS = new Set(['style', 'analytics', 'performance']);

const GROUP_LABELS: Record<string, string> = {
  content: 'Content',
  layout: 'Layout',
  behavior: 'Behavior',
  animation: 'Animation',
  visibility_targeting: 'Visibility & Targeting',
  rules_scheduling: 'Rules & Scheduling',
  localization: 'Localization',
  accessibility: 'Accessibility',
};

function toGroupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toFieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/_/g, ' ').trim();
}

function inferDynamicFieldType(def: Record<string, unknown>, uiHint?: Record<string, unknown>): FieldDef['type'] {
  const widget = uiHint?.['ui:widget'];
  if (widget === 'textarea') return 'textarea';
  if (widget === 'uri') return 'url';
  if (widget === 'select') return 'select';
  if (Array.isArray(def.enum)) return 'select';
  if (def.format === 'uri') return 'url';
  if (def.type === 'boolean') return 'boolean';
  if (def.type === 'number' || def.type === 'integer') return 'number';
  if (def.type === 'string' && typeof def.maxLength === 'number' && def.maxLength > 100) return 'textarea';
  return 'text';
}

type DynamicFieldDef = FieldDef & { group: string };

function extractDynamicFields(
  jsonSchema: Record<string, unknown>,
  uiSchema?: Record<string, unknown>,
): DynamicFieldDef[] {
  const fields: DynamicFieldDef[] = [];
  const topProps = (jsonSchema.properties ?? {}) as Record<string, Record<string, unknown>>;

  for (const [groupKey, groupDef] of Object.entries(topProps)) {
    if (SKIP_GROUPS.has(groupKey)) continue;
    const groupLabel = toGroupLabel(groupKey);
    const groupUi = (uiSchema?.[groupKey] ?? {}) as Record<string, Record<string, unknown>>;

    const groupProps = groupDef.properties as Record<string, Record<string, unknown>> | undefined;
    if (!groupProps) continue;

    for (const [fieldKey, fieldDef] of Object.entries(groupProps)) {
      const fieldUi = groupUi[fieldKey] ?? {};
      const enumValues = Array.isArray(fieldDef.enum) ? (fieldDef.enum as string[]) : undefined;
      const enumNames = Array.isArray(fieldDef.enumNames) ? (fieldDef.enumNames as string[]) : undefined;

      fields.push({
        key: fieldKey,
        label: String(fieldDef.title ?? fieldUi['ui:title'] ?? toFieldLabel(fieldKey)),
        type: inferDynamicFieldType(fieldDef, fieldUi),
        options: enumValues?.map((v, i) => ({ value: v, label: enumNames?.[i] ?? v })),
        helpText: String(fieldDef.description ?? fieldUi['ui:help'] ?? '').trim() || undefined,
        maxLength: typeof fieldDef.maxLength === 'number' ? fieldDef.maxLength : undefined,
        group: groupLabel,
      });
    }
  }
  return fields;
}

function getConfigValue(config: Record<string, unknown>, key: string): unknown {
  return config[key];
}

function renderField(
  field: FieldDef,
  value: unknown,
  onChange: (key: string, val: unknown) => void,
) {
  switch (field.type) {
    case 'text':
    case 'url':
      return (
        <TextField
          key={field.key}
          label={field.label}
          value={String(value ?? '')}
          onChange={(v) => onChange(field.key, v)}
          autoComplete="off"
          maxLength={field.maxLength}
          helpText={field.helpText}
          type={field.type === 'url' ? 'url' : 'text'}
        />
      );
    case 'textarea':
      return (
        <TextField
          key={field.key}
          label={field.label}
          value={String(value ?? '')}
          onChange={(v) => onChange(field.key, v)}
          autoComplete="off"
          multiline={3}
          maxLength={field.maxLength}
          helpText={field.helpText}
        />
      );
    case 'number':
      return (
        <TextField
          key={field.key}
          label={field.label}
          value={String(value ?? '')}
          onChange={(v) => onChange(field.key, parseFloat(v) || 0)}
          autoComplete="off"
          type="number"
          helpText={field.helpText}
        />
      );
    case 'boolean':
      return (
        <Checkbox
          key={field.key}
          label={field.label}
          checked={Boolean(value)}
          onChange={(v) => onChange(field.key, v)}
          helpText={field.helpText}
        />
      );
    case 'select':
      return (
        <Select
          key={field.key}
          label={field.label}
          options={field.options ?? []}
          value={String(value ?? '')}
          onChange={(v) => onChange(field.key, v)}
          helpText={field.helpText}
        />
      );
    case 'readonly':
      return (
        <TextField
          key={field.key}
          label={field.label}
          value={String(value ?? '')}
          autoComplete="off"
          disabled
          helpText={field.helpText}
        />
      );
    default:
      return null;
  }
}

export function ConfigEditor({
  spec,
  moduleId,
  adminConfig,
  onSpecChange,
}: {
  spec: RecipeSpec;
  moduleId: string;
  adminConfig?: { jsonSchema: Record<string, unknown>; uiSchema?: Record<string, unknown>; defaults: Record<string, unknown> } | null;
  onSpecChange?: (spec: RecipeSpec) => void;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string; version?: number }>();
  const { revalidate } = useRevalidator();

  // Use AI-generated dynamic fields when available (module has been hydrated)
  const dynamicFields = adminConfig?.jsonSchema
    ? extractDynamicFields(adminConfig.jsonSchema, adminConfig.uiSchema)
    : null;

  // Fall back to static per-type fields when not hydrated
  const staticFields = CONFIG_FIELDS[spec.type] ?? [];
  const fields = dynamicFields ?? staticFields;
  const isDynamic = dynamicFields !== null;

  const [name, setName] = useState(spec.name);
  const [config, setConfig] = useState<Record<string, unknown>>(
    () => ({ ...(spec as any).config }),
  );

  const handleConfigChange = useCallback((key: string, val: unknown) => {
    setConfig(prev => {
      const next = { ...prev, [key]: val };
      onSpecChange?.({ ...spec, config: next } as RecipeSpec);
      return next;
    });
  }, [spec, onSpecChange]);

  const handleNameChange = useCallback((val: string) => {
    setName(val);
    onSpecChange?.({ ...spec, name: val, config } as RecipeSpec);
  }, [spec, config, onSpecChange]);

  const handleSave = useCallback(() => {
    fetcher.submit(
      { spec: JSON.stringify({ ...spec, name, config }) },
      { method: 'post', action: `/api/modules/${moduleId}/spec` },
    );
  }, [spec, name, config, moduleId, fetcher]);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === 'idle') {
      revalidate();
    }
  }, [fetcher.data, fetcher.state, revalidate]);

  const isSaving = fetcher.state !== 'idle';
  const hasChanges = name !== spec.name ||
    JSON.stringify(config) !== JSON.stringify((spec as any).config);

  // No fields at all and not hydrated → prompt to hydrate
  if (fields.length === 0 && spec.type !== 'flow.automation') {
    return (
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Module settings</Text>
          <Banner tone="info">
            <Text as="p">
              Run <strong>Generate full settings</strong> below to unlock an AI-powered config editor for this module type.
            </Text>
          </Banner>
        </BlockStack>
      </Card>
    );
  }

  // Group dynamic fields by their group label
  const groups: { label: string; fields: DynamicFieldDef[] }[] = [];
  if (isDynamic) {
    const seen = new Map<string, DynamicFieldDef[]>();
    for (const f of fields as DynamicFieldDef[]) {
      if (!seen.has(f.group)) seen.set(f.group, []);
      seen.get(f.group)!.push(f);
    }
    for (const [label, grpFields] of seen) {
      groups.push({ label, fields: grpFields });
    }
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">Module settings</Text>
          <InlineStack gap="200">
            {isDynamic && <Badge tone="magic">AI-generated</Badge>}
            {fetcher.data?.ok && <Badge tone="success">Saved</Badge>}
            {fetcher.data?.error && <Badge tone="critical">Error</Badge>}
          </InlineStack>
        </InlineStack>

        <TextField
          label="Module name"
          value={name}
          onChange={handleNameChange}
          autoComplete="off"
          maxLength={80}
        />

        <Divider />

        {/* Dynamic groups from AI schema */}
        {isDynamic && groups.map((group, gi) => (
          <BlockStack key={group.label} gap="300">
            <Text as="p" variant="headingSm">{group.label}</Text>
            {group.fields.map(f => renderField(f, getConfigValue(config, f.key), handleConfigChange))}
            {gi < groups.length - 1 && <Divider />}
          </BlockStack>
        ))}

        {/* Static fallback fields (for standard types before hydration) */}
        {!isDynamic && (fields as FieldDef[]).length > 0 && (
          <BlockStack gap="300">
            <Text as="p" variant="headingSm">Content &amp; configuration</Text>
            {(fields as FieldDef[]).map(f => renderField(f, getConfigValue(config, f.key), handleConfigChange))}
          </BlockStack>
        )}

        {fetcher.data?.error && (
          <Banner tone="critical">
            <Text as="p">{fetcher.data.error}</Text>
          </Banner>
        )}

        <InlineStack align="end">
          <Button
            variant="primary"
            onClick={handleSave}
            loading={isSaving}
            disabled={!hasChanges || isSaving}
          >
            Save changes
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
