import { describe, it, expect } from 'vitest';
import { InMemoryRateLimiter } from '../index.js';

describe('InMemoryRateLimiter', () => {
  it('limits after max requests in window', () => {
    const rl = new InMemoryRateLimiter(2, 60);
    expect(rl.take('k').ok).toBe(true);
    expect(rl.take('k').ok).toBe(true);
    expect(rl.take('k').ok).toBe(false);
  });
});
