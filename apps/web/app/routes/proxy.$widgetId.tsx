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

      const cfg = JSON.parse(value) as {
        mode: 'JSON' | 'HTML';
        title: string;
        message?: string;
        _styleCss?: string;
      };

      if (cfg.mode === 'JSON') return json({ title: cfg.title, message: cfg.message ?? '' });

      const styleCss = cfg._styleCss ?? '';
      const html = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            ${styleCss}
            .superapp-widget strong{ display:block; margin-bottom: 6px; }
          </style>
        </head>
        <body>
          <div class="superapp-widget">
            <strong>${escapeHtml(cfg.title)}</strong>
            ${cfg.message ? `<div>${escapeHtml(cfg.message)}</div>` : ''}
          </div>
        </body>
        </html>
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
