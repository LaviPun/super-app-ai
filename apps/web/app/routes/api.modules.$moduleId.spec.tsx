import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { RecipeSpecSchema } from '@superapp/core';

/**
 * POST: Update the draft spec (creates a new version with the given spec).
 * Body: { spec: RecipeSpec } (JSON) or formData 'spec' = JSON string.
 * Used by Style Builder and any future spec-editing UI.
 */
export async function action({
  request,
  params,
}: {
  request: Request;
  params: { moduleId?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  let specJson: string;
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => null) as { spec?: unknown } | null;
    if (!body?.spec) return json({ error: 'Missing spec in body' }, { status: 400 });
    specJson = JSON.stringify(body.spec);
  } else {
    const formData = await request.formData();
    const raw = formData.get('spec');
    if (raw == null) return json({ error: 'Missing spec' }, { status: 400 });
    specJson = typeof raw === 'string' ? raw : (raw as File).size ? await (raw as File).text() : '';
    if (!specJson) return json({ error: 'Missing spec' }, { status: 400 });
  }

  const recipeService = new RecipeService();
  let spec: unknown;
  try {
    spec = recipeService.parse(specJson);
  } catch (e) {
    return json({ error: 'Invalid spec', details: String(e) }, { status: 400 });
  }

  const parsed = RecipeSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return json({ error: 'Spec validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  if (mod.type !== parsed.data.type) {
    return json({ error: 'Cannot change module type' }, { status: 400 });
  }

  const newVersion = await moduleService.createNewVersion(session.shop, moduleId, parsed.data);
  return json({ ok: true, version: newVersion.version });
}
