import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { getRecipeJsonSchemaForType } from '~/services/ai/recipe-json-schema.server';
import type { ModuleType } from '@superapp/core';

/**
 * Thin server-only wrapper around getRecipeJsonSchemaForType — keeps that
 * .server.ts module (and the zod-to-json-schema registry it builds) off the
 * client bundle (binding build rule); generate._index.tsx fetches this route
 * instead of importing the schema service directly.
 *
 * Returns the `config` sub-schema merged with `style` under a `style` key, so
 * a single SchemaForm mount can edit both — this is the real, per-type schema
 * (design-vocabulary storefront-style tokens + the type's actual config
 * shape), replacing the Builder's previous hard-coded "buy bar" field set
 * (label/price/buttonColor/...) which didn't correspond to any real recipe
 * schema field and was silently discarded on the next validated save.
 */

// pricing / recommendation / ruleEngine already have dedicated, structured pack
// editors in the Builder (PricingControls / RecommendationControls /
// RuleEngineControls — tiered/conditional list UX that SchemaForm's generic
// array-as-comma-text renderer can't represent) — excluded here so SchemaForm
// never renders a second, worse editor for the same fields.
const DEDICATED_PACK_KEYS = new Set(['pricing', 'recommendation', 'ruleEngine']);

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  const type = new URL(request.url).searchParams.get('type');
  if (!type) return json({ error: 'Missing type' }, { status: 400 });

  const full = getRecipeJsonSchemaForType(type as ModuleType);
  const configProp = (full?.properties as Record<string, unknown> | undefined)?.config as
    | { properties?: Record<string, unknown> }
    | undefined;
  const styleProp = (full?.properties as Record<string, unknown> | undefined)?.style;
  if (!configProp?.properties) return json({ jsonSchema: null });

  const configProperties = Object.fromEntries(
    Object.entries(configProp.properties).filter(([key]) => !DEDICATED_PACK_KEYS.has(key)),
  );
  const merged = {
    type: 'object',
    properties: { ...configProperties, ...(styleProp ? { style: styleProp } : {}) },
  };
  return json({ jsonSchema: merged });
}
