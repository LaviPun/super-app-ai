import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  RecipeBlueprintSchema,
  validateBlueprintCoherence,
  type RecipeBlueprint,
} from '@superapp/core';
import { planBlueprint, plannedModuleCount } from '~/services/ai/blueprint-planner';
import { getBlueprintCatalogEntry, blueprintIntents } from '~/services/ai/blueprint-catalog';

// --- fixtures -------------------------------------------------------------

const themeSectionRecipe = {
  type: 'theme.section',
  name: 'Bundle Builder',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: { kind: 'product-bundle', activation: 'section', title: 'Build your bundle' },
};

const cartTransformRecipe = {
  type: 'functions.cartTransform',
  name: 'Bundle Merge',
  category: 'FUNCTION',
  requires: ['CART_TRANSFORM_FUNCTION_UPDATE'],
  config: { mode: 'BUNDLE', bundles: [{ title: 'Essentials', componentSkus: ['A', 'B'], bundleSku: 'C' }] },
};

function validBlueprint(): RecipeBlueprint {
  // structuredClone so per-test mutations never leak across the shared fixtures.
  return {
    name: 'Product Bundle',
    summary: 'Cart merge + product-page bundle UI.',
    modules: [
      { role: 'bundle-builder-ui', explanation: 'Product-page UI.', recipe: structuredClone(themeSectionRecipe) as never },
      { role: 'cart-merge', explanation: 'Merges SKUs.', recipe: structuredClone(cartTransformRecipe) as never },
    ],
    links: [{ fromRole: 'bundle-builder-ui', toRole: 'cart-merge', note: 'merges what the UI sells' }],
  };
}

// --- core schema + coherence ---------------------------------------------

describe('RecipeBlueprint — schema + coherence', () => {
  it('accepts a well-formed blueprint', () => {
    const parsed = RecipeBlueprintSchema.safeParse(validBlueprint());
    expect(parsed.success).toBe(true);
    expect(validateBlueprintCoherence(validBlueprint())).toEqual({ ok: true, issues: [] });
  });

  it('rejects duplicate roles', () => {
    const bp = validBlueprint();
    bp.modules[1]!.role = bp.modules[0]!.role;
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/Duplicate roles/);
  });

  it('rejects an invalid member recipe', () => {
    const bp = validBlueprint();
    (bp.modules[0]!.recipe as { type: string }).type = 'not.a.real.type';
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
  });

  it('rejects a link referencing an unknown role', () => {
    const bp = validBlueprint();
    bp.links = [{ fromRole: 'ghost', toRole: 'cart-merge', note: 'x' }];
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/fromRole "ghost"/);
  });

  it('requires at least one module', () => {
    const res = validateBlueprintCoherence({ name: 'Empty', summary: 'x', modules: [] });
    expect(res.ok).toBe(false);
  });
});

// --- planner (the "how many modules" decision) ----------------------------

describe('blueprint planner', () => {
  it('plans a multi-module blueprint for a product bundle', () => {
    const plan = planBlueprint({ moduleType: 'functions.cartTransform', intent: 'upsell.bundle_builder' });
    expect(plan.kind).toBe('blueprint');
    if (plan.kind === 'blueprint') {
      const types = plan.modules.map((m) => m.moduleType);
      expect(types).toContain('functions.cartTransform');
      expect(types).toContain('theme.section');
      expect(plan.modules.length).toBeGreaterThanOrEqual(2);
      // each member carries a surface from the capability graph
      expect(plan.modules.every((m) => typeof m.surface === 'string')).toBe(true);
      expect(plannedModuleCount(plan)).toBe(plan.modules.length);
    }
  });

  it('plans a discount-reveal blueprint (popup + discount function)', () => {
    const plan = planBlueprint({ moduleType: 'theme.section', intent: 'promo.discount_reveal' });
    expect(plan.kind).toBe('blueprint');
    if (plan.kind === 'blueprint') {
      const types = plan.modules.map((m) => m.moduleType);
      expect(types).toContain('theme.section');
      expect(types).toContain('functions.discountRules');
    }
  });

  it('stays single-module for uncatalogued intents', () => {
    const plan = planBlueprint({ moduleType: 'theme.section', intent: 'info.faq_accordion' });
    expect(plan.kind).toBe('single');
    expect(plannedModuleCount(plan)).toBe(1);
  });

  it('stays single-module when intent is missing', () => {
    expect(planBlueprint({ moduleType: 'theme.section' }).kind).toBe('single');
  });

  it('exposes blueprint intents + catalog entries', () => {
    expect(blueprintIntents()).toContain('upsell.bundle_builder');
    const entry = getBlueprintCatalogEntry('upsell.bundle_builder');
    expect(entry?.modules.length).toBeGreaterThanOrEqual(2);
    expect(getBlueprintCatalogEntry('info.faq_accordion')).toBeUndefined();
  });
});

// --- persistence (createDraft) -------------------------------------------

const hoisted = vi.hoisted(() => {
  const recipeCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'recipe_1', ...args.data }));
  const shopFindUnique = vi.fn(async () => ({ id: 'shop_1', shopDomain: 'test.myshopify.com' }));
  const createDraft = vi.fn(async (_shop: string, _spec: unknown, opts?: { recipeId?: string }) => ({
    id: `mod_${Math.random().toString(36).slice(2, 7)}`,
    recipeId: opts?.recipeId,
  }));
  return { recipeCreate, shopFindUnique, createDraft };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findUnique: hoisted.shopFindUnique },
    recipe: { create: hoisted.recipeCreate },
  }),
}));

vi.mock('~/services/modules/module.service', () => ({
  ModuleService: vi.fn().mockImplementation(() => ({ createDraft: hoisted.createDraft })),
}));

describe('BlueprintService.createDraft', () => {
  beforeEach(() => {
    hoisted.recipeCreate.mockClear();
    hoisted.createDraft.mockClear();
  });

  it('creates a Recipe group + one draft module per member, all linked by recipeId', async () => {
    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    const result = await new BlueprintService().createDraft('test.myshopify.com', validBlueprint());

    expect(hoisted.recipeCreate).toHaveBeenCalledTimes(1);
    expect(hoisted.recipeCreate.mock.calls[0]![0].data).toMatchObject({
      shopId: 'shop_1',
      title: 'Product Bundle',
      summary: 'Cart merge + product-page bundle UI.',
    });
    expect(hoisted.createDraft).toHaveBeenCalledTimes(2);
    // every member created with the new recipeId
    for (const call of hoisted.createDraft.mock.calls) {
      expect(call[2]).toMatchObject({ recipeId: 'recipe_1' });
    }
    expect(result.recipeId).toBe('recipe_1');
    expect(result.moduleIds).toHaveLength(2);
    expect(result.firstModuleId).toBe(result.moduleIds[0]);
  });
});
