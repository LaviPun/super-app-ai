import { describe, it, expect } from 'vitest';
import { StorefrontStyleSchema } from '../storefront-style.js';
import { RecipeSpecSchema } from '../recipe.js';

describe('StorefrontStyleSchema', () => {
  it('accepts empty object and fills defaults', () => {
    const style = StorefrontStyleSchema.parse({});
    expect(style.layout.mode).toBe('inline');
    expect(style.colors.text).toBe('#111111');
    expect(style.colors.background).toBe('#ffffff');
    expect(style.typography.size).toBe('MD');
    expect(style.spacing.padding).toBe('medium');
    expect(style.shape.radius).toBe('md');
    expect(style.responsive.hideOnMobile).toBe(false);
    expect(style.customCss).toBeUndefined();
  });

  it('accepts valid hex colors', () => {
    const style = StorefrontStyleSchema.parse({
      colors: { text: '#000000', background: '#ffffff', buttonBg: '#2563eb' },
    });
    expect(style.colors.text).toBe('#000000');
    expect(style.colors.buttonBg).toBe('#2563eb');
  });

  it('rejects invalid hex colors', () => {
    expect(() =>
      StorefrontStyleSchema.parse({ colors: { text: 'red' } })
    ).toThrow();
    expect(() =>
      StorefrontStyleSchema.parse({ colors: { text: '#gggggg' } })
    ).toThrow();
  });

  it('accepts valid layout and typography enums', () => {
    const style = StorefrontStyleSchema.parse({
      layout: { mode: 'overlay', anchor: 'bottom', zIndex: 'modal' },
      typography: { size: '2XL', weight: 'bold', align: 'center' },
    });
    expect(style.layout.mode).toBe('overlay');
    expect(style.layout.anchor).toBe('bottom');
    expect(style.layout.zIndex).toBe('modal');
    expect(style.typography.size).toBe('2XL');
    expect(style.typography.weight).toBe('bold');
    expect(style.typography.align).toBe('center');
  });

  it('clamps offsetX and offsetY to safe range', () => {
    expect(() =>
      StorefrontStyleSchema.parse({ layout: { offsetX: 200 } })
    ).toThrow();
    const style = StorefrontStyleSchema.parse({ layout: { offsetX: 0, offsetY: 10 } });
    expect(style.layout.offsetX).toBe(0);
    expect(style.layout.offsetY).toBe(10);
  });

  it('accepts customCss as an optional string under 2000 chars', () => {
    const style = StorefrontStyleSchema.parse({ customCss: '.sa-title { color: red; }' });
    expect(style.customCss).toBe('.sa-title { color: red; }');
  });

  it('rejects customCss over 2000 chars', () => {
    const long = 'a'.repeat(2001);
    expect(() => StorefrontStyleSchema.parse({ customCss: long })).toThrow();
  });

  it('customCss 2000 chars is at the limit', () => {
    const atLimit = 'a'.repeat(2000);
    const style = StorefrontStyleSchema.parse({ customCss: atLimit });
    expect(style.customCss?.length).toBe(2000);
  });

  it('accepts all advanced spacing/shape/accessibility fields', () => {
    const style = StorefrontStyleSchema.parse({
      spacing: { padding: 'loose', margin: 'tight', gap: 'none' },
      shape: { radius: 'xl', borderWidth: 'thick', shadow: 'lg' },
      typography: { lineHeight: 'relaxed' },
      accessibility: { focusVisible: false, reducedMotion: false },
    });
    expect(style.spacing.margin).toBe('tight');
    expect(style.spacing.gap).toBe('none');
    expect(style.shape.borderWidth).toBe('thick');
    expect(style.shape.shadow).toBe('lg');
    expect(style.typography.lineHeight).toBe('relaxed');
    expect(style.accessibility.focusVisible).toBe(false);
  });
});

describe('RecipeSpec style field', () => {
  it('theme.banner accepts style with customCss', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'theme.banner',
      name: 'Banner',
      category: 'STOREFRONT_UI',
      config: { heading: 'Hi', enableAnimation: false },
      style: { customCss: '.superapp-banner__heading { letter-spacing: 0.1em; }' },
    });
    expect((spec as any).style?.customCss).toBeDefined();
  });

  it('proxy.widget accepts style field', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      config: { widgetId: 'abc-123', title: 'Hello', mode: 'HTML' },
      style: { colors: { text: '#ff0000', background: '#ffffff' } },
    });
    expect((spec as any).style?.colors.text).toBe('#ff0000');
  });

  it('proxy.widget style is optional', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      config: { widgetId: 'abc-123', title: 'Hello', mode: 'HTML' },
    });
    expect((spec as any).style).toBeUndefined();
  });
});
