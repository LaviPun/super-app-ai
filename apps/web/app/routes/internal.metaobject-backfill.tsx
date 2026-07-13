import { json } from '@remix-run/node';
import { Form, useActionData, useNavigation } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { MetafieldService } from '~/services/shopify/metafield.service';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import type { ThemeModulePayload, AdminBlockPayload, AdminActionPayload } from '~/services/recipes/compiler/types';
import { ErrorLogService } from '~/services/observability/error-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  Btn,
  Banner,
  Card,
  Field,
  Input,
  KV,
  PageHead,
} from '~/components/admin/page-kit';

/**
 * POST /internal/metaobject-backfill
 *
 * One-time migration route: reads existing large JSON metafields for a shop
 * and populates the new metaobject + list.metaobject_reference structure.
 *
 * Protected behind internal admin auth. Run per-shop via the internal dashboard
 * or curl after verifying the shop has a valid session.
 *
 * Body: { shopDomain: string, confirmShopDomain: string }
 *
 * Returns: { modules: N, blocks: N, actions: N }
 *
 * MIGRATION PHASES:
 *   Phase 3 — Run this after deploying the dual-write (Phase 2).
 *   Phase 4 — Verify: compare GID list count vs JSON key count.
 *   Phase 5 — Deploy Liquid + admin UI cutover (read from metaobjects).
 *   Phase 6 — Remove legacy JSON metafield writes from PublishService.
 */
export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  // Accept both a JSON body (curl / scripts) and a form post (the admin UI form).
  let body: { shopDomain?: string; confirmShopDomain?: string };
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  } else {
    const form = await request.formData();
    body = {
      shopDomain: String(form.get('shopDomain') ?? ''),
      confirmShopDomain: String(form.get('confirmShopDomain') ?? ''),
    };
  }

  const shopDomain = typeof body.shopDomain === 'string' ? body.shopDomain.trim() : '';
  const confirmShopDomain = typeof body.confirmShopDomain === 'string'
    ? body.confirmShopDomain.trim()
    : '';
  if (!shopDomain) {
    return json({ error: 'shopDomain is required' }, { status: 400 });
  }
  if (!confirmShopDomain) {
    return json({ error: 'confirmShopDomain is required' }, { status: 400 });
  }
  if (confirmShopDomain !== shopDomain) {
    return json({ error: 'confirmShopDomain must exactly match shopDomain' }, { status: 400 });
  }

  await new ActivityLogService()
    .log({
      actor: 'INTERNAL_ADMIN',
      action: 'SETTINGS_CHANGE',
      resource: 'internal.metaobject-backfill',
      details: {
        warning: 'Metaobject backfill mutates shop metafields and should be run deliberately.',
        shopDomain,
      },
    })
    .catch(() => {});

  let admin: Awaited<ReturnType<typeof shopify.authenticate.admin>>['admin'];
  try {
    const ctx = await shopify.unauthenticated.admin(shopDomain);
    admin = ctx.admin;
  } catch (err) {
    return json(
      { error: `Could not load admin session for ${shopDomain}: ${err instanceof Error ? err.message : String(err)}` },
      { status: 422 },
    );
  }

  const mf = new MetafieldService(admin);
  const mo = new MetaobjectService(admin);
  const errorLog = new ErrorLogService();
  let migratedModules = 0;
  let migratedBlocks = 0;
  let migratedActions = 0;

  // ── Theme modules ──────────────────────────────────────────────────────────
  try {
    const raw = await mf.getShopMetafield('superapp.theme', 'modules');
    if (raw) {
      const all = JSON.parse(raw) as Record<string, ThemeModulePayload>;
      await mo.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);
      const gids: string[] = [];
      for (const [moduleId, payload] of Object.entries(all)) {
        const gid = await mo.upsertModuleObject(moduleId, payload);
        gids.push(gid);
        migratedModules++;
      }
      await mo.setModuleGidList('superapp.theme', 'module_refs', gids);
    }
  } catch (err) {
    await errorLog.error(
      '[backfill] theme modules failed',
      err instanceof Error ? err.stack : undefined,
      { shopDomain, phase: 'theme.modules', migratedSoFar: migratedModules },
      err,
      'API',
    );
    return json({ error: `Theme modules migration failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // ── Admin blocks ───────────────────────────────────────────────────────────
  try {
    const raw = await mf.getShopMetafield('superapp.admin', 'blocks');
    if (raw) {
      const all = JSON.parse(raw) as Record<string, AdminBlockPayload>;
      await mo.ensureMetafieldDefinition('superapp.admin', 'block_refs', '$app:superapp_admin_block', true);
      const gids: string[] = [];
      for (const [moduleId, payload] of Object.entries(all)) {
        const gid = await mo.upsertAdminBlockObject(moduleId, payload);
        gids.push(gid);
        migratedBlocks++;
      }
      await mo.setModuleGidList('superapp.admin', 'block_refs', gids);
    }
  } catch (err) {
    await errorLog.error(
      '[backfill] admin blocks failed',
      err instanceof Error ? err.stack : undefined,
      { shopDomain, phase: 'admin.blocks', migratedSoFar: migratedBlocks },
      err,
      'API',
    );
    return json({ error: `Admin blocks migration failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  // ── Admin actions ──────────────────────────────────────────────────────────
  try {
    const raw = await mf.getShopMetafield('superapp.admin', 'actions');
    if (raw) {
      const all = JSON.parse(raw) as Record<string, AdminActionPayload>;
      await mo.ensureMetafieldDefinition('superapp.admin', 'action_refs', '$app:superapp_admin_action', true);
      const gids: string[] = [];
      for (const [moduleId, payload] of Object.entries(all)) {
        const gid = await mo.upsertAdminActionObject(moduleId, payload);
        gids.push(gid);
        migratedActions++;
      }
      await mo.setModuleGidList('superapp.admin', 'action_refs', gids);
    }
  } catch (err) {
    await errorLog.error(
      '[backfill] admin actions failed',
      err instanceof Error ? err.stack : undefined,
      { shopDomain, phase: 'admin.actions', migratedSoFar: migratedActions },
      err,
      'API',
    );
    return json({ error: `Admin actions migration failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  return json({
    ok: true,
    shopDomain,
    migrated: { modules: migratedModules, blocks: migratedBlocks, actions: migratedActions },
  });
}

/** GET: render a simple trigger form in the internal admin UI. */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({ ok: true });
}

type BackfillActionData =
  | { error: string }
  | { ok: true; shopDomain: string; migrated: { modules: number; blocks: number; actions: number } };

export default function MetaobjectBackfillPage() {
  const result = useActionData<BackfillActionData>();
  const navigation = useNavigation();
  const busy = navigation.state !== 'idle';
  const [shopDomain, setShopDomain] = useState('');
  const [confirmShopDomain, setConfirmShopDomain] = useState('');
  const errorMsg = result && 'error' in result ? result.error : null;
  const success = result && 'ok' in result ? result : null;
  const canRun = shopDomain.trim() !== '' && shopDomain.trim() === confirmShopDomain.trim();

  return (
    <div className="page page-narrow">
      <PageHead
        title="Metaobject backfill"
        sub="One-shot maintenance tool: migrate a shop's module data from large JSON metafields to metaobject entries + list.metaobject_reference shop metafields."
      />
      <Card pad>
        <Form method="post" className="stack-5">
          <Banner tone="warning" title="Mutates shop metafields">
            Run deliberately, per shop. Re-type the exact shop domain to confirm before running.
          </Banner>
          <Field label="Shop domain" help="e.g. store.myshopify.com">
            <Input
              name="shopDomain"
              value={shopDomain}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShopDomain(e.target.value)}
              placeholder="store.myshopify.com"
              autoComplete="off"
            />
          </Field>
          <Field label="Confirm shop domain" help="Must exactly match the shop domain above.">
            <Input
              name="confirmShopDomain"
              value={confirmShopDomain}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmShopDomain(e.target.value)}
              placeholder="store.myshopify.com"
              autoComplete="off"
            />
          </Field>
          {errorMsg && <Banner tone="critical" title="Backfill failed">{errorMsg}</Banner>}
          {success && (
            <Banner tone="success" title={`Backfill complete — ${success.shopDomain}`}>
              <KV
                rows={[
                  ['Modules migrated', success.migrated.modules],
                  ['Blocks migrated', success.migrated.blocks],
                  ['Actions migrated', success.migrated.actions],
                ]}
              />
            </Banner>
          )}
          <div>
            <Btn variant="primary" type="submit" icon="database" loading={busy} disabled={busy || !canRun}>
              Run backfill
            </Btn>
          </div>
        </Form>
      </Card>
    </div>
  );
}
