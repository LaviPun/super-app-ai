import { describe, it, expect, vi } from 'vitest';
import { compileRecipe } from '~/services/recipes/compiler';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import type { RecipeSpec } from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';
import type { ThemeModulePayload } from '~/services/recipes/compiler/types';

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/** A minimal theme.section (app-block path) used as the placement fixture. */
const BASE_SPEC = {
  type: 'theme.section',
  name: 'Placement Banner',
  category: 'STOREFRONT_UI',
  requires: ['THEME_ASSETS'],
  config: {
    kind: 'banner',
    activation: 'section',
    title: 'Hello',
    fields: {},
    blocks: [],
  },
} as unknown as ThemeSectionSpec;

const TARGET = { kind: 'THEME' as const, themeId: '789', moduleId: 'mod-place-1' };

function withPlacement(placement: unknown): ThemeSectionSpec {
  return { ...BASE_SPEC, placement } as unknown as ThemeSectionSpec;
}

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
}

describe('theme.section placement — compiler threading', () => {
  it('threads enabled_on placement into ThemeModulePayload', () => {
    const spec = withPlacement({ enabled_on: { templates: ['product', 'collection'] } });
    const out = compileRecipe(spec, TARGET);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload?.placement).toEqual({
      enabled_on: { templates: ['product', 'collection'] },
    });
  });

  it('threads disabled_on placement into ThemeModulePayload', () => {
    const spec = withPlacement({ disabled_on: { templates: ['cart'] } });
    const out = compileRecipe(spec, TARGET);
    expect(out.themeModulePayload?.placement).toEqual({
      disabled_on: { templates: ['cart'] },
    });
  });

  it('ABSENT placement → payload has no placement key AND is byte-identical to pre-placement', () => {
    const out = compileRecipe(BASE_SPEC, TARGET);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload).not.toHaveProperty('placement');
    expect('placement' in (out.themeModulePayload as object)).toBe(false);

    // Byte-identical contract: the full CompileResult serialization is unchanged by
    // the addition of the placement field when a spec declares no placement. We
    // reconstruct the pre-placement payload shape (every key EXCEPT placement) and
    // assert the compiler produced exactly that — no stray keys, same order.
    const p = out.themeModulePayload as ThemeModulePayload;
    const expectedPayload: ThemeModulePayload = {
      type: p.type,
      name: p.name,
      activationType: p.activationType,
      config: p.config,
      style: p.style,
      styleCss: p.styleCss,
      ruleServerResolvable: p.ruleServerResolvable,
    };
    expect(JSON.stringify(out.themeModulePayload)).toBe(JSON.stringify(expectedPayload));
  });

  it('adding placement does not perturb any other payload key', () => {
    const withOut = compileRecipe(BASE_SPEC, TARGET).themeModulePayload as ThemeModulePayload;
    const withIn = compileRecipe(
      withPlacement({ enabled_on: { templates: ['index'] } }),
      TARGET,
    ).themeModulePayload as ThemeModulePayload;
    // Everything except `placement` matches exactly.
    const { placement: _p, ...withInMinusPlacement } = withIn;
    expect(JSON.stringify(withInMinusPlacement)).toBe(JSON.stringify(withOut));
  });
});

describe('theme.section placement — reaches the persisted metaobject write', () => {
  it('writes placement_json when placement is present', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(
      graphqlJsonResponse({
        data: { metaobjectUpsert: { userErrors: [], metaobject: { id: 'gid://shopify/Metaobject/1' } } },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    const payload = compileRecipe(
      withPlacement({ enabled_on: { templates: ['product'] } }),
      TARGET,
    ).themeModulePayload as ThemeModulePayload;

    await service.upsertModuleObject('mod-place-1', payload);

    const vars = graphql.mock.calls[0]?.[1] as {
      variables: { metaobject: { fields: Array<{ key: string; value: string }> } };
    };
    const fields = vars.variables.metaobject.fields;
    const placementField = fields.find((f) => f.key === 'placement_json');
    expect(placementField).toBeDefined();
    expect(JSON.parse(placementField!.value)).toEqual({ enabled_on: { templates: ['product'] } });
  });

  it('omits placement_json entirely when placement is absent (byte-identical field set)', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(
      graphqlJsonResponse({
        data: { metaobjectUpsert: { userErrors: [], metaobject: { id: 'gid://shopify/Metaobject/2' } } },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    const payload = compileRecipe(BASE_SPEC, TARGET).themeModulePayload as ThemeModulePayload;
    await service.upsertModuleObject('mod-place-1', payload);

    const vars = graphql.mock.calls[0]?.[1] as {
      variables: { metaobject: { fields: Array<{ key: string; value: string }> } };
    };
    const keys = vars.variables.metaobject.fields.map((f) => f.key);
    expect(keys).not.toContain('placement_json');
    // The exact field set an existing (pre-placement) module writes.
    expect(keys).toEqual(['module_id', 'module_type', 'name', 'activation_type', 'config_json', 'style_json']);
  });
});

describe('theme.section head activation (034 #6) — routes to the head app embed', () => {
  const headSpec = {
    ...BASE_SPEC,
    config: { kind: 'jsonLd', activation: 'head', jsonLd: { '@type': 'Organization' } },
  } as unknown as ThemeSectionSpec;

  it("compiles activation:'head' to activationType:'head' on the theme-module payload", () => {
    const out = compileRecipe(headSpec, TARGET);
    expect(out.themeModulePayload?.activationType).toBe('head');
    // Still the metaobject path (never a native section).
    expect(out.ops.some((o) => o.kind === 'THEME_ASSET_UPSERT')).toBe(false);
  });

  it('a head module NEVER compiles to a native section even in native_section mode', () => {
    const out = compileRecipe(headSpec, { ...TARGET, mode: 'native_section' });
    // Head modules ignore native_section mode and take the app-embed path.
    expect(out.ops.some((o) => o.kind === 'THEME_ASSET_UPSERT')).toBe(false);
    expect(out.themeModulePayload?.activationType).toBe('head');
  });

  it("persists activation_type:'head' so the head embed can filter for it", async () => {
    const graphql = vi.fn().mockResolvedValueOnce(
      graphqlJsonResponse({
        data: { metaobjectUpsert: { userErrors: [], metaobject: { id: 'gid://shopify/Metaobject/9' } } },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);
    const payload = compileRecipe(headSpec, TARGET).themeModulePayload as ThemeModulePayload;
    await service.upsertModuleObject('mod-head-1', payload);
    const vars = graphql.mock.calls[0]?.[1] as {
      variables: { metaobject: { fields: Array<{ key: string; value: string }> } };
    };
    const act = vars.variables.metaobject.fields.find((f) => f.key === 'activation_type');
    expect(act?.value).toBe('head');
  });
});

/**
 * Pure mirror of the Liquid placement gate (superapp-module.liquid): render iff
 *  - no enabled_on templates OR enabled_on.templates contains the current template, AND
 *  - disabled_on.templates (if present) does NOT contain the current template.
 * A module with no placement (undefined) always renders. Kept in lock-step with the
 * `sa_placement_ok` block in the snippet.
 */
function placementRenders(
  placement: ThemeModulePayload['placement'] | undefined,
  templateName: string,
): boolean {
  if (!placement) return true;
  const enabled = placement.enabled_on?.templates ?? [];
  const disabled = placement.disabled_on?.templates ?? [];
  let ok = true;
  if (enabled.length > 0 && !enabled.includes(templateName)) ok = false;
  if (disabled.length > 0 && disabled.includes(templateName)) ok = false;
  return ok;
}

describe('theme.section placement — render-gate decision logic', () => {
  it('no placement → renders on every template', () => {
    for (const t of ['product', 'collection', 'cart', 'index', '404']) {
      expect(placementRenders(undefined, t)).toBe(true);
    }
  });

  it('enabled_on scopes rendering to the listed templates only', () => {
    const p = { enabled_on: { templates: ['product', 'collection'] } };
    expect(placementRenders(p, 'product')).toBe(true);
    expect(placementRenders(p, 'collection')).toBe(true);
    expect(placementRenders(p, 'cart')).toBe(false);
    expect(placementRenders(p, 'index')).toBe(false);
  });

  it('disabled_on renders everywhere except the listed templates', () => {
    const p = { disabled_on: { templates: ['cart', 'index'] } };
    expect(placementRenders(p, 'cart')).toBe(false);
    expect(placementRenders(p, 'index')).toBe(false);
    expect(placementRenders(p, 'product')).toBe(true);
    expect(placementRenders(p, 'search')).toBe(true);
  });

  it('empty template arrays render defensively (never hide on absent data)', () => {
    expect(placementRenders({ enabled_on: { templates: [] } }, 'cart')).toBe(true);
    expect(placementRenders({ disabled_on: { templates: [] } }, 'cart')).toBe(true);
    expect(placementRenders({}, 'cart')).toBe(true);
  });
});
