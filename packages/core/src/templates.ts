import type { RecipeSpec } from './recipe.js';
import type { ModuleCategory } from './allowed-values.js';
import {
  MODULE_CATEGORIES,
  THEME_PLACEABLE_TEMPLATES,
  PIXEL_STANDARD_EVENTS,
} from './allowed-values.js';
import { PART1_TEMPLATES } from './_templates_part1.js';
import { PART2_TEMPLATES } from './_templates_part2.js';
import { PART3_TEMPLATES } from './_templates_part3.js';
import { PART4_TEMPLATES } from './_templates_part4.js';

export type TemplateEntry = {
  id: string;
  name: string;
  description: string;
  category: ModuleCategory;
  type: string;
  icon?: string;
  tags?: string[];
  spec: RecipeSpec;
};

/** Categories that have templates; from Allowed Values Manifest (doc Section 4 + 9). */
export const TEMPLATE_CATEGORIES = MODULE_CATEGORIES;

export const MODULE_TEMPLATES: TemplateEntry[] = [
  ...PART1_TEMPLATES,
  ...PART2_TEMPLATES,
  ...PART3_TEMPLATES,
  ...PART4_TEMPLATES,
];

export function findTemplate(templateId: string): TemplateEntry | undefined {
  return MODULE_TEMPLATES.find(t => t.id === templateId);
}

export function getTemplatesByCategory(category?: string): TemplateEntry[] {
  if (!category) return MODULE_TEMPLATES;
  return MODULE_TEMPLATES.filter(t => t.category === category);
}
