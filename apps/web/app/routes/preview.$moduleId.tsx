import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { PreviewService } from '~/services/preview/preview.service';
import { schedulePreviewExport } from '~/services/preview/preview-export.queue.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { loadStoreAesthetic } from '~/services/ai/design-reference.server';
import { verifyPreviewToken } from '~/services/security/preview-token.server';

export async function loader({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  // The Preview button opens this in a bare top-level tab (window.open) which carries
  // no embedded-admin session token, so authenticate.admin() would bounce to OAuth and
  // render a blank page. Instead of trusting a raw `?shop=` query param (which let any
  // caller who obtained a (shop, moduleId) pair view that shop's compiled module HTML
  // with no authentication), the link now carries a short-lived, HMAC/AES-GCM-signed
  // capability token minted server-side (in the authenticated modules.$moduleId.tsx
  // loader) that binds this exact (shop, moduleId) pair to a 5-minute window.
  const token = new URL(request.url).searchParams.get('token')?.trim();
  const ms = new ModuleService();

  let mod;
  if (token) {
    const { shop } = verifyPreviewToken(token, { moduleId });
    mod = await ms.getModule(shop, moduleId);
  } else {
    // Backward-compat: embedded/admin GET with a real session still authenticates.
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
