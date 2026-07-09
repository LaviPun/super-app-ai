import fs from 'node:fs';
import path from 'node:path';
import type { RecipeSpec, RuleEnginePack, RecommendationPack } from '@superapp/core';
import { evaluateRuleEngine, messagingChannelSendability } from '@superapp/core';
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

// ── Preview ⇄ storefront parity (module-design-system.md §3.3 / R0) ─────────
// Storefront modules render inside `.superapp-scope[data-sa-pack]` with the real
// two-pack stylesheet. Previews must show the SAME look or merchants judge
// quality on something the storefront never renders. `render()` sets the active
// pack for the duration of the (synchronous) render; `pageHtml` wraps the body
// and inlines the pack stylesheet. Non-storefront surfaces get no wrapper.
type PreviewPack = 'luxe' | 'bold';
let activePack: PreviewPack | null = null;
let activeAccent: string | undefined;

let packCssCache: string | null = null;
/** Load the real theme-extension stylesheet (cached). '' when unavailable (previews degrade to legacy CSS). */
function loadPackCss(): string {
  if (packCssCache !== null) return packCssCache;
  const candidates = [
    path.resolve(process.cwd(), 'extensions/theme-app-extension/assets/superapp-modules.css'),
    path.resolve(process.cwd(), '../../extensions/theme-app-extension/assets/superapp-modules.css'),
    path.resolve(process.cwd(), '../extensions/theme-app-extension/assets/superapp-modules.css'),
  ];
  for (const candidate of candidates) {
    try {
      packCssCache = fs.readFileSync(candidate, 'utf8');
      return packCssCache;
    } catch {
      // try next candidate
    }
  }
  packCssCache = '';
  return packCssCache;
}

function previewPackOf(spec: RecipeSpec): PreviewPack {
  const p = (spec as { style?: { pack?: string } }).style?.pack;
  return p === 'bold' ? 'bold' : 'luxe';
}

function previewAccentOf(spec: RecipeSpec): string | undefined {
  const colors = (spec as { style?: { colors?: { seed?: string } } }).style?.colors;
  return colors?.seed;
}

export class PreviewService {
  render(spec: RecipeSpec, context?: PreviewContext): PreviewResult {
    const surface = context?.surface ?? inferSurface(spec.type);
    // Storefront types carry the two-pack look; everything else previews unwrapped.
    const isStorefront = spec.type === 'theme.section' || spec.type === 'proxy.widget';
    activePack = isStorefront ? previewPackOf(spec) : null;
    activeAccent = isStorefront ? previewAccentOf(spec) : undefined;
    try {
      return this.renderInner(spec, context, surface);
    } finally {
      activePack = null;
      activeAccent = undefined;
    }
  }

  private renderInner(spec: RecipeSpec, context: PreviewContext | undefined, surface: PreviewSurface): PreviewResult {
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
    // Previews render without the .superapp-scope pack wrapper — emit the full
    // structural token set so var(--sa-radius) etc. resolve (§9.4).
    const vars = compileStyleVars(style, { structuralDefaults: true });
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
    // R2.1 — reflect display rules in the preview. Under a synthetic "preview
    // visitor" the module may be gated off; when it resolves to a definite hide we
    // render a labelled "hidden by display rules" state instead of the module.
    // Additive: absent/disabled ruleEngine is always-show (byte-identical preview).
    const ruleState = ruleHiddenState((spec.config as { ruleEngine?: RuleEnginePack }).ruleEngine);
    if (ruleState) return ruleState;
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
      case 'product-recommendations':
        return this.sectionRecommendations(spec);
      default: {
        // R6 — per-archetype dispatch. Every native-section `kind` resolves to a
        // canonical archetype (single source of truth: `sectionArchetype`) with a
        // flagship renderer that emits the contract BEM class tree the storefront
        // Liquid renders (preview ⇄ storefront parity, R0). Only truly unknown
        // kinds fall through to the recommendation/generic tail.
        const archetype = sectionArchetype(spec.config.kind);
        if (archetype) return this.renderArchetype(archetype, spec);
        // R2.3 — any kind that carries a recommendation source renders the
        // strategy-labelled placeholder (recommendations compose onto other
        // widgets). Absent recommendation → the last-resort generic renderer.
        if ((spec.config as { recommendation?: RecommendationPack }).recommendation) {
          return this.sectionRecommendations(spec);
        }
        return this.sectionGeneric(spec);
      }
    }
  }

  /** Dispatch a resolved archetype to its dedicated renderer. */
  private renderArchetype(
    archetype: SectionArchetype,
    spec: Extract<RecipeSpec, { type: 'theme.section' }>,
  ): string {
    switch (archetype) {
      case 'hero': return this.sectionHero(spec);
      case 'feature': return this.sectionFeature(spec);
      case 'gallery': return this.sectionGallery(spec);
      case 'collection': return this.sectionCollection(spec);
      case 'pricing': return this.sectionPricing(spec);
      case 'faq': return this.sectionFaq(spec);
      case 'testimonial': return this.sectionTestimonial(spec);
      case 'stats': return this.sectionStats(spec);
      case 'cta': return this.sectionCta(spec);
      case 'trust': return this.sectionTrust(spec);
      case 'newsletter': return this.sectionNewsletter(spec);
      case 'launch': return this.sectionLaunch(spec);
      case 'contact': return this.sectionContactCard(spec);
      case 'team': return this.sectionTeam(spec);
      case 'timeline': return this.sectionTimeline(spec);
      case 'upsell': return this.sectionUpsell(spec);
      case 'band': return this.sectionBand(spec);
      case 'technical': return this.sectionTechnical(spec);
    }
  }

  /**
   * Per-archetype preview CSS: the base font + the spec's compiled style block
   * (per-template --sa-* tokens incl. the seed→OKLCH semantic ramp — --sa-solid /
   * --sa-solid-content etc. — plus radius/spacing/typography), scoped to the
   * archetype's root class exactly like sectionBanner/sectionGeneric do. Without
   * this the authored `style.colors.seed` never reaches archetype previews.
   */
  private archCss(spec: ThemeSectionSpec, rootSelector: string): string {
    return `${previewBase()}\n${this.styleCss(spec, rootSelector)}`;
  }

  /**
   * Kind renderer: product-recommendations (R2.3). Deterministic, no live catalog —
   * renders N labelled skeleton cards captioned with the strategy + limit, matching
   * the "PreviewService is deterministic, no AI" rule. Dynamic strategies note the
   * fallback so the merchant sees the degradation contract.
   */
  private sectionRecommendations(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const rec = (spec.config as { recommendation?: RecommendationPack }).recommendation;
    const strategy = rec?.strategy ?? 'related';
    const limit = Math.min(Math.max(rec?.productLimit ?? 4, 1), 12);
    const fallback = rec?.fallback ?? 'related';
    const styleBlock = this.styleCss(spec, '.superapp-recs');
    const STATIC = new Set([
      'manual',
      'collection',
      'related',
      'complementary',
      'most-expensive-in-cart',
      'cheapest-in-cart',
    ]);
    const isDynamic = !STATIC.has(strategy);
    const title = String(this.cfg(spec, 'title') ?? spec.config.title ?? 'Recommended products');
    const caption = `Strategy: ${strategy} · up to ${limit} product${limit === 1 ? '' : 's'}${
      isDynamic ? ` · fallback: ${fallback}` : ''
    }`;
    const cards = Array.from({ length: limit })
      .map(
        (_, i) => `
          <li class="superapp-recs__card">
            <div class="superapp-recs__thumb" aria-hidden="true"></div>
            <span class="superapp-recs__name">Product ${i + 1}</span>
            <span class="superapp-recs__price">$—</span>
          </li>`,
      )
      .join('');

    return pageHtml(
      `
      <section class="superapp-recs">
        <div class="preview-label">${esc(caption)}</div>
        ${title ? `<h2 class="superapp-recs__title">${esc(title)}</h2>` : ''}
        <ul class="superapp-recs__grid" role="list">${cards}</ul>
        ${
          isDynamic
            ? `<p class="superapp-recs__note">Dynamic strategy — resolves at render via the recommendation service; degrades to <strong>${esc(
                fallback,
              )}</strong> when unavailable.</p>`
            : ''
        }
      </section>
    `,
      `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
      .preview-label { font-size: 0.75em; color: #6B7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .superapp-recs__title { margin: 0 0 12px; font-size: 1.25em; font-weight: var(--sa-fw, 600); }
      .superapp-recs__grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sa-gap, 16px); grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
      .superapp-recs__card { display: flex; flex-direction: column; gap: 6px; }
      .superapp-recs__thumb { aspect-ratio: 1 / 1; background: linear-gradient(135deg, #f1f5f9, #e2e8f0); border-radius: var(--sa-radius, 8px); }
      .superapp-recs__name { font-size: 0.9em; font-weight: 500; }
      .superapp-recs__price { font-size: 0.85em; color: #6B7280; }
      .superapp-recs__note { margin-top: 12px; font-size: 0.8em; color: #6B7280; }
    `,
    );
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
    // No pack wrapper in previews — include structural defaults (§9.4).
    const styleVars = compileStyleVars(style, { structuralDefaults: true });
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
   * Last-resort generic section renderer — only reached for a `kind` that maps to
   * NO archetype (`sectionArchetype` returned null) AND carries no recommendation
   * pack. Renders title/subtitle, per-block-kind content (never a bare
   * `<div><p>text</p></div>`), and the sanitized custom-HTML escape hatch. It NEVER
   * dumps raw `config.fields` as a debug table — unknown declared fields are
   * silently omitted (a curated summary is the `technical` archetype's job). Scripts
   * are stripped for the preview iframe (they run only under the extension CSP).
   */
  private sectionGeneric(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const c = spec.config;
    const styleBlock = this.styleCss(spec, '.superapp-section');
    const blocks = (c.blocks ?? []).map((b) => renderGenericBlock(b)).join('');
    const custom = c.advancedCustom?.customHtml ? sanitizePreviewHtml(c.advancedCustom.customHtml) : '';
    // R2.5 — layout archetype modifier class + column count. Additive: absent
    // `config.layout` renders no modifier.
    const layoutClass = layoutModifierClass(c.layout?.layout);
    const layoutCols =
      typeof c.layout?.columns === 'number' ? ` style="--sa-cols:${Math.round(c.layout.columns)}"` : '';
    const hasBody = Boolean(blocks || custom);

    return pageHtml(`
      <section class="superapp-section superapp-section--${escAttr(c.kind)}${layoutClass}${
        hasBody ? '' : ' superapp-section--minimal'
      }"${layoutCols}>
        <div class="superapp-section__inner">
          ${c.title ? `<h2 class="superapp-section__title">${esc(c.title)}</h2>` : ''}
          ${c.subtitle ? `<p class="superapp-section__sub">${esc(c.subtitle)}</p>` : ''}
          ${blocks ? `<div class="superapp-section__blocks">${blocks}</div>` : ''}
          ${custom ? `<div class="superapp-section__custom">${custom}</div>` : ''}
        </div>
      </section>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
    `);
  }

  // ── R6 · Native-section archetype renderers ────────────────────────────────
  // Each emits the contract BEM class tree (archetype-contract.md §"Class trees")
  // dressed by the inlined two-pack stylesheet (superapp-modules.css). Copy comes
  // from config.title/subtitle/fields/blocks; missing/placeholder media renders a
  // tasteful accent SVG (never a broken <img>). Any field not consumed is omitted.

  /** Hero — split/centered/overlay per layout + fields.mediaSide. */
  private sectionHero(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const f = saFields(spec);
    const eyebrow = saStr(spec, 'eyebrow');
    const title = String(spec.config.title ?? saStr(spec, 'heading') ?? '');
    const subtitle = String(spec.config.subtitle ?? saStr(spec, 'standfirst') ?? '');
    const body = saStr(spec, 'bodyText') || saStr(spec, 'body');
    const mediaUrl = saStr(spec, 'mediaImageUrl') || saStr(spec, 'heroImageUrl') || saStr(spec, 'imageUrl');
    const mediaAlt = saStr(spec, 'mediaAlt') || title;
    const mediaSide = saStr(spec, 'mediaSide') === 'left' ? 'left' : 'right';
    const overlay = f.overlayText === true || saStr(spec, 'layoutVariant') === 'overlay';
    const layout = String(spec.config.layout?.layout ?? 'stacked');
    const hasMedia = Boolean(mediaUrl) || overlay || layout === 'grid';
    const variant = overlay ? 'overlay' : hasMedia && layout === 'grid' ? 'split' : 'centered';

    // CTA buttons: explicit `cta` blocks, else a single fields.ctaLabel/ctaUrl.
    const ctaBlocks = (spec.config.blocks ?? []).filter((b) => b.kind === 'cta');
    let ctasHtml = ctaBlocks
      .map((b) => ctaButton(b.text ?? '', b.url, blockStyle(b), 'superapp-hero__cta'))
      .join('');
    if (!ctasHtml && saStr(spec, 'ctaLabel')) {
      ctasHtml = ctaButton(saStr(spec, 'ctaLabel'), saStr(spec, 'ctaUrl'), 'primary', 'superapp-hero__cta');
    }

    // Proof chips from stat/feature blocks (centered heroes with proof stats).
    const proofBlocks = (spec.config.blocks ?? []).filter((b) => b.kind === 'stat' || b.kind === 'feature');
    const proofHtml = proofBlocks.length
      ? `<div class="superapp-hero__proof">${proofBlocks
          .map((b) => {
            const label = String((b.fields as Record<string, unknown> | undefined)?.label ?? '');
            return `<span class="superapp-hero__proofitem"><span class="superapp-hero__proofval">${esc(
              b.text ?? '',
            )}</span>${label ? `<span class="superapp-hero__prooflabel">${esc(label)}</span>` : ''}</span>`;
          })
          .join('')}</div>`
      : '';

    const content = `
      <div class="superapp-hero__content">
        ${eyebrow ? `<span class="superapp-hero__eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h1 class="superapp-hero__title">${esc(title)}</h1>` : ''}
        ${subtitle ? `<p class="superapp-hero__subtitle">${esc(subtitle)}</p>` : ''}
        ${body ? `<p class="superapp-hero__body">${esc(body)}</p>` : ''}
        ${ctasHtml ? `<div class="superapp-hero__ctas">${ctasHtml}</div>` : ''}
        ${proofHtml}
      </div>`;
    const media = hasMedia ? phMedia(mediaUrl, mediaAlt, 'superapp-hero__media') : '';
    // Split: media order follows mediaSide; overlay: media is a backdrop.
    const inner =
      variant === 'overlay'
        ? `${media}${content}`
        : variant === 'split' && mediaSide === 'left'
          ? `${media}${content}`
          : `${content}${media}`;

    return pageHtml(
      `<section class="superapp-hero superapp-hero--${variant}">${inner}</section>`,
      this.archCss(spec, '.superapp-hero'),
    );
  }

  /** Feature bento / column grid. */
  private sectionFeature(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const layout = String(spec.config.layout?.layout ?? 'grid');
    const variant = layout === 'masonry' || layout === 'bento' ? 'bento' : 'grid';
    const items = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'feature' || b.kind === 'benefit' || b.kind === 'tile')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const eyebrow = bf.eyebrow ? String(bf.eyebrow) : '';
        const heading = bf.heading ? String(bf.heading) : '';
        const wide = bf.span === 'wide' ? ' superapp-feature__item--wide' : '';
        const icon = bf.icon ? String(bf.icon) : '';
        return `
          <div class="superapp-feature__item${wide}">
            ${icon ? `<span class="superapp-feature__icon" aria-hidden="true">${glyph(icon)}</span>` : ''}
            ${eyebrow ? `<span class="superapp-feature__eyebrow">${esc(eyebrow)}</span>` : ''}
            ${heading ? `<h3 class="superapp-feature__title">${esc(heading)}</h3>` : ''}
            ${b.text ? `<p class="superapp-feature__text">${esc(b.text)}</p>` : ''}
          </div>`;
      })
      .join('');
    return pageHtml(
      `<section class="superapp-feature superapp-feature--${variant}">
        ${sectionHead(spec)}
        <div class="superapp-feature__grid">${items}</div>
      </section>`,
      this.archCss(spec, '.superapp-feature'),
    );
  }

  /** Gallery / lookbook image grid, masonry or carousel. */
  private sectionGallery(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const layout = String(spec.config.layout?.layout ?? 'grid');
    const variant = layout === 'masonry' ? 'masonry' : layout === 'carousel' ? 'carousel' : 'grid';
    const items = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'slide' || b.kind === 'media' || b.kind === 'tile' || b.kind === 'image')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const span = bf.span === 'wide' ? ' superapp-gallery__item--wide' : bf.span === 'tall' ? ' superapp-gallery__item--tall' : '';
        const alt = bf.alt ? String(bf.alt) : (b.text ?? '');
        const media = phMedia(b.imageUrl ?? '', alt, 'superapp-gallery__img');
        const inner = `${media}${b.text ? `<figcaption class="superapp-gallery__caption">${esc(b.text)}</figcaption>` : ''}`;
        return `<figure class="superapp-gallery__item${span}">${
          b.url ? `<a class="superapp-gallery__link" href="${escAttr(b.url)}">${inner}</a>` : inner
        }</figure>`;
      })
      .join('');
    return pageHtml(
      `<section class="superapp-gallery superapp-gallery--${variant}">
        ${sectionHead(spec)}
        <div class="superapp-gallery__grid">${items}</div>
      </section>`,
      this.archCss(spec, '.superapp-gallery'),
    );
  }

  /** Collection editorial — copy panel + media pair. */
  private sectionCollection(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const eyebrow = saStr(spec, 'eyebrow');
    const title = String(spec.config.title ?? saStr(spec, 'heading') ?? '');
    const text = saStr(spec, 'standfirst') || saStr(spec, 'bodyText') || String(spec.config.subtitle ?? '');
    const mediaUrl = saStr(spec, 'heroImageUrl') || saStr(spec, 'mediaImageUrl') || saStr(spec, 'imageUrl');
    const ctaLabel = saStr(spec, 'ctaLabel');
    const media = phMedia(mediaUrl, title, 'superapp-collection__media');
    return pageHtml(
      `<section class="superapp-collection">
        ${media}
        <div class="superapp-collection__content">
          ${eyebrow ? `<span class="superapp-collection__eyebrow">${esc(eyebrow)}</span>` : ''}
          ${title ? `<h2 class="superapp-collection__title">${esc(title)}</h2>` : ''}
          ${text ? `<p class="superapp-collection__text">${esc(text)}</p>` : ''}
          ${ctaLabel ? ctaButton(ctaLabel, saStr(spec, 'ctaUrl'), 'primary', 'superapp-collection__cta') : ''}
        </div>
      </section>`,
      this.archCss(spec, '.superapp-collection'),
    );
  }

  /** Pricing tiers / comparison — plan cards, featured highlight. */
  private sectionPricing(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const plans = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'plan' || b.kind === 'tile' || b.kind === 'comparison' || b.kind === 'row')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const featured = bf.recommended === true || bf.featured === true;
        const price = bf.price != null ? String(bf.price) : '';
        const period = bf.period ? String(bf.period) : '';
        const badge = bf.badge ? String(bf.badge) : featured ? 'Most popular' : '';
        const features = Array.isArray(bf.features) ? (bf.features as unknown[]).map(String) : [];
        const featuresHtml = features
          .map((ft) => `<li class="superapp-pricing__feature">${esc(ft)}</li>`)
          .join('');
        const ctaLabel = bf.ctaLabel ? String(bf.ctaLabel) : 'Choose plan';
        return `
          <div class="superapp-pricing__plan${featured ? ' superapp-pricing__plan--featured' : ''}">
            ${badge ? `<span class="superapp-pricing__badge">${esc(badge)}</span>` : ''}
            <h3 class="superapp-pricing__name">${esc(b.text ?? '')}</h3>
            ${
              price
                ? `<div class="superapp-pricing__price"><span class="superapp-pricing__amount">${esc(
                    price.startsWith('$') ? price : `$${price}`,
                  )}</span>${period ? `<span class="superapp-pricing__period">/${esc(period)}</span>` : ''}</div>`
                : ''
            }
            ${featuresHtml ? `<ul class="superapp-pricing__features">${featuresHtml}</ul>` : ''}
            ${ctaButton(ctaLabel, bf.ctaUrl ? String(bf.ctaUrl) : undefined, featured ? 'primary' : 'secondary', 'superapp-pricing__cta')}
          </div>`;
      })
      .join('');
    return pageHtml(
      `<div class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-pricing">${plans}</div>
      </div>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** FAQ — native <details> accordion honoring expandBehavior/defaultOpenIndex. */
  private sectionFaq(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const f = saFields(spec);
    const single = f.expandBehavior !== 'multi';
    const defaultOpen = typeof f.defaultOpenIndex === 'number' ? f.defaultOpenIndex : -1;
    const items = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'faq-item' || b.kind === 'faq' || b.kind === 'row')
      .map((b, i) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const answer = bf.answer != null ? String(bf.answer) : (b.text && bf.question ? b.text : '');
        const question = bf.question != null ? String(bf.question) : (b.text ?? '');
        const open = bf.defaultOpen === true || i === defaultOpen;
        // In single-open mode only the first eligible item stays open.
        const openAttr = open ? ' open' : '';
        return `
          <details class="superapp-faq__item"${openAttr}${single ? ' data-single' : ''}>
            <summary class="superapp-faq__q">${esc(question)}</summary>
            <div class="superapp-faq__a">${esc(answer)}</div>
          </details>`;
      })
      .join('');
    return pageHtml(
      `<div class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-faq">${items}</div>
      </div>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Testimonials / reviews — quote cards with ★ ratings. */
  private sectionTestimonial(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const cards = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'review-card' || b.kind === 'testimonial' || b.kind === 'review' || b.kind === 'social-proof')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const rating = typeof bf.rating === 'number' ? bf.rating : 5;
        const author = bf.author ? String(bf.author) : '';
        const loc = bf.location ? String(bf.location) : bf.date ? String(bf.date) : '';
        const verified = bf.verified === true;
        return `
          <figure class="superapp-testimonial__card">
            ${starRow(rating)}
            <blockquote class="superapp-testimonial__quote">${esc(b.text ?? '')}</blockquote>
            ${
              author
                ? `<figcaption class="superapp-testimonial__author">${esc(author)}${
                    verified ? '<span class="superapp-testimonial__meta">✓ Verified</span>' : ''
                  }${loc ? `<span class="superapp-testimonial__meta">${esc(loc)}</span>` : ''}</figcaption>`
                : ''
            }
          </figure>`;
      })
      .join('');
    return pageHtml(
      `<div class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-testimonial">${cards}</div>
      </div>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Stats band — value/label chips. */
  private sectionStats(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const stats = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'stat' || b.kind === 'number' || b.kind === 'percentage')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const label = bf.label ? String(bf.label) : '';
        return `
          <div class="superapp-stats__stat">
            <span class="superapp-stats__value">${esc(b.text ?? '')}</span>
            ${label ? `<span class="superapp-stats__label">${esc(label)}</span>` : ''}
          </div>`;
      })
      .join('');
    return pageHtml(
      `<div class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-stats">${stats}</div>
      </div>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** CTA / rich-text band — headline + text + button. */
  private sectionCta(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const title = String(spec.config.title ?? saStr(spec, 'heading') ?? '');
    const text = String(spec.config.subtitle ?? saStr(spec, 'bodyText') ?? saStr(spec, 'body') ?? '');
    const ctaBlock = (spec.config.blocks ?? []).find((b) => b.kind === 'cta');
    const button = ctaBlock
      ? ctaButton(ctaBlock.text ?? '', ctaBlock.url, blockStyle(ctaBlock), 'superapp-cta__button')
      : saStr(spec, 'ctaLabel')
        ? ctaButton(saStr(spec, 'ctaLabel'), saStr(spec, 'ctaUrl'), 'primary', 'superapp-cta__button')
        : '';
    return pageHtml(
      `<section class="superapp-cta">
        ${title ? `<h2 class="superapp-cta__title">${esc(title)}</h2>` : ''}
        ${text ? `<p class="superapp-cta__text">${esc(text)}</p>` : ''}
        ${button}
      </section>`,
      this.archCss(spec, '.superapp-cta'),
    );
  }

  /** Trust — logo marquee (--logos) or trust-badge row (--badges). */
  private sectionTrust(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const kind = spec.config.kind;
    const badgeBlocks = (spec.config.blocks ?? []).filter((b) => b.kind === 'badge' || b.kind === 'trust-badge');
    const logoBlocks = (spec.config.blocks ?? []).filter((b) => b.kind === 'logo');
    const badges = kind === 'trust-badges' || kind === 'trust-badge' || (badgeBlocks.length && !logoBlocks.length);
    let itemsHtml: string;
    if (badges) {
      itemsHtml = (badgeBlocks.length ? badgeBlocks : spec.config.blocks ?? [])
        .map((b) => {
          const bf = (b.fields ?? {}) as Record<string, unknown>;
          const caption = bf.caption ? String(bf.caption) : '';
          const icon = bf.icon ? String(bf.icon) : 'shield';
          return `
            <div class="superapp-trust__badge">
              <span class="superapp-trust__badgeicon" aria-hidden="true">${glyph(icon)}</span>
              <span class="superapp-trust__badgelabel">${esc(b.text ?? '')}</span>
              ${caption ? `<span class="superapp-trust__badgecaption">${esc(caption)}</span>` : ''}
            </div>`;
        })
        .join('');
    } else {
      itemsHtml = (logoBlocks.length ? logoBlocks : spec.config.blocks ?? [])
        .map((b) => {
          const alt = ((b.fields ?? {}) as Record<string, unknown>).alt;
          // Logo images in the library are demo SVGs; render the wordmark text so
          // the trust row reads cleanly instead of broken image icons.
          const inner = `<span class="superapp-trust__logo">${esc(b.text ?? String(alt ?? ''))}</span>`;
          return `<div class="superapp-trust__item">${
            b.url ? `<a class="superapp-trust__link" href="${escAttr(b.url)}">${inner}</a>` : inner
          }</div>`;
        })
        .join('');
    }
    return pageHtml(
      `<div class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-trust superapp-trust--${badges ? 'badges' : 'logos'}">${itemsHtml}</div>
      </div>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Newsletter capture — email input + submit + disclaimer. */
  private sectionNewsletter(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const title = String(spec.config.title ?? '');
    const text = String(spec.config.subtitle ?? saStr(spec, 'bodyText') ?? '');
    const placeholder = saStr(spec, 'emailPlaceholder') || 'you@email.com';
    const submit = saStr(spec, 'captureCtaLabel') || saStr(spec, 'ctaLabel') || 'Subscribe';
    const disclaimer = saStr(spec, 'consentText') || saStr(spec, 'disclaimer');
    const benefits = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'benefit' || b.kind === 'feature')
      .map((b) => `<li class="superapp-newsletter__benefit">${esc(b.text ?? '')}</li>`)
      .join('');
    return pageHtml(
      `<section class="superapp-newsletter">
        ${title ? `<h2 class="superapp-newsletter__title">${esc(title)}</h2>` : ''}
        ${text ? `<p class="superapp-newsletter__text">${esc(text)}</p>` : ''}
        ${benefits ? `<ul class="superapp-newsletter__benefits">${benefits}</ul>` : ''}
        <form class="superapp-newsletter__form" onsubmit="event.preventDefault();">
          <input class="superapp-newsletter__input" type="email" placeholder="${escAttr(placeholder)}" aria-label="Email address" />
          <button class="superapp-newsletter__submit" type="submit">${esc(submit)}</button>
        </form>
        ${disclaimer ? `<p class="superapp-newsletter__disclaimer">${esc(disclaimer)}</p>` : ''}
      </section>`,
      this.archCss(spec, '.superapp-newsletter'),
    );
  }

  /** Launch / coming-soon / 404 — big code, countdown, optional capture. */
  private sectionLaunch(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const f = saFields(spec);
    const is404 = spec.config.kind === '404';
    const code = saStr(spec, 'statusLabel') || (is404 ? '404' : '');
    const eyebrow = saStr(spec, 'eyebrow');
    const title = String(spec.config.title ?? '');
    const subtitle = String(spec.config.subtitle ?? '');
    const body = saStr(spec, 'bodyText') || saStr(spec, 'body');
    const launchDate = saStr(spec, 'launchDate') || saStr(spec, 'countdownTo');
    const homeCta = saStr(spec, 'homeCtaLabel');
    const capture = f.captureEnabled === true;
    const captureCta = saStr(spec, 'captureCtaLabel') || 'Notify me';
    const placeholder = saStr(spec, 'emailPlaceholder') || 'you@email.com';
    const incentive = saStr(spec, 'incentiveNote');

    // 404 popular-link cards from `link` blocks.
    const linkCards = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'link')
      .map((b) => {
        const cap = ((b.fields ?? {}) as Record<string, unknown>).caption;
        const media = phMedia(b.imageUrl ?? '', b.text ?? '', 'superapp-launch__linkimg');
        return `<a class="superapp-launch__link" href="${escAttr(b.url ?? '#')}">${media}<span class="superapp-launch__linktitle">${esc(
          b.text ?? '',
        )}</span>${cap ? `<span class="superapp-launch__linkcap">${esc(String(cap))}</span>` : ''}</a>`;
      })
      .join('');

    return pageHtml(
      `<section class="superapp-launch">
        ${code ? `<div class="superapp-launch__code">${esc(code)}</div>` : ''}
        ${eyebrow ? `<span class="superapp-launch__eyebrow">${esc(eyebrow)}</span>` : ''}
        ${title ? `<h1 class="superapp-launch__title">${esc(title)}</h1>` : ''}
        ${subtitle ? `<p class="superapp-launch__sub">${esc(subtitle)}</p>` : ''}
        ${body ? `<p class="superapp-launch__text">${esc(body)}</p>` : ''}
        ${launchDate ? `<div class="superapp-launch__countdown" data-sa-countdown="${escAttr(launchDate)}">00 : 00 : 00 : 00</div>` : ''}
        ${
          capture
            ? `<form class="superapp-launch__capture superapp-newsletter" onsubmit="event.preventDefault();">
                 <div class="superapp-newsletter__form">
                   <input class="superapp-newsletter__input" type="email" placeholder="${escAttr(placeholder)}" aria-label="Email address" />
                   <button class="superapp-newsletter__submit" type="submit">${esc(captureCta)}</button>
                 </div>
               </form>`
            : ''
        }
        ${homeCta ? ctaButton(homeCta, saStr(spec, 'homeCtaUrl'), 'primary', 'superapp-launch__cta') : ''}
        ${linkCards ? `<div class="superapp-launch__links">${linkCards}</div>` : ''}
        ${incentive ? `<p class="superapp-launch__note">${esc(incentive)}</p>` : ''}
      </section>`,
      this.archCss(spec, '.superapp-launch'),
    );
  }

  /** Contact card — contact methods (Visit/Call/Hours). */
  private sectionContactCard(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const methods = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'contact-method' || b.kind === 'row')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const value = bf.detail != null ? String(bf.detail) : bf.value != null ? String(bf.value) : '';
        const icon = bf.icon ? String(bf.icon) : 'pin';
        return `
          <div class="superapp-contactcard__method">
            <span class="superapp-contactcard__icon" aria-hidden="true">${glyph(icon)}</span>
            <span class="superapp-contactcard__label">${esc(b.text ?? '')}</span>
            ${value ? `<span class="superapp-contactcard__value">${esc(value)}</span>` : ''}
          </div>`;
      })
      .join('');
    return pageHtml(
      `<section class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-contactcard">${methods}</div>
      </section>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Team — member cards (photo/name/role). */
  private sectionTeam(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const members = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'team-member' || b.kind === 'member')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const role = bf.role ? String(bf.role) : '';
        const bio = bf.bio ? String(bf.bio) : '';
        return `
          <figure class="superapp-team__member">
            ${phMedia(b.imageUrl ?? '', b.text ?? '', 'superapp-team__photo')}
            <figcaption>
              <span class="superapp-team__name">${esc(b.text ?? '')}</span>
              ${role ? `<span class="superapp-team__role">${esc(role)}</span>` : ''}
              ${bio ? `<span class="superapp-team__bio">${esc(bio)}</span>` : ''}
            </figcaption>
          </figure>`;
      })
      .join('');
    return pageHtml(
      `<section class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-team">${members}</div>
      </section>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Timeline / steps — ordered markers + copy. */
  private sectionTimeline(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const steps = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'step' || b.kind === 'milestone' || b.kind === 'event')
      .map((b, i) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const marker = bf.date != null ? String(bf.date) : bf.number != null ? String(bf.number) : String(i + 1);
        const detail = bf.detail != null ? String(bf.detail) : '';
        return `
          <div class="superapp-timeline__step">
            <span class="superapp-timeline__marker">${esc(marker)}</span>
            <div class="superapp-timeline__content">
              <h3 class="superapp-timeline__title">${esc(b.text ?? '')}</h3>
              ${detail ? `<p class="superapp-timeline__text">${esc(detail)}</p>` : ''}
            </div>
          </div>`;
      })
      .join('');
    return pageHtml(
      `<section class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-timeline">${steps}</div>
      </section>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Upsell / frequently-bought-together — product picks. */
  private sectionUpsell(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const products = (spec.config.blocks ?? [])
      .filter((b) => b.kind === 'product-card' || b.kind === 'feature' || b.kind === 'product')
      .map((b) => {
        const bf = (b.fields ?? {}) as Record<string, unknown>;
        const price = bf.price != null ? String(bf.price) : '';
        const priceLabel = price ? (price.startsWith('$') ? price : `$${price}`) : '';
        return `
          <div class="superapp-upsell__product">
            ${phMedia(b.imageUrl ?? '', b.text ?? '', 'superapp-upsell__thumb')}
            <span class="superapp-upsell__name">${esc(b.text ?? '')}</span>
            ${priceLabel ? `<span class="superapp-upsell__price">${esc(priceLabel)}</span>` : ''}
          </div>`;
      })
      .join('');
    const addAll = saStr(spec, 'addAllLabel');
    const discount = saStr(spec, 'discountLabel');
    return pageHtml(
      `<section class="superapp-archsection">
        ${sectionHead(spec)}
        <div class="superapp-upsell">${products}</div>
        ${discount ? `<p class="superapp-upsell__save">${esc(discount)}</p>` : ''}
        ${addAll ? ctaButton(addAll, undefined, 'primary', 'superapp-upsell__cta') : ''}
      </section>`,
      this.archCss(spec, '.superapp-archsection'),
    );
  }

  /** Band — announcement / countdown / free-shipping / progress bar. */
  private sectionBand(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const message = String(spec.config.title ?? saStr(spec, 'message') ?? saStr(spec, 'text') ?? '');
    const ctaLabel = saStr(spec, 'ctaLabel') || saStr(spec, 'linkText');
    const ctaUrl = saStr(spec, 'ctaUrl') || saStr(spec, 'linkUrl');
    const countdownTo = saStr(spec, 'countdownTo') || saStr(spec, 'endTime');
    const hasProgress = spec.config.kind === 'progress' || saStr(spec, 'threshold') !== '';
    return pageHtml(
      `<section class="superapp-band">
        <span class="superapp-band__text">${esc(message)}</span>
        ${countdownTo ? `<span class="superapp-band__countdown" data-sa-countdown="${escAttr(countdownTo)}">00 : 00 : 00</span>` : ''}
        ${hasProgress ? `<span class="superapp-band__progress"><span class="superapp-band__progressfill" style="width:64%"></span></span>` : ''}
        ${ctaLabel ? `<a class="superapp-band__cta" href="${escAttr(ctaUrl || '#')}">${esc(ctaLabel)}</a>` : ''}
      </section>`,
      this.archCss(spec, '.superapp-band'),
    );
  }

  /** Technical (consent/json-ld/meta/…) — curated, human-labeled config card. */
  private sectionTechnical(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const kind = spec.config.kind;
    const rows = curatedTechRows(spec);
    const rowsHtml = rows
      .map(
        (r) =>
          `<div class="superapp-techcard__row"><span class="superapp-techcard__key">${esc(r[0])}</span><span class="superapp-techcard__val">${esc(
            r[1],
          )}</span></div>`,
      )
      .join('');
    return pageHtml(
      `<section class="superapp-techcard">
        <div class="superapp-techcard__type">${esc(humanizeKind(kind))}</div>
        ${spec.config.title ? `<h3 class="superapp-techcard__title">${esc(spec.config.title)}</h3>` : ''}
        ${
          rowsHtml
            ? `<div class="superapp-techcard__rows">${rowsHtml}</div>`
            : `<p class="superapp-techcard__note">This is a technical / head-only module — it renders no visible storefront UI. It ships structured data or behavior, configured server-side.</p>`
        }
      </section>`,
      this.archCss(spec, '.superapp-techcard'),
    );
  }

  /** Kind renderer: contactForm (lead-capture form). */
  private sectionContactForm(spec: Extract<RecipeSpec, { type: 'theme.section' }>): string {
    const str = (key: string, fallback = ''): string => {
      const v = this.cfg(spec, key);
      return v == null ? fallback : String(v);
    };
    const bool = (key: string): boolean => this.cfg(spec, key) === true;
    // Preview parity (R0): use the SAME class tree as the storefront renderer
    // (snippets/superapp-module.liquid `.superapp-contact*`) so the inlined pack
    // stylesheet dresses the preview exactly like the storefront.
    const styleBlock = this.styleCss(spec, '.superapp-contact');
    const required = (enabled: boolean, isRequired: boolean) => (enabled && isRequired ? 'required' : '');
    const field = (show: boolean, label: string, input: string) =>
      show ? `<label class="superapp-contact__field">${label} ${input}</label>` : '';

    const title = str('title');
    const subtitle = str('subtitle');
    return pageHtml(`
      <section class="superapp-contact" aria-label="${escAttr(title)}">
        <div class="superapp-contact__inner">
          <h2 class="superapp-contact__title">${esc(title)}</h2>
          ${subtitle ? `<p class="superapp-contact__subtitle">${esc(subtitle)}</p>` : ''}

          <form class="superapp-contact__form" onsubmit="event.preventDefault(); var s=document.querySelector('.superapp-contact__status'); s.hidden=false; s.textContent='${escAttr(str('successMessage'))}';">
            ${field(bool('showName'), 'Name', `<input type="text" name="name" ${required(bool('showName'), bool('nameRequired'))} />`)}
            ${field(bool('showEmail'), 'Email', `<input type="email" name="email" ${required(bool('showEmail'), bool('emailRequired'))} />`)}
            ${field(bool('showPhone'), 'Phone', `<input type="tel" name="phone" ${required(bool('showPhone'), bool('phoneRequired'))} />`)}
            ${field(bool('showCompany'), 'Company', `<input type="text" name="company" ${required(bool('showCompany'), bool('companyRequired'))} />`)}
            ${field(bool('showOrderNumber'), 'Order number', `<input type="text" name="orderNumber" ${required(bool('showOrderNumber'), bool('orderNumberRequired'))} />`)}
            ${field(bool('showSubject'), 'Subject', `<input type="text" name="subject" ${required(bool('showSubject'), bool('subjectRequired'))} />`)}
            ${field(bool('showMessage'), 'Message', `<textarea name="message" rows="5" ${required(bool('showMessage'), bool('messageRequired'))}></textarea>`)}
            ${bool('consentRequired') ? `<label class="superapp-contact__consent"><input type="checkbox" required /> <span>${esc(str('consentLabel'))}</span></label>` : ''}
            <button type="submit" class="superapp-contact__submit">${esc(str('submitLabel', 'Send message'))}</button>
            <p class="superapp-contact__status superapp-contact__status--success" aria-live="polite" hidden></p>
          </form>
        </div>
      </section>
    `, `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      ${styleBlock}
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

    // Anchor: prefer the explicit `anchor` key, then the `corner` key that the
    // template library actually uses (e.g. 'bottom-right', 'left'), then the
    // style.layout anchor. Without this, every widget collapsed to bottom_right.
    const cornerRaw = String(this.cfg(spec, 'corner') ?? '').toLowerCase();
    const styleAnchor = String(
      (((spec as { style?: { layout?: { anchor?: unknown } } }).style?.layout?.anchor) ?? '') as string,
    ).toLowerCase();
    const resolvedAnchor = (() => {
      const a = anchor && anchor !== 'bottom_right' ? anchor : '';
      const c = cornerRaw.replace(/-/g, '_'); // 'bottom-right' -> 'bottom_right'
      const pick = a || c || styleAnchor || 'bottom_right';
      // Normalize single-edge corners ('left'/'right') to a bottom corner.
      if (pick === 'left') return 'bottom_left';
      if (pick === 'right') return 'bottom_right';
      return pick;
    })();

    // Surface the widget's real copy so distinct templates preview distinctly,
    // and reflect the configured brand colors (previously hard-coded #111/#fff).
    const title = String(this.cfg(spec, 'title') ?? '');
    const subtitle = String(this.cfg(spec, 'subtitle') ?? '');
    const label = String(
      this.cfg(spec, 'label') ?? this.cfg(spec, 'ctaLabel') ?? this.cfg(spec, 'teaserLabel') ?? title,
    );
    const colors = ((spec as { style?: { colors?: Record<string, unknown> } }).style?.colors ?? {}) as Record<string, unknown>;
    const bubbleBg = String(colors.buttonBg ?? colors.background ?? '#111');
    const bubbleText = String(colors.buttonText ?? colors.text ?? '#fff');
    const bubbleStyle = `${''}background: ${escAttr(bubbleBg)}; color: ${escAttr(bubbleText)};`;

    let posX = '';
    let posY = '';
    let extraTransform = '';
    switch (resolvedAnchor) {
      case 'bottom_right': posX = `right: ${offsetX}px;`; posY = `bottom: ${offsetY}px;`; break;
      case 'bottom_left':  posX = `left: ${offsetX}px;`;  posY = `bottom: ${offsetY}px;`; break;
      case 'top_right':    posX = `right: ${offsetX}px;`; posY = `top: ${offsetY}px;`;    break;
      case 'top_left':     posX = `left: ${offsetX}px;`;  posY = `top: ${offsetY}px;`;    break;
      case 'bottom_center': posX = `left: 50%;`; posY = `bottom: ${offsetY}px;`; extraTransform = 'transform: translateX(-50%);'; break;
      default: posX = `right: ${offsetX}px;`; posY = `bottom: ${offsetY}px;`; break;
    }

    return pageHtml(`
      <div class="preview-stage">
        <div class="preview-label">Floating widget · ${esc(resolvedAnchor.replace(/_/g, ' '))}${title ? ` · ${esc(title)}` : ` · ${esc(variant)}`}</div>
        <div class="preview-products">
          <div class="preview-product"><span>Product A</span><span>$29</span></div>
          <div class="preview-product"><span>Product B</span><span>$49</span></div>
          <div class="preview-product"><span>Product C</span><span>$19</span></div>
        </div>
        <div class="superapp-fw" style="${posX} ${posY} ${extraTransform} ${bubbleStyle}">
          <span class="superapp-fw__icon">${icon}</span>
          ${label ? `<span class="superapp-fw__label">${esc(label)}</span>` : ''}
          ${subtitle ? `<span class="superapp-fw__sub">${esc(subtitle)}</span>` : ''}
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
      .superapp-fw__label { font-size: 14px; font-weight: 600; }
      .superapp-fw__sub { font-size: 12px; font-weight: 400; opacity: 0.85; }
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
      case 'admin.link':
        return this.adminLinkSurfacePreview(spec);
      case 'admin.print':
        return this.adminPrintSurfacePreview(spec);
      case 'admin.segmentTemplate':
        return this.segmentTemplateSurfacePreview(spec);
      case 'customerAccount.blocks':
        return this.accountSurfacePreview(spec);
      case 'pos.extension':
        return this.posSurfacePreview(spec);
      case 'analytics.pixel':
        return this.pixelSurfacePreview(spec);
      case 'integration.httpSync':
      case 'flow.automation':
        return this.workflowSurfacePreview(spec, surface);
      case 'messaging.campaign':
        return this.messagingCampaignPreview(spec);
      case 'agentic.catalogProfile':
        return this.agenticCatalogProfilePreview(spec);
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
    const title = String(
      this.cfgVal(spec, 'title') ??
        this.cfgVal(spec, 'heading') ??
        this.cfgVal(spec, 'offerTitle') ??
        spec.name,
    );
    // Surface the template's real copy (description/message) so distinct checkout
    // templates preview distinctly instead of sharing generic body text.
    const body = String(
      this.cfgVal(spec, 'description') ??
        this.cfgVal(spec, 'body') ??
        this.cfgVal(spec, 'message') ??
        '',
    );
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
    // Post-purchase templates carry `offerTitle` + `message` (not title/offerText);
    // surface them so different offers don't all show the same generic body.
    const title = String(
      this.cfgVal(spec, 'title') ??
        this.cfgVal(spec, 'heading') ??
        this.cfgVal(spec, 'offerTitle') ??
        spec.name,
    );
    const offer = String(
      this.cfgVal(spec, 'offerText') ??
        this.cfgVal(spec, 'message') ??
        this.cfgVal(spec, 'body') ??
        this.cfgVal(spec, 'description') ??
        'Add this one-time offer to your order.',
    );
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
    // admin.block uses `label` as its heading; admin.action carries both a modal
    // `title` and a verb `label` (the action). Prefer title, then label.
    const labelVal = this.cfgVal(spec, 'label');
    const heading = String(
      this.cfgVal(spec, 'title') ?? labelVal ?? this.cfgVal(spec, 'heading') ?? spec.name,
    );
    // Surface the template's real, distinguishing description (was a hardcoded
    // "Embedded admin block…" line that made every admin template look identical).
    const description = this.cfgVal(spec, 'description');
    // When `label` is a distinct action verb (admin.action), use it as the CTA;
    // otherwise fall back to the generic label.
    const action =
      String(
        this.cfgVal(spec, 'actionLabel') ??
          this.cfgVal(spec, 'ctaText') ??
          (typeof labelVal === 'string' && labelVal !== heading ? labelVal : ''),
      ) || 'Run action';
    // Humanize the extension target into a "where it appears" line (mirrors
    // posSurfacePreview): 'admin.order-details.action.render' -> 'Order details'.
    const target = String(this.cfgVal(spec, 'target') ?? '');
    const surfaceLabel = target
      ? target
          .replace(/^admin\./, '')
          .replace(/\.(action|block)\.render$/, '')
          .replace(/\.render$/, '')
          .replace(/[.-]/g, ' ')
          .replace(/\b\w/g, (m) => m.toUpperCase())
          .trim()
      : '';
    // Render the template's declared label/value fields (like discountUiSurfacePreview)
    // instead of the hardcoded Status/Last-run rows.
    const fieldsRaw = this.cfgVal(spec, 'fields');
    const fields = Array.isArray(fieldsRaw) ? (fieldsRaw as Array<Record<string, unknown>>) : [];
    const fieldRows = fields.length
      ? fields
          .map((f) => {
            const l = esc(String(f?.label ?? f?.key ?? ''));
            const tone = String(f?.tone ?? '');
            const v = String(f?.value ?? '');
            const valHtml = tone
              ? `<span class="adm__badge adm__badge--${escAttr(tone)}">${esc(v)}</span>`
              : `<span>${esc(v)}</span>`;
            return `<div class="adm__row"><span>${l}</span>${valHtml}</div>`;
          })
          .join('')
      : `<div class="adm__row"><span>Status</span><span class="adm__badge">Active</span></div>
         <div class="adm__row"><span>Last run</span><span>2 minutes ago</span></div>`;
    return this.surfaceCard(spec.name, `${spec.type} · admin (Polaris)`, `
      <div class="surf-panel">
        <h3>${esc(heading)}</h3>
        ${surfaceLabel ? `<p class="surf-muted">Appears on: <strong>${esc(surfaceLabel)}</strong></p>` : ''}
        <p class="surf-muted">${
          description ? esc(String(description)) : 'Embedded admin block rendered with Polaris-like primitives.'
        }</p>
        <div class="adm__rows">${fieldRows}</div>
        <a class="surf-btn" href="#action">${esc(action)}</a>
        <details class="surf-state"><summary>After action</summary><p class="surf-muted">Action dispatched; admin toast confirms success and the row updates.</p></details>
      </div>
    `, `
      .adm__row { display:flex; justify-content:space-between; gap:12px; font-size:13px; padding:6px 0; border-bottom:1px solid #eef2f7; }
      .adm__badge { background:#E7F5EF; color:#0E9F6E; border-radius:9999px; padding:2px 10px; font-size:12px; }
      .adm__badge--warning, .adm__badge--attention { background:#FEF3C7; color:#92400E; }
      .adm__badge--critical { background:#FDE8E8; color:#9B1C1C; }
      .adm__badge--info { background:#EAF1FB; color:#2F80ED; }
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

  /** Admin link extension (`admin_link`) — a deep link from an admin resource page. */
  private adminLinkSurfacePreview(spec: RecipeSpec): string {
    const label = String(this.cfgVal(spec, 'label') ?? spec.name);
    const target = String(this.cfgVal(spec, 'target') ?? '');
    const url = String(this.cfgVal(spec, 'url') ?? '/');
    const resource = target.split('.')[1] ?? 'resource';
    return this.surfaceCard(spec.name, `${spec.type} · admin link`, `
      <div class="surf-panel">
        <p class="surf-muted">Shown in the ${esc(resource)} page action menu. Clicking opens your app with the store + selected-resource id appended.</p>
        <div class="alk__menu">
          <div class="alk__item">Edit</div>
          <div class="alk__item">Duplicate</div>
          <div class="alk__item alk__item--app"><span class="alk__dot"></span>${esc(label)}</div>
        </div>
        <p class="surf-muted">Opens: <code>${esc(url)}?shop=…&amp;id=…</code></p>
        <details class="surf-state"><summary>Target</summary><p class="surf-muted"><code>${esc(target)}</code> — deployed as an admin_link toml registration (no runtime bundle).</p></details>
      </div>
    `, `
      .alk__menu { border:1px solid #DCE3EC; border-radius:8px; overflow:hidden; margin:10px 0; max-width:280px; }
      .alk__item { padding:9px 12px; font-size:13px; color:#334155; border-bottom:1px solid #eef2f7; }
      .alk__item:last-child { border-bottom:0; }
      .alk__item--app { color:#1F3A5F; font-weight:600; display:flex; align-items:center; gap:8px; }
      .alk__dot { width:8px; height:8px; border-radius:9999px; background:#1F3A5F; }
    `);
  }

  /** Admin print extension (`admin_print`) — a custom printable document preview. */
  private adminPrintSurfacePreview(spec: RecipeSpec): string {
    const label = String(this.cfgVal(spec, 'label') ?? spec.name);
    const kind = String(this.cfgVal(spec, 'documentKind') ?? 'packing-slip');
    const title = String(this.cfgVal(spec, 'title') ?? 'Document');
    const subtitle = String(this.cfgVal(spec, 'subtitle') ?? '');
    const includeHeader = this.cfgVal(spec, 'includeShopHeader') !== false;
    return this.surfaceCard(spec.name, `${spec.type} · admin print`, `
      <div class="surf-panel">
        <p class="surf-muted">Print-action “${esc(label)}” — opens a print preview of an app-rendered ${esc(kind)}.</p>
        <div class="apr__page">
          ${includeHeader ? '<div class="apr__shop">Your Store</div>' : ''}
          <h3 class="apr__title">${esc(title)}</h3>
          ${subtitle ? `<p class="apr__sub">${esc(subtitle)}</p>` : ''}
          <div class="apr__rows">
            <div class="apr__row"><span>SKU-001 · Travel Backpack</span><span>× 1</span></div>
            <div class="apr__row"><span>SKU-014 · Packing Cube Set</span><span>× 2</span></div>
          </div>
        </div>
        <a class="surf-btn" href="#print">Print</a>
        <details class="surf-state"><summary>How it renders</summary><p class="surf-muted">s-admin-print-action src points at the app’s /admin-print/document route, parameterized by this config + the selected resource.</p></details>
      </div>
    `, `
      .apr__page { border:1px solid #DCE3EC; border-radius:8px; background:#fff; padding:16px; margin:10px 0; }
      .apr__shop { font-size:12px; color:#6B7280; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px; }
      .apr__title { margin:0; font-size:16px; color:#111827; }
      .apr__sub { margin:4px 0 10px; color:#6B7280; font-size:13px; }
      .apr__row { display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px dashed #eef2f7; color:#334155; }
    `);
  }

  /** Customer-segment template extension — the segment editor template gallery. */
  private segmentTemplateSurfacePreview(spec: RecipeSpec): string {
    const templatesRaw = this.cfgVal(spec, 'templates');
    const templates = Array.isArray(templatesRaw) ? (templatesRaw as Array<Record<string, unknown>>) : [];
    const cards = templates.length
      ? templates
          .map(
            (t) => `
        <div class="seg__card">
          <h3>${esc(String(t?.title ?? 'Template'))}</h3>
          <p class="surf-muted">${esc(String(t?.description ?? ''))}</p>
          <code class="seg__q">${esc(String(t?.query ?? ''))}</code>
        </div>`,
          )
          .join('')
      : '<p class="surf-muted">No segment templates configured yet.</p>';
    return this.surfaceCard(spec.name, `${spec.type} · segment templates`, `
      <div class="surf-panel">
        <p class="surf-muted">Appears in the customer segment editor’s template gallery. One click inserts the query.</p>
        <div class="seg__grid">${cards}</div>
        <details class="surf-state"><summary>Target</summary><p class="surf-muted"><code>admin.customers.segmentation-templates.data</code> — a runnable data extension returning these templates.</p></details>
      </div>
    `, `
      .seg__grid { display:grid; gap:10px; margin:10px 0; }
      .seg__card { border:1px solid #DCE3EC; border-radius:8px; padding:12px; background:#fff; }
      .seg__card h3 { margin:0 0 4px; font-size:14px; color:#1F3A5F; }
      .seg__q { display:block; margin-top:8px; background:#F6F8FB; border-radius:6px; padding:6px 8px; font-size:12px; color:#334155; overflow-x:auto; }
    `);
  }

  private accountSurfacePreview(spec: RecipeSpec): string {
    const blocks = this.cfgVal(spec, 'blocks');
    const items = Array.isArray(blocks) ? (blocks as Array<Record<string, unknown>>) : [];
    // Blocks carry their real copy in `content` (not `body`) — surface it so
    // different customer-account templates render distinctly rather than all
    // showing their block kind name.
    const list = items.length
      ? items
          .map((b) => {
            const bt = String(b.title ?? b.kind ?? 'Block');
            const bc = String(b.content ?? b.body ?? '');
            return `<div class="surf-panel"><h3>${esc(bt)}</h3>${
              bc ? `<p class="surf-muted">${esc(bc)}</p>` : ''
            }</div>`;
          })
          .join('')
      : `<div class="surf-panel"><h3>${esc(String(this.cfgVal(spec, 'title') ?? spec.name))}</h3><p class="surf-muted">${esc(
          String(
            this.cfgVal(spec, 'description') ??
              'Customer account block populated from account context (orders, loyalty tier).',
          ),
        )}</p></div>`;
    return this.surfaceCard(spec.name, `${spec.type} · customer account`, `<div class="acct">${list}</div>`, `
      .acct { display:grid; gap:12px; }
    `);
  }

  private posSurfacePreview(spec: RecipeSpec): string {
    const title = String(this.cfgVal(spec, 'title') ?? spec.name);
    // Surface the POS target + action label so different POS blocks (e.g. a
    // customer-details vs order-details action that share a name) preview
    // distinctly and tell the associate WHERE the block appears.
    const target = String(this.cfgVal(spec, 'target') ?? '');
    const actionLabel = String(this.cfgVal(spec, 'label') ?? '');
    // 'pos.customer-details.action.render' -> 'Customer details'
    const surfaceLabel = target
      ? target
          .replace(/^pos\./, '')
          .replace(/\.(action|block)\.render$/, '')
          .replace(/[.-]/g, ' ')
          .replace(/\b\w/g, (m) => m.toUpperCase())
          .trim()
      : '';
    return this.surfaceCard(spec.name, `${spec.type} · POS`, `
      <div class="surf-panel pos">
        <h3>${esc(title)}</h3>
        ${surfaceLabel ? `<p class="surf-muted">Appears on: <strong>${esc(surfaceLabel)}</strong></p>` : ''}
        <a class="surf-btn" href="#tap">${actionLabel ? esc(actionLabel) : 'Tap tile'}</a>
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

  /**
   * Deterministic messaging.campaign preview (R3.4). No AI, no live send — renders
   * the channel badge, the trigger, an audience summary, and the primary template
   * with sample merge-var substitution so the merchant sees exactly what fans out.
   * SMS/push (needs_runtime) are labelled honestly so the merchant sees the gate.
   */
  private messagingCampaignPreview(spec: RecipeSpec): string {
    const cfg = (spec.config ?? {}) as Record<string, unknown>;
    const channel = String(cfg.channel ?? 'email');
    // Credential-aware: email/slack always send; sms/push send only when the merchant
    // provider credentials are configured (else honestly "needs runtime").
    const sendability = messagingChannelSendability(channel as never, process.env);
    const shipped = sendability.status === 'ready';
    const trigger = (cfg.trigger ?? {}) as Record<string, unknown>;
    const triggerKind = String(trigger.kind ?? 'broadcast');
    const dripSteps = Array.isArray(trigger.steps) ? (trigger.steps as unknown[]).length : 0;
    const triggerLabel =
      triggerKind === 'event'
        ? `On event: ${String(trigger.event ?? '—')}`
        : triggerKind === 'back_in_stock'
          ? 'On back-in-stock (product restock)'
          : triggerKind === 'drip'
            ? `Drip: ${String(trigger.dripPreset ?? '—')} (${dripSteps} step${dripSteps === 1 ? '' : 's'})`
            : 'Broadcast (Send now / scheduled)';

    const audience = (cfg.audience ?? {}) as Record<string, unknown>;
    const source = String(audience.source ?? 'data_store');
    const batchSize = Number(cfg.batchSize ?? 200);
    const audienceSummary =
      source === 'data_store'
        ? `Subscribers in "${String(audience.storeKey ?? '—')}" (up to ${batchSize}/run)`
        : source === 'event_recipient'
          ? 'The recipient on the triggering event'
          : `${Array.isArray(audience.recipients) ? audience.recipients.length : 0} explicit recipient(s)`;
    const ruleEngine = (audience.ruleEngine ?? {}) as Record<string, unknown>;
    const filtered = ruleEngine.enabled === true;
    const consentField = audience.consentField ? String(audience.consentField) : '';

    const templates = Array.isArray(cfg.templates) ? (cfg.templates as Array<Record<string, unknown>>) : [];
    const tmpl = templates.find((t) => String(t.channel) === channel) ?? templates[0];

    // Sample merge-var context — deterministic, so the preview is stable.
    const sample: Record<string, string> = {
      'record.product_title': 'Aurora Down Jacket',
      'record.product_url': 'https://example.com/products/aurora',
      'record.first_name': 'Sam',
      'record.email': 'sam@example.com',
    };
    const render = (s: string) =>
      s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => sample[path] ?? `{{${path}}}`);

    const subject = tmpl?.subject ? render(String(tmpl.subject)) : '';
    const bodyRaw = tmpl?.body ? String(tmpl.body) : '';
    const body = sanitizePreviewHtml(render(bodyRaw));

    const channelBadge = shipped
      ? `<span class="msg__chip msg__chip--ok">${esc(channel)} · sends now</span>`
      : `<span class="msg__chip msg__chip--gate">${esc(channel)} · needs runtime</span>`;

    const templateBody =
      channel === 'email'
        ? `<div class="msg__email"><div class="msg__subj">${esc(subject) || '<em>(no subject)</em>'}</div><div class="msg__html">${body || '<em>(empty body)</em>'}</div></div>`
        : `<div class="msg__text">${esc(render(bodyRaw)) || '<em>(empty body)</em>'}</div>`;

    return this.surfaceCard(spec.name, `${spec.type} · messaging`, `
      <div class="surf-panel">
        <div class="msg__head">${channelBadge}<span class="msg__trig">${esc(triggerLabel)}</span></div>
        <div class="msg__meta">
          <div class="msg__row"><span>Audience</span><span>${esc(audienceSummary)}</span></div>
          ${filtered ? `<div class="msg__row"><span>Filter</span><span>Rule-engine per-recipient filter applied</span></div>` : ''}
          ${consentField ? `<div class="msg__row"><span>Consent</span><span>Skips recipients where <code>${esc(consentField)}</code> is falsy</span></div>` : ''}
        </div>
        <h3>Rendered message (sample data)</h3>
        ${templateBody}
        ${
          shipped
            ? ''
            : `<details class="surf-state" open><summary>Runtime</summary><p class="surf-muted">The ${esc(channel)} connector ships, but this channel needs the merchant provider credentials (${esc((sendability.status === 'needs_credentials' ? sendability.missing : []).join(', ') || 'provider config')}) before it can send. Until configured this campaign is authorable and previewable, but blocked at publish (needs runtime) — never a fake send. Email and Slack send today.</p></details>`
        }
      </div>
    `, `
      .msg__head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
      .msg__chip { border-radius:9999px; padding:3px 10px; font-size:12px; text-transform:capitalize; }
      .msg__chip--ok { background:#E7F5EF; color:#0E9F6E; }
      .msg__chip--gate { background:#FEF3C7; color:#92400E; }
      .msg__trig { font-size:13px; color:#475569; }
      .msg__meta { display:grid; gap:4px; margin-bottom:12px; }
      .msg__row { display:flex; justify-content:space-between; gap:12px; font-size:13px; border-bottom:1px dashed #e2e8f0; padding:3px 0; }
      .msg__row span:first-child { color:#6B7280; }
      .msg__email { border:1px solid #dce3ec; border-radius:8px; overflow:hidden; }
      .msg__subj { background:#f8fafc; border-bottom:1px solid #dce3ec; padding:8px 12px; font-weight:600; color:#111827; font-size:14px; }
      .msg__html { padding:12px; font-size:14px; color:#1f2937; }
      .msg__text { border:1px solid #dce3ec; border-radius:8px; padding:12px; font-size:14px; color:#1f2937; white-space:pre-wrap; }
    `);
  }

  /**
   * Deterministic agentic.catalogProfile preview (M13). No AI, no live crawl —
   * renders a summary card computed from config: the feed URL, the product source,
   * counts (attributes mapped · disclosures), and an honest split of which artifacts
   * are REAL (the app-served feed) vs needs_runtime (MCP/agent-profile/sponsored).
   */
  private agenticCatalogProfilePreview(spec: RecipeSpec): string {
    const cfg = (spec.config ?? {}) as Record<string, unknown>;
    const feedHandle = String(cfg.feedHandle ?? 'catalog');
    const artifacts = Array.isArray(cfg.artifacts) ? (cfg.artifacts as string[]) : ['catalog-feed'];
    const source = (cfg.source ?? {}) as Record<string, unknown>;
    const sourceKind = String(source.kind ?? 'all');
    const attributeMap = Array.isArray(cfg.attributeMap) ? (cfg.attributeMap as unknown[]) : [];
    const disclosures = Array.isArray(cfg.disclosures) ? (cfg.disclosures as unknown[]) : [];

    const SHIPPED = new Set(['catalog-feed', 'attribute-map', 'compliance-disclosure']);
    const real = artifacts.filter((a) => SHIPPED.has(a));
    const deferred = artifacts.filter((a) => !SHIPPED.has(a));

    const sourceLabel =
      sourceKind === 'collection'
        ? `Collection (${Array.isArray(source.collectionIds) ? source.collectionIds.length : 0})`
        : sourceKind === 'manual'
          ? `Manual (${Array.isArray(source.productIds) ? source.productIds.length : 0} products)`
          : 'All active products';

    const chips = (list: string[], cls: string) =>
      list.map((a) => `<span class="ag__chip ag__chip--${cls}">${esc(a)}</span>`).join('');

    return this.surfaceCard(spec.name, `${spec.type} · agentic`, `
      <div class="surf-panel">
        <div class="ag__url">GET <code>/agentic/{shop}/${esc(feedHandle)}/feed.json</code></div>
        <div class="ag__meta">
          <div class="msg__row"><span>Product source</span><span>${esc(sourceLabel)}</span></div>
          <div class="msg__row"><span>Attributes mapped</span><span>${attributeMap.length}</span></div>
          <div class="msg__row"><span>Disclosures</span><span>${disclosures.length}</span></div>
        </div>
        <h3>Artifacts</h3>
        <div class="ag__chips">${chips(real, 'ok') || '<span class="surf-muted">none</span>'}</div>
        ${
          deferred.length
            ? `<details class="surf-state" open><summary>Not yet shipped (needs_runtime)</summary>
                 <div class="ag__chips">${chips(deferred, 'gate')}</div>
                 <p class="surf-muted">These artifacts (hosted MCP endpoint, agent-profile registration, sponsored products) are modeled but their runtime is not shipped. The module publishes only the feed; these are named as deferred and never faked.</p>
               </details>`
            : ''
        }
      </div>
    `, `
      .ag__url { font-size:13px; color:#475569; margin-bottom:12px; }
      .ag__url code { background:#f1f5f9; padding:2px 6px; border-radius:6px; font-size:12px; }
      .ag__meta { display:grid; gap:4px; margin-bottom:12px; }
      .ag__chips { display:flex; gap:8px; flex-wrap:wrap; }
      .ag__chip { border-radius:9999px; padding:3px 10px; font-size:12px; }
      .ag__chip--ok { background:#E7F5EF; color:#0E9F6E; }
      .ag__chip--gate { background:#FEF3C7; color:#92400E; }
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
  // Every preview is rendered with illustrative SAMPLE values (the module isn't
  // bound to real store data until published). A small persistent marker makes
  // that explicit so merchants don't mistake demo values for their real config.
  //
  // Storefront previews additionally wrap the body in the SAME
  // `.superapp-scope[data-sa-pack]` wrapper the theme extension renders and
  // inline the real `superapp-modules.css`, so preview == storefront (R0).
  // The pack stylesheet is injected AFTER the legacy per-kind CSS so the design
  // system wins where selectors collide.
  const packCss = activePack ? loadPackCss() : '';
  const scopeOpen = activePack
    ? `<div class="superapp-scope" data-sa-pack="${activePack}"${
        activeAccent ? ` style="--sa-accent-override:${escAttr(activeAccent)}"` : ''
      }>`
    : '';
  const scopeClose = activePack ? '</div>' : '';
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Preview</title>
        <style>
      .sa-sample-badge {
        position: fixed; top: 8px; right: 8px; z-index: 2147483646;
        background: rgba(17,24,39,0.06); color: #6b7280;
        font: 600 11px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        letter-spacing: 0.02em; padding: 4px 8px; border-radius: 9999px;
        border: 1px solid rgba(17,24,39,0.08); pointer-events: none;
      }
      ${css}${packCss ? `\n/* ── two-pack design system (real storefront stylesheet) ── */\n${packCss}` : ''}</style>
      </head>
      <body>
        <div class="sa-sample-badge" aria-hidden="true">Sample data</div>
        <div style="padding:16px">${scopeOpen}${body}${scopeClose}</div>
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

/**
 * R2.5 — BEM-style layout modifier class from a layout archetype value. Returns
 * a leading-space `" superapp-layout--<token>"` or `''` when absent. `stacked`
 * is the default and a CSS no-op, so it emits no modifier (keeps the pre-R2.5
 * output byte-identical). Defence-in-depth sanitization even though the value
 * comes from a closed per-type enum.
 */
function layoutModifierClass(layout: unknown): string {
  if (typeof layout !== 'string' || layout.length === 0 || layout === 'stacked') return '';
  const token = layout.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return ` superapp-layout--${token}`;
}

// ── R6 · Native-section archetype resolution + render helpers ────────────────
// Single source of truth mapping every library `config.kind` to a canonical
// archetype (archetype-contract.md §"Canonical archetypes and kind aliases").
// The storefront Liquid + native-section compiler resolve the SAME table, so the
// preview class trees below match what the storefront renders (R0 parity).

type SectionArchetype =
  | 'hero' | 'feature' | 'gallery' | 'collection' | 'pricing' | 'faq'
  | 'testimonial' | 'stats' | 'cta' | 'trust' | 'newsletter' | 'launch'
  | 'contact' | 'team' | 'timeline' | 'upsell' | 'band' | 'technical';

const KIND_ARCHETYPE: Record<string, SectionArchetype> = {
  hero: 'hero', 'collection-hero': 'hero',
  feature: 'feature', benefit: 'feature',
  gallery: 'gallery', lookbook: 'gallery', 'collection-lookbook': 'gallery', 'collection-carousel': 'gallery',
  'collection-story': 'collection', 'collection-split': 'collection', 'collection-promo': 'collection',
  'collection-list': 'collection', story: 'collection',
  pricing: 'pricing', comparison: 'pricing', plan: 'pricing',
  faq: 'faq', accordion: 'faq',
  testimonials: 'testimonial', reviews: 'testimonial', 'social-proof': 'testimonial',
  'review-summary': 'testimonial', testimonial: 'testimonial',
  stats: 'stats',
  cta: 'cta', 'rich-text': 'cta',
  trust: 'trust', 'trust-badges': 'trust', 'trust-badge': 'trust', 'payment-badges': 'trust',
  'usp-strip': 'trust', 'logo-marquee': 'trust',
  newsletter: 'newsletter',
  launch: 'launch', 'coming-soon': 'launch', '404': 'launch',
  contact: 'contact',
  team: 'team',
  timeline: 'timeline', steps: 'timeline',
  upsell: 'upsell', 'bought-together': 'upsell', 'product-addons': 'upsell',
  announcement: 'band', 'announcement-bar': 'band', 'free-shipping-bar': 'band',
  countdown: 'band', 'countdown-bar': 'band', progress: 'band',
  consent: 'technical', 'json-ld': 'technical', meta: 'technical', 'pixel-bootstrap': 'technical',
  preload: 'technical', filters: 'technical', search: 'technical', sort: 'technical',
  'sticky-atc': 'technical', 'size-chart': 'technical', 'star-rating': 'technical',
  'payment-icons': 'technical', footer: 'technical', rewards: 'technical', badge: 'technical',
};

function sectionArchetype(kind: string): SectionArchetype | null {
  return KIND_ARCHETYPE[kind] ?? null;
}

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/** config.fields as a record (never undefined). */
function saFields(spec: ThemeSectionSpec): Record<string, unknown> {
  const f = (spec.config as { fields?: unknown }).fields;
  return f && typeof f === 'object' ? (f as Record<string, unknown>) : {};
}

/** Read a value from config.fields then top-level config, coerced to a string. */
function saStr(spec: ThemeSectionSpec, key: string): string {
  const c = spec.config as Record<string, unknown>;
  const v = saFields(spec)[key] ?? c[key];
  return v == null ? '' : String(v);
}

/** A block's CTA style (`fields.style`), normalized to the button variant set. */
function blockStyle(b: { fields?: Record<string, unknown> }): string {
  const s = String((b.fields ?? {}).style ?? 'primary');
  return ['primary', 'secondary', 'outline', 'ghost', 'link'].includes(s) ? s : 'primary';
}

/** Section head (title + subtitle) shared by archetypes that wrap a child grid. */
function sectionHead(spec: ThemeSectionSpec): string {
  const title = spec.config.title;
  const sub = spec.config.subtitle;
  if (!title && !sub) return '';
  return `<header class="superapp-archsection__head">
    ${title ? `<h2 class="superapp-archsection__title">${esc(String(title))}</h2>` : ''}
    ${sub ? `<p class="superapp-archsection__sub">${esc(String(sub))}</p>` : ''}
  </header>`;
}

/** Minimal per-renderer CSS — the archetype classes come from the inlined pack sheet. */
function previewBase(): string {
  return `body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }`;
}

/**
 * A CTA anchor. Carries the archetype-specific class (`cls`, for layout) plus the
 * shared `.superapp-btn`/`--variant` classes so one button rule-set dresses every
 * archetype's CTAs consistently across both packs.
 */
function ctaButton(text: string, url: string | undefined, style: string, cls: string): string {
  if (!text) return '';
  const variant = ['primary', 'secondary', 'outline', 'ghost', 'link'].includes(style) ? style : 'primary';
  return `<a class="${cls} superapp-btn superapp-btn--${variant}" href="${escAttr(url || '#')}">${esc(text)}</a>`;
}

/** ★ rating row (filled + empty stars), aria-labelled. */
function starRow(rating: number): string {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    stars += `<span class="superapp-testimonial__star${i > r ? ' is-empty' : ''}" aria-hidden="true">★</span>`;
  }
  return `<span class="superapp-testimonial__rating" role="img" aria-label="${r} out of 5 stars">${stars}</span>`;
}

/** True when a media URL is a demo/placeholder (would 404) or is missing. */
function isPlaceholderUrl(url: string): boolean {
  if (!url) return true;
  if (/(^|\.)example\.com/i.test(url)) return true;
  // Library demo assets under Shopify's CDN files path are illustrative, not real.
  if (/cdn\.shopify\.com\/s\/files\//i.test(url)) return true;
  return false;
}

/** Tasteful placeholder SVG glyph shared by media placeholders. */
const PH_SVG =
  '<svg class="superapp-ph__glyph" viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="6" y="9" width="36" height="30" rx="3"/><circle cx="17" cy="19" r="3.5"/><path d="M8 34l10-9 7 6 6-6 9 9"/></svg>';

/**
 * Media element for a slot: a real `<img>` when the URL looks real, otherwise a
 * token-accented placeholder div (never a broken image). Both carry `cls` so the
 * archetype sizing rules apply either way.
 */
function phMedia(url: string, alt: string, cls: string): string {
  if (!isPlaceholderUrl(url)) {
    return `<img class="${cls}" src="${escAttr(url)}" alt="${escAttr(alt)}" loading="lazy" />`;
  }
  return `<div class="${cls} superapp-ph" role="img" aria-label="${escAttr(alt || 'Sample image')}">${PH_SVG}</div>`;
}

/** Small inline glyph for icon slots (feature/trust/contact). Accent-colored. */
function glyph(_name: string): string {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
}

/** Human-readable label for a technical kind. */
function humanizeKind(kind: string): string {
  return kind
    .replace(/[-_]/g, ' ')
    .replace(/\bjson ld\b/i, 'JSON-LD')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Curated, human-labeled summary rows for the `technical` archetype — a small
 * allowlist of meaningful keys, NEVER a raw dump of every field. Values are
 * humanized (arrays → counts, booleans → Yes/No).
 */
function curatedTechRows(spec: ThemeSectionSpec): Array<[string, string]> {
  const f = saFields(spec);
  const LABELS: Record<string, string> = {
    schemaType: 'Schema type', type: 'Type', mode: 'Mode', position: 'Position',
    placement: 'Placement', events: 'Events', provider: 'Provider', enabled: 'Enabled',
    consentCategory: 'Consent category', label: 'Label', target: 'Target',
    strategy: 'Strategy', unit: 'Unit', size: 'Size', currency: 'Currency',
    ctaLabel: 'CTA label', showPrice: 'Show price', showThumbnail: 'Show thumbnail',
    showOnScrollPastAtc: 'Show past ATC', columnsDesktop: 'Columns (desktop)',
    iconStyle: 'Icon style', sortBy: 'Sort by', defaultSort: 'Default sort',
  };
  const rows: Array<[string, string]> = [];
  for (const [key, label] of Object.entries(LABELS)) {
    const v = f[key];
    if (v == null || v === '') continue;
    let out: string;
    if (Array.isArray(v)) out = `${v.length} item${v.length === 1 ? '' : 's'}`;
    else if (typeof v === 'boolean') out = v ? 'Yes' : 'No';
    else if (typeof v === 'object') continue;
    else out = String(v);
    rows.push([label, out]);
  }
  return rows.slice(0, 6);
}

/**
 * Render a single generic block by its kind (last-resort generic section only).
 * Every known block kind gets meaningful markup — never a bare `<div><p>text</p></div>`.
 */
function renderGenericBlock(b: {
  kind: string;
  text?: string;
  imageUrl?: string;
  url?: string;
  fields?: Record<string, unknown>;
}): string {
  const bf = (b.fields ?? {}) as Record<string, unknown>;
  switch (b.kind) {
    case 'cta':
      return ctaButton(b.text ?? '', b.url, blockStyle(b), 'superapp-block__btn');
    case 'stat':
    case 'number':
    case 'percentage':
      return `<div class="superapp-section__block superapp-section__block--stat"><span class="superapp-block__num">${esc(
        b.text ?? '',
      )}</span>${bf.label ? `<span class="superapp-block__label">${esc(String(bf.label))}</span>` : ''}</div>`;
    case 'feature':
    case 'benefit':
      return `<div class="superapp-section__block">${
        bf.eyebrow ? `<span class="superapp-block__eyebrow">${esc(String(bf.eyebrow))}</span>` : ''
      }${bf.heading ? `<h3 class="superapp-block__heading">${esc(String(bf.heading))}</h3>` : ''}${
        b.text ? `<p class="superapp-section__block-text">${esc(b.text)}</p>` : ''
      }</div>`;
    case 'faq-item':
      return `<details class="superapp-faq__item"><summary class="superapp-faq__q">${esc(
        b.text ?? '',
      )}</summary><div class="superapp-faq__a">${esc(String(bf.answer ?? ''))}</div></details>`;
    case 'review-card':
    case 'testimonial':
      return `<figure class="superapp-section__block">${starRow(
        typeof bf.rating === 'number' ? bf.rating : 5,
      )}<blockquote>${esc(b.text ?? '')}</blockquote>${
        bf.author ? `<figcaption>${esc(String(bf.author))}</figcaption>` : ''
      }</figure>`;
    case 'slide':
    case 'media':
    case 'logo':
      return `<div class="superapp-section__block">${phMedia(
        b.imageUrl ?? '',
        b.text ?? '',
        'superapp-section__block-img',
      )}${b.text ? `<p class="superapp-section__block-text">${esc(b.text)}</p>` : ''}</div>`;
    case 'badge':
      return `<div class="superapp-section__block">${
        b.text ? `<strong>${esc(b.text)}</strong>` : ''
      }${bf.caption ? `<p class="superapp-section__block-text">${esc(String(bf.caption))}</p>` : ''}</div>`;
    default:
      return b.text
        ? `<div class="superapp-section__block"><p class="superapp-section__block-text">${esc(b.text)}</p></div>`
        : '';
  }
}

/**
 * R2.1 — preview reflection of display rules. Evaluates the pack against a
 * synthetic "preview visitor" (a logged-out first-time US shopper with an empty
 * cart) via the SHARED evaluator. Returns a labelled "hidden by display rules"
 * page only when the rules resolve to a DEFINITE hide (`resolvable && verdict ===
 * 'hide'`) — so behavioral/unresolved rules (which the storefront defers to the
 * client) still preview the module normally. Absent/disabled ruleEngine returns
 * `null` (render the module unchanged — byte-identical to pre-R2.1).
 */
function ruleHiddenState(rules: RuleEnginePack | undefined): string | null {
  if (!rules || !rules.enabled || !rules.groups || rules.groups.length === 0) return null;
  const ctx = {
    values: {
      'customer.loggedIn': false,
      'customer.ordersCount': 0,
      'geo.countryCode': 'US',
      'customer.countryCode': 'US',
      'cart.subtotal': 0,
      'cart.itemCount': 0,
    } as Record<string, string | number | boolean | string[] | undefined>,
  };
  const { verdict, resolvable } = evaluateRuleEngine(rules, ctx);
  if (!resolvable || verdict !== 'hide') return null;
  const action = rules.matchAction === 'HIDE' ? 'HIDE when rules match' : 'SHOW when rules match';
  return pageHtml(
    `
      <div class="superapp-rule-hidden" role="note">
        <div class="superapp-rule-hidden__badge">Hidden by display rules</div>
        <p class="superapp-rule-hidden__msg">This module is gated by <strong>display rules</strong> (${esc(action)}). For this preview visitor (logged-out, first-time, US, empty cart) the rules resolve to <strong>hide</strong>, so nothing renders on the storefront.</p>
      </div>
    `,
    `
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
      .superapp-rule-hidden { max-width: 560px; margin: 24px auto; padding: 20px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; color: #334155; }
      .superapp-rule-hidden__badge { display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
      .superapp-rule-hidden__msg { margin: 0; line-height: 1.5; }
    `,
  );
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

