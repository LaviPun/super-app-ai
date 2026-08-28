import { describe, expect, it } from 'vitest';
import { compileCreateSingleRecipePrompt, compileCreateModulePrompt } from '~/services/ai/llm.server';

describe('compileCreateSingleRecipePrompt cache boundary', () => {
  const base = {
    purposeAndGuidance: 'PURPOSE_TEXT',
    moduleType: 'theme.section',
    summary: 'SUMMARY_TEXT',
    expectations: 'EXPECTATIONS_TEXT',
    userRequest: 'UNIQUE_USER_REQUEST_TOKEN',
    approachHint: 'UNIQUE_APPROACH_HINT_TOKEN',
    fullSchemaSpec: 'SCHEMA_TEXT',
    settingsPack: 'SETTINGS_TEXT',
  };

  it('places every static block before cacheableChars and every dynamic block after it', () => {
    const { prompt, cacheableChars } = compileCreateSingleRecipePrompt(base);
    const prefix = prompt.slice(0, cacheableChars);
    const suffix = prompt.slice(cacheableChars);

    for (const staticText of ['PURPOSE_TEXT', 'SUMMARY_TEXT', 'EXPECTATIONS_TEXT', 'SCHEMA_TEXT', 'SETTINGS_TEXT']) {
      expect(prefix).toContain(staticText);
      expect(suffix).not.toContain(staticText);
    }
    for (const dynamicText of ['UNIQUE_USER_REQUEST_TOKEN', 'UNIQUE_APPROACH_HINT_TOKEN']) {
      expect(suffix).toContain(dynamicText);
      expect(prefix).not.toContain(dynamicText);
    }
  });

  it('is deterministic: same static params, different dynamic params, produces byte-identical prefixes', () => {
    const a = compileCreateSingleRecipePrompt({ ...base, userRequest: 'req A', approachHint: 'hint A' });
    const b = compileCreateSingleRecipePrompt({ ...base, userRequest: 'req B', approachHint: 'hint B' });
    expect(a.prompt.slice(0, a.cacheableChars)).toBe(b.prompt.slice(0, b.cacheableChars));
    expect(a.cacheableChars).toBe(b.cacheableChars);
  });

  it('cacheableChars is 0 when there is no meaningful static block (no fullSchemaSpec/settingsPack/purposeAndGuidance)', () => {
    const { cacheableChars } = compileCreateSingleRecipePrompt({
      purposeAndGuidance: '',
      moduleType: 'theme.section',
      summary: '',
      expectations: '',
      userRequest: 'x',
    });
    expect(cacheableChars).toBe(0);
  });

  it('exemplarBlock and catalogDetails (per-request RAG picks) stay in the dynamic suffix', () => {
    const { prompt, cacheableChars } = compileCreateSingleRecipePrompt({
      ...base,
      exemplarBlock: 'EXEMPLAR_UNIQUE_TOKEN',
      catalogDetails: 'CATALOG_UNIQUE_TOKEN',
    });
    expect(prompt.slice(0, cacheableChars)).not.toContain('EXEMPLAR_UNIQUE_TOKEN');
    expect(prompt.slice(0, cacheableChars)).not.toContain('CATALOG_UNIQUE_TOKEN');
  });
});

describe('compileCreateModulePrompt cache boundary', () => {
  // Review finding 6: the task text embeds the merchant-chosen optionCount
  // (1-3, per-request — see the "adaptation" note in compileCreateModulePrompt),
  // so it deliberately lives in the DYNAMIC suffix, not the static prefix —
  // renamed from "...task text and typesList in the static prefix" which
  // read as if both were in the prefix.
  it('keeps typesList in the static prefix and the optionCount-dependent task text in the dynamic suffix', () => {
    const { prompt, cacheableChars } = compileCreateModulePrompt({
      purposeAndGuidance: 'PURPOSE_TEXT',
      typesList: 'TYPES_LIST_TEXT',
      moduleType: 'theme.section',
      summary: 'SUMMARY_TEXT',
      expectations: 'EXPECTATIONS_TEXT',
      userRequest: 'UNIQUE_REQUEST',
    });
    const prefix = prompt.slice(0, cacheableChars);
    const suffix = prompt.slice(cacheableChars);
    expect(prefix).toContain('TYPES_LIST_TEXT');
    expect(prefix).not.toContain('UNIQUE_REQUEST');
    expect(suffix).toContain('Task: Generate exactly');
    expect(prefix).not.toContain('Task: Generate exactly');
  });
});
