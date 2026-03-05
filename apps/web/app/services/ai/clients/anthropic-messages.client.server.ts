import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';

/** Claude Agent Skills config: skills (anthropic IDs e.g. pptx, xlsx or custom skill_01Ab...) and optional code execution. */
export type AnthropicSkillsConfig = {
  skills?: string[];
  codeExecution?: boolean;
};

export async function anthropicGenerateRecipe(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  prompt: string;
  shopId?: string;
  /** When set, sends container.skills and optional code_execution tool with beta headers. */
  skillsConfig?: AnthropicSkillsConfig;
}) {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const url = `${base}/v1/messages`;

  const useSkills = opts.skillsConfig?.skills?.length;
  const useCodeExecution = Boolean(opts.skillsConfig?.codeExecution);
  const useBeta = useSkills || useCodeExecution;

  const betaParts: string[] = [];
  if (useSkills) betaParts.push('skills-2025-10-02', 'files-api-2025-04-14');
  if (useCodeExecution) betaParts.push('code-execution-2025-08-25');
  const anthropicBeta = [...new Set(betaParts)].join(',');

  const headers: Record<string, string> = {
    'x-api-key': opts.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (anthropicBeta) headers['anthropic-beta'] = anthropicBeta;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: 4096,
    system: 'You are a JSON generator. Always respond with valid JSON only. No markdown, no explanation outside the JSON.',
    messages: [{ role: 'user', content: opts.prompt }],
  };

  if (useSkills) {
    body.container = {
      skills: opts.skillsConfig!.skills!.map((skillId) =>
        skillId.startsWith('skill_')
          ? { type: 'custom', skill_id: skillId, version: 'latest' as const }
          : { type: 'anthropic', skill_id: skillId, version: 'latest' as const }
      ),
    };
  }

  if (useCodeExecution) {
    body.tools = [{ type: 'code_execution_20250825', name: 'code_execution' }];
  }

  const { json } = await postJsonWithRetries({
    url,
    headers,
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
