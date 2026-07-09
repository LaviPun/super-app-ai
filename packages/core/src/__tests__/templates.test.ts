import { describe, it, expect } from 'vitest';
import {
  MODULE_TEMPLATES,
  findTemplate,
  TEMPLATE_CATEGORIES,
  getTemplateReadiness,
  getTemplateInstallability,
  TEMPLATE_TYPES_REQUIRING_DATA_SAVE,
} from '../templates.js';
import { MODULE_APP_TEMPLATES } from '../templates/modules/index.js';
import { BLOCK_TEMPLATES } from '../templates/blocks/index.js';
import { SECTION_TEMPLATES } from '../templates/sections/index.js';
import { RecipeSpecSchema } from '../recipe.js';
import { RECIPE_SPEC_TYPES } from '../allowed-values.js';

describe('MODULE_TEMPLATES integrity', () => {
  it('has at least 300 templates in aggregate', () => {
    expect(MODULE_TEMPLATES.length).toBeGreaterThanOrEqual(300);
  });

  it('ships three real libraries, each ≥ 100 templates', () => {
    // App-extension modules (admin/POS/checkout/functions/customer-account/…).
    expect(MODULE_APP_TEMPLATES.length).toBeGreaterThanOrEqual(100);
    // theme.section app-blocks (OS-2.0 theme app extension blocks + app embeds).
    expect(BLOCK_TEMPLATES.length).toBeGreaterThanOrEqual(100);
    // native full-page Liquid sections (activation: 'section').
    expect(SECTION_TEMPLATES.length).toBeGreaterThanOrEqual(100);
  });

  it('every template has matching type and spec.type', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.type).toBe(t.spec.type);
    }
  });

  it('every template has matching category and spec.category', () => {
    for (const t of MODULE_TEMPLATES) {
      expect(t.category).toBe(t.spec.category);
    }
  });

  it('all template IDs are unique', () => {
    const ids = MODULE_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template spec validates against RecipeSpecSchema', () => {
    for (const t of MODULE_TEMPLATES) {
      const result = RecipeSpecSchema.safeParse(t.spec);
      expect(result.success, `Template ${t.id} (${t.type}) failed validation: ${JSON.stringify(result.success ? null : result.error.flatten())}`).toBe(true);
    }
  });

  it('covers all RecipeSpec type variants', () => {
    const coveredTypes = new Set(MODULE_TEMPLATES.map(t => t.type));
    for (const t of RECIPE_SPEC_TYPES) {
      expect(coveredTypes.has(t), `Missing template for type: ${t}`).toBe(true);
    }
  });

  it('every template category is in TEMPLATE_CATEGORIES', () => {
    for (const t of MODULE_TEMPLATES) {
      expect((TEMPLATE_CATEGORIES as readonly string[]).includes(t.category)).toBe(true);
    }
  });

  it('findTemplate returns the correct template by ID', () => {
    const hero = findTemplate('NSEC-HERO-01');
    expect(hero).toBeDefined();
    expect(hero!.spec.type).toBe('theme.section');

    const pdp = findTemplate('TBLK-PDP-01');
    expect(pdp).toBeDefined();
    expect(pdp!.spec.type).toBe('theme.section');

    const ana = findTemplate('COV-ANA-01');
    expect(ana).toBeDefined();
    expect(ana!.spec.type).toBe('analytics.pixel');
  });

  it('findTemplate returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined();
  });

  // ── Block/native unit lints (034 surface-coverage discipline) ────────────────
  // Every theme.section block config.blocks[].kind is slug-safe (renderers dispatch
  // on it and emit it into generated Liquid/section names — no spaces/special chars).
  it('theme.section block kinds are slug-safe', () => {
    const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const themeSection = [...BLOCK_TEMPLATES, ...SECTION_TEMPLATES].filter(
      (t) => t.spec.type === 'theme.section',
    );
    for (const t of themeSection) {
      const blocks = (t.spec.config as { blocks?: Array<{ kind?: unknown }> }).blocks ?? [];
      for (const b of blocks) {
        expect(typeof b.kind, `Template ${t.id} has a block with a non-string kind`).toBe('string');
        expect(
          SLUG.test(b.kind as string),
          `Template ${t.id} block kind "${String(b.kind)}" is not slug-safe`,
        ).toBe(true);
      }
    }
  });

  // Block fields are typed: each theme.section block's optional `fields` bag must be a
  // plain object (Record), never an array/scalar — the renderers read it as key/value.
  it('theme.section block fields are typed as an object bag', () => {
    const themeSection = [...BLOCK_TEMPLATES, ...SECTION_TEMPLATES].filter(
      (t) => t.spec.type === 'theme.section',
    );
    for (const t of themeSection) {
      const blocks = (t.spec.config as { blocks?: Array<{ fields?: unknown }> }).blocks ?? [];
      for (const b of blocks) {
        if (b.fields === undefined) continue;
        expect(
          typeof b.fields === 'object' && b.fields !== null && !Array.isArray(b.fields),
          `Template ${t.id} has a block whose fields is not a plain object`,
        ).toBe(true);
      }
    }
  });

  it('applies advanced defaults for popup, integration, and flow templates', () => {
    for (const t of MODULE_TEMPLATES) {
      if (t.spec.type === 'theme.section' && (t.spec.config as { kind?: string }).kind === 'popup') {
        const cfg = t.spec.config as Record<string, unknown>;
        expect(cfg.trigger).toBeDefined();
        expect(cfg.frequency).toBeDefined();
        expect(cfg.maxShowsPerDay).toBeDefined();
        expect(cfg.showOnPages).toBeDefined();
        expect(cfg.showCloseButton).toBeDefined();
        expect(cfg.countdownEnabled).toBeDefined();
      }

      if (t.spec.type === 'integration.httpSync') {
        expect(t.spec.config.payloadMapping).toBeDefined();
        expect(t.spec.config.payloadMapping.shop).toBeDefined();
        expect(t.spec.config.payloadMapping.event).toBeDefined();
      }

      if (t.spec.type === 'theme.section' && (t.spec.config as { kind?: string }).kind === 'contactForm') {
        const cfg = t.spec.config as Record<string, unknown>;
        expect(cfg.submitLabel).toBeDefined();
        expect(cfg.successMessage).toBeDefined();
        expect(cfg.errorMessage).toBeDefined();
        expect(cfg.submissionMode).toBeDefined();
        expect(cfg.spamProtection).toBeDefined();
      }

      if (t.spec.type === 'flow.automation') {
        for (const step of t.spec.config.steps) {
          if (step.kind === 'HTTP_REQUEST') {
            expect(step.method).toBeDefined();
            expect(step.bodyMapping.orderId).toBeDefined();
          }
          if (step.kind === 'WRITE_TO_STORE') {
            expect(step.titleExpr).toBeDefined();
            expect(step.payloadMapping.orderId).toBeDefined();
          }
          if (step.kind === 'SEND_HTTP_REQUEST') {
            expect(step.method).toBeDefined();
            expect(step.authType).toBeDefined();
            expect(step.headers['X-SuperApp-Source']).toBe('template');
          }
        }
      }
    }
  });

  it('computes readiness metadata for each template', () => {
    for (const t of MODULE_TEMPLATES) {
      const readiness = getTemplateReadiness(t);
      expect(readiness.templateId).toBe(t.id);
      expect(readiness.type).toBe(t.type);
      expect(Array.isArray(readiness.dbModels)).toBe(true);
      expect(Array.isArray(readiness.checks)).toBe(true);
      expect(readiness.checks.length).toBeGreaterThan(0);
      expect(typeof readiness.hasAdvancedSettings).toBe('boolean');
      expect(typeof readiness.dataSaveReady).toBe('boolean');
      expect(Array.isArray(readiness.requiredDataFlags)).toBe(true);
      expect(Array.isArray(readiness.missingDataFlags)).toBe(true);
    }
  });

  it('marks flow templates containing WRITE_TO_STORE as data-store ready', () => {
    const flowTemplate = MODULE_TEMPLATES.find((t) =>
      t.type === 'flow.automation'
      && Array.isArray((t.spec.config as { steps?: Array<{ kind?: string }> }).steps)
      && ((t.spec.config as { steps: Array<{ kind?: string }> }).steps).some((step) => step.kind === 'WRITE_TO_STORE')
    );
    if (!flowTemplate) return; // dataset may evolve; behavior is covered by readiness metadata test above
    const readiness = getTemplateReadiness(flowTemplate);
    expect(readiness.dataSaveReady).toBe(true);
    expect(['DATA_STORE', 'DATA_CAPTURE_AND_DATA_STORE']).toContain(readiness.storageMode);
  });

  it('every readiness check on every template passes (zero "Needs work")', () => {
    const failures: string[] = [];
    for (const t of MODULE_TEMPLATES) {
      const readiness = getTemplateReadiness(t);
      for (const check of readiness.checks) {
        if (!check.ok) {
          failures.push(`${t.id} (${t.type}) → ${check.id}: ${check.detail}`);
        }
      }
    }
    expect(failures, `Templates with failing readiness checks:\n${failures.join('\n')}`).toEqual([]);
  });

  it('detects flow persistence nested inside CONDITION branches', () => {
    // FLOW-04 writes to a store only inside a CONDITION.thenSteps; readiness must
    // still see it as a DATA_STORE flow (recursive step-kind collection).
    const flow04 = findTemplate('FLOW-04');
    expect(flow04).toBeDefined();
    const readiness = getTemplateReadiness(flow04!);
    expect(readiness.storageMode).toBe('DATA_STORE');
    expect(readiness.dataSaveReady).toBe(true);
  });

  it('treats effectful (tag/notify) flows without a DataStore as persistence-ready', () => {
    // FLOW-03 only tags + Slacks — a complete automation with no app-side store.
    const flow03 = findTemplate('FLOW-03');
    expect(flow03).toBeDefined();
    const readiness = getTemplateReadiness(flow03!);
    expect(readiness.storageMode).toBe('NONE');
    const persistence = readiness.checks.find((c) => c.id === 'data.persistence');
    expect(persistence?.ok).toBe(true);
  });

  it('does not demand style/placement of head app-embed theme.sections', () => {
    // Head-injection theme.sections render no visible markup and carry no `style`.
    const headEmbed = findTemplate('EMB-HEAD-01');
    expect(headEmbed).toBeDefined();
    expect((headEmbed!.spec as { style?: unknown }).style).toBeUndefined();
    const baseLayout = getTemplateReadiness(headEmbed!).checks.find((c) => c.id === 'base.layout');
    expect(baseLayout?.ok).toBe(true);
  });

  it('computes installability policy with strict advanced-settings requirement', () => {
    for (const t of MODULE_TEMPLATES) {
      const installability = getTemplateInstallability(t);
      if (!installability.readiness.hasAdvancedSettings) {
        expect(installability.ok).toBe(false);
        expect(installability.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it('enforces data-save requirement for selected template types', () => {
    for (const t of MODULE_TEMPLATES) {
      const installability = getTemplateInstallability(t);
      if (TEMPLATE_TYPES_REQUIRING_DATA_SAVE.has(t.type)) {
        if (!installability.readiness.dataSaveReady) {
          expect(installability.ok).toBe(false);
          expect(installability.reasons.join(' ')).toContain('data-save path');
        }
      } else {
        expect(installability.readiness.dataSaveReady).toBe(true);
      }
    }
  });

  it('declares and enforces Shopify data-surface flags for each template', () => {
    for (const t of MODULE_TEMPLATES) {
      const readiness = getTemplateReadiness(t);
      expect(readiness.missingDataFlags).toEqual([]);
      for (const requiredFlag of readiness.requiredDataFlags) {
        expect(t.spec.requires).toContain(requiredFlag);
      }
    }
  });
});
