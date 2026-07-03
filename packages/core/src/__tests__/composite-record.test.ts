import { describe, it, expect } from 'vitest';
import {
  CompositeRecordSchema,
  MemberBindingSchema,
  COMPOSITE_KINDS,
  RECORD_BACKINGS,
  COMPOSITE_KIND_BACKING,
  COMPOSITE_KIND_REALITY,
} from '../composite-record.js';
import { validateBlueprintCoherence, type RecipeBlueprint } from '../recipe-blueprint.js';

// --- §2d worked example: the bundler as a shared-record blueprint ----------

const bundleRecord = {
  ref: 'skincare-bundle',
  kind: 'product-bundle' as const,
  backing: 'APP_METAFIELD' as const,
  dataModel: {
    fields: [
      { name: 'presentationMode', type: 'select' as const, options: ['single-bap', 'multi-bap', 'cart-transform'], required: true },
      { name: 'discountPercentage', type: 'number' as const, required: true },
    ],
  },
  entityMap: {
    bindingKey: '_superapp_bundle_id',
    entries: [
      { ref: 'CLEANSER-01', role: 'component', qty: 1 },
      { ref: 'SERUM-01', role: 'component', qty: 1 },
      { ref: 'MOIST-01', role: 'component', qty: 1 },
    ],
  },
};

/** A full §2d bundler blueprint with a shared record + 3 bound members. */
function bundlerBlueprint(overrides?: { availabilitySource?: 'components' | 'placeholder' | 'none' }): RecipeBlueprint {
  return {
    name: 'Summer Skincare Bundle',
    summary: 'Buy the 3-step routine together and save 20%.',
    sharedRecords: [bundleRecord],
    modules: [
      {
        role: 'bundle-builder-ui',
        explanation: 'PDP bundle widget.',
        recipe: { type: 'theme.section', name: 'Bundle Builder', category: 'STOREFRONT_UI', requires: [], config: { kind: 'product-bundle', activation: 'section', title: 'Build your bundle' } } as never,
      },
      {
        role: 'cart-merge',
        explanation: 'Merge components into one line.',
        recipe: { type: 'functions.cartTransform', name: 'Cart Merge', category: 'FUNCTION', requires: [], config: { mode: 'BUNDLE', bundles: [{ title: 'Skincare Bundle', componentSkus: ['CLEANSER-01', 'SERUM-01'], bundleSku: 'BUNDLE-01' }] } } as never,
      },
      {
        role: 'bundle-price',
        explanation: 'Hold the tier price to checkout.',
        recipe: { type: 'functions.discountRules', name: 'Bundle Price', category: 'FUNCTION', requires: [], config: { rules: [{ when: { minSubtotal: 1 }, apply: { percentageOff: 20 } }], combineWithOtherDiscounts: false } } as never,
      },
    ],
    bindings: [
      { memberRole: 'bundle-builder-ui', recordRef: 'skincare-bundle', bindingRole: 'display', reads: ['discountPercentage', 'presentationMode'], availabilitySource: overrides?.availabilitySource ?? 'components' },
      { memberRole: 'cart-merge', recordRef: 'skincare-bundle', bindingRole: 'enforcement', reads: ['presentationMode'] },
      { memberRole: 'bundle-price', recordRef: 'skincare-bundle', bindingRole: 'enforcement', reads: ['discountPercentage'] },
    ],
  } as unknown as RecipeBlueprint;
}

describe('CompositeRecordSchema', () => {
  it('accepts the §2d bundler record', () => {
    const parsed = CompositeRecordSchema.safeParse(bundleRecord);
    expect(parsed.success).toBe(true);
  });

  it('.strict() rejects unknown keys', () => {
    const parsed = CompositeRecordSchema.safeParse({ ...bundleRecord, bogus: 1 });
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-kebab ref', () => {
    expect(CompositeRecordSchema.safeParse({ ...bundleRecord, ref: 'Skincare_Bundle' }).success).toBe(false);
    expect(CompositeRecordSchema.safeParse({ ...bundleRecord, ref: '1bundle' }).success).toBe(false);
    expect(CompositeRecordSchema.safeParse({ ...bundleRecord, ref: 'ok-kebab-1' }).success).toBe(true);
  });

  it('pins each kind to a real backing + reality tag (totality)', () => {
    for (const kind of COMPOSITE_KINDS) {
      expect(RECORD_BACKINGS).toContain(COMPOSITE_KIND_BACKING[kind]);
      expect(['full', 'engine-real-shopify-api-gated', 'record-and-surfaces-only']).toContain(COMPOSITE_KIND_REALITY[kind]);
    }
  });
});

describe('MemberBindingSchema', () => {
  it('defaults reads=[] and availabilitySource=none', () => {
    const parsed = MemberBindingSchema.parse({ memberRole: 'x', recordRef: 'y', bindingRole: 'display' });
    expect(parsed.reads).toEqual([]);
    expect(parsed.availabilitySource).toBe('none');
  });

  it('.strict() rejects unknown keys', () => {
    expect(MemberBindingSchema.safeParse({ memberRole: 'x', recordRef: 'y', bindingRole: 'display', bogus: 1 }).success).toBe(false);
  });
});

describe('validateBlueprintCoherence — composite rules', () => {
  it('the §2d bundler is coherent (ok, no warnings)', () => {
    const res = validateBlueprintCoherence(bundlerBlueprint());
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it('back-compat: a flat blueprint (no sharedRecords) is ok', () => {
    const flat: RecipeBlueprint = {
      name: 'Flat Blueprint',
      summary: 'No shared record.',
      modules: [{ role: 'only', explanation: 'x', recipe: { type: 'theme.section', name: 'Reveal Popup', category: 'STOREFRONT_UI', requires: [], config: { kind: 'popup', activation: 'overlay' } } as never }],
    };
    const res = validateBlueprintCoherence(flat);
    expect(res.ok).toBe(true);
    expect(res.warnings).toEqual([]);
  });

  it('flags a binding.recordRef not in sharedRecords', () => {
    const bp = bundlerBlueprint();
    bp.bindings![0]!.recordRef = 'ghost-record';
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/unknown record "ghost-record"/);
  });

  it('flags a binding.memberRole not a member role', () => {
    const bp = bundlerBlueprint();
    bp.bindings![0]!.memberRole = 'ghost-member';
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/unknown member role "ghost-member"/);
  });

  it('flags a product-bundle record with no enforcement binding on a Function member', () => {
    const bp = bundlerBlueprint();
    // Strip both enforcement bindings → only the display remains.
    bp.bindings = bp.bindings!.filter((b) => b.bindingRole !== 'enforcement');
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/no enforcement binding on a Function member/);
  });

  it('flags a backing that does not match the kind pin', () => {
    const bp = bundlerBlueprint();
    bp.sharedRecords![0] = { ...bp.sharedRecords![0]!, backing: 'DATA_STORE' };
    const res = validateBlueprintCoherence(bp);
    expect(res.ok).toBe(false);
    expect(res.issues.join(' ')).toMatch(/pinned to "APP_METAFIELD"/);
  });

  it('WARNS (does not fail) on a placeholder-inventory bundle display — the Fast Bundle Sold-Out bug', () => {
    const res = validateBlueprintCoherence(bundlerBlueprint({ availabilitySource: 'placeholder' }));
    expect(res.ok).toBe(true); // still coherent
    expect(res.warnings.join(' ')).toMatch(/Sold-Out bug/);
  });
});
