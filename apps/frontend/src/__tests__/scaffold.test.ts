import { describe, expect, it } from 'vitest';

describe('frontend scaffold', () => {
  it('defines default API base env contract', () => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3002';
    expect(apiBase).toContain('http');
  });
});
