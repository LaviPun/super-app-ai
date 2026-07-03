import { json, redirect } from '@remix-run/node';

/** GET is not allowed — loader prevents Remix Single Fetch 404 after form submit. */
export async function loader() {
  return redirect('/modules');
}

import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { BlueprintService } from '~/services/blueprints/blueprint.service';
import { ThemeService } from '~/services/shopify/theme.service';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';
import { isBlueprintsEnabled } from '~/env.server';

/**
 * R3.2 — Co-deploy ("Publish all N"): publish every member of a blueprint as a unit,
 * resolving the bundle triangle (SKU→GID) at publish so members wire to each other
 * with real GIDs. First real caller of `BlueprintService.publishBlueprint`.
 *
 * Flag-gated behind BLUEPRINTS_ENABLED. Per-member publishability/policy is enforced
 * by the shared `PublishService` gate inside `publishBlueprint` (a member that would
 * be blocked lands in `failed[]`, never reported published). Full per-member
 * PublishPolicyService/feature-flag parity with single publish is a follow-up
 * (design §5.6 step 3).
 */
export async function action({ request, params }: { request: Request; params: { recipeId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/blueprints/publish', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      if (!isBlueprintsEnabled()) {
        return json({ error: 'Blueprints are not enabled.' }, { status: 403 });
      }
      await enforceRateLimit(`publish:${session.shop}`);

      const recipeId = params.recipeId?.trim();
      if (!recipeId) return json({ error: 'Missing recipeId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

      const blueprintService = new BlueprintService();
      const recipe = await blueprintService.getBlueprint(session.shop, recipeId);
      if (!recipe) {
        await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/blueprints/publish', success: false, details: { error: 'Blueprint not found', recipeId } });
        return json({ error: 'Blueprint not found' }, { status: 404 });
      }

      // Resolve a themeId for the batch. Prefer the explicit one from the "Publish
      // all N" picker (design DECISION 1(b)); else, when any member is a theme
      // module, fall back to the store's main/published theme.
      let themeId: string | undefined;
      const bodyThemeId = await readThemeId(request);
      if (bodyThemeId) {
        themeId = bodyThemeId;
      } else {
        const hasThemeMember = recipe.modules.some((m) => m.type.startsWith('theme.') || m.type === 'proxy.widget');
        if (hasThemeMember) {
          try {
            const themes = await new ThemeService(admin).listThemes();
            const main = themes.find((t) => t.role === 'main') ?? themes[0];
            if (main) themeId = String(main.id);
          } catch {
            // Leave themeId undefined → theme members fail loudly with the themeId
            // error inside publishBlueprint (never silently published elsewhere).
          }
        }
      }

      try {
        const result = await blueprintService.publishBlueprint(admin, session.shop, recipeId, { themeId });

        const activity = new ActivityLogService();
        for (const member of result.published) {
          await activity.log({
            actor: 'MERCHANT',
            action: 'MODULE_PUBLISHED',
            resource: `module:${member.moduleId}`,
            shopId: shopRow?.id,
            details: { source: 'blueprint_co_deploy', recipeId, type: member.type },
          });
        }

        await logRequestOutcome({
          shopId: shopRow?.id,
          pathOrIntent: '/api/blueprints/publish',
          success: result.failed.length === 0,
          details: {
            recipeId,
            published: result.published.length,
            failed: result.failed.length,
            skipped: result.skipped.length,
          },
        });

        return json(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/blueprints/publish', success: false, details: { error: message, recipeId } });
        return json({ error: message }, { status: 500 });
      }
    },
  );
}

/** Read an optional themeId from JSON or form-encoded body. */
async function readThemeId(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { themeId?: string } | null;
    return body?.themeId?.trim() || undefined;
  }
  const formData = await request.formData().catch(() => null);
  const value = formData?.get('themeId');
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
