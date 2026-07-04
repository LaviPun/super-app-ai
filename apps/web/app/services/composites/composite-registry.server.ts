/**
 * Composite record registry lookup (Phase #4 · R3.6).
 *
 * The R3.6 accrual/advancement engines fire from the webhook + cron paths, where
 * there is no in-hand blueprint — only a shopId. They need to discover which
 * composite records of a given kind a shop has PUBLISHED (loyalty ledgers,
 * subscription contracts) so they can act on the right typed store.
 *
 * The composite manifest is already persisted on `Recipe.compositeJson`
 * (R3.1) and every Recipe is shop-scoped (`Recipe.shopId`). So the registry is a
 * pure read over that column — NO new table, NO new column (fully back-compat).
 * We reuse `parseCompositeManifest` (the SAME parser the publish path uses) so a
 * record shape can never drift between publish and runtime.
 */
import type { CompositeKind, CompositeRecord } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { parseCompositeManifest } from '~/services/blueprints/blueprint.service';

/** A shop's published composite record + the recipe it belongs to. */
export type ShopCompositeRecord = {
  recipeId: string;
  record: CompositeRecord;
};

/**
 * Every composite record of `kind` a shop has, read from `Recipe.compositeJson`.
 * A recipe with no manifest (a flat blueprint / single module) contributes
 * nothing. Deterministic order (recipe creation order) so callers are stable.
 */
export async function findShopCompositeRecords(
  shopId: string,
  kind: CompositeKind,
): Promise<ShopCompositeRecord[]> {
  const prisma = getPrisma();
  const recipes = await prisma.recipe.findMany({
    where: { shopId, compositeJson: { not: null } },
    select: { id: true, compositeJson: true },
    orderBy: { createdAt: 'asc' },
  });

  const out: ShopCompositeRecord[] = [];
  for (const r of recipes) {
    const manifest = parseCompositeManifest(r.compositeJson);
    if (!manifest) continue;
    for (const record of manifest.sharedRecords) {
      if (record.kind === kind) out.push({ recipeId: r.id, record });
    }
  }
  return out;
}
