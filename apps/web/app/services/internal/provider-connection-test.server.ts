// WS-INT Task 22 — a minimal, cheap "are these credentials valid" probe per AI
// provider kind. Deliberately NOT a generateRecipe call (that would burn real
// tokens on every click of a Test-connection button); each kind's cheapest
// verifiable read-only endpoint:
//   OPENAI/GROK/DEEPSEEK/MISTRAL/CUSTOM/AZURE_OPENAI (OpenAI-compatible): GET {baseUrl}/models
//   ANTHROPIC: GET {baseUrl}/v1/models — the Anthropic Models API, no beta header,
//     no token cost (lighter than a messages.create ping).
//   GEMINI: GET {baseUrl}/v1beta/models?key={apiKey}
import type { ProviderKind } from './ai-provider-kinds';

export interface ProviderConnectionTestInput {
  provider: ProviderKind;
  baseUrl: string | null;
  apiKey: string;
}

export interface ProviderConnectionTestResult {
  ok: boolean;
  /** The real upstream error (status + body snippet), never a generic message (program D8). */
  error?: string;
}

const OPENAI_COMPATIBLE_KINDS: ReadonlySet<ProviderKind> = new Set([
  'OPENAI',
  'GROK',
  'DEEPSEEK',
  'MISTRAL',
  'CUSTOM',
  'AZURE_OPENAI',
]);

const DEFAULT_BASE_URLS: Partial<Record<ProviderKind, string>> = {
  OPENAI: 'https://api.openai.com',
  ANTHROPIC: 'https://api.anthropic.com',
  GEMINI: 'https://generativelanguage.googleapis.com',
};

const TEST_TIMEOUT_MS = 10_000;

function trimBase(url: string): string {
  return url.replace(/\/$/, '');
}

async function toResult(res: Response): Promise<ProviderConnectionTestResult> {
  if (res.ok) return { ok: true };
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    // best-effort only
  }
  return { ok: false, error: detail ? `${res.status}: ${detail}` : `Upstream responded ${res.status}` };
}

/** Dispatches a lightweight credential-validity probe for the given provider kind.
 *  Never throws — network/timeout failures come back as `{ ok: false, error }`. */
export async function testProviderConnection(input: ProviderConnectionTestInput): Promise<ProviderConnectionTestResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) return { ok: false, error: 'No API key configured for this provider.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    if (input.provider === 'ANTHROPIC') {
      const base = trimBase(input.baseUrl || DEFAULT_BASE_URLS.ANTHROPIC!);
      const res = await fetch(`${base}/v1/models`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: controller.signal,
      });
      return await toResult(res);
    }

    if (input.provider === 'GEMINI') {
      const base = trimBase(input.baseUrl || DEFAULT_BASE_URLS.GEMINI!);
      const res = await fetch(`${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        signal: controller.signal,
      });
      return await toResult(res);
    }

    if (OPENAI_COMPATIBLE_KINDS.has(input.provider)) {
      const base = trimBase(input.baseUrl || DEFAULT_BASE_URLS.OPENAI!);
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      return await toResult(res);
    }

    return { ok: false, error: `Unsupported provider kind: ${input.provider}` };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: `Timed out after ${TEST_TIMEOUT_MS}ms waiting for the provider.` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
