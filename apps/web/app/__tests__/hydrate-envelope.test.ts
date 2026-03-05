import { describe, it, expect } from 'vitest';
import { HydrateEnvelopeSchema } from '~/schemas/hydrate-envelope.server';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';

const validEnvelope = {
  version: '2.0',
  adminConfigSchema: {
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
      expect(result.data.version).toBe('2.0');
      expect(result.data.validationReport.overall).toBe('PASS');
      expect(result.data.validationReport.checks).toHaveLength(2);
      expect(result.data.themeEditorSettings.fields).toHaveLength(2);
      expect(result.data.adminConfigSchema.defaults).toEqual({ content: {}, layout: {} });
    }
  });

  it('accepts envelope without uiTokens', () => {
    const { uiTokens: _, ...noTokens } = validEnvelope;
    const result = HydrateEnvelopeSchema.safeParse(noTokens);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const result = HydrateEnvelopeSchema.safeParse({ ...validEnvelope, version: '1.0' });
    expect(result.success).toBe(false);
  });

  it('rejects validationReport.overall FAIL', () => {
    const result = HydrateEnvelopeSchema.safeParse({
      ...validEnvelope,
      validationReport: { ...validEnvelope.validationReport, overall: 'FAIL' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing adminConfigSchema', () => {
    const { adminConfigSchema: _, ...missing } = validEnvelope;
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
});

describe('HydrateEnvelope → ModuleVersion persist shape', () => {
  it('valid envelope serializes to the JSON columns the API persists', () => {
    const envelope = HydrateEnvelopeSchema.parse(validEnvelope);

    const adminConfigSchemaJson = JSON.stringify(envelope.adminConfigSchema);
    const adminDefaultsJson = JSON.stringify(envelope.adminConfigSchema.defaults);
    const themeEditorSettingsJson = JSON.stringify(envelope.themeEditorSettings);
    const uiTokensJson = envelope.uiTokens ? JSON.stringify(envelope.uiTokens) : null;
    const validationReportJson = JSON.stringify(envelope.validationReport);
    const compiledRuntimePlanJson = envelope.implementationPlan ? JSON.stringify(envelope.implementationPlan) : null;

    expect(adminConfigSchemaJson).toBeTruthy();
    expect(adminDefaultsJson).toBeTruthy();
    expect(themeEditorSettingsJson).toBeTruthy();
    expect(validationReportJson).toContain('"overall":"PASS"');
    expect(JSON.parse(validationReportJson).checks.length).toBeGreaterThan(0);
    expect(compiledRuntimePlanJson === null || typeof compiledRuntimePlanJson === 'string').toBe(true);

    expect(JSON.parse(adminConfigSchemaJson).schemaVersion).toBe('1.0');
    expect(JSON.parse(themeEditorSettingsJson).fields.length).toBe(2);
    expect(JSON.parse(validationReportJson).overall).toBe('PASS');
  });
});
