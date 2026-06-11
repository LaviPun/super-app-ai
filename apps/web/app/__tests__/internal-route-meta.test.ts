import { describe, expect, it } from 'vitest';
import { internalDocumentTitle, titleForInternalPath } from '~/utils/internal-route-meta';

describe('internal route meta', () => {
  it('maps known internal paths to page titles', () => {
    expect(titleForInternalPath('/internal/ai-assistant')).toBe('AI assistant');
    expect(titleForInternalPath('/internal/stores/abc')).toBe('Store details');
  });

  it('builds document titles with app name', () => {
    expect(internalDocumentTitle('/internal/jobs', 'Acme Ops')).toBe('Jobs · Acme Ops');
    expect(internalDocumentTitle('/internal/unknown-page', 'Acme Ops')).toBe('Admin · Acme Ops');
  });
});
