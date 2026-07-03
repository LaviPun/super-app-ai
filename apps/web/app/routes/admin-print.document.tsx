/**
 * Admin print-document route (`/admin-print/document`).
 *
 * The shipped admin-print extension (extensions/admin-print) sets its
 * `s-admin-print-action` `src` to this path with `?moduleId=…&documentKind=…&ids=…`.
 * Shopify loads it inside the merchant's admin session, so we authenticate with
 * `authenticate.admin`, read the module's PUBLISHED admin.print config, and return a
 * self-contained print-optimized HTML document. Nothing to configure → 404, never a
 * placeholder.
 */
import type { LoaderFunctionArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { readPublishedPrintConfig, renderPrintDocument } from '~/services/admin-print/print-document.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await shopify.authenticate.admin(request);
  const url = new URL(request.url);
  const moduleId = url.searchParams.get('moduleId') ?? '';
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!moduleId) {
    return new Response('Missing moduleId', { status: 400 });
  }

  const config = await readPublishedPrintConfig(getPrisma(), session.shop, moduleId);
  if (!config) {
    return new Response('No published print document for this module.', { status: 404 });
  }

  const html = renderPrintDocument(config, ids);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
