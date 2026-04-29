import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';

const PROXY_WIDGET_QUERY = `#graphql
  query ReadProxyWidget($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      configJson: field(key: "config_json") { value }
      styleCss:   field(key: "style_css")   { value }
    }
  }
`;

export async function loader({ request, params }: { request: Request; params: { widgetId?: string } }) {
  const { widgetId } = params;
  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: `/proxy/${widgetId ?? ''}` },
    async () => {
      if (!widgetId) return json({ error: 'Missing widgetId' }, { status: 400 });

      const { admin: adminMaybe } = await shopify.authenticate.public.appProxy(request);
      if (!adminMaybe) return json({ error: 'Admin context unavailable' }, { status: 503 });
      const admin = adminMaybe;

      const res = await admin.graphql(PROXY_WIDGET_QUERY, {
        variables: { handle: { type: '$app:superapp_proxy_widget', handle: `superapp-proxy-${widgetId}` } },
      });
      const data = await res.json();
      const obj = data?.data?.metaobjectByHandle;
      if (!obj) return new Response('', { status: 204 });

      const cfg = JSON.parse(obj.configJson?.value ?? '{}') as {
        mode?: 'JSON' | 'HTML';
        title?: string;
        message?: string;
      };
      const styleCss: string = obj.styleCss?.value ?? '';

      if (cfg.mode === 'JSON') return json({ title: cfg.title ?? '', message: cfg.message ?? '' });

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
            <strong>${escapeHtml(cfg.title ?? '')}</strong>
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
