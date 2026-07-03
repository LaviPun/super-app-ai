import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  RecipeBlueprintSchema,
  validateBlueprintCoherence,
  type RecipeBlueprint,
} from '@superapp/core';
import { planBlueprint, plannedModuleCount } from '~/services/ai/blueprint-planner';
import { getBlueprintCatalogEntry, blueprintIntents, buildCompositeManifest } from '~/services/ai/blueprint-catalog';

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
    expect(validateBlueprintCoherence(validBlueprint())).toEqual({ ok: true, issues: [], warnings: [] });
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

// --- R3.1 composite generation (deterministic, catalog-driven) -------------

describe('composite manifest generation', () => {
  it('the bundle intent is a composite: builds a coherent product-bundle manifest (§7.10)', () => {
    const entry = getBlueprintCatalogEntry('upsell.bundle_builder')!;
    expect(entry.composite?.kind).toBe('product-bundle');

    // Emulate the generation assembly: all catalog roles generated.
    const presentRoles = new Set(entry.modules.map((m) => m.role));
    const manifest = buildCompositeManifest(entry, presentRoles);
    expect(manifest).not.toBeNull();

    // One product-bundle record, backing pinned to APP_METAFIELD (not model-chosen).
    const record = manifest!.sharedRecords[0] as { kind: string; backing: string; entityMap: { bindingKey: string } };
    expect(record.kind).toBe('product-bundle');
    expect(record.backing).toBe('APP_METAFIELD');
    expect(record.entityMap.bindingKey).toBe('_superapp_bundle_id');

    // Every binding names a present role; display binds Sold-Out to real inventory.
    const bindings = manifest!.bindings as Array<{ memberRole: string; bindingRole: string; availabilitySource?: string }>;
    expect(bindings.every((b) => presentRoles.has(b.memberRole))).toBe(true);
    const display = bindings.find((b) => b.memberRole === 'bundle-builder-ui');
    expect(display?.bindingRole).toBe('display');
    expect(display?.availabilitySource).toBe('components');
    expect(bindings.some((b) => b.bindingRole === 'enforcement')).toBe(true);

    // Assemble a full blueprint like generateValidatedBlueprint does → coherent.
    const blueprint: RecipeBlueprint = {
      name: entry.name,
      summary: entry.summary,
      modules: [
        { role: 'bundle-builder-ui', explanation: 'UI', recipe: structuredClone(themeSectionRecipe) as never },
        { role: 'cart-merge', explanation: 'Merge', recipe: structuredClone(cartTransformRecipe) as never },
      ],
      sharedRecords: manifest!.sharedRecords as RecipeBlueprint['sharedRecords'],
      bindings: manifest!.bindings as RecipeBlueprint['bindings'],
    };
    // Filter bindings to present roles (checkout-display omitted here).
    blueprint.bindings = blueprint.bindings!.filter((b) => ['bundle-builder-ui', 'cart-merge'].includes(b.memberRole));
    const res = validateBlueprintCoherence(blueprint);
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it('a non-composite intent (discount reveal) builds no manifest', () => {
    const entry = getBlueprintCatalogEntry('promo.discount_reveal')!;
    expect(entry.composite).toBeUndefined();
    expect(buildCompositeManifest(entry, new Set(['reveal-popup', 'discount-rule']))).toBeNull();
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

  it('flat blueprint writes null compositeJson (back-compat)', async () => {
    const { BlueprintService } = await import('~/services/blueprints/blueprint.service');
    await new BlueprintService().createDraft('test.myshopify.com', validBlueprint());
    expect(hoisted.recipeCreate.mock.calls[0]![0].data.compositeJson).toBeNull();
  });

  it('composite blueprint persists sharedRecords/bindings/memberRoles as compositeJson (R3.1)', async () => {
    const bp = validBlueprint();
    bp.sharedRecords = [{
      ref: 'product-bundle', kind: 'product-bundle', backing: 'APP_METAFIELD',
      entityMap: { bindingKey: '_superapp_bundle_id', entries: [] },
    }];
    bp.bindings = [
      { memberRole: 'bundle-builder-ui', recordRef: 'product-bundle', bindingRole: 'display', reads: [], availabilitySource: 'components' },
      { memberRole: 'cart-merge', recordRef: 'product-bundle', bindingRole: 'enforcement', reads: [], availabilitySource: 'none' },
    ];

    const { BlueprintService, parseCompositeManifest } = await import('~/services/blueprints/blueprint.service');
    await new BlueprintService().createDraft('test.myshopify.com', bp);

    const written = hoisted.recipeCreate.mock.calls[0]![0].data.compositeJson as string;
    const manifest = parseCompositeManifest(written);
    expect(manifest?.sharedRecords[0]!.ref).toBe('product-bundle');
    expect(manifest?.bindings).toHaveLength(2);
    // memberRoles snapshot in module order → binding.memberRole resolves at publish.
    expect(manifest?.memberRoles).toEqual(['bundle-builder-ui', 'cart-merge']);
  });
});
