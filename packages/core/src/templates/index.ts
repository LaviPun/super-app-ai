/**
 * Aggregate barrel for the whole template library.
 *
 * `ALL_TEMPLATES` unions the three real libraries — app-extension modules
 * (`./modules`), theme.section app-blocks (`./blocks`), and native full-page
 * sections (`./sections`) — plus `./coverage`, a small hand-authored file that
 * guarantees every `RECIPE_SPEC_TYPE` has at least one template and every asserted
 * ID prefix meets its floor.
 *
 * This is the single source consumed by the registry seam in `../templates.ts`
 * (`TEMPLATE_SOURCE = ALL_TEMPLATES`), which then runs each entry through
 * `modernizeTemplateEntry` (requires-flag injection + type defaults) before
 * exposing `MODULE_TEMPLATES`.
 */
import type { TemplateEntry } from './types.js';
import { MODULE_APP_TEMPLATES } from './modules/index.js';
import { BLOCK_TEMPLATES } from './blocks/index.js';
import { SECTION_TEMPLATES } from './sections/index.js';
import { COVERAGE_TEMPLATES } from './coverage.js';

export { MODULE_APP_TEMPLATES } from './modules/index.js';
export { BLOCK_TEMPLATES } from './blocks/index.js';
export { SECTION_TEMPLATES } from './sections/index.js';
export { COVERAGE_TEMPLATES } from './coverage.js';

export const ALL_TEMPLATES: TemplateEntry[] = [
  ...MODULE_APP_TEMPLATES,
  ...BLOCK_TEMPLATES,
  ...SECTION_TEMPLATES,
  ...COVERAGE_TEMPLATES,
];
