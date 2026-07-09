import { json } from '@remix-run/node';
import { findTemplate } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { PreviewService, type PreviewSurface } from '~/services/preview/preview.service';

/**
 * Merchant-safe template preview. Mirrors `/api/preview` (used by the AI
 * builder's live preview) but takes a `templateId` instead of an arbitrary
 * spec, so the merchant Templates gallery/detail pages can render the real
 * `PreviewService` output for a canonical template without needing internal
 * admin access (unlike `/internal/templates/:id/preview`, which is gated
 * behind `requireInternalAdmin` and also exposes internal-only readiness
 * data via `mode=merchant`/artifact wiring not meant for merchants).
 */
export async function loader({ request, params }: { request: Request; params: { templateId?: string } }) {
  await shopify.authenticate.admin(request);

  const templateId = String(params.templateId ?? '').trim();
  if (!templateId) return json({ error: 'Missing template ID' }, { status: 400 });

  const template = findTemplate(templateId);
  if (!template) return json({ error: 'Template not found' }, { status: 404 });

  const url = new URL(request.url);
  const surface = (url.searchParams.get('surface') ?? undefined) as PreviewSurface | undefined;

  // The template spec already carries its authored `style.pack` + `colors.seed`,
  // so PreviewService.render() resolves the two-pack look + accent from the spec
  // itself — no app-side pack/palette resolution needed here. We only forward
  // theme fonts when they are trivially present as query params (the caller may
  // pass the storefront's heading/body font so previews match inherited type);
  // we never make an extra Admin/theme call for them.
  const headingFont = url.searchParams.get('headingFont')?.trim() || undefined;
  const bodyFont = url.searchParams.get('bodyFont')?.trim() || undefined;
  const themeFonts = headingFont || bodyFont ? { headingFont, bodyFont } : undefined;

  // This response is deterministic per (templateId, surface, fonts): PreviewService
  // renders from the static template spec with no per-request state. The payload is
  // large (the pack stylesheet is inlined), and the gallery fetches one per card, so
  // let the browser/CDN absorb repeat scrolls instead of re-fetching every thumbnail.
  const cacheHeaders = { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' };

  try {
    const preview = new PreviewService().render(template.spec, {
      ...(surface ? { surface } : {}),
      ...(themeFonts ? { themeFonts } : {}),
    });
    if (preview.kind === 'HTML') return json({ html: preview.html }, { headers: cacheHeaders });
    return json({ json: preview.json }, { headers: cacheHeaders });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
