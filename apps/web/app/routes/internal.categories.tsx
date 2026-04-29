import { json } from '@remix-run/node';
import { Form, useLoaderData, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Button, InlineStack, Banner,
  InlineGrid, TextField, Checkbox,
} from '@shopify/polaris';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { SettingsService } from '~/services/settings/settings.service';
import { TEMPLATE_CATEGORIES } from '@superapp/core';
import { ActivityLogService } from '~/services/activity/activity.service';

export type CategoryOverride = { displayName?: string; enabled?: boolean };

function parseOverrides(raw: string | null): Record<string, CategoryOverride> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, CategoryOverride> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const v = val as Record<string, unknown>;
        out[key] = {
          displayName: typeof v.displayName === 'string' ? v.displayName : undefined,
          enabled: typeof v.enabled === 'boolean' ? v.enabled : undefined,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

const CATEGORY_ID_RE = /^[A-Z][A-Z0-9_]*$/;
const ALLOWED_FIELDS = new Set(['displayName', 'enabled']);

type StrictParseResult =
  | { ok: true; value: Record<string, CategoryOverride> }
  | { ok: false; error: string };

function strictParseOverrides(raw: string): StrictParseResult {
  if (!raw.trim()) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not parse JSON';
    return { ok: false, error: `Invalid JSON: ${msg}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Root must be a JSON object mapping category IDs to override objects.' };
  }
  const out: Record<string, CategoryOverride> = {};
  for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (!CATEGORY_ID_RE.test(key)) {
      return { ok: false, error: `Invalid category ID "${key}". Use UPPER_SNAKE_CASE (e.g. CUSTOM_REPORTS).` };
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) {
      return { ok: false, error: `Override for "${key}" must be an object.` };
    }
    const v = val as Record<string, unknown>;
    for (const field of Object.keys(v)) {
      if (!ALLOWED_FIELDS.has(field)) {
        return { ok: false, error: `Override for "${key}" has unknown field "${field}". Allowed: displayName, enabled.` };
      }
    }
    if (v.displayName !== undefined && typeof v.displayName !== 'string') {
      return { ok: false, error: `Override for "${key}".displayName must be a string.` };
    }
    if (typeof v.displayName === 'string' && v.displayName.length > 80) {
      return { ok: false, error: `Override for "${key}".displayName is too long (max 80 chars).` };
    }
    if (v.enabled !== undefined && typeof v.enabled !== 'boolean') {
      return { ok: false, error: `Override for "${key}".enabled must be a boolean.` };
    }
    out[key] = {
      displayName: typeof v.displayName === 'string' ? v.displayName : undefined,
      enabled: typeof v.enabled === 'boolean' ? v.enabled : undefined,
    };
  }
  return { ok: true, value: out };
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const settings = await new SettingsService().get();
  const overrides = parseOverrides(settings.categoryOverrides);
  const codeCategories = [...TEMPLATE_CATEGORIES];
  const codeCategoryIds = codeCategories as readonly string[];
  const customIds = Object.keys(overrides).filter(k => !codeCategoryIds.includes(k));
  const allCategoryIds = [...new Set([...codeCategories, ...customIds])];
  return json({
    categories: codeCategories,
    allCategoryIds,
    overrides,
    rawOverrides: settings.categoryOverrides ?? '',
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  const service = new SettingsService();
  const settings = await service.get();
  let overrides = parseOverrides(settings.categoryOverrides);

  if (intent === 'add_category') {
    const categoryId = String(form.get('categoryId') ?? '').trim().toUpperCase().replace(/\s+/g, '_');
    if (!categoryId) return json({ error: 'Category ID is required' }, { status: 400 });
    if (!CATEGORY_ID_RE.test(categoryId)) {
      return json(
        { error: `Invalid category ID "${categoryId}". Use UPPER_SNAKE_CASE (letters, digits, underscores; must start with a letter).` },
        { status: 400 },
      );
    }
    const displayName = String(form.get('displayName') ?? '').trim() || categoryId;
    if (displayName.length > 80) {
      return json({ error: 'Display name is too long (max 80 chars).' }, { status: 400 });
    }
    const enabled = form.get('enabled') === 'true';
    overrides[categoryId] = { displayName, enabled };
    const str = JSON.stringify(overrides, null, 2);
    await service.update({ categoryOverrides: str });
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'STORE_SETTINGS_UPDATED',
      details: { section: 'categoryOverrides', added: categoryId },
    });
    return json({ toast: { message: `Category ${categoryId} added` } });
  }

  if (intent === 'save') {
    const raw = form.get('categoryOverrides');
    const str = typeof raw === 'string' ? raw : '';
    let normalized: string | null = null;
    if (str.trim()) {
      const result = strictParseOverrides(str);
      if (!result.ok) {
        return json({ error: result.error }, { status: 400 });
      }
      overrides = result.value;
      normalized = JSON.stringify(overrides, null, 2);
    }
    await service.update({ categoryOverrides: normalized });
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'STORE_SETTINGS_UPDATED',
      details: { section: 'categoryOverrides', count: Object.keys(overrides).length },
    });
    return json({ toast: { message: 'Category overrides saved' } });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

export default function InternalCategories() {
  const { categories, allCategoryIds, overrides, rawOverrides } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [jsonText, setJsonText] = useState(rawOverrides || '{}');
  const [newId, setNewId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const isSaving = navigation.state !== 'idle';

  return (
    <Page title="Categories" subtitle="Configure display names, visibility, and add new categories.">
      <BlockStack gap="500">
        {actionData && 'toast' in actionData && (
          <Banner tone="success">{(actionData as { toast: { message: string } }).toast.message}</Banner>
        )}
        {actionData && 'error' in actionData && (
          <Banner tone="critical">{(actionData as { error: string }).error}</Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add new category</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Add a custom category ID. It will appear in the list below and in overrides JSON. Use UPPER_SNAKE_CASE (e.g. CUSTOM_REPORTS).
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="add_category" />
              <InlineStack gap="300" wrap>
                <div style={{ minWidth: 180 }}>
                  <TextField
                    label="Category ID"
                    name="categoryId"
                    value={newId}
                    onChange={setNewId}
                    placeholder="CUSTOM_REPORTS"
                    autoComplete="off"
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <TextField
                    label="Display name"
                    name="displayName"
                    value={newDisplayName}
                    onChange={setNewDisplayName}
                    placeholder="Custom Reports"
                    autoComplete="off"
                  />
                </div>
                <div style={{ paddingTop: 24 }}>
                  <Checkbox
                    label="Enabled"
                    checked={newEnabled}
                    onChange={setNewEnabled}
                  />
                  <input type="hidden" name="enabled" value={newEnabled ? 'true' : 'false'} />
                </div>
                <div style={{ paddingTop: 24 }}>
                  <Button submit size="slim" variant="secondary">Add category</Button>
                </div>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">All categories (code + custom)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Built-in categories from catalog; custom ones from overrides.
            </Text>
            <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="200">
              {allCategoryIds.map(cat => {
                const o = overrides[cat];
                const label = o?.displayName ?? cat;
                const enabled = o?.enabled !== false;
                return (
                  <Text key={cat} as="p" variant="bodySm">
                    {label}
                    {!enabled && ' (disabled)'}
                    {!(categories as readonly string[]).includes(cat) && ' [custom]'}
                  </Text>
                );
              })}
            </InlineGrid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Category overrides (JSON)</Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Example: {`{ "STOREFRONT_UI": { "displayName": "Storefront", "enabled": true }, "FUNCTION": { "enabled": false } }`}
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <textarea
                name="categoryOverrides"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                rows={10}
                style={{
                  width: '100%',
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 12,
                  padding: 8,
                  border: '1px solid var(--p-color-border)',
                  borderRadius: 6,
                  boxSizing: 'border-box',
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
                spellCheck={false}
                aria-label="Category overrides JSON"
              />
              <InlineStack gap="200" blockAlign="start">
                <Button submit variant="primary" loading={isSaving}>
                  Save overrides
                </Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
