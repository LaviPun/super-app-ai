import { describe, it, expect } from 'vitest';
import { HydrateEnvelopeSchema, validatePerfectConfig, REQUIRED_ADMIN_GROUPS } from '~/schemas/hydrate-envelope.server';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';

const validEnvelope = {
  version: '1.0',
  moduleKey: 'exit-intent-popup',
  recipeRef: { type: 'theme.popup', name: 'Exit Intent Popup', category: 'STOREFRONT_UI' },
  summary: 'An exit-intent popup for email capture.',
  assumptions: ['OS 2.0 theme', 'Theme App Extension available'],
  adminConfig: {
    schemaVersion: '1.0',
    jsonSchema: { type: 'object', properties: { content: {}, layout: {} }, required: [] },
    uiSchema: { 'ui:order': ['content', 'layout'] },
    defaults: { content: {}, layout: {} },
  },
  themeEditorSettings: {
    fields: [
      { id: 'enabled', type: 'boolean', label: 'Enable', default: true },
      { id: 'config_id', type: 'text', label: 'Config ID', default: '' },
    ],
    limitsNotes: ['Keep minimal.'],
  },
  uiTokens: {
    colors: [{ token: 'primary', default: '#111111', themeAware: true }],
    spacing: [{ token: 'md', default: 8 }],
  },
  validationReport: {
    overall: 'PASS',
    checks: [
      { id: 'SURFACE_COMPAT', severity: 'high', status: 'PASS', description: 'Theme surface supported', howToFix: '' },
      { id: 'SETTINGS_COMPLETE', severity: 'medium', status: 'PASS', description: 'All groups present' },
    ],
    notes: ['Ready to deploy.'],
  },
};

describe('HydrateEnvelopeSchema', () => {
  it('parses a valid envelope', () => {
    const result = HydrateEnvelopeSchema.safeParse(validEnvelope);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0');
      expect(result.data.validationReport.overall).toBe('PASS');
      expect(result.data.validationReport.checks).toHaveLength(2);
      expect(result.data.themeEditorSettings.fields).toHaveLength(2);
      expect(result.data.adminConfig.defaults).toEqual({ content: {}, layout: {} });
    }
  });

  it('accepts envelope without uiTokens', () => {
    const { uiTokens: _, ...noTokens } = validEnvelope;
    const result = HydrateEnvelopeSchema.safeParse(noTokens);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const result = HydrateEnvelopeSchema.safeParse({ ...validEnvelope, version: '2.0' });
    expect(result.success).toBe(false);
  });

  it('rejects validationReport.overall FAIL', () => {
    const result = HydrateEnvelopeSchema.safeParse({
      ...validEnvelope,
      validationReport: { ...validEnvelope.validationReport, overall: 'FAIL' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing adminConfig', () => {
    const { adminConfig: _, ...missing } = validEnvelope;
    const result = HydrateEnvelopeSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it('rejects missing themeEditorSettings.fields', () => {
    const result = HydrateEnvelopeSchema.safeParse({
      ...validEnvelope,
      themeEditorSettings: { limitsNotes: [] },
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional skill fields (moduleKey, recipeRef, summary, assumptions)', () => {
    const { moduleKey: _, recipeRef: _r, summary: _s, assumptions: _a, ...minimal } = validEnvelope;
    const result = HydrateEnvelopeSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });
});

describe('buildHydratePrompt', () => {
  it('includes RecipeSpec JSON in prompt', () => {
    const spec = {
      type: 'theme.popup',
      name: 'Test Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { title: 'Hi', body: '', trigger: 'ON_LOAD', delaySeconds: 0, frequency: 'ONCE_PER_DAY', maxShowsPerDay: 0, showOnPages: 'ALL', customPageUrls: [], autoCloseSeconds: 0, showCloseButton: true, countdownEnabled: false, countdownSeconds: 0, countdownLabel: '', ctaText: '', ctaUrl: '', secondaryCtaText: '',       secondaryCtaUrl: '' },
    } as Parameters<typeof buildHydratePrompt>[0];
    const prompt = buildHydratePrompt(spec);
    expect(prompt).toContain('theme.popup');
    expect(prompt).toContain('Test Popup');
    expect(prompt).toContain('HydrateEnvelope');
    expect(prompt).toContain('validationReport');
  });

  it('includes merchant context and type-specific guidance when provided', () => {
    const spec = { type: 'theme.popup', name: 'X', category: 'STOREFRONT_UI', requires: [], config: {} } as unknown as Parameters<typeof buildHydratePrompt>[0];
    const prompt = buildHydratePrompt(spec, { planTier: 'GROWTH', locale: 'fr' });
    expect(prompt).toContain('plan=GROWTH');
    expect(prompt).toContain('locale=fr');
    expect(prompt).toMatch(/mobile fallback|Popup/);
  });

  it('references version 1.0 and adminConfig in prompt', () => {
    const spec = { type: 'theme.banner', name: 'B', category: 'STOREFRONT_UI', requires: [], config: {} } as unknown as Parameters<typeof buildHydratePrompt>[0];
    const prompt = buildHydratePrompt(spec);
    expect(prompt).toContain('"1.0"');
    expect(prompt).toContain('adminConfig');
  });
});

describe('validatePerfectConfig', () => {
  it('returns valid and no envelope when all required groups present in defaults and jsonSchema.properties', () => {
    const allGroupsDefaults = Object.fromEntries(REQUIRED_ADMIN_GROUPS.map((g) => [g, {}]));
    const allGroupsProperties = Object.fromEntries(REQUIRED_ADMIN_GROUPS.map((g) => [g, { type: 'object' }]));
    const fullEnvelope = HydrateEnvelopeSchema.parse({
      ...validEnvelope,
      adminConfig: {
        ...validEnvelope.adminConfig,
        jsonSchema: { type: 'object', properties: allGroupsProperties, required: [] },
        defaults: allGroupsDefaults,
      },
    });
    const result = validatePerfectConfig(fullEnvelope);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.envelope).toBeUndefined();
  });

  it('patches missing default groups and returns envelope with WARN', () => {
    const minimal = {
      ...validEnvelope,
      adminConfig: {
        ...validEnvelope.adminConfig,
        defaults: { content: {} },
      },
    };
    const envelope = HydrateEnvelopeSchema.parse(minimal);
    const result = validatePerfectConfig(envelope);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.envelope).toBeDefined();
    const defs = result.envelope!.adminConfig.defaults as Record<string, unknown>;
    for (const group of REQUIRED_ADMIN_GROUPS) {
      expect(group in defs).toBe(true);
    }
    expect(result.envelope!.validationReport.checks.some((c: { id: string }) => c.id === 'perfect_config_defaults')).toBe(true);
  });
});

describe('HydrateEnvelope → ModuleVersion persist shape', () => {
  it('valid envelope serializes to the JSON columns the API persists', () => {
    const envelope = HydrateEnvelopeSchema.parse(validEnvelope);

    const adminConfigJson = JSON.stringify(envelope.adminConfig);
    const adminDefaultsJson = JSON.stringify(envelope.adminConfig.defaults);
    const themeEditorSettingsJson = JSON.stringify(envelope.themeEditorSettings);
    const uiTokensJson = envelope.uiTokens ? JSON.stringify(envelope.uiTokens) : null;
    const validationReportJson = JSON.stringify(envelope.validationReport);
    const implementationPlanJson = envelope.implementationPlan ? JSON.stringify(envelope.implementationPlan) : null;

    expect(adminConfigJson).toBeTruthy();
    expect(adminDefaultsJson).toBeTruthy();
    expect(themeEditorSettingsJson).toBeTruthy();
    expect(validationReportJson).toContain('"overall":"PASS"');
    expect(JSON.parse(validationReportJson).checks.length).toBeGreaterThan(0);
    expect(implementationPlanJson === null || typeof implementationPlanJson === 'string').toBe(true);

    expect(JSON.parse(adminConfigJson).schemaVersion).toBe('1.0');
    expect(JSON.parse(themeEditorSettingsJson).fields.length).toBe(2);
    expect(JSON.parse(validationReportJson).overall).toBe('PASS');
  });
});
