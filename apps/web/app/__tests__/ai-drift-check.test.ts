/**
 * AI Drift-Check CI tests (Phase 5.2).
 * Fail CI if code registries drift out of sync — i.e. if any module type added to RECIPE_SPEC_TYPES
 * is missing a summary, prompt expectation, or catalog mapping.
 *
 * Also checks that every CLEAN_INTENTS entry has a ROUTING_TABLE entry, and that MODULE_TYPE_TO_INTENT
 * only maps to CLEAN_INTENTS values (invariant tests for Phase 1.8 completeness).
 */
import { describe, it, expect } from 'vitest';
import { RECIPE_SPEC_TYPES, MODULE_TYPE_TO_INTENT } from '@superapp/core';
import { CLEAN_INTENTS, ROUTING_TABLE, resolveRouting } from '@superapp/core';
import { MODULE_SUMMARIES } from '~/services/ai/module-summaries.server';
import { getPromptExpectations, getFullRecipeSchemaSpec } from '~/services/ai/prompt-expectations.server';
import { getCatalogDetailsForType } from '~/services/ai/catalog-details.server';

const CLEAN_INTENTS_SET = new Set<string>(CLEAN_INTENTS);
const BLUEPRINT_ROUTE = ROUTING_TABLE['platform.extensionBlueprint']!;

// ─── Registry sync checks ──────────────────────────────────────────────────────

describe('Drift check: RECIPE_SPEC_TYPES coverage', () => {
  it('every RecipeSpec type has a module summary', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      const summary = MODULE_SUMMARIES[type as keyof typeof MODULE_SUMMARIES];
      expect(summary, `Missing MODULE_SUMMARIES entry for ${type}`).toBeDefined();
      expect(summary?.length ?? 0, `MODULE_SUMMARIES[${type}] is too short`).toBeGreaterThan(50);
    }
  });

  it('every RecipeSpec type has prompt expectations', () => {
    for (const type of RECIPE_SPEC_TYPES) {
      const exp = getPromptExpectations(type as 'theme.banner');
      expect(exp, `getPromptExpectations returned empty for ${type}`).toBeTruthy();
      expect(exp.length, `Expectations too short for ${type}`).toBeGreaterThan(30);
    }
  });

  it('storefront types have full schema specs', () => {
    const storefrontTypes = [
      'theme.banner', 'theme.popup', 'theme.notificationBar',
      'theme.effect', 'theme.floatingWidget', 'proxy.widget',
    ] as const;
    for (const type of storefrontTypes) {
      const spec = getFullRecipeSchemaSpec(type);
      expect(spec, `Missing full schema spec for ${type}`).toContain(type);
      expect(spec.length, `Full schema spec too short for ${type}`).toBeGreaterThan(100);
    }
  });

  it('storefront types return catalog details (not empty)', () => {
    const storefrontTypes = [
      'theme.banner', 'theme.popup', 'theme.notificationBar',
      'theme.effect', 'theme.floatingWidget', 'proxy.widget',
    ];
    for (const type of storefrontTypes) {
      const catalog = getCatalogDetailsForType(type);
      // May not have matching entries if catalog is small, but should not throw
      expect(catalog, `getCatalogDetailsForType threw for ${type}`).toBeTruthy();
    }
  });
});

// ─── Routing invariants ────────────────────────────────────────────────────────

describe('Drift check: CLEAN_INTENTS and ROUTING_TABLE invariants', () => {
  it('every MODULE_TYPE_TO_INTENT value is a valid CLEAN_INTENTS entry', () => {
    for (const [moduleType, intent] of Object.entries(MODULE_TYPE_TO_INTENT)) {
      expect(
        CLEAN_INTENTS_SET.has(intent as (typeof CLEAN_INTENTS)[number]),
        `MODULE_TYPE_TO_INTENT[${moduleType}] = "${intent}" is not in CLEAN_INTENTS`,
      ).toBe(true);
    }
  });

  it('every CLEAN_INTENTS entry has a ROUTING_TABLE entry with required fields', () => {
    for (const intent of CLEAN_INTENTS) {
      const entry = ROUTING_TABLE[intent];
      expect(entry, `ROUTING_TABLE missing entry for CLEAN_INTENTS: ${intent}`).toBeDefined();
      expect(entry?.prompt_scaffold_id, `${intent} missing prompt_scaffold_id`).toBeTruthy();
      expect(entry?.prompt_profile, `${intent} missing prompt_profile`).toBeTruthy();
      expect(entry?.output_schema, `${intent} missing output_schema`).toBeTruthy();
    }
  });

  it('unknown intent resolves to blueprint (not promo popup)', () => {
    const result = resolveRouting('some.completely.unknown.intent.xyz');
    expect(result.prompt_scaffold_id).toBe(BLUEPRINT_ROUTE.prompt_scaffold_id);
    expect(result.prompt_scaffold_id).not.toBe('tpl_promo_popup_v1');
  });

  it('theme.floatingWidget resolves to utility.floating_widget routing', () => {
    const result = resolveRouting('utility.floating_widget');
    expect(result.prompt_scaffold_id).toBe('tpl_floating_widget_v1');
  });

  it('theme.effect resolves to utility.effect routing (tpl_effect_v1)', () => {
    const result = resolveRouting('utility.effect');
    expect(result.prompt_scaffold_id).toBe('tpl_effect_v1');
  });
});

// ─── New type coverage ─────────────────────────────────────────────────────────

describe('Drift check: theme.floatingWidget new type is fully registered', () => {
  it('MODULE_TYPE_TO_INTENT includes theme.floatingWidget', () => {
    expect(MODULE_TYPE_TO_INTENT['theme.floatingWidget']).toBe('utility.floating_widget');
  });

  it('theme.floatingWidget summary contains variant and anchor', () => {
    const summary = MODULE_SUMMARIES['theme.floatingWidget' as keyof typeof MODULE_SUMMARIES];
    expect(summary).toContain('variant');
    expect(summary).toContain('anchor');
  });

  it('theme.floatingWidget full schema spec is present', () => {
    const spec = getFullRecipeSchemaSpec('theme.floatingWidget');
    expect(spec).toContain('theme.floatingWidget');
    expect(spec).toContain('variant');
    expect(spec).toContain('onClick');
  });
});
