import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PreviewService, type PreviewContext } from '~/services/preview/preview.service';
import { PreviewSimulationInputSchema } from '@superapp/platform-contracts';

export async function loader() {
  return json({ error: 'POST only' }, { status: 405 });
}

export async function action({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);

  const formData = await request.formData().catch(() => null);
  const specJson = formData?.get('spec') as string | null;
  if (!specJson) return json({ error: 'Missing spec' }, { status: 400 });

  // WS4/025: optional simulation fixture drives interactive Function/checkout previews.
  // Defaults fill any omitted fields, so a partial object from the UI is fine.
  let context: PreviewContext | undefined;
  const simRaw = formData?.get('simulation');
  if (typeof simRaw === 'string' && simRaw.trim()) {
    try {
      context = { simulation: PreviewSimulationInputSchema.parse(JSON.parse(simRaw)) };
    } catch (e) {
      return json({ error: `Invalid simulation input: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
    }
  }

  try {
    const spec = new RecipeService().parse(specJson);
    const result = new PreviewService().render(spec, context);
    if (result.kind === 'HTML') return json({ html: result.html });
    return json({ json: result.json });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
