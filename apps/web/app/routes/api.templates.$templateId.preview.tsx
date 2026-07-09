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

  try {
    const preview = new PreviewService().render(template.spec, surface ? { surface } : undefined);
    if (preview.kind === 'HTML') return json({ html: preview.html });
    return json({ json: preview.json });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
