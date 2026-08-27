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
