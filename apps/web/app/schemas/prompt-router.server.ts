import { z } from 'zod';
import { RECIPE_SPEC_TYPES } from '@superapp/core';
import { PROMPT_ROUTER_REASON_CODES } from './prompt-router-reasons.server';

export const PromptRouterReasonCodeSchema = z.enum(PROMPT_ROUTER_REASON_CODES);

export const PromptRouterIncludeFlagsSchema = z.object({
  includeSettingsPack: z.boolean().default(true),
  includeIntentPacket: z.boolean().default(true),
  includeCatalog: z.boolean().default(false),
  includeFullSchema: z.boolean().default(false),
  includeStyleSchema: z.boolean().default(false),
});

export const PromptRouterCatalogFiltersSchema = z.object({
  templateKind: z.string().optional(),
  intent: z.string().optional(),
  surface: z.string().optional(),
  limit: z.number().int().min(1).max(10).default(8),
});

export const PromptRouterDecisionSchema = z.object({
  version: z.literal('1.0'),
  moduleType: z.enum(RECIPE_SPEC_TYPES),
  confidence: z.number().min(0).max(1),
  intent: z.string().optional(),
  surface: z.string().optional(),
  settingsRequired: z.array(z.string()).default([]),
  includeFlags: PromptRouterIncludeFlagsSchema,
  catalogFilters: PromptRouterCatalogFiltersSchema.optional(),
  needsClarification: z.boolean().default(false),
  /** Machine-readable outcome; prefer over long `reasoning` in logs/metrics */
  reasonCode: PromptRouterReasonCodeSchema.default('router_decision'),
  /** Short human hint; keep small to limit token leakage in logs */
  reasoning: z.string().max(200).default('router_decision'),
});

export type PromptRouterDecision = z.infer<typeof PromptRouterDecisionSchema>;
