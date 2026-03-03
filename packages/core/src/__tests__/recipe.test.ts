import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '../recipe.js';

describe('RecipeSpecSchema', () => {
  it('validates a theme.banner recipe', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.banner',
      name: 'Homepage Banner',
      category: 'STOREFRONT_UI',
      config: { heading: 'Hello', enableAnimation: false }
    });
    expect(spec.type).toBe('theme.banner');
  });

  it('rejects proxy.widget with invalid widgetId', () => {
    expect(() => RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Bad',
      category: 'STOREFRONT_UI',
      config: { widgetId: 'NO SPACES', title: 'x' }
    })).toThrow();
  });

  it('validates a flow.automation recipe', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Order → ERP',
      category: 'FLOW',
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [{ kind: 'ADD_ORDER_NOTE', note: 'Synced to ERP' }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });
});
