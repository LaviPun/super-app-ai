/**
 * Super App AI — Sidekick data extension bundle.
 *
 * Runs headlessly in Shopify's sandbox (target: admin.app.tools.data). Each
 * registered tool calls our app backend at /api/sidekick/tools. Because this is
 * a relative fetch, Shopify resolves it against the app's app_url and attaches
 * an OpenID Connect ID token automatically, so the backend authenticates the
 * merchant with the standard embedded-app flow (no custom signing).
 *
 * The backend returns { results: ResourceLink[] } already in MCP Resource Link
 * format, so each tool just forwards that through to Sidekick.
 */

async function callBackend(tool, input) {
  const res = await fetch('/api/sidekick/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  if (!res.ok) {
    return { results: [] };
  }
  const data = await res.json();
  return { results: Array.isArray(data.results) ? data.results : [] };
}

export default () => {
  shopify.tools.register('search_modules', async ({ query, status } = {}) => {
    return callBackend('search_modules', { query, status });
  });

  shopify.tools.register('get_module_performance', async ({ moduleId, days } = {}) => {
    return callBackend('get_module_performance', { moduleId, days });
  });
};
