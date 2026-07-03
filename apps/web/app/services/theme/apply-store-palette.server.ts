import type { RecipeSpec } from '@superapp/core';
import type { StorePalette } from '~/services/theme/theme-analyzer.service';

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Schema defaults the model "didn't really choose" — safe to replace with the store color. */
const DEFAULT_TEXT = '#111111';
const DEFAULT_BACKGROUND = '#ffffff';

function isHex6(v: unknown): v is string {
  return typeof v === 'string' && HEX6.test(v);
}

/**
 * Fill a generated storefront recipe's `style.colors` from the live store
 * palette WITHOUT clobbering colors the model chose deliberately:
 *  - optional colors (buttonBg/buttonText) are filled only when unset;
 *  - text/background are replaced only when they still equal the schema default.
 *
 * Returns the same reference (mutated) for caller convenience. No-ops for recipe
 * types without a `style` block or when the palette has no usable colors.
 */
export function applyStorePalette<T extends RecipeSpec>(recipe: T, palette: StorePalette | undefined): T {
  if (!palette || palette.source === 'none') return recipe;

  const styled = recipe as unknown as { style?: { colors?: Record<string, unknown> } };
  // Only storefront recipes (theme.section / proxy.widget) carry a style block.
  if (recipe.type !== 'theme.section' && recipe.type !== 'proxy.widget') return recipe;

  if (!styled.style) styled.style = {};
  if (!styled.style.colors) styled.style.colors = {};
  const colors = styled.style.colors;

  const buttonBg = palette.button ?? palette.primary;

  // text/background: replace only the schema default (i.e. the model left it generic).
  if (isHex6(palette.text) && (colors.text === undefined || colors.text === DEFAULT_TEXT)) {
    colors.text = palette.text;
  }
  if (isHex6(palette.background) && (colors.background === undefined || colors.background === DEFAULT_BACKGROUND)) {
    colors.background = palette.background;
  }
  // optional colors: fill only when the model didn't set them.
  if (isHex6(buttonBg) && colors.buttonBg === undefined) {
    colors.buttonBg = buttonBg;
  }
  if (isHex6(palette.buttonText) && colors.buttonText === undefined) {
    colors.buttonText = palette.buttonText;
  }

  // Seed the OKLCH semantic ramp from the merchant's brand accent (phase #2 2B/2C):
  // the compiler derives the 12-step semantic --sa-* vars from this. Fill only when
  // unset, so a deliberately-chosen seed is respected.
  const seed = palette.primary ?? palette.accent ?? buttonBg;
  if (isHex6(seed) && colors.seed === undefined) {
    colors.seed = seed;
  }

  return recipe;
}
