import type { RecipeSpec } from '@superapp/core';
import {
  compileStyleVars,
  compileStyleCss,
  compileOverlayPositionCss,
  normalizeStyle,
} from '~/services/recipes/compiler/style-compiler';

export type PreviewResult =
  | { kind: 'HTML'; html: string }
  | { kind: 'JSON'; json: unknown };

export class PreviewService {
  render(spec: RecipeSpec): PreviewResult {
    switch (spec.type) {
      case 'theme.banner':
        return { kind: 'HTML', html: this.banner(spec) };
      case 'theme.popup':
        return { kind: 'HTML', html: this.popup(spec) };
      case 'theme.notificationBar':
        return { kind: 'HTML', html: this.notificationBar(spec) };
      case 'theme.contactForm':
        return { kind: 'HTML', html: this.contactForm(spec) };
      case 'theme.effect':
        return { kind: 'HTML', html: this.effect(spec) };
      case 'theme.floatingWidget':
        return { kind: 'HTML', html: this.floatingWidget(spec) };
      case 'proxy.widget':
        return { kind: 'HTML', html: this.proxyWidget(spec) };
      default:
        return { kind: 'JSON', json: { type: spec.type, name: spec.name, category: spec.category, config: spec.config } };
    }
  }

  private styleCss(spec: { style?: unknown }, rootSelector: string): string {
    const style = normalizeStyle(spec.style as any);
    const vars = compileStyleVars(style);
    const rules = compileStyleCss(style, rootSelector);
    const varsBlock = `${rootSelector}{ ${vars.split('\n').map((s) => s.trim()).join(' ')} }`;
    return `${varsBlock}\n${rules}`;
  }

  private banner(spec: Extract<RecipeSpec, { type: 'theme.banner' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-banner');
    return pageHtml(`
      <section class="superapp-banner">
        <div class="superapp-banner__inner">
          <div class="superapp-banner__content">
            <h2 class="superapp-banner__heading">${esc(c.heading)}</h2>
            ${c.subheading ? `<p class="superapp-banner__subheading">${esc(c.subheading)}</p>` : ''}
            ${c.ctaText && c.ctaUrl ? `<a class="superapp-banner__cta" href="${escAttr(c.ctaUrl)}">${esc(c.ctaText)}</a>` : ''}
          </div>
          ${c.imageUrl ? `<img class="superapp-banner__image" src="${escAttr(c.imageUrl)}" alt="" loading="lazy" width="800" height="400">` : ''}
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

  private notificationBar(spec: Extract<RecipeSpec, { type: 'theme.notificationBar' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-note');
    return pageHtml(`
      <div class="superapp-note">
        <div class="superapp-note__inner">
          <span class="superapp-note__msg">${esc(c.message)}</span>
          ${c.linkText && c.linkUrl ? `<a class="superapp-note__link" href="${escAttr(c.linkUrl)}">${esc(c.linkText)}</a>` : ''}
          ${c.dismissible ? `<button class="superapp-note__close" type="button" aria-label="Dismiss" onclick="this.closest('.superapp-note').remove()">×</button>` : ''}
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

  private popup(spec: Extract<RecipeSpec, { type: 'theme.popup' }>): string {
    const c = spec.config;
    const style = normalizeStyle((spec as any).style);
    const styleVars = compileStyleVars(style);
    const styleCss = compileStyleCss(style, '.superapp-popup__panel');
    const overlayCss = compileOverlayPositionCss(style, '.superapp-popup', '.superapp-popup__panel');
    return pageHtml(`
      <button class="demo-open" onclick="document.querySelector('.superapp-popup').hidden=false">Open popup preview</button>
      <div class="superapp-popup" hidden>
        <div class="superapp-popup__backdrop" onclick="document.querySelector('.superapp-popup').hidden=true"></div>
        <div class="superapp-popup__panel" role="dialog" aria-modal="true" aria-label="${escAttr(c.title)}">
          <button class="superapp-popup__close" type="button" onclick="document.querySelector('.superapp-popup').hidden=true" aria-label="Close">×</button>
          <h3 class="superapp-popup__title">${esc(c.title)}</h3>
          ${c.body ? `<p class="superapp-popup__body">${esc(c.body)}</p>` : ''}
          ${c.ctaText && c.ctaUrl ? `<a class="superapp-popup__cta" href="${escAttr(c.ctaUrl)}">${esc(c.ctaText)}</a>` : ''}
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

  private contactForm(spec: Extract<RecipeSpec, { type: 'theme.contactForm' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-contact-form');
    const required = (enabled: boolean, isRequired: boolean) => (enabled && isRequired ? 'required' : '');

    return pageHtml(`
      <section class="superapp-contact-form" aria-label="${escAttr(c.title)}">
        <h2 class="superapp-contact-form__title">${esc(c.title)}</h2>
        ${c.subtitle ? `<p class="superapp-contact-form__subtitle">${esc(c.subtitle)}</p>` : ''}

        <form class="superapp-contact-form__form" onsubmit="event.preventDefault(); document.querySelector('.superapp-contact-form__status').textContent='${escAttr(c.successMessage)}';">
          ${c.showName ? `<label>Name <input type="text" name="name" ${required(c.showName, c.nameRequired)} /></label>` : ''}
          ${c.showEmail ? `<label>Email <input type="email" name="email" ${required(c.showEmail, c.emailRequired)} /></label>` : ''}
          ${c.showPhone ? `<label>Phone <input type="tel" name="phone" ${required(c.showPhone, c.phoneRequired)} /></label>` : ''}
          ${c.showCompany ? `<label>Company <input type="text" name="company" ${required(c.showCompany, c.companyRequired)} /></label>` : ''}
          ${c.showOrderNumber ? `<label>Order number <input type="text" name="orderNumber" ${required(c.showOrderNumber, c.orderNumberRequired)} /></label>` : ''}
          ${c.showSubject ? `<label>Subject <input type="text" name="subject" ${required(c.showSubject, c.subjectRequired)} /></label>` : ''}
          ${c.showMessage ? `<label>Message <textarea name="message" rows="5" ${required(c.showMessage, c.messageRequired)}></textarea></label>` : ''}
          ${c.consentRequired ? `<label class="superapp-contact-form__consent"><input type="checkbox" required /> ${esc(c.consentLabel)}</label>` : ''}
          <button type="submit" class="superapp-contact-form__submit">${esc(c.submitLabel)}</button>
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

  private effect(spec: Extract<RecipeSpec, { type: 'theme.effect' }>): string {
    const c = spec.config;
    const effectKind = c.effectKind;
    const intensity = c.intensity ?? 'medium';
    const speed = c.speed ?? 'normal';
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

  private floatingWidget(spec: Extract<RecipeSpec, { type: 'theme.floatingWidget' }>): string {
    const c = spec.config;
    const anchor = c.anchor ?? 'bottom_right';
    const offsetX = c.offsetX ?? 24;
    const offsetY = c.offsetY ?? 24;

    const variantIcons: Record<string, string> = {
      whatsapp: '💬',
      chat: '💬',
      coupon: '🏷️',
      cart: '🛒',
      scroll_top: '↑',
      custom: '⭐',
    };
    const icon = variantIcons[c.variant ?? 'custom'] ?? '⭐';
    const label = c.label ?? '';

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
        <div class="preview-label">Floating widget · ${esc(anchor.replace(/_/g, ' '))} · ${esc(c.variant ?? 'custom')}</div>
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
