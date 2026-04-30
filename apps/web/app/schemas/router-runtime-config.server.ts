import { z } from 'zod';

export const RouterRuntimeTargetSchema = z.enum(['localMachine', 'modalRemote']);
export type RouterRuntimeTarget = z.infer<typeof RouterRuntimeTargetSchema>;

export const RouterTargetConfigSchema = z.object({
  url: z.string().url().optional(),
  token: z.string().min(1).optional(),
  backend: z.enum(['ollama', 'openai', 'custom']).default('ollama'),
  model: z.string().optional(),
  timeoutMs: z.number().int().min(200).max(10_000).default(1200),
});

export const RouterRuntimeConfigSchema = z.object({
  activeTarget: RouterRuntimeTargetSchema.default('localMachine'),
  fallbackTarget: RouterRuntimeTargetSchema.optional(),
  previousTarget: RouterRuntimeTargetSchema.optional(),
  shadowMode: z.boolean().default(true),
  canaryShops: z.array(z.string()).default([]),
  circuitFailureThreshold: z.number().int().min(1).max(50).default(5),
  circuitCooldownMs: z.number().int().min(1000).max(10 * 60_000).default(30_000),
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

export const DEFAULT_ROUTER_RUNTIME_CONFIG: RouterRuntimeConfig = {
  activeTarget: 'localMachine',
  fallbackTarget: 'modalRemote',
  shadowMode: true,
  canaryShops: [],
  circuitFailureThreshold: 5,
  circuitCooldownMs: 30_000,
  targets: {
    localMachine: {
      url: 'http://127.0.0.1:8787',
      backend: 'ollama',
      timeoutMs: 1200,
    },
    modalRemote: {
      backend: 'openai',
      timeoutMs: 1200,
    },
  },
};
