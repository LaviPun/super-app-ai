import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('guardAnthropicSkillsConfig (P2A-3 warning)', () => {
  const original = process.env.ALLOW_MERCHANT_CODE_EXECUTION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ALLOW_MERCHANT_CODE_EXECUTION;
    } else {
      process.env.ALLOW_MERCHANT_CODE_EXECUTION = original;
    }
  });

  it('warns when code execution is actually enabled (structured output silently disabled downstream)', () => {
    process.env.ALLOW_MERCHANT_CODE_EXECUTION = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guardAnthropicSkillsConfig({ codeExecution: true }, { blockMerchantCodeExecution: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('structured-output tool-forcing is now disabled'));
    warn.mockRestore();
  });

  it('does not warn when code execution ends up blocked', () => {
    process.env.ALLOW_MERCHANT_CODE_EXECUTION = 'true';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guardAnthropicSkillsConfig({ codeExecution: true }, { blockMerchantCodeExecution: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn when the env gate keeps code execution off', () => {
    process.env.ALLOW_MERCHANT_CODE_EXECUTION = 'false';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    guardAnthropicSkillsConfig({ codeExecution: true }, { blockMerchantCodeExecution: false });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
