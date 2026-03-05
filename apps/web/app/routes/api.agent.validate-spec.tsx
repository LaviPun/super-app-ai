import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { RecipeSpecSchema } from '@superapp/core';
import { RecipeService } from '~/services/recipes/recipe.service';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { CapabilityService } from '~/services/shopify/capability.service';
import { isCapabilityAllowed } from '@superapp/core';

/**
 * Agent API Primitive: Validate a RecipeSpec without saving or publishing.
 *
 * POST /api/agent/validate-spec
 * Body: { spec: RecipeSpec }
 *
 * Returns:
 * - Schema validation result (Zod)
 * - Plan gate result (which capabilities are blocked)
 * - Pre-publish validation errors
 *
 * READ-ONLY — no side effects.
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as { spec?: unknown } | null;
  if (!body?.spec) return json({ error: 'Missing spec' }, { status: 400 });

  // 1. Schema validation
  const recipeService = new RecipeService();
  let spec: unknown;
  try {
    spec = typeof body.spec === 'string' ? recipeService.parse(body.spec) : body.spec;
  } catch (e) {
    return json({ ok: false, valid: false, schemaError: String(e), planGate: null, prePublish: null });
  }

  const parsed = RecipeSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return json({
      ok: false,
      valid: false,
      schemaError: parsed.error.flatten(),
      planGate: null,
      prePublish: null,
    });
  }

  // 2. Plan gate check
  const caps = new CapabilityService();
  let tier = await caps.getPlanTier(session.shop);
  if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);

  const blocked = (parsed.data.requires ?? []).filter((c: any) => !isCapabilityAllowed(tier, c));
  const planGate = {
    planTier: tier,
    blocked,
    reasons: blocked.map((c: any) => caps.explainCapabilityGate(c) ?? String(c)),
    allowed: blocked.length === 0,
  };

  // 3. Pre-publish validation
  const prePublishErrors = validateBeforePublish(parsed.data, { planTier: tier });

  return json({
    ok: true,
    valid: blocked.length === 0 && prePublishErrors.length === 0,
    schemaError: null,
    planGate,
    prePublish: {
      errors: prePublishErrors,
      passed: prePublishErrors.length === 0,
    },
    spec: parsed.data,
  });
}
