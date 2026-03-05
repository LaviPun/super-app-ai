import { json, redirect } from '@remix-run/node';

/** GET is not allowed — loader prevents Remix Single Fetch 404 after form submit. */
export async function loader() {
  return redirect('/modules');
}
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { ThemeService } from '~/services/shopify/theme.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import type { DeployTarget } from '@superapp/core';
import { isCapabilityAllowed } from '@superapp/core';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { ActivityLogService } from '~/services/activity/activity.service';

/** Turn thrown value into a string suitable for UI (avoids "[object Object]"). */
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    const body = o.body ?? o.response ?? o.data;
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.errors) && b.errors.length) {
        const first = b.errors[0];
        const msg = first && typeof first === 'object' && first !== null && 'message' in first
          ? String((first as { message: unknown }).message) : String(first);
        if (msg) return msg;
      }
      if (typeof b.error === 'string') return b.error;
    }
  }
  return 'Publish failed. Please try again or check the theme ID.';
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/publish', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      enforceRateLimit(`publish:${session.shop}`);

      let body: { moduleId?: string; version?: number; themeId?: string } | null = null;
      const contentType = request.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        body = await request.json().catch(() => null);
      } else {
        const formData = await request.formData().catch(() => null);
        if (formData) {
          body = {
            moduleId: (formData.get('moduleId') as string) ?? undefined,
            themeId: (formData.get('themeId') as string) || undefined,
            version: formData.has('version') ? Number(formData.get('version')) : undefined,
          };
        }
      }
      if (!body?.moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

      const moduleService = new ModuleService();
      const module = await moduleService.getModule(session.shop, body.moduleId);
      if (!module) return json({ error: 'Module not found' }, { status: 404 });

      const draft = module.versions.find(v => v.status === 'DRAFT') ?? module.versions[0];
      if (!draft) return json({ error: 'No version found' }, { status: 400 });

      const spec = new RecipeService().parse(draft.specJson);

      const caps = new CapabilityService();
      let tier = await caps.getPlanTier(session.shop);
      if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);

      const blocked = (spec.requires ?? []).filter((c: any) => !isCapabilityAllowed(tier, c));
      if (blocked.length) {
        const reasons = blocked.map((c: any) => caps.explainCapabilityGate(c) ?? String(c));
        return json({ error: 'Plan does not allow this module', blocked, reasons, planTier: tier }, { status: 403 });
      }

      const isThemeModule = spec.type.startsWith('theme.');
      const target: DeployTarget = isThemeModule
        ? { kind: 'THEME', themeId: body.themeId ?? '', moduleId: module.id }
        : { kind: 'PLATFORM' };

      if (target.kind === 'THEME' && !target.themeId) {
        return json({ error: 'themeId is required for theme module publish' }, { status: 400 });
      }

      if (target.kind === 'THEME') {
        const themeService = new ThemeService(admin);
        const storeThemes = await themeService.listThemes();
        const themeIdNum = Number(target.themeId);
        const themeExists = storeThemes.some(t => t.id === themeIdNum);
        if (!themeExists) {
          return json(
            { error: 'Theme not found or not accessible for this store. Please choose a theme from the list.' },
            { status: 400 }
          );
        }
      }

      const validationErrors = validateBeforePublish(spec, { planTier: tier });
      if (validationErrors.length > 0) {
        return json(
          { error: 'Pre-publish validation failed', errors: validationErrors },
          { status: 400 }
        );
      }

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow?.id, type: 'PUBLISH', payload: { moduleId: module.id, target } });
      await jobs.start(job.id);

      try {
        const publisher = new PublishService(admin);
        await publisher.publish(spec, target);

        await moduleService.markPublished(module.id, draft.id, target.kind === 'THEME' ? target.themeId : undefined);
        await jobs.succeed(job.id, { ok: true });
        await new ActivityLogService().log({ actor: 'MERCHANT', action: 'MODULE_PUBLISHED', resource: `module:${module.id}`, shopId: shopRow?.id, details: { target: target.kind, versionId: draft.id } });

        const noExtension = (spec.type === 'admin.block' || spec.type === 'pos.extension') ? 'admin' : undefined;
        const q = noExtension ? `?published=1&noExtension=${noExtension}` : '?published=1';
        return redirect(`/modules/${module.id}${q}`);
      } catch (e) {
        await jobs.fail(job.id, e);
        const message = toErrorMessage(e);
        return json({ error: message }, { status: 500 });
      }
    }
  );
}
