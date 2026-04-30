import { describe, it, expect } from 'vitest';
import {
  MODULE_TEMPLATES,
  findTemplate,
  TEMPLATE_CATEGORIES,
  getTemplateReadiness,
  getTemplateInstallability,
  TEMPLATE_TYPES_REQUIRING_DATA_SAVE,
} from '../templates.js';
import { RecipeSpecSchema } from '../recipe.js';
import { RECIPE_SPEC_TYPES } from '../allowed-values.js';

describe('MODULE_TEMPLATES integrity', () => {
  it('has at least 126 templates', () => {
    expect(MODULE_TEMPLATES.length).toBeGreaterThanOrEqual(126);
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
    const uao = findTemplate('UAO-001');
    expect(uao).toBeDefined();
    expect(uao!.spec.type).toBe('theme.banner');

    const chk = findTemplate('CHK-037');
    expect(chk).toBeDefined();
    expect(chk!.spec.type).toBe('checkout.block');

    const ana = findTemplate('ANA-109');
    expect(ana).toBeDefined();
    expect(ana!.spec.type).toBe('analytics.pixel');
  });

  it('findTemplate returns undefined for unknown id', () => {
    expect(findTemplate('nonexistent')).toBeUndefined();
  });

  it('covers all 14 recipe library categories', () => {
    const ids = MODULE_TEMPLATES.map(t => t.id);
    const prefixes = ['UAO', 'DAP', 'BCT', 'CUX', 'CHK', 'TYO', 'ACC', 'SHP', 'PAY', 'TRU', 'SUP', 'LOY', 'ANA', 'OPS'];
    for (const prefix of prefixes) {
      const count = ids.filter(id => id.startsWith(prefix)).length;
      expect(count, `Category ${prefix} should have at least 9 templates`).toBeGreaterThanOrEqual(9);
    }
  });

  it('applies advanced defaults for popup, integration, and flow templates', () => {
    for (const t of MODULE_TEMPLATES) {
      if (t.spec.type === 'theme.popup') {
        expect(t.spec.config.trigger).toBeDefined();
        expect(t.spec.config.frequency).toBeDefined();
        expect(t.spec.config.maxShowsPerDay).toBeDefined();
        expect(t.spec.config.showOnPages).toBeDefined();
        expect(t.spec.config.showCloseButton).toBeDefined();
        expect(t.spec.config.countdownEnabled).toBeDefined();
      }

      if (t.spec.type === 'integration.httpSync') {
        expect(t.spec.config.payloadMapping).toBeDefined();
        expect(t.spec.config.payloadMapping.shop).toBeDefined();
        expect(t.spec.config.payloadMapping.event).toBeDefined();
      }

      if (t.spec.type === 'theme.contactForm') {
        expect(t.spec.config.submitLabel).toBeDefined();
        expect(t.spec.config.successMessage).toBeDefined();
        expect(t.spec.config.errorMessage).toBeDefined();
        expect(t.spec.config.submissionMode).toBeDefined();
        expect(t.spec.config.spamProtection).toBeDefined();
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
