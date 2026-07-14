import { describe, expect, it } from 'vitest';
import { MODULE_TEMPLATES, type RecipeSpec } from '@superapp/core';
import { runRichnessQa } from '~/services/ai/richness-qa.server';

/**
 * The templates define the ceiling: every shipped storefront template MUST pass
 * its own archetype's richness floor. A failure here means a floor is stricter
 * than the hand-authored library — weaken the floor, don't "fix" the template.
 *
 * mustHaveControls is intentionally omitted so ONLY the structural floors run
 * (basicness needs a per-request expectation the library doesn't carry).
 */
const STOREFRONT = new Set(['theme.section', 'proxy.widget']);

const storefrontTemplates = MODULE_TEMPLATES.filter((t) => STOREFRONT.has(t.type));

describe('richness floors — every shipped storefront template passes its floor', () => {
  it('has a non-trivial storefront template corpus', () => {
    expect(storefrontTemplates.length).toBeGreaterThan(50);
  });

  it.each(storefrontTemplates.map((t) => [t.id, t.spec] as const))(
    '%s passes its archetype floor',
    (_id, spec) => {
      const issues = runRichnessQa(spec as RecipeSpec);
      const failures = issues.filter((i) => i.severity === 'fail');
      expect(failures, failures.map((f) => `${f.id}: ${f.message}`).join('\n')).toEqual([]);
    },
  );
});
