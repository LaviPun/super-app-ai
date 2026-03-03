import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function loader({ request, params }: { request: Request; params: { widgetId?: string } }) {
  const { widgetId } = params;
  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: `/proxy/${widgetId ?? ''}` },
    async () => {
      if (!widgetId) return json({ error: 'Missing widgetId' }, { status: 400 });

      const { admin } = await shopify.authenticate.public.appProxy(request);

      const query = `#graphql
        query ReadProxyConfig($namespace: String!, $key: String!) {
          shop {
            metafield(namespace: $namespace, key: $key) { value }
          }
        }
      `;
      const res = await admin.graphql(query, { variables: { namespace: 'superapp.proxy', key: widgetId }});
      const data = await res.json();
      const value = data?.data?.shop?.metafield?.value;
      if (!value) return new Response('', { status: 204 });

      const cfg = JSON.parse(value) as { mode: 'JSON' | 'HTML'; title: string; message?: string };

      if (cfg.mode === 'JSON') return json({ title: cfg.title, message: cfg.message ?? '' });

      const html = `
        <div class="superapp-widget">
          <strong>${escapeHtml(cfg.title)}</strong>
          ${cfg.message ? `<div>${escapeHtml(cfg.message)}</div>` : ''}
        </div>
      `.trim();

      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60',
        },
      });
    }
  );
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
