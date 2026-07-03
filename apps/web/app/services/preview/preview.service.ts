import type { RecipeSpec } from '@superapp/core';
import {
  compileStyleVars,
  compileStyleCss,
  compileOverlayPositionCss,
  normalizeStyle,
} from '~/services/recipes/compiler/style-compiler';
import {
  defaultSimulationInput,
  type PreviewSimulationInput,
  type PreviewSimulationResult,
} from '@superapp/platform-contracts';
import {
  isFunctionPreviewKind,
  simulateFunction,
} from '~/services/preview/function-simulation.server';

export type PreviewResult =
  | { kind: 'HTML'; html: string }
  | { kind: 'JSON'; json: unknown };

export type PreviewSurface =
  | 'generic'
  | 'product'
  | 'collection'
  | 'cart'
  | 'checkout'
  | 'postPurchase'
  | 'customer';

export type PreviewContext = {
  surface?: PreviewSurface;
  /** Fixture for Function simulation previews (cart/checkout). */
  simulation?: PreviewSimulationInput;
  /**
   * Live-theme fonts (from ThemeAnalyzer's StoreTypography). When provided, the
   * preview HTML is wrapped in a font scope so it inherits the merchant's theme
   * fonts — matching what the storefront renders (where modules inherit fonts by
   * cascade). Without it, previews use the app's default stack and can look
   * off-brand.
   */
  themeFonts?: { headingFont?: string; bodyFont?: string };
};

export class PreviewService {
  render(spec: RecipeSpec, context?: PreviewContext): PreviewResult {
    const surface = context?.surface ?? inferSurface(spec.type);
    let result: PreviewResult;
    switch (spec.type) {
      case 'theme.section':
        result = { kind: 'HTML', html: this.themeSection(spec) };
        break;
      case 'proxy.widget':
        result = { kind: 'HTML', html: this.proxyWidget(spec) };
        break;
      default:
        // WS4: every remaining type gets a real, interactive surface preview —
        // never the static diagram.
        result = { kind: 'HTML', html: this.interactiveSurfacePreview(spec, surface, context?.simulation) };
    }
    if (result.kind === 'HTML' && context?.themeFonts) {
      return { kind: 'HTML', html: wrapThemeFonts(result.html, context.themeFonts) };
    }
    return result;
  }

  private styleCss(spec: { style?: unknown }, rootSelector: string): string {
    const style = normalizeStyle(spec.style as any);
    const vars = compileStyleVars(style);
    const rules = compileStyleCss(style, rootSelector);
    const varsBlock = `${rootSelector}{ ${vars.split('\n').map((s) => s.trim()).join(' ')} }`;
    return `${varsBlock}\n${rules}`;
  }

  /**
   * Section dispatcher. Known `kind`s (migrated from the former named theme.*
   * types) get a rich renderer; any other kind falls back to the generic
   * renderer. This is how the collapse preserves per-kind fidelity while the
   * type stays open/unrestricted.
   */
  private themeSection(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    switch (spec.config.kind) {
      case 'notification-bar':
        return this.sectionNotificationBar(spec);
      case 'banner':
        return this.sectionBanner(spec);
      case 'popup':
        return this.sectionPopup(spec);
      case 'contactForm':
        return this.sectionContactForm(spec);
      case 'effect':
        return this.sectionEffect(spec);
      case 'floatingWidget':
        return this.sectionFloatingWidget(spec);
      default:
        return this.sectionGeneric(spec);
    }
  }

  /** Reads a config value, preferring config.fields then top-level config. */
  private cfg(spec: Extract<RecipeSpec, { type: 'theme.section' }>, key: string): unknown {
    const c = spec.config as Record<string, unknown>;
    const f = (c.fields ?? {}) as Record<string, unknown>;
    return f[key] ?? c[key];
  }

  /** Kind renderer: popup (overlay dialog). */
  private sectionPopup(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const title = String(this.cfg(spec, 'title') ?? '');
    const body = this.cfg(spec, 'body');
    const ctaText = this.cfg(spec, 'ctaText');
    const ctaUrl = this.cfg(spec, 'ctaUrl');
    const style = normalizeStyle((spec as { style?: unknown }).style as never);
    const styleVars = compileStyleVars(style);
    const styleCss = compileStyleCss(style, '.superapp-popup__panel');
    const overlayCss = compileOverlayPositionCss(style, '.superapp-popup', '.superapp-popup__panel');
    return pageHtml(`
      <button class="demo-open" onclick="document.querySelector('.superapp-popup').hidden=false">Open popup preview</button>
      <div class="superapp-popup" hidden>
        <div class="superapp-popup__backdrop" onclick="document.querySelector('.superapp-popup').hidden=true"></div>
        <div class="superapp-popup__panel" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
          <button class="superapp-popup__close" type="button" onclick="document.querySelector('.superapp-popup').hidden=true" aria-label="Close">×</button>
          <h3 class="superapp-popup__title">${esc(title)}</h3>
          ${body ? `<p class="superapp-popup__body">${esc(String(body))}</p>` : ''}
          ${ctaText && ctaUrl ? `<a class="superapp-popup__cta" href="${escAttr(String(ctaUrl))}">${esc(String(ctaText))}</a>` : ''}
        </div>
      </div>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .demo-open { padding: 10px 14px; border-radius: 10px; border: 1px solid #111; background: #fff; cursor:pointer; }
      .superapp-popup__panel { ${styleVars.split('\n').map(s => s.trim()).join(' ') } }
      ${overlayCss}
      .superapp-popup[hidden]{ display:none; }
      .superapp-popup__backdrop { position:absolute; inset:0; background: var(--sa-backdrop); }
      ${styleCss}
      .superapp-popup__close { position:absolute; top: 8px; right: 10px; border:0; background:transparent; font-size: 22px; cursor:pointer; }
      .superapp-popup__title { margin: 0 0 10px; font-size: 1.25em; font-weight: var(--sa-fw); }
      .superapp-popup__body { margin: 0 0 12px; opacity: .85; }
      .superapp-popup__cta { display:inline-block; padding: 10px 14px; border: 1px solid currentColor; text-decoration:none; border-radius: var(--sa-radius); background: var(--sa-btn-bg, transparent); color: var(--sa-btn-text, var(--sa-text)); }
    `);
  }

  /** Kind renderer: banner. Reads from config.fields, falling back to top-level config. */
  private sectionBanner(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const c = spec.config as Record<string, unknown>;
    const f = (c.fields ?? {}) as Record<string, unknown>;
    const pick = (k: string) => (f[k] ?? c[k]) as unknown;
    const heading = String(pick('heading') ?? c.title ?? '');
    const subheading = pick('subheading') ? String(pick('subheading')) : '';
    const ctaText = pick('ctaText') ? String(pick('ctaText')) : '';
    const ctaUrl = pick('ctaUrl') ? String(pick('ctaUrl')) : '';
    const imageUrl = pick('imageUrl') ? String(pick('imageUrl')) : '';
    const styleBlock = this.styleCss(spec, '.superapp-banner');
    return pageHtml(`
      <section class="superapp-banner">
        <div class="superapp-banner__inner">
          <div class="superapp-banner__content">
            <h2 class="superapp-banner__heading">${esc(heading)}</h2>
            ${subheading ? `<p class="superapp-banner__subheading">${esc(subheading)}</p>` : ''}
            ${ctaText && ctaUrl ? `<a class="superapp-banner__cta" href="${escAttr(ctaUrl)}">${esc(ctaText)}</a>` : ''}
          </div>
          ${imageUrl ? `<img class="superapp-banner__image" src="${escAttr(imageUrl)}" alt="" loading="lazy" width="800" height="400">` : ''}
        </div>
      </section>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-banner__inner { display:flex; gap: var(--sa-gap); align-items:center; }
      .superapp-banner__content { max-width: 720px; }
      .superapp-banner__heading { margin: 0 0 8px; font-size: 1.25em; line-height: var(--sa-lh); font-weight: var(--sa-fw); }
      .superapp-banner__subheading { margin: 0 0 12px; opacity: 0.85; }
      .superapp-banner__cta { display:inline-block; padding: 10px 14px; border: 1px solid currentColor; text-decoration:none; border-radius: var(--sa-radius); background: var(--sa-btn-bg, transparent); color: var(--sa-btn-text, var(--sa-text)); }
      .superapp-banner__image { max-width: 420px; height: auto; border-radius: var(--sa-radius); background:#f2f2f2; }
      @media (max-width: 900px) { .superapp-banner__inner { flex-direction: column; align-items:flex-start; } .superapp-banner__image{ max-width:100%; } }
    `);
  }

  /** Kind renderer: notification bar. Reads bar data from config.fields. */
  private sectionNotificationBar(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const f = (spec.config.fields ?? {}) as Record<string, unknown>;
    const message = String(f.message ?? spec.config.title ?? '');
    const linkText = f.linkText ? String(f.linkText) : '';
    const linkUrl = f.linkUrl ? String(f.linkUrl) : '';
    const dismissible = f.dismissible !== false;
    const styleBlock = this.styleCss(spec, '.superapp-note');
    return pageHtml(`
      <div class="superapp-note">
        <div class="superapp-note__inner">
          <span class="superapp-note__msg">${esc(message)}</span>
          ${linkText && linkUrl ? `<a class="superapp-note__link" href="${escAttr(linkUrl)}">${esc(linkText)}</a>` : ''}
          ${dismissible ? `<button class="superapp-note__close" type="button" aria-label="Dismiss" onclick="this.closest('.superapp-note').remove()">×</button>` : ''}
        </div>
      </div>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-note { position: sticky; top: 0; z-index: var(--sa-z); }
      .superapp-note__inner { display:flex; gap: var(--sa-gap); align-items:center; justify-content:center; }
      .superapp-note__link { color: var(--sa-text); text-decoration: underline; }
      .superapp-note__close { margin-left: 8px; border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
    `);
  }

  /**
   * Generic section renderer — works for ANY `kind`. Renders title/subtitle,
   * repeatable blocks, declared field values, and the sanitized custom-HTML
   * escape hatch. Scripts are stripped for the preview iframe (they run only on
   * the live storefront under the extension CSP).
   */
  private sectionGeneric(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-section');
    const blocks = (c.blocks ?? [])
      .map((b) => `<div class="superapp-section__block">${b.imageUrl ? `<img src="${escAttr(b.imageUrl)}" alt="" loading="lazy">` : ''}${b.text ? `<p>${esc(b.text)}</p>` : ''}${b.url && b.text ? '' : ''}</div>`)
      .join('');
    const fields = c.fields && typeof c.fields === 'object' ? (c.fields as Record<string, unknown>) : {};
    const fieldRows = Object.entries(fields)
      .map(([k, v]) => `<div class="superapp-section__field"><span>${esc(k)}</span><span>${esc(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span></div>`)
      .join('');
    const custom = c.advancedCustom?.customHtml ? sanitizePreviewHtml(c.advancedCustom.customHtml) : '';

    return pageHtml(`
      <section class="superapp-section superapp-section--${escAttr(c.kind)}">
        ${c.title ? `<h2 class="superapp-section__title">${esc(c.title)}</h2>` : ''}
        ${c.subtitle ? `<p class="superapp-section__sub">${esc(c.subtitle)}</p>` : ''}
        ${blocks ? `<div class="superapp-section__blocks">${blocks}</div>` : ''}
        ${custom ? `<div class="superapp-section__custom">${custom}</div>` : ''}
        ${fieldRows ? `<div class="superapp-section__fields">${fieldRows}</div>` : ''}
      </section>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-section__title { margin: 0 0 8px; font-size: 1.25em; font-weight: var(--sa-fw); }
      .superapp-section__sub { margin: 0 0 12px; opacity: 0.85; }
      .superapp-section__blocks { display: grid; gap: var(--sa-gap); grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
      .superapp-section__block img { max-width: 100%; height: auto; border-radius: var(--sa-radius); background: #f2f2f2; }
      .superapp-section__fields { margin-top: 12px; display: grid; gap: 4px; font-size: 0.85em; }
      .superapp-section__field { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px dashed #e2e8f0; padding: 2px 0; }
      .superapp-section__field span:first-child { color: #6B7280; }
    `);
  }

  /** Kind renderer: contactForm (lead-capture form). */
  private sectionContactForm(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const str = (key: string, fallback = ''): string => {
      const v = this.cfg(spec, key);
      return v == null ? fallback : String(v);
    };
    const bool = (key: string): boolean => this.cfg(spec, key) === true;
    const styleBlock = this.styleCss(spec, '.superapp-contact-form');
    const required = (enabled: boolean, isRequired: boolean) => (enabled && isRequired ? 'required' : '');

    const title = str('title');
    const subtitle = str('subtitle');
    return pageHtml(`
      <section class="superapp-contact-form" aria-label="${escAttr(title)}">
        <h2 class="superapp-contact-form__title">${esc(title)}</h2>
        ${subtitle ? `<p class="superapp-contact-form__subtitle">${esc(subtitle)}</p>` : ''}

        <form class="superapp-contact-form__form" onsubmit="event.preventDefault(); document.querySelector('.superapp-contact-form__status').textContent='${escAttr(str('successMessage'))}';">
          ${bool('showName') ? `<label>Name <input type="text" name="name" ${required(bool('showName'), bool('nameRequired'))} /></label>` : ''}
          ${bool('showEmail') ? `<label>Email <input type="email" name="email" ${required(bool('showEmail'), bool('emailRequired'))} /></label>` : ''}
          ${bool('showPhone') ? `<label>Phone <input type="tel" name="phone" ${required(bool('showPhone'), bool('phoneRequired'))} /></label>` : ''}
          ${bool('showCompany') ? `<label>Company <input type="text" name="company" ${required(bool('showCompany'), bool('companyRequired'))} /></label>` : ''}
          ${bool('showOrderNumber') ? `<label>Order number <input type="text" name="orderNumber" ${required(bool('showOrderNumber'), bool('orderNumberRequired'))} /></label>` : ''}
          ${bool('showSubject') ? `<label>Subject <input type="text" name="subject" ${required(bool('showSubject'), bool('subjectRequired'))} /></label>` : ''}
          ${bool('showMessage') ? `<label>Message <textarea name="message" rows="5" ${required(bool('showMessage'), bool('messageRequired'))}></textarea></label>` : ''}
          ${bool('consentRequired') ? `<label class="superapp-contact-form__consent"><input type="checkbox" required /> ${esc(str('consentLabel'))}</label>` : ''}
          <button type="submit" class="superapp-contact-form__submit">${esc(str('submitLabel'))}</button>
          <p class="superapp-contact-form__status" aria-live="polite"></p>
        </form>
      </section>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-contact-form { max-width: 680px; margin: 0 auto; }
      .superapp-contact-form__title { margin: 0 0 8px; }
      .superapp-contact-form__subtitle { margin: 0 0 14px; opacity: 0.85; }
      .superapp-contact-form__form { display: grid; gap: 10px; }
      .superapp-contact-form__form label { display: grid; gap: 6px; font-size: 14px; }
      .superapp-contact-form__form input,
      .superapp-contact-form__form textarea {
        width: 100%;
        border: 1px solid var(--sa-border, #d1d5db);
        border-radius: var(--sa-radius, 8px);
        padding: 10px 12px;
        font: inherit;
      }
      .superapp-contact-form__submit {
        justify-self: start;
        border-radius: var(--sa-radius, 8px);
        padding: 10px 14px;
        border: 1px solid currentColor;
        background: var(--sa-btn-bg, #111827);
        color: var(--sa-btn-text, #ffffff);
        cursor: pointer;
      }
      .superapp-contact-form__status { min-height: 20px; margin: 0; color: #065f46; }
      .superapp-contact-form__consent { display: flex !important; align-items: center; gap: 8px; }
      .superapp-contact-form__consent input { width: auto; }
    `);
  }

  /** Kind renderer: effect (full-viewport decoration overlay). */
  private sectionEffect(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const effectKind = String(this.cfg(spec, 'effectKind') ?? 'snowfall');
    const intensity = String(this.cfg(spec, 'intensity') ?? 'medium');
    const speed = String(this.cfg(spec, 'speed') ?? 'normal');
    const particleCount = intensity === 'low' ? 30 : intensity === 'high' ? 80 : 50;
    const durationSec = speed === 'slow' ? 12 : speed === 'fast' ? 6 : 9;

    let particlesHtml = '';
    for (let i = 1; i <= particleCount; i++) {
      particlesHtml += `<div class="superapp-effect__particle superapp-effect__particle--${esc(effectKind)}" style="--i: ${i}; --total: ${particleCount};"></div>\n`;
    }

    const fallAnimation =
      effectKind === 'snowfall'
        ? `@keyframes superapp-effect-fall {
  0% { transform: translateY(-10vh) translateX(0); opacity: 0.9; }
  100% { transform: translateY(100vh) translateX(5vw); opacity: 0.7; }
}`
        : `@keyframes superapp-effect-fall {
  0% { transform: translateY(-10vh) translateX(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) translateX(15vw) rotate(720deg); opacity: 0.8; }
}`;

    const particleCss =
      effectKind === 'snowfall'
        ? `width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 6px rgba(255,255,255,0.8);`
        : `width: 10px; height: 10px; border-radius: 2px; background: hsl(calc(var(--i) * 37), 80%, 60%);`;

    return pageHtml(`
      <div class="superapp-effect" role="presentation" aria-hidden="true">
        <div class="superapp-effect__overlay">
          ${particlesHtml}
        </div>
        <div class="superapp-effect__label">${esc(effectKind)} &middot; ${esc(intensity)} &middot; ${esc(speed)}</div>
      </div>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: ${effectKind === 'snowfall' ? '#1a2a3a' : '#222'}; min-height: 100vh; }
      .superapp-effect { position: fixed; inset: 0; pointer-events: none; z-index: 1000; overflow: hidden; }
      .superapp-effect__overlay { position: absolute; inset: 0; overflow: hidden; }
      .superapp-effect__particle {
        position: absolute;
        left: calc((var(--i) / var(--total)) * 100%);
        top: -20px;
        ${particleCss}
        animation: superapp-effect-fall ${durationSec}s linear infinite;
        animation-delay: calc(-1s * (var(--i) / var(--total)) * ${durationSec});
      }
      ${fallAnimation}
      .superapp-effect__label {
        position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
        padding: 8px 16px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 6px;
        font-size: 13px; text-transform: capitalize; pointer-events: none; z-index: 1001;
      }
      @media (prefers-reduced-motion: reduce) {
        .superapp-effect__particle { animation: none !important; opacity: 0.25; }
      }
    `);
  }

  /** Kind renderer: floatingWidget (corner-anchored floating button). */
  private sectionFloatingWidget(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const anchor = String(this.cfg(spec, 'anchor') ?? 'bottom_right');
    const offsetX = Number(this.cfg(spec, 'offsetX') ?? 24);
    const offsetY = Number(this.cfg(spec, 'offsetY') ?? 24);
    const variant = String(this.cfg(spec, 'variant') ?? 'custom');

    const variantIcons: Record<string, string> = {
      whatsapp: '💬',
      chat: '💬',
      coupon: '🏷️',
      cart: '🛒',
      scroll_top: '↑',
      custom: '⭐',
    };
    const icon = variantIcons[variant] ?? '⭐';
    const label = String(this.cfg(spec, 'label') ?? '');

    let posX = '';
    let posY = '';
    let extraTransform = '';
    switch (anchor) {
      case 'bottom_right': posX = `right: ${offsetX}px;`; posY = `bottom: ${offsetY}px;`; break;
      case 'bottom_left':  posX = `left: ${offsetX}px;`;  posY = `bottom: ${offsetY}px;`; break;
      case 'top_right':    posX = `right: ${offsetX}px;`; posY = `top: ${offsetY}px;`;    break;
      case 'top_left':     posX = `left: ${offsetX}px;`;  posY = `top: ${offsetY}px;`;    break;
      case 'bottom_center': posX = `left: 50%;`; posY = `bottom: ${offsetY}px;`; extraTransform = 'transform: translateX(-50%);'; break;
      default: posX = `right: ${offsetX}px;`; posY = `bottom: ${offsetY}px;`; break;
    }

    return pageHtml(`
      <div class="preview-stage">
        <div class="preview-label">Floating widget · ${esc(anchor.replace(/_/g, ' '))} · ${esc(variant)}</div>
        <div class="preview-products">
          <div class="preview-product"><span>Product A</span><span>$29</span></div>
          <div class="preview-product"><span>Product B</span><span>$49</span></div>
          <div class="preview-product"><span>Product C</span><span>$19</span></div>
        </div>
        <div class="superapp-fw" style="${posX} ${posY} ${extraTransform}">
          <span class="superapp-fw__icon">${icon}</span>
          ${label ? `<span class="superapp-fw__label">${esc(label)}</span>` : ''}
        </div>
      </div>
    `, `
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; }
      .preview-stage {
        position: relative;
        min-height: 320px;
        background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
        border-radius: 8px;
        overflow: hidden;
        padding: 56px 16px 16px;
      }
      .preview-label {
        position: absolute;
        top: 16px;
        left: 16px;
        font-size: 12px;
        color: #888;
        text-transform: capitalize;
      }
      .preview-products {
        display: grid;
        gap: 8px;
        max-width: 320px;
      }
      .preview-product {
        display: flex;
        justify-content: space-between;
        border: 1px solid #ddd;
        border-radius: 8px;
        background: #fff;
        padding: 10px 12px;
        font-size: 13px;
        color: #374151;
      }
      .superapp-fw {
        position: absolute;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #111;
        color: #fff;
        border-radius: 999px;
        padding: 14px 18px;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,0.22);
        font-size: 15px;
        white-space: nowrap;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .superapp-fw:hover { transform: scale(1.06); box-shadow: 0 8px 28px rgba(0,0,0,0.28); }
      .superapp-fw__icon { font-size: 22px; line-height: 1; }
      .superapp-fw__label { font-size: 14px; font-weight: 500; }
    `);
  }

  private proxyWidget(spec: Extract<RecipeSpec, { type: 'proxy.widget' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-widget');
    return pageHtml(`
      <div class="superapp-widget">
        <strong>${esc(c.title)}</strong>
        ${c.message ? `<div>${esc(c.message)}</div>` : ''}
      </div>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-widget strong{ display:block; margin-bottom: 6px; }
    `);
  }

  /**
   * WS4: interactive per-surface preview for every non-theme/proxy type. Drives
   * the render from the spec's compiled config (what deploys), evaluates logic
   * branches, and never falls back to the static diagram. CSP-bound + sandboxed.
   */
  private interactiveSurfacePreview(
    spec: RecipeSpec,
    surface: PreviewSurface,
    simulation?: PreviewSimulationInput,
  ): string {
    if (isFunctionPreviewKind(spec.type)) {
      const result = simulateFunction(spec as never, simulation ?? defaultSimulationInput());
      return this.functionSimulationPreview(spec, result);
    }
    switch (spec.type) {
      case 'checkout.upsell':
      case 'checkout.block':
        return this.checkoutSurfacePreview(spec);
      case 'postPurchase.offer':
        return this.postPurchaseSurfacePreview(spec);
      case 'admin.block':
      case 'admin.action':
      case 'platform.extensionBlueprint':
        return this.adminSurfacePreview(spec);
      case 'admin.discountUi':
        return this.discountUiSurfacePreview(spec);
      case 'customerAccount.blocks':
        return this.accountSurfacePreview(spec);
      case 'pos.extension':
        return this.posSurfacePreview(spec);
      case 'analytics.pixel':
        return this.pixelSurfacePreview(spec);
      case 'integration.httpSync':
      case 'flow.automation':
        return this.workflowSurfacePreview(spec, surface);
      default:
        // Unknown/novel type: still interactive (mock card), not the diagram.
        return this.workflowSurfacePreview(spec, surface);
    }
  }

  private cfgVal(spec: RecipeSpec, key: string): unknown {
    return (spec.config as Record<string, unknown>)?.[key];
  }

  private functionSimulationPreview(spec: RecipeSpec, result: PreviewSimulationResult): string {
    const rows = result.outcomes
      .map(
        (o) => `
        <div class="sim-row sim-${esc(o.effect)}">
          <div class="sim-row__label">${esc(o.label)}</div>
          <div class="sim-row__detail">${esc(o.detail)}</div>
          <span class="sim-badge">${esc(o.effect)}</span>
        </div>`,
      )
      .join('');
    const fallback = result.fallbackNote
      ? `<div class="sim-fallback">Non-Plus fallback: ${esc(result.fallbackNote)}</div>`
      : '';
    return pageHtml(
      `
      <section class="sim">
        <header class="sim__header">
          <h2>${esc(spec.name)} <span>${esc(spec.type)}</span></h2>
          <p>Deterministic Function simulation against a representative cart fixture.</p>
        </header>
        ${fallback}
        <div class="sim__list">${rows}</div>
      </section>`,
      `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f6f8fb; margin:0; }
      .sim__header h2 { margin:0; font-size:18px; color:#111827; }
      .sim__header h2 span { font-size:12px; color:#6b7280; margin-left:6px; }
      .sim__header p { margin:6px 0 12px; color:#475569; font-size:13px; }
      .sim__list { display:grid; gap:8px; }
      .sim-row { background:#fff; border:1px solid #dce3ec; border-left-width:4px; border-radius:8px; padding:10px 12px; position:relative; }
      .sim-row__label { font-weight:600; color:#111827; font-size:14px; }
      .sim-row__detail { color:#475569; font-size:13px; margin-top:2px; }
      .sim-badge { position:absolute; top:10px; right:12px; font:11px IBM Plex Mono, ui-monospace, monospace; text-transform:uppercase; color:#6b7280; }
      .sim-applied { border-left-color:#0E9F6E; }
      .sim-hidden, .sim-blocked { border-left-color:#DC2626; }
      .sim-renamed, .sim-reordered, .sim-bundled, .sim-routed, .sim-constrained { border-left-color:#2F80ED; }
      .sim-none { border-left-color:#D97706; }
      .sim-fallback { background:#FEF3C7; border:1px solid #F59E0B; color:#92400E; border-radius:8px; padding:8px 10px; font-size:13px; margin-bottom:10px; }
      `,
    );
  }

  private surfaceCard(title: string, badge: string, bodyHtml: string, css = ''): string {
    return pageHtml(
      `
      <section class="surf">
        <header class="surf__header"><h2>${esc(title)} <span>${esc(badge)}</span></h2></header>
        <div class="surf__body">${bodyHtml}</div>
      </section>`,
      `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f6f8fb; margin:0; }
      .surf__header h2 { margin:0 0 12px; font-size:18px; color:#111827; }
      .surf__header h2 span { font-size:12px; color:#6b7280; margin-left:6px; }
      .surf-panel { background:#fff; border:1px solid #dce3ec; border-radius:10px; padding:14px; }
      .surf-panel h3 { margin:0 0 8px; font-size:14px; color:#1F3A5F; }
      .surf-btn { display:inline-block; background:#1F3A5F; color:#fff; border:0; border-radius:8px; padding:9px 14px; font-size:14px; cursor:pointer; text-decoration:none; }
      .surf-muted { color:#6b7280; font-size:13px; }
      details.surf-state { margin-top:10px; border:1px solid #dce3ec; border-radius:8px; padding:8px 10px; background:#fff; }
      details.surf-state > summary { cursor:pointer; font-size:13px; color:#2F80ED; }
      ${css}
      `,
    );
  }

  private checkoutSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? this.cfgVal(spec, 'heading') ?? spec.name);
    const body = String(this.cfgVal(spec, 'body') ?? this.cfgVal(spec, 'message') ?? '');
    const cta = String(this.cfgVal(spec, 'ctaText') ?? this.cfgVal(spec, 'buttonLabel') ?? 'Add to order');
    return this.surfaceCard(spec.name, `${spec.type} · checkout UI`, `
      <div class="surf-panel co">
        <div class="co__order">
          <h3>Order summary</h3>
          <div class="co__line"><span>Travel Backpack</span><span>$120.00</span></div>
          <div class="co__line"><span>Packing Cube Set</span><span>$32.00</span></div>
          <div class="co__line co__total"><span>Subtotal</span><span>$152.00</span></div>
        </div>
        <div class="co__ext">
          <h3>${esc(title)}</h3>
          ${body ? `<p class="surf-muted">${esc(body)}</p>` : ''}
          <a class="surf-btn" href="#add">${esc(cta)}</a>
          <details class="surf-state"><summary>After "added" state</summary><p class="surf-muted">Line added to order; extension shows confirmation and updated subtotal.</p></details>
        </div>
      </div>
    `, `
      .co { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      .co__line { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; color:#334155; }
      .co__total { border-top:1px solid #dce3ec; margin-top:6px; padding-top:8px; font-weight:600; color:#111827; }
    `);
  }

  private postPurchaseSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? this.cfgVal(spec, 'heading') ?? spec.name);
    const offer = String(this.cfgVal(spec, 'offerText') ?? this.cfgVal(spec, 'body') ?? 'Add this one-time offer to your order.');
    return this.surfaceCard(spec.name, `${spec.type} · post-purchase`, `
      <div class="surf-panel">
        <h3>${esc(title)}</h3>
        <p class="surf-muted">Shown after payment, before the thank-you page.</p>
        <p>${esc(offer)}</p>
        <a class="surf-btn" href="#accept">Accept offer</a>
        <a class="surf-btn" href="#decline" style="background:#6B7280;margin-left:8px">Decline</a>
        <details class="surf-state"><summary>Accepted state</summary><p class="surf-muted">Offer charged to original payment; order updated without re-auth.</p></details>
      </div>
    `);
  }

  private adminSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? this.cfgVal(spec, 'heading') ?? spec.name);
    const action = String(this.cfgVal(spec, 'actionLabel') ?? this.cfgVal(spec, 'ctaText') ?? 'Run action');
    return this.surfaceCard(spec.name, `${spec.type} · admin (Polaris)`, `
      <div class="surf-panel">
        <h3>${esc(title)}</h3>
        <p class="surf-muted">Embedded admin block rendered with Polaris-like primitives.</p>
        <div class="adm__rows">
          <div class="adm__row"><span>Status</span><span class="adm__badge">Active</span></div>
          <div class="adm__row"><span>Last run</span><span>2 minutes ago</span></div>
        </div>
        <a class="surf-btn" href="#action">${esc(action)}</a>
        <details class="surf-state"><summary>After action</summary><p class="surf-muted">Action dispatched; admin toast confirms success and the row updates.</p></details>
      </div>
    `, `
      .adm__row { display:flex; justify-content:space-between; font-size:13px; padding:6px 0; border-bottom:1px solid #eef2f7; }
      .adm__badge { background:#E7F5EF; color:#0E9F6E; border-radius:9999px; padding:2px 10px; font-size:12px; }
    `);
  }

  /** Spring 2026 Discount UI Extension — an admin discount-config form (declarative). */
  private discountUiSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? spec.name);
    const cls = String(this.cfgVal(spec, 'discountClass') ?? 'product');
    const desc = String(this.cfgVal(spec, 'description') ?? '');
    const fn = String(this.cfgVal(spec, 'functionHandle') ?? '');
    const fieldsRaw = this.cfgVal(spec, 'fields');
    const fields = Array.isArray(fieldsRaw) ? (fieldsRaw as Array<Record<string, unknown>>) : [];
    const rows = fields
      .map((f) => {
        const label = esc(String(f?.label ?? f?.key ?? 'Field'));
        const kind = String(f?.kind ?? 'text');
        const control =
          kind === 'toggle'
            ? '<span class="dui__toggle"></span>'
            : kind === 'select'
              ? '<span class="dui__input">Select…</span>'
              : `<span class="dui__input">${kind === 'number' ? '0' : ''}</span>`;
        return `<div class="dui__field"><label>${label}</label>${control}</div>`;
      })
      .join('');
    return this.surfaceCard(spec.name, `${spec.type} · admin discount UI`, `
      <div class="surf-panel">
        <div class="dui__head"><h3>${esc(title)}</h3><span class="dui__cls">${esc(cls)} discount</span></div>
        ${desc ? `<p class="surf-muted">${esc(desc)}</p>` : ''}
        <div class="dui__form">${rows || '<p class="surf-muted">No fields configured yet.</p>'}</div>
        ${fn ? `<p class="surf-muted">Paired Function: <code>${esc(fn)}</code></p>` : ''}
        <a class="surf-btn" href="#save">Save discount</a>
        <details class="surf-state"><summary>Runtime</summary><p class="surf-muted">Needs the Shopify discount-details admin extension shipped before it can publish (needs_runtime).</p></details>
      </div>
    `, `
      .dui__head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .dui__cls { background:#EEF3FB; color:#1F3A5F; border-radius:9999px; padding:2px 10px; font-size:12px; text-transform:capitalize; }
      .dui__form { display:flex; flex-direction:column; gap:10px; margin:10px 0; }
      .dui__field { display:flex; flex-direction:column; gap:4px; }
      .dui__field label { font-size:12px; color:#6B7280; }
      .dui__input { border:1px solid #DCE3EC; border-radius:8px; padding:8px 10px; font-size:13px; background:#fff; color:#6B7280; }
      .dui__toggle { width:36px; height:20px; border-radius:9999px; background:#DCE3EC; }
    `);
  }

  private accountSurfacePreview(spec: RecipeSpec): string {
    const blocks = this.cfgVal(spec, 'blocks');
    const items = Array.isArray(blocks) ? (blocks as Array<Record<string, unknown>>) : [];
    const list = items.length
      ? items.map((b) => `<div class="surf-panel"><h3>${esc(String(b.title ?? b.kind ?? 'Block'))}</h3><p class="surf-muted">${esc(String(b.body ?? b.kind ?? ''))}</p></div>`).join('')
      : `<div class="surf-panel"><h3>${esc(String(this.cfgVal(spec, 'title') ?? spec.name))}</h3><p class="surf-muted">Customer account block populated from account context (orders, loyalty tier).</p></div>`;
    return this.surfaceCard(spec.name, `${spec.type} · customer account`, `<div class="acct">${list}</div>`, `
      .acct { display:grid; gap:12px; }
    `);
  }

  private posSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? spec.name);
    return this.surfaceCard(spec.name, `${spec.type} · POS`, `
      <div class="surf-panel pos">
        <h3>${esc(title)}</h3>
        <p class="surf-muted">Smart Grid tile / POS block as it appears to a store associate.</p>
        <a class="surf-btn" href="#tap">Tap tile</a>
        <details class="surf-state"><summary>Tapped state</summary><p class="surf-muted">POS opens the block modal with cart context.</p></details>
      </div>
    `);
  }

  private pixelSurfacePreview(spec: RecipeSpec): string {
    const events = this.cfgVal(spec, 'events');
    const evs = Array.isArray(events) ? (events as unknown[]).map(String) : ['page_viewed', 'product_viewed', 'checkout_completed'];
    return this.surfaceCard(spec.name, `${spec.type} · web pixel`, `
      <div class="surf-panel">
        <h3>Subscribed events</h3>
        <p class="surf-muted">A web pixel has no visible UI — this shows the events it captures and a sample payload.</p>
        <div class="px__events">${evs.map((e) => `<span class="px__chip">${esc(e)}</span>`).join('')}</div>
        <details class="surf-state" open><summary>Sample event payload</summary><pre>${esc(JSON.stringify({ event: evs[0] ?? 'page_viewed', timestamp: '2026-06-14T12:00:00Z', clientId: 'demo-client' }, null, 2))}</pre></details>
      </div>
    `, `
      .px__events { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
      .px__chip { background:#EAF1FB; color:#2F80ED; border-radius:9999px; padding:3px 10px; font-size:12px; }
      pre { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:12px; }
    `);
  }

  private workflowSurfacePreview(spec: RecipeSpec, surface: PreviewSurface): string {
    const steps = this.cfgVal(spec, 'steps');
    const stepList = Array.isArray(steps) ? (steps as Array<Record<string, unknown>>) : [];
    const rendered = stepList.length
      ? stepList.map((s, i) => `<div class="wf__step"><span class="wf__n">${i + 1}</span><div><strong>${esc(String(s.kind ?? s.type ?? 'step'))}</strong><div class="surf-muted">${esc(String(s.label ?? s.description ?? ''))}</div></div></div>`).join('')
      : ['Trigger fires', 'Conditions evaluated against fixture', 'Action dispatched'].map((t, i) => `<div class="wf__step"><span class="wf__n">${i + 1}</span><div><strong>${esc(t)}</strong></div></div>`).join('');
    return this.surfaceCard(spec.name, `${spec.type} · ${surface}`, `
      <div class="surf-panel">
        <h3>Workflow run (simulated)</h3>
        <div class="wf">${rendered}</div>
        <details class="surf-state"><summary>Run output</summary><pre>${esc(JSON.stringify({ status: 'completed', dispatched: true }, null, 2))}</pre></details>
      </div>
    `, `
      .wf { display:grid; gap:8px; }
      .wf__step { display:flex; gap:10px; align-items:flex-start; }
      .wf__n { background:#1F3A5F; color:#fff; border-radius:9999px; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center; font-size:12px; flex:0 0 auto; }
      pre { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:12px; }
    `);
  }

}

const LINK_INTERCEPT_SCRIPT = `
<script>
function ensureActionPanel() {
  var panel = document.getElementById('superapp-preview-actions');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'superapp-preview-actions';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '12px';
  panel.style.maxWidth = '420px';
  panel.style.maxHeight = '38vh';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(17,24,39,0.92)';
  panel.style.color = '#fff';
  panel.style.padding = '10px 12px';
  panel.style.borderRadius = '10px';
  panel.style.font = '12px/1.4 ui-monospace, Menlo, Consolas, monospace';
  panel.style.zIndex = '2147483647';
  panel.style.boxShadow = '0 4px 14px rgba(0,0,0,.35)';
  panel.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Preview action log</div>';
  document.body.appendChild(panel);
  return panel;
}

function logAction(message) {
  var panel = ensureActionPanel();
  var line = document.createElement('div');
  line.textContent = new Date().toLocaleTimeString() + ' - ' + message;
  line.style.whiteSpace = 'pre-wrap';
  line.style.wordBreak = 'break-word';
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function showInlineState(title, subtitle) {
  var existing = document.getElementById('superapp-preview-state');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'superapp-preview-state';
    existing.style.position = 'fixed';
    existing.style.left = '12px';
    existing.style.bottom = '12px';
    existing.style.background = '#fff';
    existing.style.color = '#111827';
    existing.style.border = '1px solid #e5e7eb';
    existing.style.borderRadius = '8px';
    existing.style.padding = '10px 12px';
    existing.style.font = '13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif';
    existing.style.zIndex = '2147483647';
    existing.style.boxShadow = '0 4px 14px rgba(0,0,0,.12)';
    document.body.appendChild(existing);
  }
  existing.innerHTML = '<strong>' + title + '</strong><div style="margin-top:4px;color:#6b7280">' + subtitle + '</div>';
}

document.addEventListener('click', function(e) {
  var anchor = e.target && e.target.closest('a');
  if (!anchor) return;
  e.preventDefault();
  var href = anchor.getAttribute('href') || anchor.href || '';
  logAction('CTA click -> ' + href);
  showInlineState('CTA clicked', href || 'No destination');
  window.parent.postMessage({
    type: 'preview-link-click',
    href: href,
    target: anchor.getAttribute('target') || '_self',
    text: (anchor.textContent || '').trim().slice(0, 80)
  }, '*');
}, true);

document.addEventListener('submit', function(e) {
  var form = e.target;
  if (!form || !(form instanceof HTMLFormElement)) return;
  e.preventDefault();
  var formData = new FormData(form);
  var summary = [];
  formData.forEach(function(value, key) {
    summary.push(key + '=' + String(value).slice(0, 60));
  });
  logAction('Form submit -> ' + (summary.join(', ') || '[no fields]'));
  showInlineState('Form submitted', 'Simulated submit in preview sandbox');
}, true);

document.addEventListener('change', function(e) {
  var input = e.target;
  if (!input || !(input instanceof HTMLInputElement)) return;
  if (input.type === 'file') {
    var count = (input.files && input.files.length) || 0;
    logAction('File input changed -> ' + count + ' file(s) selected');
    showInlineState('Upload simulated', count + ' file(s) selected in preview');
  }
}, true);
</script>`;

function pageHtml(body: string, css: string) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Preview</title>
        <style>${css}</style>
      </head>
      <body>
        <div style="padding:16px">${body}</div>
        ${LINK_INTERCEPT_SCRIPT}
      </body>
    </html>
  `.trim();
}

/**
 * Strip executable vectors from merchant/AI custom HTML for the preview iframe.
 * (The live storefront runs custom JS under the extension's own CSP; the preview
 * is HTML/CSS only.) Removes <script>/<iframe>/<object>, on* handlers, and
 * javascript: URLs. Not a full sanitizer — the preview is sandboxed + CSP-bound.
 */
function sanitizePreviewHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"')
    .slice(0, 20_000);
}

function esc(input: string) {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = input.charCodeAt(i);
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&#039;';
    else if (code > 127) out += `&#${code};`;
    else out += ch;
  }
  return out;
}

function escAttr(input: string) {
  return esc(input);
}

function inferSurface(type: string): PreviewSurface {
  if (type.startsWith('checkout.')) return 'checkout';
  if (type.startsWith('postPurchase.')) return 'postPurchase';
  if (type === 'customerAccount.blocks') return 'customer';
  if (type.startsWith('functions.')) return 'cart';
  if (type === 'flow.automation') return 'checkout';
  if (type === 'analytics.pixel') return 'product';
  return 'generic';
}

/** System fallback stack appended after any theme font so previews never go blank. */
const PREVIEW_FALLBACK_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Sanitize an extracted font family for safe use in a CSS value + a Google Fonts
 * URL. Allows letters/numbers/spaces only (the family name), so a malformed or
 * malicious value can't break out of the `font-family` declaration or the URL.
 */
function sanitizeFamily(name?: string): string | undefined {
  if (!name) return undefined;
  const clean = name.replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length ? clean : undefined;
}

/**
 * Wrap preview HTML in a font scope so it inherits the merchant's live-theme
 * fonts. The inner renderers never set `font-family`, so a scope on the wrapper
 * cascades cleanly; headings get the heading font, everything else the body
 * font. A best-effort Google Fonts link loads the families when available; if a
 * family isn't on Google Fonts (e.g. a proprietary Shopify font), the name still
 * applies and falls back to the system stack.
 */
export function wrapThemeFonts(
  html: string,
  fonts: { headingFont?: string; bodyFont?: string },
): string {
  const heading = sanitizeFamily(fonts.headingFont);
  const body = sanitizeFamily(fonts.bodyFont);
  if (!heading && !body) return html;

  const bodyDecl = body ? `'${body}', ${PREVIEW_FALLBACK_STACK}` : PREVIEW_FALLBACK_STACK;
  const headDecl = [heading, body]
    .filter(Boolean)
    .map((f) => `'${f}'`)
    .concat(PREVIEW_FALLBACK_STACK)
    .join(', ');

  const families = [...new Set([heading, body].filter((f): f is string => !!f))];
  const link = families.length
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families
        .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
        .join('&')}&display=swap">`
    : '';

  const style = `<style>
  .superapp-preview-fontscope { font-family: ${bodyDecl}; }
  .superapp-preview-fontscope :is(h1,h2,h3,h4,h5,h6) { font-family: ${headDecl}; }
</style>`;

  return `${link}${style}<div class="superapp-preview-fontscope" data-theme-fonts>${html}</div>`;
}

