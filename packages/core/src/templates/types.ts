/**
 * Shared type re-export for the template library unit files.
 *
 * Unit files under `modules/`, `blocks/`, and `sections/` import `TemplateEntry`
 * from here instead of from `../../templates.js` directly, so the authoring files
 * never form an import cycle with the registry seam (`templates.ts`), which in turn
 * imports the aggregate `ALL_TEMPLATES` from `./index.js`.
 */
export type { TemplateEntry } from '../templates.js';
