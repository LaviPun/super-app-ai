/**
 * Composition: turn a module manifest + tier into a single Zod config schema and
 * the merged UI hints that drive the admin form. This is the bridge between the
 * pack registry and the rest of the system (recipe schema, LLM JSON Schema, forms).
 *
 * The composed config is a grouped object keyed by each pack's `namespace`:
 *   z.object({ content: ContentPackSchema, style: ..., trigger: ..., targeting: ... })
 *
 * Tier semantics:
 *  - 'basic'    → only `manifest.packs`, and advanced-tier packs are made `.optional()`.
 *  - 'advanced' → `manifest.packs` + `manifest.advancedPacks`, all required per their schema.
 */
import { z } from 'zod';
import type { ModuleType } from '../allowed-values.js';
import type { ControlPack, ControlTier, UiHints } from './types.js';
import { requirePack } from './registry.js';
import { getManifest } from './module-manifests.js';

export interface ComposedConfig {
  type: ModuleType;
  tier: ControlTier;
  /** Packs actually included (after appliesTo + tier filtering), in manifest order. */
  packs: ControlPack[];
  /** Grouped Zod schema for the module's `config`. */
  schema: z.ZodObject<z.ZodRawShape>;
  /** Merged UI hints keyed by pack namespace, for the SchemaForm renderer. */
  uiSchema: Record<string, UiHints>;
}

/** Resolve the ordered, tier-filtered list of pack ids for a manifest + tier. */
function resolvePackIds(type: ModuleType, tier: ControlTier): string[] {
  const manifest = getManifest(type);
  if (!manifest) throw new Error(`No v2 manifest for module type "${type}"`);
  return tier === 'advanced'
    ? [...manifest.packs, ...(manifest.advancedPacks ?? [])]
    : [...manifest.packs];
}

/**
 * Compose a module type + tier into a grouped Zod config schema + UI hints.
 * Advanced-only packs are included but optional at the Basic tier so a Basic
 * config still validates against the Advanced schema (forward-compatible).
 */
export function composeConfig(type: ModuleType, tier: ControlTier = 'basic'): ComposedConfig {
  const ids = resolvePackIds(type, tier);
  const shape: z.ZodRawShape = {};
  const uiSchema: Record<string, UiHints> = {};
  const packs: ControlPack[] = [];

  for (const id of ids) {
    const pack = requirePack(id);
    if (pack.appliesTo && !pack.appliesTo(type)) continue;
    packs.push(pack);
    // An advanced-tier pack is optional when composing the Basic surface.
    const includeAsOptional = pack.tier === 'advanced' && tier === 'basic';
    shape[pack.namespace] = includeAsOptional ? pack.schema.optional() : pack.schema;
    if (pack.uiSchema) uiSchema[pack.namespace] = pack.uiSchema;
  }

  return {
    type,
    tier,
    packs,
    schema: z.object(shape),
    uiSchema,
  };
}

/**
 * Composed config schema only (convenience). Use when you just need validation,
 * e.g. inside a recipe branch's `config`.
 */
export function composeConfigSchema(type: ModuleType, tier: ControlTier = 'basic'): z.ZodObject<z.ZodRawShape> {
  return composeConfig(type, tier).schema;
}
