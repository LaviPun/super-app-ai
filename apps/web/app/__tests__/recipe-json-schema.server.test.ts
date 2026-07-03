import { describe, expect, it } from 'vitest';
import {
  getRecipeSingleJsonSchemaForType,
  getRecipeJsonSchemaForType,
} from '~/services/ai/recipe-json-schema.server';

type JsonObj = Record<string, unknown>;

/** Navigate `recipe.properties.config.properties.<ns>.properties.<field>` defensively. */
function configField(recipe: JsonObj | undefined, ns: string, field: string): JsonObj | undefined {
  const config = (recipe?.properties as JsonObj | undefined)?.config as JsonObj | undefined;
  const nsNode = (config?.properties as JsonObj | undefined)?.[ns] as JsonObj | undefined;
  return (nsNode?.properties as JsonObj | undefined)?.[field] as JsonObj | undefined;
}

function typeIncludesNull(node: JsonObj | undefined): boolean {
  const t = node?.type;
  return t === 'null' || (Array.isArray(t) && t.includes('null'));
}

describe('recipe-json-schema — R2.5 per-type enum overlay', () => {
  it('constrains theme.section config.layout.layout to the type option-set (hard enum)', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    const layoutField = configField(recipe, 'layout', 'layout');
    expect(layoutField).toBeDefined();
    expect(layoutField!.enum).toEqual(['stacked', 'grid', 'masonry', 'carousel']);
    // Closed set → no length noise remains.
    expect(layoutField!.minLength).toBeUndefined();
    expect(layoutField!.maxLength).toBeUndefined();
  });

  it('leaves existing branch keys intact (overlay does not clobber)', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    const configProps = ((recipe?.properties as JsonObj).config as JsonObj).properties as JsonObj;
    // The pins/fields that predate R2.5 must still be present.
    for (const key of ['kind', 'activation', 'blocks', 'audience', 'schedule']) {
      expect(configProps[key], `config.${key} should still be present`).toBeDefined();
    }
  });

  it('a type without a per-type enum has no layout key (schema unaffected)', () => {
    const recipe = getRecipeJsonSchemaForType('functions.discountRules');
    const configProps = ((recipe?.properties as JsonObj).config as JsonObj).properties as JsonObj;
    expect(configProps.layout).toBeUndefined();
  });
});

describe('recipe-json-schema — required-normalization bug fix (X-2 / top-risk #2)', () => {
  it('keeps OpenAI-strict `required` = every property key on config', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    const config = (recipe?.properties as JsonObj).config as JsonObj;
    const propKeys = Object.keys(config.properties as JsonObj).sort();
    const required = ([...(config.required as string[])]).sort();
    expect(required).toEqual(propKeys);
  });

  it('makes optional pinned packs NULLABLE so the model can opt out (not force-invented)', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    // layout/audience/schedule/advancedCustom are `.optional()` pins — they must
    // be nullable, letting the model return null when irrelevant rather than
    // being forced to emit a bogus pricing/layout/audience block.
    const config = (recipe?.properties as JsonObj).config as JsonObj;
    const props = config.properties as JsonObj;
    for (const optionalKey of ['layout', 'audience', 'schedule', 'advancedCustom', 'ruleEngine']) {
      expect(typeIncludesNull(props[optionalKey] as JsonObj), `${optionalKey} should be nullable`).toBe(true);
    }
  });

  it('R2.1 — pins ruleEngine on theme.section config with the constrained enums', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    const config = (recipe?.properties as JsonObj).config as JsonObj;
    const ruleEngine = (config.properties as JsonObj).ruleEngine as JsonObj;
    expect(ruleEngine, 'config.ruleEngine should be pinned').toBeDefined();
    // enabled defaults false → the model can omit rules; matchAction is a closed enum.
    const reProps = (ruleEngine.properties as JsonObj | undefined) ?? {};
    const matchAction = reProps.matchAction as JsonObj | undefined;
    expect(matchAction?.enum).toEqual(['SHOW', 'HIDE']);
  });

  it('keeps genuinely-required keys non-nullable (name has no default → required)', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    // `name` is a required top-level property with no default → must NOT be nullable.
    const nameNode = (recipe?.properties as JsonObj).name as JsonObj;
    expect(typeIncludesNull(nameNode)).toBe(false);
  });

  it('DEFAULTED fields stay non-nullable (null would fail Zod .default(); it only coerces absence)', () => {
    const recipe = getRecipeJsonSchemaForType('theme.section');
    const props = ((recipe?.properties as JsonObj).config as JsonObj).properties as JsonObj;
    // `kind`/`activation` carry Zod `.default()` → must remain non-nullable so the
    // model emits a real value rather than a null that .default() won't coerce.
    expect(typeIncludesNull(props.kind as JsonObj)).toBe(false);
    expect(typeIncludesNull(props.activation as JsonObj)).toBe(false);
    // The per-type enum inner field is defaulted ('stacked') → non-nullable too.
    const layoutInner = configField(recipe, 'layout', 'layout');
    expect(typeIncludesNull(layoutInner)).toBe(false);
  });

  it('the single/options envelopes wrap the same per-type recipe root', () => {
    const single = getRecipeSingleJsonSchemaForType('theme.section');
    const recipeInSingle = ((single?.properties as JsonObj).recipe) as JsonObj;
    const layoutField = configField(recipeInSingle, 'layout', 'layout');
    expect(layoutField!.enum).toEqual(['stacked', 'grid', 'masonry', 'carousel']);
  });
});
