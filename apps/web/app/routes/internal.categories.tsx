import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { SettingsService } from '~/services/settings/settings.service';
import { TEMPLATE_CATEGORIES } from '@superapp/core';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  Btn,
  Icon,
  Field,
  Input,
  Checkbox,
  Toggle,
  Card,
  Modal,
  ConfirmDialog,
  DataTable,
  PageHead,
  MonoChip,
  fmtNum,
  titleCase,
} from '~/components/admin/page-kit';

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
  const prisma = getPrisma();
  const [settings, grouped] = await Promise.all([
    new SettingsService().get(),
    prisma.module.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const overrides = parseOverrides(settings.categoryOverrides);
  const codeCategories = [...TEMPLATE_CATEGORIES];
  const codeCategoryIds = codeCategories as readonly string[];
  const customIds = Object.keys(overrides).filter(k => !codeCategoryIds.includes(k));
  const allCategoryIds = [...new Set([...codeCategories, ...customIds])];
  // Real, cross-shop module counts per category (RecipeSpec.category === MODULE_CATEGORIES id).
  const moduleCounts: Record<string, number> = {};
  for (const g of grouped) moduleCounts[g.category] = g._count._all;
  return json({
    categories: codeCategories,
    allCategoryIds,
    overrides,
    moduleCounts,
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
    const categoryId = String(form.get('categoryId') ?? '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
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

  if (intent === 'edit_category' || intent === 'toggle_visibility') {
    const categoryId = String(form.get('categoryId') ?? '').trim();
    if (!categoryId || !CATEGORY_ID_RE.test(categoryId)) {
      return json({ error: 'Invalid category ID' }, { status: 400 });
    }
    const enabled = form.get('enabled') === 'true';
    const prev = overrides[categoryId] ?? {};
    if (intent === 'edit_category') {
      const displayName = String(form.get('displayName') ?? '').trim();
      if (displayName.length > 80) {
        return json({ error: 'Display name is too long (max 80 chars).' }, { status: 400 });
      }
      overrides[categoryId] = { displayName: displayName || undefined, enabled };
    } else {
      overrides[categoryId] = { ...prev, enabled };
    }
    await service.update({ categoryOverrides: JSON.stringify(overrides, null, 2) });
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'STORE_SETTINGS_UPDATED',
      details: { section: 'categoryOverrides', updated: categoryId },
    });
    const message =
      intent === 'toggle_visibility'
        ? `${categoryId} ${enabled ? 'shown' : 'hidden'}`
        : `Category ${categoryId} saved`;
    return json({ toast: { message } });
  }

  if (intent === 'delete_category') {
    const categoryId = String(form.get('categoryId') ?? '').trim();
    if (!categoryId) return json({ error: 'Missing category ID' }, { status: 400 });
    const isBuiltIn = (TEMPLATE_CATEGORIES as readonly string[]).includes(categoryId);
    const hadOverride = Object.prototype.hasOwnProperty.call(overrides, categoryId);
    if (isBuiltIn && !hadOverride) {
      return json({ error: `"${categoryId}" is a built-in category and cannot be deleted.` }, { status: 400 });
    }
    if (hadOverride) {
      delete overrides[categoryId];
      const remaining = Object.keys(overrides).length ? JSON.stringify(overrides, null, 2) : null;
      await service.update({ categoryOverrides: remaining });
    }
    await new ActivityLogService().log({
      actor: 'INTERNAL_ADMIN',
      action: 'STORE_SETTINGS_UPDATED',
      details: { section: 'categoryOverrides', removed: categoryId },
    });
    return json({
      toast: { message: isBuiltIn ? `${categoryId} reset to default` : `Category ${categoryId} deleted` },
    });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

type CatActionData = { toast?: { message: string }; error?: string };

/** Fetcher whose toast always reflects the server response (error styling on ok:false). */
function useCatFetcher() {
  const fetcher = useFetcher<CatActionData>();
  const ctx = useAdminCtx();
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) ctx.toast(fetcher.data.error, true);
      else if (fetcher.data.toast?.message) ctx.toast(fetcher.data.toast.message);
    }
  }, [fetcher.state, fetcher.data, ctx]);
  return fetcher;
}

export default function AdminCategories() {
  const data = useLoaderData<typeof loader>();
  const rowFetcher = useCatFetcher();
  const [modal, setModal] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [showJson, setShowJson] = useState(false);

  const ROWS: any[] = data.allCategoryIds.map((id: string) => {
    const o = (data.overrides as Record<string, any>)[id] || {};
    return { id, key: id.toLowerCase().replace(/_/g, '-'), display: o.displayName || titleCase(id), enabled: o.enabled !== false, modules: data.moduleCounts[id] ?? 0, icon: 'categories' };
  });

  return (
    <div className="page">
      <PageHead
        title="Categories"
        sub="Module categories shown to merchants. Toggle visibility, rename, or add new categories."
        actions={
          <>
            <Btn icon="code" onClick={() => setShowJson((j) => !j)}>
              {showJson ? 'Form view' : 'JSON view'}
            </Btn>
            <Btn variant="primary" icon="plus" onClick={() => setModal('new')}>
              Add category
            </Btn>
          </>
        }
      />
      {showJson ? (
        <Card pad>
          <pre className="code-block">{JSON.stringify(ROWS.reduce((a: any, c: any) => { a[c.key] = { display: c.display, enabled: c.enabled }; return a; }, {}), null, 2)}</pre>
        </Card>
      ) : (
        <Card>
          <DataTable
            rowKey="id"
            columns={[
              {
                key: 'display',
                label: 'Category',
                render: (r: any) => (
                  <div className="row-3">
                    <span className="tile-ico" style={{ width: 32, height: 32, background: 'var(--p-surface-secondary)' }}>
                      <Icon name={r.icon} size={16} />
                    </span>
                    <span className="cell-strong">{r.display}</span>
                  </div>
                ),
              },
              { key: 'key', label: 'Key', render: (r: any) => <MonoChip>{r.key}</MonoChip> },
              { key: 'modules', label: 'Modules', num: true, render: (r: any) => fmtNum(r.modules) },
              {
                key: 'enabled',
                label: 'Visible',
                render: (r: any) => (
                  <Toggle
                    checked={r.enabled}
                    onChange={(e: any) =>
                      rowFetcher.submit(
                        { intent: 'toggle_visibility', categoryId: r.id, enabled: String(e.target.checked) },
                        { method: 'post' },
                      )
                    }
                  />
                ),
              },
              {
                key: 'act',
                label: '',
                render: (r: any) => (
                  <div className="dt-actions">
                    <Btn size="sm" icon="edit" className="btn-plain" onClick={() => setModal(r)} />
                    <Btn
                      size="sm"
                      icon="trash"
                      className="btn-plain-critical"
                      onClick={() =>
                        setConfirm({
                          title: 'Delete category',
                          message: 'Delete the “' + r.display + '” category? ' + fmtNum(r.modules) + ' modules use it and will become Uncategorized. Merchants lose this filter.',
                          confirmLabel: 'Delete category',
                          tone: 'critical',
                          icon: 'trash',
                          onConfirm: () =>
                            rowFetcher.submit({ intent: 'delete_category', categoryId: r.id }, { method: 'post' }),
                        })
                      }
                    />
                  </div>
                ),
              },
            ]}
            rows={ROWS}
          />
        </Card>
      )}
      {modal && <CategoryModal cat={modal} onClose={() => setModal(null)} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function CategoryModal({ cat, onClose }: { cat: any; onClose: () => void }) {
  const fetcher = useCatFetcher();
  const isNew = cat === 'new';
  const [f, setF] = useState(isNew ? { display: '', key: '', enabled: true } : { ...cat });
  const set = (k: string, v: any) => setF((o: any) => ({ ...o, [k]: v }));

  // Close only after the server confirms the write.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !fetcher.data.error) onClose();
  }, [fetcher.state, fetcher.data, onClose]);

  const save = () => {
    if (isNew) {
      const categoryId = String(f.key || f.display)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      fetcher.submit(
        { intent: 'add_category', categoryId, displayName: f.display, enabled: String(!!f.enabled) },
        { method: 'post' },
      );
    } else {
      fetcher.submit(
        { intent: 'edit_category', categoryId: f.id, displayName: f.display, enabled: String(!!f.enabled) },
        { method: 'post' },
      );
    }
  };
  return (
    <Modal
      title={isNew ? 'Add category' : 'Edit ' + cat.display}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} loading={fetcher.state !== 'idle'}>
            {isNew ? 'Add' : 'Save'}
          </Btn>
        </>
      }
    >
      <div className="stack-4">
        <Field label="Display name">
          <Input value={f.display} onChange={(e: any) => set('display', e.target.value)} placeholder="Subscriptions" autoFocus />
        </Field>
        <Field label="Key" help={isNew ? 'lowercase-with-dashes' : 'Fixed identifier — not editable'}>
          <Input mono value={f.key} onChange={(e: any) => set('key', e.target.value)} placeholder="subscriptions" readOnly={!isNew} disabled={!isNew} />
        </Field>
        <Checkbox checked={!!f.enabled} onChange={(e: any) => set('enabled', e.target.checked)} label="Visible to merchants" />
      </div>
    </Modal>
  );
}
