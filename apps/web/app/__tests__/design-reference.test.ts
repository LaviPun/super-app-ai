import { describe, expect, it } from 'vitest';
import {
  buildDesignReferencePromptBlock,
  deriveDesignReferencePack,
  paletteToDesignReferencePack,
} from '~/services/ai/design-reference.server';
import type { StorePalette } from '~/services/theme/theme-analyzer.service';
import { compileCreateSingleRecipePrompt } from '~/services/ai/llm.server';
import {
  FRONTEND_DEVELOPER_REFINEMENT_PASS,
  PREMIUM_OUTPUT_GUARDRAILS,
  PROMPT_PURPOSE_AND_GUIDANCE,
  UI_DESIGNER_REFINEMENT_PASS,
} from '~/services/ai/prompt-expectations.server';

describe('design-reference fallback', () => {
  it('falls back to bummer.in when URL is missing', () => {
    const pack = deriveDesignReferencePack(null);
    expect(pack.sourceType).toBe('fallback');
    expect(pack.sourceUrl).toContain('bummer.in');
    expect(pack.primaryColors.length).toBeGreaterThan(0);
  });

  it('uses store source when URL is provided', () => {
    const pack = deriveDesignReferencePack('https://acme-store.com');
    expect(pack.sourceType).toBe('store');
    expect(pack.sourceUrl).toContain('acme-store.com');
  });
});

describe('paletteToDesignReferencePack (live theme)', () => {
  const palette: StorePalette = {
    primary: '#1773b0',
    accent: '#ff5a00',
    background: '#fafafa',
    text: '#121212',
    button: '#1773b0',
    buttonText: '#ffffff',
    neutrals: ['#1773b0', '#121212', '#fafafa'],
    source: 'settings_data',
  };

  it('carries concrete hex values from the extracted palette', () => {
    const pack = paletteToDesignReferencePack(palette, { headingFont: 'Assistant' }, 'live-theme');
    expect(pack.sourceType).toBe('store');
    expect(pack.primaryColors).toContain('#1773b0');
    expect(pack.primaryColors).toContain('#ff5a00');
    expect(pack.neutralPalette).toContain('#fafafa');
    expect(pack.typographyHints.join(' ')).toContain('Assistant');
  });

  it('surfaces real hexes into the compiled prompt block', () => {
    const block = buildDesignReferencePromptBlock(paletteToDesignReferencePack(palette, {}, 'live-theme'));
    expect(block).toContain('#1773b0');
    expect(block).toContain('#fafafa');
  });

  it('degrades to instruction text when palette has no colors', () => {
    const pack = paletteToDesignReferencePack({ neutrals: [], source: 'css' }, {}, 'live-theme');
    expect(pack.primaryColors[0]).toMatch(/Use the live store/);
  });
});

describe('prompt premium sections', () => {
  it('includes DesignReferenceV1 and refinement passes in compiled prompt', () => {
    const designBlock = buildDesignReferencePromptBlock(deriveDesignReferencePack('https://bummer.in'));
    const prompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance: PROMPT_PURPOSE_AND_GUIDANCE,
      moduleType: 'theme.section',
      summary: 'summary',
      expectations: 'expectations',
      userRequest: 'Create premium popup',
      designReferenceBlock: designBlock,
      uiDesignerPass: UI_DESIGNER_REFINEMENT_PASS,
      frontendDeveloperPass: FRONTEND_DEVELOPER_REFINEMENT_PASS,
      premiumGuardrails: PREMIUM_OUTPUT_GUARDRAILS,
    });

    expect(prompt).toContain('DesignReferenceV1');
    expect(prompt).toContain('UI_DESIGNER_PASS');
    expect(prompt).toContain('FRONTEND_DEVELOPER_PASS');
    expect(prompt).toContain('Premium output guardrails');
  });
});

