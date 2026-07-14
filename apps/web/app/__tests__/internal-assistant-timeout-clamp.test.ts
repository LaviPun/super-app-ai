import { afterEach, describe, expect, it } from 'vitest';
import { resolveChatTimeoutMs } from '~/services/ai/internal-assistant.server';

const ENV_KEY = 'INTERNAL_AI_CHAT_TIMEOUT_MS';

describe('resolveChatTimeoutMs', () => {
  const original = process.env[ENV_KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('with no env: keeps existing default (max of configured and 30s floor)', () => {
    delete process.env[ENV_KEY];
    expect(resolveChatTimeoutMs(3000)).toBe(30_000);
    expect(resolveChatTimeoutMs(45_000)).toBe(45_000);
  });

  it('clamps an env value below the 30s cold-start floor up to 30s', () => {
    process.env[ENV_KEY] = '5000';
    expect(resolveChatTimeoutMs(3000)).toBe(30_000);
  });

  it('clamps an env value above the 90s ceiling down to 90s', () => {
    process.env[ENV_KEY] = '120000';
    expect(resolveChatTimeoutMs(3000)).toBe(90_000);
  });

  it('passes an in-range env value through unchanged', () => {
    process.env[ENV_KEY] = '60000';
    expect(resolveChatTimeoutMs(3000)).toBe(60_000);
  });

  it('ignores a non-positive / non-finite env value and falls back to the default', () => {
    process.env[ENV_KEY] = '0';
    expect(resolveChatTimeoutMs(3000)).toBe(30_000);
    process.env[ENV_KEY] = 'not-a-number';
    expect(resolveChatTimeoutMs(45_000)).toBe(45_000);
  });
});
