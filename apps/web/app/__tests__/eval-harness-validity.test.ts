import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Eval harness validity fixes (fix/eval-harness-validity).
 *
 * A qualification run must score exactly the model it claims to score:
 *  1. EVAL_PROVIDER_ID must actually pin that AiProvider row (by id or name),
 *     and FAIL FAST when the row is missing from the eval DB — never silently
 *     fall through to the env client (`resolveEvalLlmClient`).
 *  2. Cross-provider fallback (Claude -> OpenAI) must be disabled in eval runs
 *     (`getLlmClient(..., { disableFallback: true })`).
 *  3. ANTHROPIC_SKILLS / ANTHROPIC_CODE_EXECUTION env must not leak into eval
 *     calls (`getLlmClient(..., { ignoreEnvSkills: true })`) — eval requests
 *     must match production's DB-provider request shape.
 *
 * Production behavior (no options passed) is asserted unchanged.
 */
const hoisted = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  providerFindMany: vi.fn(),
  providerFindFirst: vi.fn(),
  providerFindUnique: vi.fn(),
  priceFindFirst: vi.fn(),
  appSettingsFindUnique: vi.fn(),
  getApiKey: vi.fn(),
  openAiGenerateRecipe: vi.fn(),
  anthropicGenerateRecipe: vi.fn(),
  geminiGenerateRecipe: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique },
    aiProvider: {
      findMany: hoisted.providerFindMany,
      findFirst: hoisted.providerFindFirst,
      findUnique: hoisted.providerFindUnique,
    },
    aiModelPrice: { findFirst: hoisted.priceFindFirst },
    appSettings: { findUnique: hoisted.appSettingsFindUnique },
  }),
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    async getApiKey(id: string) {
      return hoisted.getApiKey(id);
    }
  },
}));

vi.mock('~/services/ai/clients/openai-responses.client.server', () => ({
  openAiGenerateRecipe: (...args: unknown[]) => hoisted.openAiGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/anthropic-messages.client.server', () => ({
  anthropicGenerateRecipe: (...args: unknown[]) => hoisted.anthropicGenerateRecipe(...args),
}));
vi.mock('~/services/ai/clients/gemini.client.server', () => ({
  geminiGenerateRecipe: (...args: unknown[]) => hoisted.geminiGenerateRecipe(...args),
}));

import { getLlmClient, StubLlmClient } from '~/services/ai/llm.server';
import { resolveEvalLlmClient, EvalProviderNotFoundError } from '~/services/ai/evals.server';

const ok = { rawJson: '{"recipe":{}}', tokensIn: 1, tokensOut: 2, model: 'm' };

const PINNED_ROW = {
  id: 'prov_claude',
  name: 'claude-primary',
  provider: 'ANTHROPIC',
  model: 'claude-sonnet-4-6',
  baseUrl: null,
  extraConfig: null,
  isActive: true,
};

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_DEFAULT_MODEL',
  'OPENAI_DEFAULT_MODEL',
  'ANTHROPIC_SKILLS',
  'ANTHROPIC_CODE_EXECUTION',
  'AI_COST_ROUTING_ENABLED',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  // No DB providers configured unless a test opts in -> getLlmClient uses env path.
  hoisted.shopFindUnique.mockResolvedValue(null);
  hoisted.providerFindMany.mockResolvedValue([]);
  hoisted.providerFindFirst.mockResolvedValue(null);
  hoisted.providerFindUnique.mockResolvedValue(null);
  hoisted.priceFindFirst.mockResolvedValue(null);
  hoisted.appSettingsFindUnique.mockResolvedValue(null);
  hoisted.getApiKey.mockResolvedValue('sk-test');
  hoisted.openAiGenerateRecipe.mockResolvedValue(ok);
  hoisted.anthropicGenerateRecipe.mockResolvedValue(ok);
  hoisted.geminiGenerateRecipe.mockResolvedValue(ok);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k]!;
  }
});

describe('getLlmClient({ disableFallback: true }) — evals score exactly one model', () => {
  it('production default (no options): env Claude failure silently falls back to env OpenAI', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    process.env.OPENAI_API_KEY = 'sk-oai';
    hoisted.anthropicGenerateRecipe.mockRejectedValue(new Error('overloaded'));

    const { client, providerId } = await getLlmClient(null);
    expect(providerId).toBeNull();

    const result = await client.generateRecipe('prompt');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.openAiGenerateRecipe).toHaveBeenCalledTimes(1); // unchanged production behavior
    expect(result.rawJson).toBe(ok.rawJson);
  });

  it('disableFallback: env Claude failure propagates — OpenAI is NEVER called', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    process.env.OPENAI_API_KEY = 'sk-oai';
    hoisted.anthropicGenerateRecipe.mockRejectedValue(new Error('credit balance too low'));

    const { client } = await getLlmClient(null, { disableFallback: true });

    await expect(client.generateRecipe('prompt')).rejects.toThrow('credit balance too low');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();
  });

  it('disableFallback: DB provider path skips the operator-assigned manual fallback', async () => {
    hoisted.providerFindFirst.mockResolvedValue(PINNED_ROW); // legacy resolveProviderIdForShop
    hoisted.providerFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === PINNED_ROW.id ? PINNED_ROW : where.id === 'prov_fallback'
        ? { ...PINNED_ROW, id: 'prov_fallback', name: 'fb', provider: 'OPENAI', model: 'gpt-5-mini' }
        : null,
    );
    hoisted.appSettingsFindUnique.mockResolvedValue({ fallbackAiProviderId: 'prov_fallback' });
    hoisted.anthropicGenerateRecipe.mockRejectedValue(new Error('boom'));

    const { client, providerId } = await getLlmClient(null, { disableFallback: true });
    expect(providerId).toBe(PINNED_ROW.id);

    await expect(client.generateRecipe('prompt')).rejects.toThrow('boom');
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();
  });
});

describe('getLlmClient({ ignoreEnvSkills: true }) — ANTHROPIC_SKILLS must not leak into evals', () => {
  it('production default: ANTHROPIC_SKILLS env attaches skillsConfig to the env Claude client', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    process.env.ANTHROPIC_SKILLS = 'pptx,xlsx';

    const { client } = await getLlmClient(null);
    await client.generateRecipe('prompt');

    const call = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { skillsConfig?: unknown };
    expect(call.skillsConfig).toEqual({ skills: ['pptx', 'xlsx'], codeExecution: false });
  });

  it('ignoreEnvSkills: no skillsConfig even when ANTHROPIC_SKILLS + ANTHROPIC_CODE_EXECUTION are set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    process.env.ANTHROPIC_SKILLS = 'pptx,xlsx';
    process.env.ANTHROPIC_CODE_EXECUTION = 'true';

    const { client } = await getLlmClient(null, { ignoreEnvSkills: true });
    await client.generateRecipe('prompt');

    const call = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { skillsConfig?: unknown };
    expect(call.skillsConfig).toBeUndefined();
  });
});

describe('resolveEvalLlmClient — EVAL_PROVIDER_ID provider pinning', () => {
  it('unset -> StubLlmClient with an honest label', async () => {
    const resolved = await resolveEvalLlmClient(undefined);
    expect(resolved.client).toBeInstanceOf(StubLlmClient);
    expect(resolved.label).toContain('stub');
  });

  it('pins the named AiProvider row (by id) and dispatches to exactly that provider', async () => {
    hoisted.providerFindFirst.mockResolvedValue(PINNED_ROW);
    hoisted.providerFindUnique.mockResolvedValue(PINNED_ROW);

    const resolved = await resolveEvalLlmClient('prov_claude');
    expect(resolved.label).toContain('claude-primary');
    expect(resolved.label).toContain('claude-sonnet-4-6');

    // Looked up by id OR name.
    const where = hoisted.providerFindFirst.mock.calls[0]![0].where;
    expect(where).toEqual({ OR: [{ id: 'prov_claude' }, { name: 'prov_claude' }] });

    await resolved.client.generateRecipe('prompt');
    expect(hoisted.anthropicGenerateRecipe).toHaveBeenCalledTimes(1);
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();
  });

  it('a pinned provider failure propagates — no cross-provider fallback in eval runs', async () => {
    process.env.OPENAI_API_KEY = 'sk-oai'; // env fallback material exists but must not be used
    hoisted.providerFindFirst.mockResolvedValue(PINNED_ROW);
    hoisted.providerFindUnique.mockResolvedValue(PINNED_ROW);
    hoisted.anthropicGenerateRecipe.mockRejectedValue(new Error('429 rate limited'));

    const resolved = await resolveEvalLlmClient('claude-primary');
    await expect(resolved.client.generateRecipe('prompt')).rejects.toThrow('429 rate limited');
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();
  });

  it('FAILS FAST when the provider is missing from the eval DB (no silent env fallthrough)', async () => {
    hoisted.providerFindFirst.mockResolvedValue(null);
    process.env.ANTHROPIC_API_KEY = 'sk-ant'; // env client available — must NOT be used

    await expect(resolveEvalLlmClient('prov_missing')).rejects.toThrow(EvalProviderNotFoundError);
    await expect(resolveEvalLlmClient('prov_missing')).rejects.toThrow(
      "provider 'prov_missing' not found in eval DB — seed it or unset EVAL_PROVIDER_ID",
    );
    expect(hoisted.anthropicGenerateRecipe).not.toHaveBeenCalled();
  });

  it("'env' pins the env client with fallback disabled, env skills ignored, and an honest label", async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    process.env.OPENAI_API_KEY = 'sk-oai';
    process.env.ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5';
    process.env.ANTHROPIC_SKILLS = 'pptx';

    const resolved = await resolveEvalLlmClient('env');
    expect(resolved.label).toContain('env');
    expect(resolved.label).toContain('claude-sonnet-5');

    hoisted.anthropicGenerateRecipe.mockRejectedValue(new Error('overloaded'));
    await expect(resolved.client.generateRecipe('prompt')).rejects.toThrow('overloaded');
    expect(hoisted.openAiGenerateRecipe).not.toHaveBeenCalled();

    const call = hoisted.anthropicGenerateRecipe.mock.calls[0]![0] as { skillsConfig?: unknown };
    expect(call.skillsConfig).toBeUndefined();
  });
});
