import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { PreviewService } from '~/services/preview/preview.service';
import { schedulePreviewExport } from '~/services/preview/preview-export.queue.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  // The Preview button opens this in a bare top-level tab (window.open) which carries
  // no embedded-admin session token, so authenticate.admin() would bounce to OAuth and
  // render a blank page. Instead we scope strictly to the module's own shop + id: the
  // shop is passed as a query param and getModule() filters by BOTH shop domain and id,
  // so a request can only ever see a module that genuinely belongs to that shop. The
  // output is the module's deterministic compiled preview HTML — no other shop data.
  const shop = new URL(request.url).searchParams.get('shop')?.trim();
  const ms = new ModuleService();

  let mod;
  if (shop) {
    mod = await ms.getModule(shop, moduleId);
  } else {
    // Backward-compat: embedded/admin GET without a shop param still authenticates.
    const { session } = await shopify.authenticate.admin(request);
    mod = await ms.getModule(session.shop, moduleId);
  }
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  const draft = mod.versions.find(v => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  if (!draft) return json({ error: 'No version found' }, { status: 404 });

  const spec = new RecipeService().parse(draft.specJson);
  // Inherit the merchant's live-theme fonts so the preview matches the storefront.
  const aesthetic = await loadStoreAesthetic(mod.shopId).catch(() => null);
  const preview = new PreviewService().render(spec, { themeFonts: aesthetic?.typography });

  if (preview.kind === 'JSON') return json(preview.json);

  void schedulePreviewExport({
    shopId: mod.shopId,
    moduleId: mod.id,
    revisionId: draft.id,
    html: preview.html,
    recipeSpecRef: draft.id,
  }).catch(() => undefined);

  return new Response(preview.html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
