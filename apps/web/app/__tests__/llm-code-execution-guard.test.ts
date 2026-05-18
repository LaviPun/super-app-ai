import { afterEach, describe, expect, it } from 'vitest';
import { guardAnthropicSkillsConfig } from '~/services/ai/llm.server';

describe('guardAnthropicSkillsConfig', () => {
  const original = process.env.ALLOW_MERCHANT_CODE_EXECUTION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_MERCHANT_CODE_EXECUTION;
    } else {
      process.env.ALLOW_MERCHANT_CODE_EXECUTION = original;
    }
  });

  it('forces codeExecution off when merchant guard is active', () => {
    process.env.ALLOW_MERCHANT_CODE_EXECUTION = 'true';
    const result = guardAnthropicSkillsConfig(
      { skills: ['file_search'], codeExecution: true },
      { blockMerchantCodeExecution: true },
    );
    expect(result?.codeExecution).toBe(false);
  });

  it('keeps codeExecution off when env gate is disabled', () => {
    process.env.ALLOW_MERCHANT_CODE_EXECUTION = 'false';
    const result = guardAnthropicSkillsConfig(
      { skills: ['file_search'], codeExecution: true },
      { blockMerchantCodeExecution: false },
    );
    expect(result?.codeExecution).toBe(false);
  });
});
