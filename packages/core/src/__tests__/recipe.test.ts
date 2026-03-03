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

  it('validates a SEND_HTTP_REQUEST step', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'HTTP Flow',
      category: 'FLOW',
      config: {
        trigger: 'MANUAL',
        steps: [{
          kind: 'SEND_HTTP_REQUEST',
          url: 'https://api.example.com/webhook',
          method: 'POST',
          headers: { 'X-Custom': 'value' },
          body: '{"key": "value"}',
          authType: 'bearer',
          authConfig: { token: 'my-token' },
        }],
      },
    });
    expect(spec.type).toBe('flow.automation');
    if (spec.type === 'flow.automation') {
      expect(spec.config.steps[0]!.kind).toBe('SEND_HTTP_REQUEST');
    }
  });

  it('rejects SEND_HTTP_REQUEST with non-HTTPS url', () => {
    expect(() => RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Bad HTTP',
      category: 'FLOW',
      config: {
        trigger: 'MANUAL',
        steps: [{
          kind: 'SEND_HTTP_REQUEST',
          url: 'http://insecure.com/api',
          method: 'POST',
        }],
      },
    })).toThrow();
  });

  it('validates new trigger types', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Customer Flow',
      category: 'FLOW',
      config: {
        trigger: 'SHOPIFY_WEBHOOK_CUSTOMER_CREATED',
        steps: [{ kind: 'TAG_CUSTOMER', tag: 'new' }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });

  it('validates SuperApp trigger types', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Module Pub Flow',
      category: 'FLOW',
      config: {
        trigger: 'SUPERAPP_MODULE_PUBLISHED',
        steps: [{ kind: 'SEND_EMAIL_NOTIFICATION', to: 'admin@example.com', subject: 'Module published', body: '<p>Module was published</p>' }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });

  it('validates TAG_ORDER step', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Tag Order Flow',
      category: 'FLOW',
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [{ kind: 'TAG_ORDER', tags: 'high-value, priority' }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });

  it('validates CONDITION step', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Conditional Flow',
      category: 'FLOW',
      config: {
        trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
        steps: [{
          kind: 'CONDITION',
          field: 'order.total_price',
          operator: 'greater_than',
          value: '100',
        }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });

  it('validates SEND_SLACK_MESSAGE step', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'flow.automation',
      name: 'Slack Flow',
      category: 'FLOW',
      config: {
        trigger: 'MANUAL',
        steps: [{ kind: 'SEND_SLACK_MESSAGE', channel: '#orders', text: 'New order!' }],
      },
    });
    expect(spec.type).toBe('flow.automation');
  });

  it('validates SEND_HTTP_REQUEST with all auth types', () => {
    const authCases = [
      { authType: 'none' as const },
      { authType: 'basic' as const, authConfig: { username: 'user', password: 'pass' } },
      { authType: 'bearer' as const, authConfig: { token: 'abc123' } },
      { authType: 'custom_header' as const, authConfig: { headerName: 'X-API-Key', headerValue: 'key123' } },
    ];
    for (const auth of authCases) {
      const spec = RecipeSpecSchema.parse({
        type: 'flow.automation',
        name: `HTTP ${auth.authType}`,
        category: 'FLOW',
        config: {
          trigger: 'MANUAL',
          steps: [{
            kind: 'SEND_HTTP_REQUEST',
            url: 'https://api.test.com/endpoint',
            method: 'GET',
            ...auth,
          }],
        },
      });
      expect(spec.type).toBe('flow.automation');
    }
  });
});
