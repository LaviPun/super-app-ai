import { describe, it, expect } from 'vitest';
import {
  getDefaultStorefrontStyle,
  normalizeStyle,
  compileStyleVars,
  compileStyleCss,
  compileOverlayPositionCss,
  sanitizeCustomCss,
  compileCustomCss,
} from '~/services/recipes/compiler/style-compiler';
import { compileThemeBanner } from '~/services/recipes/compiler/theme.banner';
import { compileThemePopup } from '~/services/recipes/compiler/theme.popup';
import { compileNotificationBar } from '~/services/recipes/compiler/theme.notificationBar';
import { compileProxyWidget } from '~/services/recipes/compiler/proxy.widget';
import type { RecipeSpec } from '@superapp/core';

// ---------------------------------------------------------------------------
// Defaults & normalise
// ---------------------------------------------------------------------------

describe('style-compiler – defaults & normalise', () => {
  it('getDefaultStorefrontStyle returns full default object', () => {
    const def = getDefaultStorefrontStyle();
    expect(def.colors.text).toBe('#111111');
    expect(def.layout.zIndex).toBe('sticky');
    expect(def.customCss).toBeUndefined();
  });

  it('normalizeStyle(undefined) returns defaults', () => {
    const s = normalizeStyle(undefined);
    expect(s.colors.background).toBe('#ffffff');
    expect(s.typography.size).toBe('MD');
  });

  it('normalizeStyle(partial) merges with defaults', () => {
    const s = normalizeStyle({ colors: { text: '#000' } } as any);
    expect(s.colors.text).toBe('#000');
    expect(s.colors.background).toBe('#ffffff');
  });

  it('normalizeStyle preserves customCss', () => {
    const s = normalizeStyle({ customCss: '.foo { color: red; }' } as any);
    expect(s.customCss).toBe('.foo { color: red; }');
  });
});

// ---------------------------------------------------------------------------
// compileStyleVars
// ---------------------------------------------------------------------------

describe('compileStyleVars', () => {
  it('outputs all --sa-* CSS custom properties', () => {
    const vars = compileStyleVars(undefined);
    expect(vars).toContain('--sa-text: #111111;');
    expect(vars).toContain('--sa-bg: #ffffff;');
    expect(vars).toContain('--sa-pad: 16px;');
    expect(vars).toContain('--sa-radius: 8px;');
    expect(vars).toContain('--sa-backdrop:');
    expect(vars).toContain('--sa-shadow: none;');
    expect(vars).toContain('--sa-border-width: 0;');
  });

  it('uses custom color overrides', () => {
    const vars = compileStyleVars({
      ...getDefaultStorefrontStyle(),
      colors: { ...getDefaultStorefrontStyle().colors, text: '#333333', background: '#f0f0f0' },
    });
    expect(vars).toContain('--sa-text: #333333;');
    expect(vars).toContain('--sa-bg: #f0f0f0;');
  });

  it('outputs button vars when set', () => {
    const vars = compileStyleVars({
      ...getDefaultStorefrontStyle(),
      colors: { ...getDefaultStorefrontStyle().colors, buttonBg: '#2563eb', buttonText: '#ffffff' },
    });
    expect(vars).toContain('--sa-btn-bg: #2563eb;');
    expect(vars).toContain('--sa-btn-text: #ffffff;');
  });

  it('outputs custom backdrop rgba when overlayBackdrop is set', () => {
    const vars = compileStyleVars({
      ...getDefaultStorefrontStyle(),
      colors: {
        ...getDefaultStorefrontStyle().colors,
        overlayBackdrop: '#ff0000',
        overlayBackdropOpacity: 0.5,
      },
    });
    expect(vars).toContain('--sa-backdrop: rgba(255,0,0,0.5);');
  });

  it('uses typography presets correctly', () => {
    const vars = compileStyleVars({
      ...getDefaultStorefrontStyle(),
      typography: { size: 'LG', weight: 'bold', lineHeight: 'relaxed', align: 'center' },
    });
    expect(vars).toContain('--sa-fs: 18px;');
    expect(vars).toContain('--sa-fw: 700;');
    expect(vars).toContain('--sa-lh: 1.75;');
  });
});

// ---------------------------------------------------------------------------
// compileStyleCss
// ---------------------------------------------------------------------------

describe('compileStyleCss', () => {
  it('outputs rules referencing var(--sa-*)', () => {
    const css = compileStyleCss(undefined, '.superapp-module');
    expect(css).toContain('.superapp-module');
    expect(css).toContain('color: var(--sa-text)');
    expect(css).toContain('background: var(--sa-bg)');
    expect(css).toContain('padding: var(--sa-pad)');
    expect(css).toContain('border-radius: var(--sa-radius)');
    expect(css).toContain('box-shadow: var(--sa-shadow)');
  });

  it('adds border rule when borderWidth is not none', () => {
    const css = compileStyleCss(
      { ...getDefaultStorefrontStyle(), shape: { radius: 'md', borderWidth: 'thin', shadow: 'none' } },
      '.superapp-module',
    );
    expect(css).toContain('border-width: var(--sa-border-width)');
    expect(css).toContain('border-style: solid');
  });

  it('omits border rule when borderWidth is none', () => {
    const css = compileStyleCss(undefined, '.superapp-module');
    expect(css).not.toContain('border-style');
  });
});

// ---------------------------------------------------------------------------
// compileOverlayPositionCss
// ---------------------------------------------------------------------------

describe('compileOverlayPositionCss', () => {
  it('outputs fixed overlay host with z-index and panel with offsets', () => {
    const css = compileOverlayPositionCss(undefined, '.superapp-popup', '.superapp-popup__panel');
    expect(css).toContain('.superapp-popup');
    expect(css).toContain('position: fixed');
    expect(css).toContain('inset: 0');
    expect(css).toMatch(/z-index: \d+/);
    expect(css).toContain('.superapp-popup__panel');
    expect(css).toContain('var(--sa-offset-x)');
    expect(css).toContain('var(--sa-offset-y)');
  });

  it('uses modal z-index (1100) when zIndex = modal', () => {
    const css = compileOverlayPositionCss(
      { ...getDefaultStorefrontStyle(), layout: { ...getDefaultStorefrontStyle().layout, zIndex: 'modal' } },
      '.host',
      '.panel',
    );
    expect(css).toContain('z-index: 1100');
  });
});

// ---------------------------------------------------------------------------
// sanitizeCustomCss
// ---------------------------------------------------------------------------

describe('sanitizeCustomCss', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeCustomCss('')).toBe('');
  });

  it('strips <script> tags', () => {
    expect(sanitizeCustomCss('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('removes @import', () => {
    expect(sanitizeCustomCss('@import url("evil.css");')).not.toContain('@import');
  });

  it('removes url()', () => {
    expect(sanitizeCustomCss('background: url(http://x.com/img.png)')).not.toContain('url(');
  });

  it('removes expression()', () => {
    expect(sanitizeCustomCss('width: expression(alert(1))')).not.toContain('expression(');
  });

  it('removes javascript:', () => {
    expect(sanitizeCustomCss('content: javascript:alert(1)')).not.toContain('javascript:');
  });

  it('preserves safe CSS', () => {
    const input = '.my-class { color: red; font-size: 14px; }';
    const out = sanitizeCustomCss(input);
    expect(out).toContain('color: red');
    expect(out).toContain('font-size: 14px');
  });

  it('truncates to 2000 chars', () => {
    const long = '.foo { color: red; } '.repeat(200);
    expect(sanitizeCustomCss(long).length).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// compileCustomCss
// ---------------------------------------------------------------------------

describe('compileCustomCss', () => {
  it('returns empty string when no customCss', () => {
    expect(compileCustomCss(undefined, '.root')).toBe('');
    expect(compileCustomCss(getDefaultStorefrontStyle(), '.root')).toBe('');
  });

  it('wraps plain declarations in root selector', () => {
    const s = { ...getDefaultStorefrontStyle(), customCss: 'letter-spacing: 0.05em;' };
    const css = compileCustomCss(s, '.superapp-banner');
    expect(css).toContain('.superapp-banner');
    expect(css).toContain('letter-spacing: 0.05em;');
  });

  it('prefixes nested selectors with root selector', () => {
    const s = { ...getDefaultStorefrontStyle(), customCss: '.inner { color: blue; }' };
    const css = compileCustomCss(s, '.superapp-banner');
    expect(css).toContain('.superapp-banner .inner');
  });

  it('sanitizes dangerous patterns before output', () => {
    const s = { ...getDefaultStorefrontStyle(), customCss: 'background: url(evil.png); color: red;' };
    const css = compileCustomCss(s, '.root');
    expect(css).not.toContain('url(');
    expect(css).toContain('color: red');
  });
});

// ---------------------------------------------------------------------------
// Theme compilers integration
// ---------------------------------------------------------------------------

const themeTarget = { kind: 'THEME' as const, themeId: 'theme-1', moduleId: 'test-module-1' };

describe('theme compilers — style integration', () => {
  it('theme.banner compiles with target and returns themeModulePayload', () => {
    const spec = {
      type: 'theme.banner',
      name: 'Test Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { heading: 'Hi', enableAnimation: false },
    } as RecipeSpec;
    const out = compileThemeBanner(spec as any, themeTarget);
    expect(out.ops.length).toBeGreaterThan(0);
    expect(out.ops.some((o) => o.kind === 'AUDIT')).toBe(true);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload?.type).toBe('theme.banner');
    expect(out.themeModulePayload?.config).toEqual(spec.config);
  });

  it('theme.banner compiles custom colors and style into payload', () => {
    const spec = {
      type: 'theme.banner',
      name: 'Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { heading: 'Hi', enableAnimation: false },
      style: {
        colors: { text: '#222222', background: '#eeeeee' },
        customCss: '.superapp-banner__heading { letter-spacing: 0.05em; }',
      },
    } as RecipeSpec;
    const out = compileThemeBanner(spec as any, themeTarget);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload?.style).toEqual(spec.style);
  });

  it('theme.banner custom CSS is passed through in payload', () => {
    const spec = {
      type: 'theme.banner',
      name: 'Banner',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { heading: 'Hi', enableAnimation: false },
      style: { customCss: '@import url("bad.css"); .foo { color: red; }' },
    } as RecipeSpec;
    const out = compileThemeBanner(spec as any, themeTarget);
    expect(out.themeModulePayload?.style?.customCss).toBe(spec.style?.customCss);
  });

  it('theme.popup compiles with target and returns themeModulePayload', () => {
    const spec = {
      type: 'theme.popup',
      name: 'Popup',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { title: 'Hi', trigger: 'ON_LOAD', frequency: 'ONCE_PER_DAY' },
    } as RecipeSpec;
    const out = compileThemePopup(spec as any, themeTarget);
    expect(out.ops.length).toBeGreaterThan(0);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload?.type).toBe('theme.popup');
  });

  it('theme.notificationBar compiles without style (defaults applied)', () => {
    const spec = {
      type: 'theme.notificationBar',
      name: 'Bar',
      category: 'STOREFRONT_UI',
      requires: ['THEME_ASSETS'],
      config: { message: 'Hello', dismissible: true },
    } as RecipeSpec;
    const out = compileNotificationBar(spec as any, themeTarget);
    expect(out.themeModulePayload).toBeDefined();
    expect(out.themeModulePayload?.type).toBe('theme.notificationBar');
    expect(out.themeModulePayload?.config).toEqual(spec.config);
  });
});

// ---------------------------------------------------------------------------
// proxy.widget with style
// ---------------------------------------------------------------------------

describe('proxy.widget — style integration', () => {
  it('compiles without style (defaults applied)', () => {
    const spec = {
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'widget-abc', title: 'Hello', mode: 'HTML' },
    } as RecipeSpec;
    const out = compileProxyWidget(spec as any);
    const metaOp = out.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET') as any;
    expect(metaOp).toBeDefined();
    const value = JSON.parse(metaOp.value);
    expect(value._styleCss).toContain('--sa-text');
  });

  it('compiles with custom colors', () => {
    const spec = {
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'widget-abc', title: 'Hello', mode: 'HTML' },
      style: { colors: { text: '#ff0000', background: '#000000' } },
    } as RecipeSpec;
    const out = compileProxyWidget(spec as any);
    const metaOp = out.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET') as any;
    const value = JSON.parse(metaOp.value);
    expect(value._styleCss).toContain('--sa-text: #ff0000;');
    expect(value._styleCss).toContain('--sa-bg: #000000;');
  });

  it('compiles customCss scoped to widget selector', () => {
    const spec = {
      type: 'proxy.widget',
      name: 'Widget',
      category: 'STOREFRONT_UI',
      requires: ['APP_PROXY'],
      config: { widgetId: 'widget-abc', title: 'Hello', mode: 'HTML' },
      style: { customCss: '.inner { font-style: italic; }' },
    } as RecipeSpec;
    const out = compileProxyWidget(spec as any);
    const value = JSON.parse((out.ops.find((o) => o.kind === 'SHOP_METAFIELD_SET') as any).value);
    expect(value._styleCss).toContain('.superapp-widget .inner');
  });
});
