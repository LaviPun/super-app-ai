import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  shop: { findFirst: vi.fn() },
  module: { findFirst: vi.fn() },
};

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

describe('inspectRecipe run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.shop.findFirst.mockResolvedValue(null);
  });

  it('resolves a real template and returns a valid RecipeSpec verdict + link fields', async () => {
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('inspectRecipe', { prompt: 'inspect recipe CHKU-01' });
    expect(result.ok).toBe(true);
    const d = result.data as Record<string, any>;
    expect(d.found).toBe(true);
    expect(d.source).toBe('template');
    expect(d.id).toBe('CHKU-01');
    // Canonical library templates validate against the schema.
    expect(d.validation.valid).toBe(true);
    expect(Array.isArray(d.validation.issues)).toBe(true);
    // Summary is derived from the actual spec shape.
    expect(typeof d.summary.type).toBe('string');
    expect(typeof d.summary.settingsCount).toBe('number');
    expect(Array.isArray(d.summary.settingKeys)).toBe(true);
    // Payload is budgeted.
    expect(JSON.stringify(d).length).toBeLessThanOrEqual(2000);
  });

  it('reports an INVALID verdict with path+message issues for a broken module spec', async () => {
    prismaMock.module.findFirst.mockResolvedValue({
      id: 'cmrezggie001m11h4wulhkams',
      shopId: 'shop-1',
      name: 'Broken Module',
      type: 'theme.section',
      category: 'conversion',
      activeVersion: { specJson: JSON.stringify({ type: 'theme.section', name: '' }) },
      versions: [],
    });
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('inspectRecipe', {
      prompt: 'validate module cmrezggie001m11h4wulhkams',
    });
    expect(result.ok).toBe(true);
    const d = result.data as Record<string, any>;
    expect(d.found).toBe(true);
    expect(d.source).toBe('module');
    expect(d.shopId).toBe('shop-1');
    expect(d.validation.valid).toBe(false);
    expect(d.validation.issues.length).toBeGreaterThan(0);
    for (const issue of d.validation.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
    }
    expect(d.validation.issues.length).toBeLessThanOrEqual(5);
  });

  it('returns found:false ok:false when the module id does not resolve', async () => {
    prismaMock.module.findFirst.mockResolvedValue(null);
    const { runAssistantTool } = await import('~/services/ai/internal-assistant-tools.server');
    const result = await runAssistantTool('inspectRecipe', {
      prompt: 'inspect module cmrezftuu001k11h4cq5leu8n',
    });
    expect(result.ok).toBe(false);
    expect((result.data as Record<string, any>).found).toBe(false);
  });
});
