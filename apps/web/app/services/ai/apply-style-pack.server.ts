import type { RecipeSpec } from '@superapp/core';
import type { StorePalette, StoreTypography } from '~/services/theme/theme-analyzer.service';
import { STYLE_PACKS, resolveStorefrontPack, type StylePackId } from '~/services/ai/style-packs.server';
import { paletteToDesignReferencePack, selectStylePackForReference } from '~/services/ai/design-reference.server';

/**
 * Phase #2 (029): apply the selected style pack's grammar to a generated module's
 * NEW token fields (density / elevation idiom / motion) — the ones the prompt does
 * not set. Colors + radius already flow through the prompt + `applyStorePalette`;
 * this closes the loop so the pack actually drives the design-token substrate.
 *
 * Fills only when unset, so a deliberate model/merchant choice is respected.
 */

const ELEVATION_BY_PACK: Record<StylePackId, 'soft' | 'glow' | 'border' | 'emboss'> = {
  'apple-hig-clean': 'soft', // soft depth
  'editorial-wellness': 'border', // near-flat, border-carried
  'bold-dtc': 'soft', // bold offset — soft is the safe token approximation
  'minimal-luxe': 'emboss', // hairline + inset, highest-craft
  'playful-commerce': 'soft', // dual soft shadow
  'tech-utility': 'border', // 1px border + tiny shadow
};

const MOTION_BY_PACK: Record<
  StylePackId,
  { duration: 'fast' | 'base' | 'slow'; easing: 'standard' | 'enter' | 'exit' | 'mechanical' }
> = {
  'apple-hig-clean': { duration: 'base', easing: 'standard' },
  'editorial-wellness': { duration: 'slow', easing: 'enter' },
  'bold-dtc': { duration: 'fast', easing: 'standard' },
  'minimal-luxe': { duration: 'slow', easing: 'standard' },
  'playful-commerce': { duration: 'base', easing: 'standard' },
  'tech-utility': { duration: 'fast', easing: 'mechanical' },
};

/** Map a pack's numeric md radius to the StorefrontStyle radius enum. */
function radiusEnum(md: number): 'none' | 'sm' | 'md' | 'lg' | 'xl' {
  if (md <= 2) return 'none';
  if (md <= 5) return 'sm';
  if (md <= 9) return 'md';
  if (md <= 13) return 'lg';
  return 'xl';
}

export function applyStylePackTokens<T extends RecipeSpec>(
  recipe: T,
  palette: StorePalette | undefined,
  typography: StoreTypography | undefined,
): T {
  if (recipe.type !== 'theme.section' && recipe.type !== 'proxy.widget') return recipe;
  if (!palette || palette.source === 'none') return recipe;

  const refPack = paletteToDesignReferencePack(palette, typography ?? {}, 'live-theme');
  const selection = selectStylePackForReference(refPack);
  const packId = selection.packId;
  const pack = STYLE_PACKS[packId];

  const styled = recipe as unknown as {
    style?: {
      pack?: 'auto' | 'luxe' | 'bold';
      spacing?: Record<string, unknown>;
      shape?: Record<string, unknown>;
      motion?: Record<string, unknown>;
    };
  };
  if (!styled.style) styled.style = {};
  const st = styled.style;
  st.spacing ??= {};
  st.shape ??= {};
  st.motion ??= {};

  // Resolve + persist the two-pack render grammar (module-design-system.md §3.3.1)
  // so the storefront stamps `data-sa-pack`. Respect an explicit model/merchant choice.
  if (st.pack === undefined) st.pack = resolveStorefrontPack(selection);

  if (st.spacing.density === undefined) st.spacing.density = pack.density;
  if (st.shape.radius === undefined) st.shape.radius = radiusEnum(pack.radius.md);
  if (st.shape.elevation === undefined) st.shape.elevation = ELEVATION_BY_PACK[packId];
  if (st.motion.duration === undefined) st.motion.duration = MOTION_BY_PACK[packId].duration;
  if (st.motion.easing === undefined) st.motion.easing = MOTION_BY_PACK[packId].easing;

  return recipe;
}
