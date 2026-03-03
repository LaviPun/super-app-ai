import type { RecipeSpec } from '@superapp/core';

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
      case 'proxy.widget':
        return { kind: 'HTML', html: this.proxyWidget(spec) };
      default:
        return { kind: 'JSON', json: { type: spec.type, name: spec.name, category: spec.category, config: spec.config } };
    }
  }

  private banner(spec: Extract<RecipeSpec, { type: 'theme.banner' }>): string {
    const c = spec.config;
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
      .superapp-banner { padding: 24px 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .superapp-banner__inner { display:flex; gap: 16px; align-items:center; }
      .superapp-banner__content { max-width: 720px; }
      .superapp-banner__heading { margin: 0 0 8px; font-size: 28px; line-height: 1.2; }
      .superapp-banner__subheading { margin: 0 0 12px; opacity: 0.85; }
      .superapp-banner__cta { display:inline-block; padding: 10px 14px; border: 1px solid currentColor; text-decoration:none; border-radius: 10px; }
      .superapp-banner__image { max-width: 420px; height: auto; border-radius: 14px; background:#f2f2f2; }
      @media (max-width: 900px) { .superapp-banner__inner { flex-direction: column; align-items:flex-start; } .superapp-banner__image{ max-width:100%; } }
    `);
  }

  private notificationBar(spec: Extract<RecipeSpec, { type: 'theme.notificationBar' }>): string {
    const c = spec.config;
    return pageHtml(`
      <div class="superapp-note">
        <div class="superapp-note__inner">
          <span class="superapp-note__msg">${esc(c.message)}</span>
          ${c.linkText && c.linkUrl ? `<a class="superapp-note__link" href="${escAttr(c.linkUrl)}">${esc(c.linkText)}</a>` : ''}
          ${c.dismissible ? `<button class="superapp-note__close" type="button" aria-label="Dismiss" onclick="this.closest('.superapp-note').remove()">×</button>` : ''}
        </div>
      </div>
    `, `
      .superapp-note { position: sticky; top: 0; z-index: 30; background: #111; color: #fff; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .superapp-note__inner { display:flex; gap: 10px; align-items:center; justify-content:center; padding: 10px 12px; }
      .superapp-note__link { color: #fff; text-decoration: underline; }
      .superapp-note__close { margin-left: 8px; border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
    `);
  }

  private popup(spec: Extract<RecipeSpec, { type: 'theme.popup' }>): string {
    const c = spec.config;
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
      .superapp-popup[hidden]{ display:none; }
      .superapp-popup { position: fixed; inset: 0; z-index: 1000; }
      .superapp-popup__backdrop { position:absolute; inset:0; background: rgba(0,0,0,0.45); }
      .superapp-popup__panel { position: relative; max-width: 520px; margin: 10vh auto; background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 18px 70px rgba(0,0,0,0.25); }
      .superapp-popup__close { position:absolute; top: 8px; right: 10px; border:0; background:transparent; font-size: 22px; cursor:pointer; }
      .superapp-popup__title { margin: 0 0 10px; font-size: 20px; }
      .superapp-popup__body { margin: 0 0 12px; opacity: .85; }
      .superapp-popup__cta { display:inline-block; padding: 10px 14px; border: 1px solid currentColor; text-decoration:none; border-radius: 10px; }
    `);
  }

  private proxyWidget(spec: Extract<RecipeSpec, { type: 'proxy.widget' }>): string {
    const c = spec.config;
    return pageHtml(`
      <div class="superapp-widget">
        <strong>${esc(c.title)}</strong>
        ${c.message ? `<div>${esc(c.message)}</div>` : ''}
      </div>
    `, `
      .superapp-widget { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 12px; border: 1px solid #e5e5e5; border-radius: 12px; max-width: 520px; }
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
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escAttr(input: string) {
  return esc(input);
}
