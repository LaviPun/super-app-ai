const DEFAULT_LOCAL_PROMPT_ROUTER_BASE_URL = 'http://127.0.0.1:8787';

/**
 * True when `url` points to the local reference `internal-ai-router` base
 * (`127.0.0.1:8787` or `localhost:8787`).
 */
export function isReferenceLocalPromptRouterBaseUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/\/+$/, '');
  const ref = DEFAULT_LOCAL_PROMPT_ROUTER_BASE_URL.replace(/\/+$/, '');
  if (normalized === ref) return true;
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    if (!(host === 'localhost' || host === '127.0.0.1') || port !== '8787') return false;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return path === '/';
  } catch {
    return false;
  }
}
