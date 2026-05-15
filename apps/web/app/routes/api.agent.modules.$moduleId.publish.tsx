import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { CapabilityService } from '~/services/shopify/capability.service';
import type { Capability, DeployTarget, ModuleType } from '@superapp/core';
import { getCapabilityNode } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { JobService } from '~/services/jobs/job.service';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';
import { runPublishPreflight } from '~/services/publish/publish-preflight.server';
import { evaluateFeatureFlag, type FeatureFlagTopology } from '~/services/releases/feature-flags.server';
import { ProgressivePublishService } from '~/services/releases/progressive-publish.server';
import { getRecentPublishMetrics } from '~/services/releases/release-metrics.server';

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

  const preflight = await runPublishPreflight(admin, { isThemeModule });
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
  const jobs = new JobService();
  const progressive = new ProgressivePublishService();
  const canary = progressive.startCanary();
  const job = await jobs.create({
    shopId: shopRow?.id,
    type: 'PUBLISH',
    payload: {
      moduleId,
      target,
      source: 'agent_api',
      progressiveStage: canary.stage,
      progressiveDecision: canary.decision,
    },
  });
  await jobs.start(job.id);

  try {
    const previouslyPublishedVersion = mod.versions.find((v) => v.status === 'PUBLISHED');
    const publisher = new PublishService(admin);
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

    const rolloutMetrics = await getRecentPublishMetrics({
      shopId: shopRow?.id,
      paths: ['/api/publish'],
      windowMinutes: 30,
    });
    const progressiveDecision = progressive.evaluateRamp(rolloutMetrics);
    if (progressiveDecision.decision === 'ABORT' && previouslyPublishedVersion) {
      await moduleService.rollbackToVersion(
        session.shop,
        mod.id,
        previouslyPublishedVersion.version
      );
    }

    return json({ ok: true, moduleId, versionId: draft.id, version: draft.version, target: target.kind });
  } catch (e) {
    await jobs.fail(job.id, e);
    const message = e instanceof Error ? e.message : 'Publish failed';
    return json({ error: message }, { status: 500 });
  }
}
