/**
 * Admin print-document reader + renderer.
 *
 * The shipped admin-print extension (extensions/admin-print) renders an
 * `s-admin-print-action` whose `src` points at `/admin-print/document?moduleId=…&
 * documentKind=…&ids=…`. This module reads the module's PUBLISHED `admin.print` config
 * (the same source of truth every surface publishes to — a module's active PUBLISHED
 * ModuleVersion) and renders a self-contained, print-optimized HTML document from it.
 * No demo data: an unpublished / mismatched module yields `null` and the route 404s.
 */
import type { PrismaClient } from '@prisma/client';
import { RecipeSpecSchema, type RecipeSpec } from '@superapp/core';

export type AdminPrintDocConfig = Extract<RecipeSpec, { type: 'admin.print' }>['config'];

/** Narrow a parsed RecipeSpec to the `admin.print` variant. */
function isPrintSpec(spec: RecipeSpec): spec is Extract<RecipeSpec, { type: 'admin.print' }> {
  return spec.type === 'admin.print';
}

/** Read the PUBLISHED admin.print config for one module on a shop, or null. */
export async function readPublishedPrintConfig(
  prisma: PrismaClient,
  shopDomain: string,
  moduleId: string,
): Promise<AdminPrintDocConfig | null> {
  const mod = await prisma.module.findFirst({
    where: { id: moduleId, type: 'admin.print', status: 'PUBLISHED', shop: { shopDomain } },
    include: { activeVersion: true },
  });
  const version = mod?.activeVersion;
  if (!version || version.status !== 'PUBLISHED' || !version.specJson) return null;
  try {
    const parsed = RecipeSpecSchema.safeParse(JSON.parse(version.specJson));
    if (!parsed.success || !isPrintSpec(parsed.data)) return null;
    return parsed.data.config;
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve `{{order.name}}` / `{{product.title}}` style placeholders in a body template
 * against the selected resource ids. We only know the ids in this app context, so the
 * substitution is intentionally minimal (id + count); a richer merge would need an
 * Admin API read per id (a follow-up). Unresolved placeholders are left verbatim.
 */
function fillTemplate(template: string, ids: string[]): string {
  return template
    .replace(/\{\{\s*count\s*\}\}/g, String(ids.length))
    .replace(/\{\{\s*ids\s*\}\}/g, ids.join(', '));
}

/** Render the print document as a self-contained, print-optimized HTML page. */
export function renderPrintDocument(config: AdminPrintDocConfig, ids: string[]): string {
  const title = esc(config.title);
  const subtitle = config.subtitle ? esc(config.subtitle) : '';
  const kind = esc(config.documentKind);
  const header = config.includeShopHeader
    ? '<div class="pd-shop">Your Store</div>'
    : '';
  const idRows = ids.length
    ? ids.map((id) => `<tr><td>${esc(id)}</td></tr>`).join('')
    : '<tr><td class="pd-muted">No resource selected.</td></tr>';
  const body = config.bodyTemplate
    ? `<div class="pd-body">${esc(fillTemplate(config.bodyTemplate, ids))}</div>`
    : `<table class="pd-table"><thead><tr><th>Resource</th></tr></thead><tbody>${idRows}</tbody></table>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; margin: 0; padding: 24px; }
  .pd-shop { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; margin-bottom: 12px; }
  .pd-kind { font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .pd-sub { color: #6b7280; margin: 0 0 18px; font-size: 14px; }
  .pd-table { width: 100%; border-collapse: collapse; }
  .pd-table th, .pd-table td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  .pd-body { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
  .pd-muted { color: #9ca3af; }
</style>
</head>
<body>
  ${header}
  <div class="pd-kind">${kind}</div>
  <h1>${title}</h1>
  ${subtitle ? `<p class="pd-sub">${subtitle}</p>` : ''}
  ${body}
</body>
</html>`;
}
