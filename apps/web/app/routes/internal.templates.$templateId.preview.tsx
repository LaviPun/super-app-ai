import { json } from '@remix-run/node';
import { findTemplate, RecipeSpecSchema } from '@superapp/core';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { PreviewService } from '~/services/preview/preview.service';
import { SettingsService } from '~/services/settings/settings.service';

function getTemplateSpec(templateId: string, overridesJson: string | null) {
  const template = findTemplate(templateId);
  if (!template) return null;
  if (!overridesJson?.trim()) return template.spec;
  try {
    const overrides = JSON.parse(overridesJson) as Record<string, unknown>;
    const override = overrides[templateId];
    if (override && typeof override === 'object') {
      const parsed = RecipeSpecSchema.safeParse(override);
      if (parsed.success) return parsed.data;
    }
  } catch {
    // ignore malformed overrides and fall back to canonical template
  }
  return template.spec;
}

function jsonPreviewPage(data: unknown, title: string): string {
  const pretty = JSON.stringify(data, null, 2);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #f6f8fb; color: #111827; }
      .wrap { padding: 16px; }
      .hint { margin-bottom: 10px; color: #6b7280; font-size: 12px; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: #ffffff; border: 1px solid #dce3ec; border-radius: 8px; padding: 12px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hint">This template type renders as structured JSON preview.</div>
      <pre>${pretty}</pre>
    </div>
  </body>
</html>`;
}

export async function loader({ request, params }: { request: Request; params: { templateId?: string } }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const templateId = String(params.templateId ?? '').trim();
  if (!templateId) return json({ error: 'Missing template ID' }, { status: 400 });

  const template = findTemplate(templateId);
  if (!template) return json({ error: 'Template not found' }, { status: 404 });

  const settings = await new SettingsService().get();
  const spec = getTemplateSpec(templateId, settings.templateSpecOverrides);
  if (!spec) return json({ error: 'Template spec unavailable' }, { status: 404 });

  const preview = new PreviewService().render(spec);
  if (preview.kind === 'JSON') {
    return new Response(jsonPreviewPage(preview.json, `${template.name} Preview`), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (mode === 'merchant') {
    const merchantLikeHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${template.name} Merchant Preview</title>
    <style>
      body { margin: 0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f3f4f6; color: #111827; }
      .top { height: 56px; background: #111827; color: #fff; display: flex; align-items: center; padding: 0 16px; font-size: 14px; }
      .hero { background: #fff; border-bottom: 1px solid #e5e7eb; padding: 18px 16px; }
      .hero h1 { margin: 0 0 6px; font-size: 18px; }
      .hero p { margin: 0; color: #6b7280; font-size: 13px; }
      .canvas { max-width: 1120px; margin: 18px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
      iframe { width: 100%; height: 560px; border: 0; display: block; background: #fff; }
    </style>
  </head>
  <body>
    <div class="top">Merchant storefront simulation</div>
    <div class="hero">
      <h1>Sample storefront page</h1>
      <p>Template: ${template.name} · Type: ${template.type}</p>
    </div>
    <div class="canvas">
      <iframe src="/internal/templates/${encodeURIComponent(templateId)}/preview"></iframe>
    </div>
  </body>
</html>`;
    return new Response(merchantLikeHtml, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return new Response(preview.html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
