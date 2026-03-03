import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';
import { getRecipeJsonSchema } from '~/services/ai/recipe-json-schema.server';

export async function openAiCompatibleGenerateRecipe(opts: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  shopId?: string;
}) {
  try {
    return await tryResponses(opts);
  } catch {
    return await tryChatCompletions(opts);
  }
}

async function tryResponses(opts: any) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/responses`;
  const schema = getRecipeJsonSchema();

  const body = {
    model: opts.model,
    input: [{ role: 'user', content: [{ type: 'input_text', text: opts.prompt }] }],
    text: { format: { type: 'json_schema', name: 'recipe_spec', schema, strict: true } },
    temperature: 0.2,
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body,
    logMeta: { provider: 'CUSTOM', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  return {
    rawJson: extractResponsesText(json),
    tokensIn: json?.usage?.input_tokens ?? 0,
    tokensOut: json?.usage?.output_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

async function tryChatCompletions(opts: any) {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/v1/chat/completions`;
  const schema = getRecipeJsonSchema();

  const body = {
    model: opts.model,
    messages: [{ role: 'user', content: opts.prompt }],
    response_format: { type: 'json_schema', json_schema: { name: 'recipe_spec', schema, strict: true } },
    temperature: 0.2,
  };

  const { json } = await postJsonWithRetries({
    url,
    headers: { authorization: `Bearer ${opts.apiKey}` },
    body,
    logMeta: { provider: 'CUSTOM', model: opts.model, actor: 'INTERNAL' },
    shopId: opts.shopId,
  });

  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Chat completions missing content');

  return {
    rawJson: text.trim(),
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
    model: json?.model ?? opts.model,
  };
}

function extractResponsesText(resp: any): string {
  const chunks: string[] = [];
  for (const item of resp?.output ?? []) {
    if (item?.type !== 'message') continue;
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  const text = chunks.join('\n').trim();
  if (!text) throw new Error('Responses missing output_text');
  return text;
}
