import { afterEach, describe, expect, it } from 'vitest';
import { buildPromptAudit } from '~/services/ai/llm.server';

describe('buildPromptAudit', () => {
  const originalDebugCapture = process.env.DEBUG_AI_CAPTURE;

  afterEach(() => {
    if (originalDebugCapture === undefined) {
      delete process.env.DEBUG_AI_CAPTURE;
    } else {
      process.env.DEBUG_AI_CAPTURE = originalDebugCapture;
    }
  });

  it('returns only hash and length by default', () => {
    delete process.env.DEBUG_AI_CAPTURE;
    const audit = buildPromptAudit('hello world');
    expect(audit).toMatchObject({ chars: 11 });
    expect(audit?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(audit).not.toHaveProperty('preview');
  });

  it('includes preview only when DEBUG_AI_CAPTURE=1', () => {
    process.env.DEBUG_AI_CAPTURE = '1';
    const text = 'x'.repeat(2000);
    const audit = buildPromptAudit(text);
    expect(audit?.chars).toBe(2000);
    expect(audit?.preview).toBe('x'.repeat(1200));
  });
});
