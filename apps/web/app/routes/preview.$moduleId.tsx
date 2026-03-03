import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PreviewService } from '~/services/preview/preview.service';

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);

  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const ms = new ModuleService();
  const mod = await ms.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  if (!draft) return json({ error: 'No version found' }, { status: 404 });

  const spec = new RecipeService().parse(draft.specJson);
  const preview = new PreviewService().render(spec);

  if (preview.kind === 'JSON') return json(preview.json);

  return new Response(preview.html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
