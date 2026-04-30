import { describe, expect, it } from 'vitest';
import {
  buildDesignReferencePromptBlock,
  deriveDesignReferencePack,
} from '~/services/ai/design-reference.server';
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

describe('prompt premium sections', () => {
  it('includes DesignReferenceV1 and refinement passes in compiled prompt', () => {
    const designBlock = buildDesignReferencePromptBlock(deriveDesignReferencePack('https://bummer.in'));
    const prompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance: PROMPT_PURPOSE_AND_GUIDANCE,
      moduleType: 'theme.popup',
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

