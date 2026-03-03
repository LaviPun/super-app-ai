import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { getRecipeJsonSchema } from '~/services/ai/recipe-json-schema.server';

export async function openAiGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
}) {
  const base = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
  const url = `${base}/v1/responses`;

  const schema = getRecipeJsonSchema();

  const body = {
    model: opts.model,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: opts.prompt }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'recipe_spec',
        schema,
        strict: true,
      },
    },
    temperature: 0.2,
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body,
    logMeta: { provider: 'OPENAI', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  const rawJson = extractOutputText(json);
  const usage = json?.usage;

  return {
    rawJson,
    tokensIn: usage?.input_tokens ?? 0,
    tokensOut: usage?.output_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

function extractOutputText(resp: any): string {
  const out = resp?.output;
  if (!Array.isArray(out)) throw new Error('OpenAI response missing output[]');

  const chunks: string[] = [];
  for (const item of out) {
    if (item?.type !== 'message') continue;
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') chunks.push(part.text);
    }
  }

  const text = chunks.join('\n').trim();
  if (!text) throw new Error('OpenAI response missing output_text');
  return text;
}
