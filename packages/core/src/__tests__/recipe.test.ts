import { describe, it, expect } from 'vitest';
import { RecipeSpecSchema } from '../recipe.js';

describe('RecipeSpecSchema', () => {
  it('validates a theme.section banner recipe', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Homepage Banner',
      category: 'STOREFRONT_UI',
      config: { kind: 'banner', fields: { heading: 'Hello', enableAnimation: false } }
    });
    expect(spec.type).toBe('theme.section');
  });

  it('validates a generic theme.section with free-form kind, fields, blocks, and escape hatch', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'FAQ Accordion',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'faq', // arbitrary recommendation tag, not an enum
        activation: 'section',
        title: 'Frequently asked questions',
        fieldSchema: { fields: [{ name: 'introText', type: 'text' }] },
        fields: { introText: 'Answers to common questions.' },
        blocks: [
          { kind: 'qa', text: 'Do you ship internationally? Yes.' },
          { kind: 'qa', text: 'What is your return policy? 30 days.' },
        ],
        advancedCustom: { customHtml: '<details><summary>More</summary><p>Details</p></details>' },
      },
      placement: { enabled_on: { templates: ['page'] } },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.kind).toBe('faq');
      expect(spec.config.blocks).toHaveLength(2);
      expect(spec.config.fieldSchema?.fields[0]?.name).toBe('introText');
    }
  });

  it('accepts an arbitrary, never-before-seen section kind (no enum restriction)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Constellation Map',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'interactive-constellation-map', activation: 'global' },
    });
    expect(spec.type === 'theme.section' && spec.config.kind).toBe('interactive-constellation-map');
  });

  it('persists v2 advanced popup packs (audience, schedule, advancedCustom)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Advanced Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'popup',
        title: 'VIP offer',
        trigger: 'ON_EXIT_INTENT',
        audience: { visitor: 'returning', loggedInOnly: true, customerTags: ['VIP'] },
        schedule: { daysOfWeek: ['fri', 'sat'], dayStartHour: 18, dayEndHour: 23 },
        advancedCustom: { customHtml: '<div>hi</div>' },
      },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.audience?.visitor).toBe('returning');
      expect(spec.config.schedule?.daysOfWeek).toEqual(['fri', 'sat']);
      expect(spec.config.advancedCustom?.customHtml).toBe('<div>hi</div>');
    }
  });

  it('R2.5 — pins the layout archetype pack on theme.section.config', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Featured collection grid',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'lookbook', layout: { layout: 'grid', columns: 3 } },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.layout?.layout).toBe('grid');
      expect(spec.config.layout?.columns).toBe(3);
    }
  });

  it('R2.5 back-compat — a theme.section with NO layout still validates (optional pin)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Plain section',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'custom' },
    });
    expect(spec.type === 'theme.section' && spec.config.layout).toBeUndefined();
  });

  it('R2.5 union looseness — a cross-type value (masonry) parses via the loose z.string()', () => {
    // The recipe union keeps `layout.layout` a loose string so cross-type recipes
    // coexist; the tight per-type enum is enforced at generation, not here.
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Masonry gallery',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'gallery', layout: { layout: 'masonry' } },
    });
    expect(spec.type === 'theme.section' && spec.config.layout?.layout).toBe('masonry');
  });

  it('R2.1 — pins the rule-engine pack on theme.section.config', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Returning-customer upsell',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'banner',
        ruleEngine: {
          enabled: true,
          logic: 'AND',
          matchAction: 'SHOW',
          groups: [
            {
              logic: 'AND',
              conditions: [
                { object: 'customer', attribute: 'ordersCount', operator: 'greater_than_or_equal', value: 1 },
              ],
            },
          ],
        },
      },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.ruleEngine?.enabled).toBe(true);
      expect(spec.config.ruleEngine?.groups[0]?.conditions[0]?.attribute).toBe('ordersCount');
    }
  });

  it('R2.1 back-compat — a theme.section with NO ruleEngine still validates (optional pin)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Plain banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'banner' },
    });
    expect(spec.type === 'theme.section' && spec.config.ruleEngine).toBeUndefined();
  });

  it('R2.1 — pins the rule-engine pack on proxy.widget.config too', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Gated widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: {
        widgetId: 'gated-widget',
        title: 'Members only',
        ruleEngine: {
          enabled: true,
          groups: [
            { logic: 'AND', conditions: [{ object: 'customer', attribute: 'loggedIn', operator: 'equal_to', value: true }] },
          ],
        },
      },
    });
    expect(spec.type === 'proxy.widget' && spec.config.ruleEngine?.enabled).toBe(true);
  });

  it('R2.1 — rejects an unknown (object, attribute) pair inside a pinned rule', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'theme.section',
      name: 'Bad rule',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'banner',
        ruleEngine: {
          enabled: true,
          groups: [{ logic: 'AND', conditions: [{ object: 'product', attribute: 'zzz', operator: 'equal_to', value: 'x' }] }],
        },
      },
    });
    expect(r.success).toBe(false);
  });

  it('R2.3 — pins the recommendation pack on theme.section.config', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Frequently bought together',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'product-recommendations',
        recommendation: {
          strategy: 'complementary',
          productLimit: 3,
          hideCartProducts: true,
          excludeTags: ['hidden-upsell'],
          fallback: 'related',
        },
      },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.recommendation?.strategy).toBe('complementary');
      expect(spec.config.recommendation?.productLimit).toBe(3);
    }
  });

  it('R2.3 back-compat — a theme.section with NO recommendation still validates (optional pin)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Plain section',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'custom' },
    });
    expect(spec.type === 'theme.section' && spec.config.recommendation).toBeUndefined();
  });

  it('R2.3 back-compat — checkout.upsell with ONLY the legacy productVariantGid parses', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'checkout.upsell',
      name: 'Order bump',
      category: 'STOREFRONT_UI',
      config: { offerTitle: 'Add a warranty', productVariantGid: 'gid://shopify/ProductVariant/999' },
    });
    expect(spec.type === 'checkout.upsell' && spec.config.recommendation).toBeUndefined();
  });

  it('R2.3 — checkout.upsell with BOTH productVariantGid and recommendation parses', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'checkout.upsell',
      name: 'Smart upsell',
      category: 'STOREFRONT_UI',
      config: {
        offerTitle: 'You may also like',
        productVariantGid: 'gid://shopify/ProductVariant/999',
        recommendation: { strategy: 'related', productLimit: 2, fallback: 'related' },
      },
    });
    expect(spec.type === 'checkout.upsell' && spec.config.recommendation?.strategy).toBe('related');
  });

  it('R2.3 — postPurchase.offer accepts the recommendation pin', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'postPurchase.offer',
      name: 'Post-purchase reorder',
      category: 'STOREFRONT_UI',
      config: {
        offerTitle: 'Reorder your favorites',
        recommendation: { strategy: 'buy-it-again', fallback: 'related' },
      },
    });
    expect(spec.type === 'postPurchase.offer' && spec.config.recommendation?.strategy).toBe('buy-it-again');
  });

  it('R2.3 — rejects a manual recommendation with an empty variant list (superRefine)', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'theme.section',
      name: 'Bad manual recs',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'product-recommendations', recommendation: { strategy: 'manual' } },
    });
    expect(r.success).toBe(false);
  });

  it('validates a theme.section effect recipe', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Winter Snowfall',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { kind: 'effect', activation: 'overlay', effectKind: 'snowfall', intensity: 'medium', speed: 'normal' },
      style: { accessibility: { reducedMotion: true } },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.kind).toBe('effect');
      expect(spec.config.effectKind).toBe('snowfall');
      expect(spec.config.intensity).toBe('medium');
      expect(spec.config.speed).toBe('normal');
    }
  });

  it('validates a theme.section contactForm recipe', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Contact Us',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: {
        kind: 'contactForm',
        activation: 'section',
        title: 'Get in touch',
        submitLabel: 'Send message',
        successMessage: 'Thanks! We received your message.',
        errorMessage: 'Please try again.',
        submissionMode: 'SHOPIFY_CONTACT',
      },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.kind).toBe('contactForm');
      expect(spec.config.submissionMode).toBe('SHOPIFY_CONTACT');
    }
  });

  it('theme.section effect kind preserves effectKind via the open config', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Holiday Confetti',
      category: 'STOREFRONT_UI',
      config: { kind: 'effect', activation: 'overlay', effectKind: 'confetti' },
    });
    expect(spec.type).toBe('theme.section');
    if (spec.type === 'theme.section') {
      expect(spec.config.kind).toBe('effect');
      expect(spec.config.effectKind).toBe('confetti');
    }
  });

  it('accepts an arbitrary effect kind (no enum restriction after collapse)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.section',
      name: 'Custom Rain',
      category: 'STOREFRONT_UI',
      config: { kind: 'effect', activation: 'overlay', effectKind: 'rain' },
    });
    expect(spec.type === 'theme.section' && spec.config.effectKind).toBe('rain');
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

  // R3.3 — the additive `dataModel` on Base (shared by every variant).
  it('R3.3 — a Base-derived variant parses with a valid dataModel', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Product Reviews',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'product-reviews', title: 'Reviews' },
      dataModel: {
        label: 'Product Reviews',
        description: 'Customer-submitted product reviews.',
        schema: {
          fields: [
            { name: 'productId', type: 'text', required: true },
            { name: 'rating', type: 'number', required: true },
            { name: 'status', type: 'select', required: true, options: ['pending', 'approved', 'rejected'] },
          ],
        },
      },
    });
    expect(spec.dataModel?.label).toBe('Product Reviews');
    expect(spec.dataModel?.schema.fields.map((f) => f.name)).toEqual(['productId', 'rating', 'status']);
  });

  it('R3.3 back-compat — a spec with dataModel OMITTED still validates (optional field)', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Plain widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'plain-widget', title: 'Plain' },
    });
    expect(spec.dataModel).toBeUndefined();
  });

  it('R3.3 — rejects a dataModel field name violating the DataField name regex', () => {
    const r = RecipeSpecSchema.safeParse({
      type: 'proxy.widget',
      name: 'Bad field name',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'bad-widget', title: 'Bad' },
      dataModel: { label: 'Bad', schema: { fields: [{ name: '1nvalid', type: 'text' }] } },
    });
    expect(r.success).toBe(false);
  });

  it('R3.3 — JSON round-trip through parse preserves dataModel (no strip)', () => {
    const input = {
      type: 'theme.section' as const,
      name: 'Reviews section',
      category: 'STOREFRONT_UI' as const,
      requires: ['THEME_ASSETS' as const],
      config: { kind: 'custom' },
      dataModel: { label: 'Reviews', schema: { fields: [{ name: 'rating', type: 'number' as const }] } },
    };
    const spec = RecipeSpecSchema.parse(JSON.parse(JSON.stringify(input)));
    expect(spec.dataModel?.schema.fields[0]?.name).toBe('rating');
  });
});
