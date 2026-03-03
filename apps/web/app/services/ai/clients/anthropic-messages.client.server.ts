import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { getRecipeJsonSchema } from '~/services/ai/recipe-json-schema.server';

export async function anthropicGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
}) {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const schema = getRecipeJsonSchema();

  const body = {
    model: opts.model,
    max_tokens: 1200,
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { format: { type: 'json_schema', schema } },
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
    logMeta: { provider: 'ANTHROPIC', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  const rawJson = extractText(json);
  const usage = json?.usage;

  return {
    rawJson,
    tokensIn: usage?.input_tokens ?? 0,
    tokensOut: usage?.output_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

function extractText(resp: any): string {
  const content = resp?.content;
  if (!Array.isArray(content)) throw new Error('Anthropic response missing content[]');
  const parts = content.filter((c: any) => c?.type === 'text' && typeof c?.text === 'string').map((c: any) => c.text);
  const text = parts.join('\n').trim();
  if (!text) throw new Error('Anthropic response missing text');
  return text;
}
