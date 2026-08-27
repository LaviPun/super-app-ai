// Pure provider-kind constants — deliberately has NO server-only imports (no
// db.server, no crypto.server) so client components (internal.ai-providers.tsx's
// ProviderModal, the Integrations Hub tile bodies) can safely import these as
// runtime values without pulling `~/db.server` into the client bundle via
// `ai-provider.service.ts` (Remix's "Server-only module referenced by client"
// build guard — WS-INT Task 13 build-fix). `ai-provider.service.ts` re-exports
// everything here so server code keeps a single import path.

export type ProviderKind = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'AZURE_OPENAI' | 'CUSTOM' | 'GROK' | 'DEEPSEEK' | 'MISTRAL';

/** Every provider kind the Hub / AI Providers page accepts — the single source of
 * truth both `internal.ai-providers.tsx` and the Integrations Hub tile registry
 * import from (WS-INT Task 13). */
export const ALLOWED_PROVIDER_KINDS: readonly ProviderKind[] = [
  'OPENAI',
  'ANTHROPIC',
  'GEMINI',
  'AZURE_OPENAI',
  'CUSTOM',
  'GROK',
  'DEEPSEEK',
  'MISTRAL',
];

/** Decision G7: GROK/DEEPSEEK/MISTRAL speak the OpenAI Chat Completions dialect —
 * no new HTTP client, just a sane default base URL pre-filled when a provider row
 * of that kind is created. `llm.server.ts`'s existing CUSTOM/AZURE_OPENAI fallthrough
 * already routes these to `openAiCompatibleGenerateRecipe`. */
export const DEFAULT_BASE_URL_BY_KIND: Partial<Record<ProviderKind, string>> = {
  GROK: 'https://api.x.ai/v1',
  DEEPSEEK: 'https://api.deepseek.com',
  MISTRAL: 'https://api.mistral.ai/v1',
};

/**
 * Pure formatter for the internal AI Providers key-reveal preview (e.g. "sk-ant-…cAAA"):
 * first segment (up to and including the 2nd dash, or the 1st if there's only one) + last 4
 * chars, middle always hidden. Deliberately pure (no crypto import) so both the server (loader
 * masking, computed from the decrypted key — never send the full key to the client for masking)
 * and this test file can call it without mocking `~/services/security/crypto.server`. Distinct
 * from `AiProviderService.getApiKeyMasked`'s older '••••••••xyz1' bullet convention, which is
 * still used elsewhere (Integrations Hub, settings forms) and is left unchanged.
 */
export function maskApiKeyPreview(key: string | null | undefined): string {
  if (!key) return '—';
  const last4 = key.slice(-4);
  const firstDash = key.indexOf('-');
  const secondDash = firstDash >= 0 ? key.indexOf('-', firstDash + 1) : -1;
  let prefix: string;
  if (secondDash > 0) {
    prefix = key.slice(0, secondDash + 1);
  } else if (firstDash > 0) {
    prefix = key.slice(0, firstDash + 1);
  } else {
    prefix = key.slice(0, 4);
  }
  // Guard short/edge-case keys where prefix + last4 would overlap or expose
  // the whole key — mask entirely instead of leaking the middle.
  if (key.length < 8 || prefix.length + last4.length >= key.length) {
    return '•'.repeat(Math.max(4, Math.min(key.length, 8)));
  }
  return `${prefix}…${last4}`;
}
