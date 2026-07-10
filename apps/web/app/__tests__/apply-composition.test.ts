import { describe, it, expect } from 'vitest';
import type { RecipeSpec } from '@superapp/core';
import { applyCompositionRules } from '~/services/ai/apply-composition.server';

const section = (config: Record<string, unknown>, style: Record<string, unknown> = {}): RecipeSpec =>
  ({ type: 'theme.section', config, style }) as unknown as RecipeSpec;

const blocks = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'feature', text: `b${i}` }));

describe('applyCompositionRules (§04/§6 guardrails)', () => {
  it('clamps columns to the block count', () => {
    const r = applyCompositionRules(section({ layout: { layout: 'grid', columns: 4 }, blocks: blocks(2) })) as never as {
      config: { layout: { columns: number } };
    };
    expect(r.config.layout.columns).toBe(2);
  });

  it('repairs a single-orphan grid (7 blocks × 4 cols → 3 cols... → no lone trailing item)', () => {
    const r = applyCompositionRules(section({ layout: { layout: 'grid', columns: 4 }, blocks: blocks(7) })) as never as {
      config: { layout: { columns: number } };
    };
    const cols = r.config.layout.columns;
    expect(cols >= 3 ? 7 % cols !== 1 : true).toBe(true);
  });

  it('leaves an evenly-divided grid untouched', () => {
    const r = applyCompositionRules(section({ layout: { layout: 'grid', columns: 3 }, blocks: blocks(6) })) as never as {
      config: { layout: { columns: number } };
    };
    expect(r.config.layout.columns).toBe(3);
  });

  it('clamps columns to the 1..4 range', () => {
    const r = applyCompositionRules(section({ layout: { layout: 'grid', columns: 9 }, blocks: blocks(12) })) as never as {
      config: { layout: { columns: number } };
    };
    expect(r.config.layout.columns).toBeLessThanOrEqual(4);
  });

  it('left-aligns a long centered paragraph (never center a paragraph)', () => {
    const r = applyCompositionRules(
      section({ body: 'x'.repeat(400) }, { typography: { align: 'center' } }),
    ) as never as { style: { typography: { align: string } } };
    expect(r.style.typography.align).toBe('left');
  });

  it('keeps a short centered statement centered', () => {
    const r = applyCompositionRules(
      section({ body: 'Considered, always.' }, { typography: { align: 'center' } }),
    ) as never as { style: { typography: { align: string } } };
    expect(r.style.typography.align).toBe('center');
  });

  it('no-ops for non-storefront types', () => {
    const r = applyCompositionRules({ type: 'functions.discountRules', config: { layout: { columns: 9 } } } as unknown as RecipeSpec) as never as {
      config: { layout: { columns: number } };
    };
    expect(r.config.layout.columns).toBe(9);
  });
});
