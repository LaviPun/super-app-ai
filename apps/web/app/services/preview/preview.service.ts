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
      case 'theme.effect':
        return { kind: 'HTML', html: this.effect(spec) };
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

  private effect(spec: Extract<RecipeSpec, { type: 'theme.effect' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-effect');
    return pageHtml(`
      <div class="superapp-effect" role="presentation" aria-hidden="true">
        <div class="superapp-effect__preview">Effect: ${esc(c.effectKind)} (${c.intensity ?? 'medium'}, ${c.speed ?? 'normal'})</div>
      </div>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .superapp-effect { position: fixed; inset: 0; pointer-events: none; z-index: var(--sa-z, 1000); display: flex; align-items: center; justify-content: center; }
      .superapp-effect__preview { padding: 12px 20px; background: rgba(0,0,0,0.6); color: #fff; border-radius: 8px; font-size: 14px; }
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
