import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  shop: { findFirst: vi.fn().mockResolvedValue(null) },
};

vi.mock('~/db.server', () => ({ getPrisma: () => prismaMock }));

const docsIndexMock = {
  resolveDocsDir: vi.fn(),
  getDocsIndex: vi.fn(),
  searchDocs: vi.fn(),
};

vi.mock('~/services/ai/app-docs-index.server', () => docsIndexMock);

describe('searchAppDocs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shop.findFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.resetModules());

  it('degrades honestly (ok:false) when the docs corpus is absent', async () => {
    docsIndexMock.resolveDocsDir.mockReturnValue(null);
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('searchAppDocs', { prompt: 'how do plan tiers work?' });
    expect(result.ok).toBe(false);
    expect(result.data.available).toBe(false);
    expect(typeof result.data.reason).toBe('string');
    // Never fabricates snippets when docs are missing.
    expect(result.data.snippets).toBeUndefined();
  });

  it('returns ranked snippets from the docs index when the corpus is present', async () => {
    docsIndexMock.resolveDocsDir.mockReturnValue('/repo/docs');
    docsIndexMock.getDocsIndex.mockReturnValue([{ docPath: 'docs/app.md', heading: 'Plans & quotas', body: 'x' }]);
    docsIndexMock.searchDocs.mockReturnValue([
      { doc: 'docs/app.md', heading: 'Plans & quotas', excerpt: 'Plan tiers control quota.' },
    ]);
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('searchAppDocs', { prompt: 'plan tiers' });
    expect(result.ok).toBe(true);
    const snippets = result.data.snippets as Array<{ doc: string; heading: string }>;
    expect(snippets[0]?.doc).toBe('docs/app.md');
    expect(snippets[0]?.heading).toBe('Plans & quotas');
    expect(docsIndexMock.searchDocs).toHaveBeenCalledWith(expect.anything(), 'plan tiers');
  });
});
