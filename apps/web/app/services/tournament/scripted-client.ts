/**
 * ScriptedLlmClient — replays pre-authored agent outputs instead of calling any
 * third-party AI provider. Used when the tournament's generative/evaluative work
 * is produced out-of-band (e.g. by a Claude Code subagent) and handed to the
 * engine as a fixture. No network, no provider keys.
 *
 * Responses are keyed by the engine's agent id (`audit:cand1:tests`,
 * `judge:cand2`, `harvest:all`, `synthesize:final`). The engine reaches the
 * keyed path via `KeyedLlmClient.generateForAgent`.
 */
import type { GenerateHints, GenerateResult, LlmClient } from '~/services/ai/llm.server';

/** An `LlmClient` that can resolve a response by the engine's agent id. */
export interface KeyedLlmClient extends LlmClient {
  generateForAgent(key: string, prompt: string, hints?: GenerateHints): Promise<GenerateResult>;
}

/** Rough token estimate (~4 chars/token) — accounting only, never billed. */
const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

export class ScriptedLlmClient implements KeyedLlmClient {
  constructor(
    private readonly responses: Record<string, unknown>,
    private readonly model = 'claude-subagent',
  ) {}

  async generateForAgent(key: string, prompt: string): Promise<GenerateResult> {
    const r = this.responses[key];
    const rawJson = typeof r === 'string' ? r : JSON.stringify(r ?? {});
    return { rawJson, tokensIn: estimateTokens(prompt), tokensOut: estimateTokens(rawJson), model: this.model };
  }

  // Fallback for any non-keyed call (e.g. candidate generation); fixtures supply
  // candidates directly, so this is rarely hit.
  async generateRecipe(prompt: string): Promise<GenerateResult> {
    return { rawJson: '{}', tokensIn: estimateTokens(prompt), tokensOut: 2, model: this.model };
  }
}
