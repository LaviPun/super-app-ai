import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService, PublishPartialFailureError, FunctionKeyAlreadyPublishedError } from '~/services/publish/publish.service';
import { publishPartialFailureResponse } from '~/services/publish/publish-error-response.server';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { CapabilityService } from '~/services/shopify/capability.service';
import type { Capability, DeployTarget, ModuleType } from '@superapp/core';
import { getCapabilityNode } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { QuotaService } from '~/services/billing/quota.service';
import { AppError } from '~/services/errors/app-error.server';
import { JobService } from '~/services/jobs/job.service';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';
import { runPublishPreflight } from '~/services/publish/publish-preflight.server';
import { evaluateFeatureFlag, type FeatureFlagTopology } from '~/services/releases/feature-flags.server';
import { getThemeEmbedStatus } from '~/services/publish/embed-status.server';

/**
 * Agent API: Publish a module to a theme or platform.
 *
 * POST /api/agent/modules/:moduleId/publish
 * Body: { themeId?: string, version?: number }
 *   - themeId: required for theme.* module types
 *   - version: optional specific version to publish (defaults to latest DRAFT)
 */
export async function action({
  request,
  params,
}: {
  request: Request;
  params: { moduleId?: string };
}) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const contentType = request.headers.get('Content-Type') ?? '';
  let body: {
    themeId?: string;
    version?: number;
  } = {};
  if (contentType.includes('application/json')) {
    body = await request.json().catch(() => ({}));
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  // Resolve the version to publish
  const draft = body.version != null
    ? mod.versions.find(v => v.version === body.version)
    : (mod.versions.find(v => v.status === 'DRAFT') ?? mod.versions[0]);

  if (!draft) return json({ error: 'No version found to publish' }, { status: 400 });

  const spec = new RecipeService().parse(draft.specJson);

  // Plan gate
  const caps = new CapabilityService();
  let tier = await caps.getPlanTier(session.shop);
  if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);
  // Build deploy target
  const isThemeModule = spec.type.startsWith('theme.');
  const target: DeployTarget = isThemeModule
    ? { kind: 'THEME', themeId: body.themeId ?? '', moduleId }
    : { kind: 'PLATFORM', moduleId };

  const preflight = await runPublishPreflight(admin, { isThemeModule, moduleType: spec.type });
  if (!preflight.ok) {
    const error = preflight.error
      ? `Publish preflight failed: ${preflight.error}`
      : `Missing required Shopify access scopes: ${preflight.missingScopes.join(', ')}`;
    return json(
      {
        error,
        missingScopes: preflight.missingScopes,
        requiredScopes: preflight.requiredScopes,
        grantedScopes: preflight.grantedScopes,
      },
      { status: 403 },
    );
  }

  const policy = new PublishPolicyService().evaluate({
    shopDomain: session.shop,
    versionId: draft.id,
    planTier: tier,
    requires: (spec.requires ?? []) as Capability[],
    specType: spec.type,
    targetKind: target.kind,
  });
  if (!policy.allowed) {
    const capabilityReasons = policy.blocked.map((c) => caps.explainCapabilityGate(c) ?? String(c));
    return json(
      {
        error: 'Plan does not allow this module',
        blocked: policy.blocked,
        reasons: [...capabilityReasons, ...policy.reasons],
        planTier: tier,
        snapshotKey: policy.snapshotKey,
      },
      { status: 403 }
    );
  }

  const surface = getCapabilityNode(spec.type as ModuleType).surface;
  const featureTopology: FeatureFlagTopology = {
    globalKillSwitch: process.env.RELEASE_GLOBAL_KILL_SWITCH === '1',
    globalSurfaceToggles: {
      THEME: process.env.RELEASE_SURFACE_THEME_ENABLED !== '0',
      ADMIN: process.env.RELEASE_SURFACE_ADMIN_ENABLED !== '0',
      CHECKOUT: process.env.RELEASE_SURFACE_CHECKOUT_ENABLED !== '0',
      FUNCTIONS: process.env.RELEASE_SURFACE_FUNCTIONS_ENABLED !== '0',
      CUSTOMER_ACCOUNT: process.env.RELEASE_SURFACE_CUSTOMER_ACCOUNT_ENABLED !== '0',
      POS: process.env.RELEASE_SURFACE_POS_ENABLED !== '0',
      INTEGRATION: process.env.RELEASE_SURFACE_INTEGRATION_ENABLED !== '0',
      FLOW: process.env.RELEASE_SURFACE_FLOW_ENABLED !== '0',
    },
  };
  const featureFlagDecision = evaluateFeatureFlag({
    topology: featureTopology,
    shopDomain: session.shop,
    surface,
  });
  if (!featureFlagDecision.enabled) {
    return json(
      {
        error: `Release blocked by feature flag policy: ${featureFlagDecision.reason}`,
        source: featureFlagDecision.source,
      },
      { status: 423 },
    );
  }

  if (target.kind === 'THEME' && !target.themeId) {
    return json({ error: 'themeId is required for theme.* module types' }, { status: 400 });
  }

  // Pre-publish validation
  const validationErrors = validateBeforePublish(spec, { planTier: tier });
  if (validationErrors.length > 0) {
    return json({ error: 'Pre-publish validation failed', errors: validationErrors }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  // WS-QF / Deploy-5: the published-module cap is crossed HERE (moduleCount
  // counts PUBLISHED modules), so enforce it before any publish work.
  // Excludes this module from the count, so a re-publish at cap never blocks.
  if (shopRow) {
    try {
      await new QuotaService().enforcePublishCap(shopRow.id, mod.id);
    } catch (e) {
      if (e instanceof AppError && e.code === 'RATE_LIMITED') {
        return json({ error: e.message, code: 'MODULE_LIMIT_REACHED' }, { status: 429 });
      }
      throw e;
    }
  }

  const jobs = new JobService();
  const job = await jobs.create({
    shopId: shopRow?.id,
    type: 'PUBLISH',
    payload: {
      moduleId,
      target,
      source: 'agent_api',
    },
  });
  await jobs.start(job.id);

  try {
    const publisher = new PublishService(admin, { shop: session.shop, shopId: shopRow?.id });
    await publisher.publish(spec, target);
    await moduleService.markPublishedWithTransition({
      shopId: shopRow?.id,
      moduleId: mod.id,
      versionId: draft.id,
      targetThemeId: target.kind === 'THEME' ? target.themeId : undefined,
      source: 'agent_api',
      idempotencyKey: `agent-publish:${session.shop}:${mod.id}:${draft.id}:${target.kind === 'THEME' ? target.themeId : 'platform'}`,
    });
    await jobs.succeed(job.id, { ok: true });
    await new ActivityLogService().log({
      actor: 'SYSTEM',
      action: 'MODULE_PUBLISHED',
      resource: `module:${moduleId}`,
      shopId: shopRow?.id,
      details: { target: target.kind, versionId: draft.id, source: 'agent_api' },
    }).catch(() => {/* non-fatal */});

    // WS-E finding 5: a successful publish does not by itself make a theme
    // module render — the merchant also needs the app embed on. Advisory-only
    // (getThemeEmbedStatus never throws), so this can never turn a real publish
    // success into a reported failure.
    let embedStatus: Awaited<ReturnType<typeof getThemeEmbedStatus>> | undefined;
    if (isThemeModule) {
      embedStatus = await getThemeEmbedStatus(admin, target.kind === 'THEME' ? target.themeId : undefined);
    }

    return json({ ok: true, moduleId, versionId: draft.id, version: draft.version, target: target.kind, embedStatus });
  } catch (e) {
    await jobs.fail(job.id, e);
    // WS-E finding 4: same structured guidance as api.publish.tsx — a partial
    // failure here (this is the route the module-detail page's own
    // Publish/Republish button actually calls) must not degrade to a flat
    // error string. Shared helper keeps the two routes from drifting.
    if (e instanceof PublishPartialFailureError) {
      return publishPartialFailureResponse(e);
    }
    // WS-E final-review fix 1b: same-functionKey conflict is merchant-fixable
    // (unpublish the other module first), not a server error — 409.
    if (e instanceof FunctionKeyAlreadyPublishedError) {
      return json({ error: e.message, code: e.code }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : 'Publish failed';
    return json({ error: message }, { status: 500 });
  }
}
