import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { MetafieldService } from '~/services/shopify/metafield.service';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import type { ThemeModulePayload, AdminBlockPayload, AdminActionPayload } from '~/services/recipes/compiler/types';
import { ErrorLogService } from '~/services/observability/error-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';

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

  let body: { shopDomain?: string; confirmShopDomain?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
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

export default function MetaobjectBackfillPage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Metaobject Backfill</h1>
      <p>
        Migrates a shop's module data from large JSON metafields → metaobject entries
        + <code>list.metaobject_reference</code> shop metafields.
      </p>
      <p>Run via POST with <code>{'{"shopDomain":"store.myshopify.com","confirmShopDomain":"store.myshopify.com"}'}</code></p>
      <p>
        <strong>Migration phases:</strong>
        <ol>
          <li>Deploy dual-write (Phase 2) — done if metaobject.service.ts is live</li>
          <li>Run this backfill per shop (Phase 3)</li>
          <li>Verify: GID list count == legacy JSON key count (Phase 4)</li>
          <li>Deploy Liquid + Admin UI cutover (Phase 5)</li>
          <li>Remove legacy JSON writes from PublishService (Phase 6)</li>
        </ol>
      </p>
    </div>
  );
}
