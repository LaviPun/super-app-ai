import { z } from 'zod';

export const RouterRuntimeTargetSchema = z.enum(['localMachine', 'modalRemote']);
export type RouterRuntimeTarget = z.infer<typeof RouterRuntimeTargetSchema>;

export const RouterTargetConfigSchema = z.object({
  url: z.string().url().optional(),
  token: z.string().min(1).optional(),
  backend: z.enum(['ollama', 'openai', 'qwen3', 'custom', 'anthropic']).default('ollama'),
  model: z.string().optional(),
  timeoutMs: z.number().int().min(200).max(10_000).default(3000),
});

export const RouterRuntimeConfigSchema = z.object({
  dualTargetEnabled: z.boolean().default(false),
  activeTarget: RouterRuntimeTargetSchema.default('localMachine'),
  fallbackTarget: RouterRuntimeTargetSchema.optional(),
  previousTarget: RouterRuntimeTargetSchema.optional(),
  shadowMode: z.boolean().default(true),
  canaryShops: z.array(z.string()).default([]),
  circuitFailureThreshold: z.number().int().min(1).max(50).default(5),
  circuitCooldownMs: z.number().int().min(1000).max(10 * 60_000).default(30_000),
  releaseGateSchemaFailRateMax: z.number().min(0).max(1).default(0.02),
  releaseGateFallbackRateMax: z.number().min(0).max(1).default(0.05),
  targets: z.object({
    localMachine: RouterTargetConfigSchema.default({}),
    modalRemote: RouterTargetConfigSchema.default({}),
  }),
  lastHealthCheckAt: z.string().optional(),
  lastHealthCheckOk: z.boolean().optional(),
  lastHealthCheckMessage: z.string().optional(),
  lastRouteCheckAt: z.string().optional(),
  lastRouteCheckOk: z.boolean().optional(),
  lastRouteCheckMessage: z.string().optional(),
});

export type RouterRuntimeConfig = z.infer<typeof RouterRuntimeConfigSchema>;

/** Base URL used when an operator selects the optional `anthropic` backend for a target. */
export const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

/**
 * Internal assistant defaults to self-hosted models on BOTH targets:
 * - `localMachine`: local Ollama (the default active target).
 * - `modalRemote`: a cloud-hosted twin of the same Qwen model (e.g. on Modal),
 *   pinged via the OpenAI-compatible `qwen3` backend. Operators may switch
 *   either target to the `anthropic` backend in /internal/model-setup, but it
 *   is never the default — the internal copilot stays self-hosted unless asked.
 */
export const DEFAULT_ROUTER_RUNTIME_CONFIG: RouterRuntimeConfig = {
  dualTargetEnabled: false,
  activeTarget: 'localMachine',
  fallbackTarget: 'modalRemote',
  shadowMode: true,
  canaryShops: [],
  circuitFailureThreshold: 5,
  circuitCooldownMs: 30_000,
  releaseGateSchemaFailRateMax: 0.02,
  releaseGateFallbackRateMax: 0.05,
  targets: {
    localMachine: {
      url: 'http://127.0.0.1:11434',
      backend: 'ollama',
      model: 'qwen3:4b-instruct',
      timeoutMs: 3000,
    },
    modalRemote: {
      backend: 'qwen3',
      model: 'Qwen/Qwen3-4B-Instruct',
      timeoutMs: 3000,
    },
  },
};

/**
 * Remix → reference `internal-ai-router` when `INTERNAL_AI_ROUTER_URL` is unset.
 * Used only in `NODE_ENV === 'development'` by {@link resolveRouterTargetConfig}.
 */
export const DEFAULT_LOCAL_PROMPT_ROUTER_BASE_URL = 'http://127.0.0.1:8787';
