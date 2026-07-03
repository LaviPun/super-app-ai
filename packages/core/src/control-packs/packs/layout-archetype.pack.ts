/**
 * `layout-archetype` control pack (basic) — R2.5 proof case for the per-type
 * enum enabler.
 *
 * Declares a `layout` field whose enum option-set is **supplied by the module
 * type**: `theme.section` resolves to `stacked | grid | masonry | carousel`
 * (see `type-enums.ts`), while a future reviews/bundle type would resolve a
 * different set from the *same* pack.
 *
 * Flat-pin path (post R2.4 prune): the pack `schema` keeps a **loose**
 * `z.string()` for `layout` so the shared recipe union accepts any type's value
 * and old recipes keep validating. The tight per-type enum is enforced at
 * generation time in `recipe-json-schema.server.ts`, driven by the `typeEnums`
 * metadata below + the `type-enums.ts` catalog. `default('stacked')` keeps the
 * default a CSS no-op (byte-identical render for recipes that omit `layout`).
 */
import { z } from 'zod';
import type { ControlPack, TypeEnumField } from '../types.js';

/** The per-type enum slot. Fallback covers types without a catalog entry. */
const layoutField: TypeEnumField = {
  kind: 'typeEnum',
  enumKey: 'layout',
  fallback: [
    { value: 'stacked', label: 'Stacked' },
    { value: 'grid', label: 'Grid' },
    { value: 'carousel', label: 'Carousel' },
  ],
  default: 'stacked',
};

/**
 * Loose at the union level (per-type enum enforced in generation JSON Schema).
 * `columns` is generic (maps to `--sa-cols`); meaningless for stacked/carousel,
 * hidden in the form via `showWhen`.
 */
export const LayoutArchetypePackSchema = z.object({
  layout: z.string().min(1).default('stacked'),
  columns: z.number().int().min(1).max(6).optional(),
});

export const layoutArchetypePack: ControlPack<typeof LayoutArchetypePackSchema> = {
  id: 'layout-archetype',
  namespace: 'layout',
  label: 'Layout',
  tier: 'basic',
  schema: LayoutArchetypePackSchema,
  typeEnums: { layout: layoutField },
  uiSchema: {
    groupLabel: 'Layout',
    order: ['layout', 'columns'],
    fields: {
      layout: { widget: 'select', help: 'How the section arranges its content.' },
      columns: {
        widget: 'number',
        help: 'Column count for grid/masonry layouts.',
        showWhen: { field: 'layout', equals: 'grid' },
      },
    },
  },
};
