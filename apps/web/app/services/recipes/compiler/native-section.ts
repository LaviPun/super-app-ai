/**
 * Native-section renderer (spec 033 + section-archetype contract).
 *
 * Deterministically assembles a self-contained `sections/superapp-<slug>.liquid`
 * from an already-validated, already-sanitized `theme.section` RecipeSpec — the
 * SECOND deploy medium for a storefront section (alongside the shipped app-block /
 * metaobject path). Pure + no I/O: given the same spec it always produces the same
 * bytes, so the output is a valid native section by construction (defense-in-depth
 * validation still runs at publish preflight).
 *
 * The trust model is unchanged from the app-block path: we do NOT let the model
 * emit arbitrary Liquid. The body is built from the spec's typed fields, blocks,
 * and compiled style; `advancedCustom` flows through the same sanitizer. Only the
 * OUTPUT medium changes.
 *
 * Parity (section-archetype contract, R0): the markup here uses the SAME BEM class
 * trees as PreviewService and snippets/superapp-module.liquid, resolved through the
 * SAME kind→archetype alias table. But a native section cannot rely on the theme
 * app-extension's superapp-modules.css, so each file carries a scoped `{% style %}`
 * block with the archetype's structural CSS, driven by the compiled `--sa-*` token
 * values (from `compileStyleVars`, re-scoped to `#shopify-section-{{ section.id }}`).
 */
import type { RecipeSpec, StorefrontStyle } from '@superapp/core';
import { compileStyleVars, compileStyleCss, compileCustomCss, normalizeStyle } from './style-compiler';
import { KIND_ARCHETYPE } from '../kind-archetype';

type ThemeSectionSpec = Extract<RecipeSpec, { type: 'theme.section' }>;

/** A Shopify `{% schema %}` setting entry (subset we emit). */
type SchemaSetting = {
  type: string;
  id: string;
  label: string;
  default?: unknown;
  options?: Array<{ value: string; label: string }>;
};

/** A Shopify `{% schema %}` block-type definition. */
type SchemaBlock = {
  type: string;
  name: string;
  settings: SchemaSetting[];
};

/** A preset block instance (drives the default layout when the section is added). */
type PresetBlock = {
  type: string;
  settings: Record<string, unknown>;
};

/**
 * Filesystem/handle-safe slug for the section filename. Lowercase, `[a-z0-9-]`,
 * collapsed dashes, trimmed, capped. Guarantees the emitted key always matches
 * the publish allow-list `^sections/superapp-[a-z0-9-]+\.liquid$`.
 */
export function toSectionSlug(raw: string): string {
  const slug = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

/** The `sections/…` filename for a module slug. */
export function nativeSectionFilename(slug: string): string {
  return `sections/superapp-${toSectionSlug(slug)}.liquid`;
}

/**
 * Slug-safe native block `type` (used as an object key + CSS class suffix +
 * Liquid `{% when %}` branch). Constrained to `^[a-z][a-z0-9_-]{0,24}$`.
 */
function toBlockType(kind: string): string {
  let t = String(kind ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z]+/, '')
    .slice(0, 25)
    .replace(/-+$/g, '');
  if (!t) t = 'item';
  return t;
}

/**
 * Snake_case, theme-check-safe setting id for a field key. camelCase splits on the
 * case boundary (`ctaLabel` → `cta_label`, `mediaImageUrl` → `media_image_url`), so
 * the markup can reference a stable, predictable id that always matches what the
 * schema declared.
 */
function fieldSettingId(key: string): string {
  let id = String(key ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!id) id = 'field';
  if (!/^[a-z]/.test(id)) id = `f_${id}`;
  return id;
}

/** Map a DataField `type` to the closest Shopify setting `type`. */
function fieldTypeToSettingType(t: string | undefined): string {
  switch (t) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'checkbox';
    case 'select':
      return 'select';
    case 'url':
      return 'url';
    case 'email':
      return 'text';
    case 'textarea':
      return 'textarea';
    case 'date':
      return 'text';
    default:
      return 'text';
  }
}

/** Escape a value for safe interpolation into a Liquid class/attr context. */
function liquidSafe(s: string): string {
  return String(s).replace(/[{}%]/g, '');
}

/** JSON-encode for the `{% schema %}` body (deterministic pretty-print). */
function schemaJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function humanize(s: string): string {
  const words = String(s).replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : s;
}

// ───────────────────────── Archetype resolution ─────────────────────────────
// The kind→archetype alias table is single-sourced in ../kind-archetype (imported
// above). PreviewService and the storefront Liquid `when` table resolve the SAME
// table; the Liquid copy (which can't import a TS const) is kept in sync by
// kind-archetype-parity.test.ts, which fails on any divergence.

/** Archetypes that render nothing but an empty container without blocks → generic. */
const BLOCK_REQUIRED = new Set([
  'feature',
  'gallery',
  'pricing',
  'faq',
  'testimonial',
  'stats',
  'trust',
  'team',
  'timeline',
  'upsell',
]);

/** Archetypes that frame their own header (eyebrow/title/subtitle/body). */
const SELF_HEADER = new Set(['hero', 'cta', 'collection', 'contact', 'band', 'launch', 'newsletter', 'technical']);

function resolveArchetype(kind: string, hasBlocks: boolean): string {
  const arch = KIND_ARCHETYPE[String(kind ?? '').toLowerCase()] ?? 'generic';
  if (BLOCK_REQUIRED.has(arch) && !hasBlocks) return 'generic';
  return arch;
}

// ───────────────────────── Schema (settings + blocks) ───────────────────────

/**
 * Build the `settings[]` for the section from title/subtitle + `config.fieldSchema`
 * + a promotion of every scalar/array key in `config.fields`. Promotion is what
 * makes the archetype markup settings-driven: an authored `eyebrow`/`bodyText`/
 * `mediaImageUrl`/… becomes an editable theme setting with the authored value as its
 * default, referenced from the markup by its stable `fieldSettingId`.
 */
function buildSettings(
  spec: ThemeSectionSpec,
): { settings: SchemaSetting[]; defaults: Record<string, unknown>; ids: Set<string> } {
  const cfg = spec.config as Record<string, unknown>;
  const settings: SchemaSetting[] = [];
  const defaults: Record<string, unknown> = {};

  const title = typeof cfg.title === 'string' ? cfg.title : undefined;
  settings.push({ type: 'text', id: 'title', label: 'Title', default: title ?? '' });
  defaults.title = title ?? '';

  const subtitle = typeof cfg.subtitle === 'string' ? cfg.subtitle : undefined;
  if (subtitle !== undefined) {
    settings.push({ type: 'textarea', id: 'subtitle', label: 'Subtitle', default: subtitle });
    defaults.subtitle = subtitle;
  }

  // Layout variant select (drives a CSS class; same "few variants from one token
  // set" model as the app-block path). Absent layout → a stable default.
  const layout = cfg.layout as { layout?: string } | undefined;
  const layoutValue = typeof layout?.layout === 'string' && layout.layout.length > 0 ? layout.layout : 'default';
  settings.push({
    type: 'select',
    id: 'layout',
    label: 'Layout',
    default: layoutValue,
    options: [
      { value: 'default', label: 'Default' },
      { value: 'columns', label: 'Columns' },
      { value: 'grid', label: 'Grid' },
      { value: 'carousel', label: 'Carousel' },
      ...(layoutValue !== 'default' && !['columns', 'grid', 'carousel'].includes(layoutValue)
        ? [{ value: layoutValue, label: layoutValue }]
        : []),
    ],
  });
  defaults.layout = layoutValue;

  const seen = new Set(settings.map((s) => s.id));

  // Declared typed settings from config.fieldSchema.
  const fieldSchema = cfg.fieldSchema as { fields?: Array<Record<string, unknown>> } | undefined;
  const fieldValues = (cfg.fields as Record<string, unknown>) ?? {};
  for (const f of fieldSchema?.fields ?? []) {
    const name = typeof f.name === 'string' ? f.name : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    seen.add(fieldSettingId(name));
    const settingType = fieldTypeToSettingType(f.type as string | undefined);
    const setting: SchemaSetting = {
      type: settingType,
      id: name,
      label: typeof f.label === 'string' ? f.label : name,
    };
    if (settingType === 'select' && Array.isArray(f.options)) {
      setting.options = (f.options as string[]).map((o) => ({ value: String(o), label: String(o) }));
    }
    const def = fieldValues[name];
    if (def !== undefined) {
      setting.default = settingType === 'checkbox' ? Boolean(def) : def;
      defaults[name] = setting.default;
    }
    settings.push(setting);
  }

  // Promote config.fields → editable settings so the archetype markup is fully
  // settings-driven (no hardcoded copy beyond schema defaults). URL-suffixed strings
  // (image or link) become `url` settings so the authored value survives and the
  // merchant can swap it; long strings → textarea; arrays → a comma-joined text
  // setting (documented limitation — no native list control).
  for (const [k, v] of Object.entries(fieldValues)) {
    if (v === null || v === undefined) continue;
    const id = fieldSettingId(k);
    if (seen.has(id) || seen.has(k)) continue;
    seen.add(id);
    let settingType: string;
    let value: unknown = v;
    if (Array.isArray(v)) {
      settingType = 'text';
      value = v.map((x) => String(x)).join(', ');
    } else if (typeof v === 'object') {
      continue;
    } else if (typeof v === 'boolean') {
      settingType = 'checkbox';
    } else if (typeof v === 'number') {
      settingType = 'number';
    } else if (/url$/i.test(k)) {
      settingType = 'url';
    } else if (typeof v === 'string' && v.length > 80) {
      settingType = 'textarea';
    } else {
      settingType = 'text';
    }
    const setting: SchemaSetting = { type: settingType, id, label: humanize(k) };
    setting.default = settingType === 'checkbox' ? Boolean(value) : value;
    defaults[id] = setting.default;
    settings.push(setting);
  }

  return { settings, defaults, ids: new Set(settings.map((s) => s.id)) };
}

/**
 * Build `blocks[]` (one type definition per DISTINCT `config.blocks[].kind`) and
 * `presets[0].blocks[]` (one instance per authored block). Per-block field types are
 * inferred from the authored values; a `text`/`imageUrl`/`url` become
 * `text`/`url`/`url`, and each `fields.*` key becomes a setting keyed by its
 * `fieldSettingId` (stable, snake_case) so the archetype block markup can read it.
 */
function buildBlocks(spec: ThemeSectionSpec): { blocks: SchemaBlock[]; presetBlocks: PresetBlock[] } {
  const cfg = spec.config as Record<string, unknown>;
  const authored = (cfg.blocks as Array<Record<string, unknown>>) ?? [];
  const byType = new Map<string, SchemaBlock>();
  const presetBlocks: PresetBlock[] = [];

  for (const b of authored) {
    const type = toBlockType(typeof b.kind === 'string' ? b.kind : 'item');
    let def = byType.get(type);
    if (!def) {
      def = { type, name: humanize(type), settings: [] };
      byType.set(type, def);
    }
    const settingsById = new Map(def.settings.map((s) => [s.id, s]));
    const instanceSettings: Record<string, unknown> = {};

    const addSetting = (id: string, settingType: string, label: string, value: unknown) => {
      if (!settingsById.has(id)) {
        const s: SchemaSetting = { type: settingType, id, label };
        settingsById.set(id, s);
        def!.settings.push(s);
      }
      if (value !== undefined) instanceSettings[id] = value;
    };

    if (typeof b.text === 'string') addSetting('text', 'text', 'Text', b.text);
    // Image as a `url` setting: keeps the authored image URL as the default (so the
    // flagship layout renders on add) while staying merchant-editable. Rendered with
    // explicit width/height to satisfy the no-CLS invariant.
    if (typeof b.imageUrl === 'string') addSetting('image', 'url', 'Image URL', b.imageUrl);
    if (typeof b.url === 'string') addSetting('url', 'url', 'Link', b.url);

    const fields = (b.fields as Record<string, unknown>) ?? {};
    for (const [k, v] of Object.entries(fields)) {
      const id = fieldSettingId(k);
      if (Array.isArray(v)) {
        addSetting(id, 'text', humanize(k), v.map((x) => String(x)).join(', '));
      } else if (typeof v === 'boolean') {
        addSetting(id, 'checkbox', humanize(k), v);
      } else if (typeof v === 'number') {
        addSetting(id, 'number', humanize(k), v);
      } else if (v === null || v === undefined) {
        // skip
      } else {
        addSetting(id, /url$/i.test(k) ? 'url' : 'text', humanize(k), String(v));
      }
    }

    presetBlocks.push({ type, settings: instanceSettings });
  }

  return { blocks: [...byType.values()], presetBlocks };
}

// ───────────────────────── Scoped archetype CSS ─────────────────────────────

/** Per-archetype structural CSS, scoped to the section root selector `R`. */
const ARCHETYPE_CSS: Record<string, (R: string) => string> = {
  hero: (R) => `
${R} .superapp-hero{display:grid;gap:var(--sa-gap,1.5rem);align-items:center;}
${R} .superapp-hero--split{grid-template-columns:1fr 1fr;}
${R} .superapp-hero--overlay{position:relative;min-block-size:60vh;place-items:center;text-align:center;overflow:hidden;}
${R} .superapp-hero--overlay .superapp-hero__media{position:absolute;inset:0;inline-size:100%;block-size:100%;object-fit:cover;z-index:0;}
${R} .superapp-hero--overlay .superapp-hero__content{position:relative;z-index:1;padding:2rem;}
${R} .superapp-hero--overlay::after{content:"";position:absolute;inset:0;background:var(--sa-backdrop,rgba(0,0,0,.4));z-index:0;}
${R} .superapp-hero__media{inline-size:100%;border-radius:var(--sa-radius,12px);object-fit:cover;}
${R} .superapp-hero__eyebrow{display:inline-block;text-transform:uppercase;letter-spacing:.08em;font-size:.75em;opacity:.7;margin-block-end:.5rem;}
${R} .superapp-hero__title{font-size:clamp(2rem,5vw,3.5rem);font-weight:var(--sa-fw,700);line-height:1.05;margin:0 0 .4em;}
${R} .superapp-hero__subtitle{font-size:1.15em;opacity:.85;margin:0 0 1rem;}
${R} .superapp-hero__body{opacity:.75;margin:0 0 1.25rem;max-inline-size:52ch;}
${R} .superapp-hero__ctas{display:flex;flex-wrap:wrap;gap:.75rem;margin-block-start:1rem;}
${R} .superapp-hero__cta{display:inline-flex;align-items:center;justify-content:center;padding:.75em 1.5em;border-radius:var(--sa-btn-radius,8px);font-weight:600;text-decoration:none;transition:transform .2s var(--sa-ease,ease);}
${R} .superapp-hero__cta--primary{background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);}
${R} .superapp-hero__cta--secondary{border:1px solid currentColor;}
${R} .superapp-hero__cta--link,${R} .superapp-hero__cta--ghost{text-decoration:underline;}
${R} .superapp-hero__cta:hover{transform:translateY(-1px);}
${R} .superapp-hero__proof{display:flex;flex-wrap:wrap;gap:1.5rem;margin-block-start:1.5rem;}
${R} .superapp-hero__proofvalue{display:block;font-size:1.5em;font-weight:700;}
${R} .superapp-hero__prooflabel{opacity:.7;font-size:.85em;}
@media (max-width:749px){${R} .superapp-hero--split{grid-template-columns:1fr;}}`,

  feature: (R) => `
${R} .superapp-feature{display:grid;gap:var(--sa-gap,1.5rem);grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}
${R} .superapp-feature__item{padding:var(--sa-pad,1.25rem);border-radius:var(--sa-radius,12px);box-shadow:var(--sa-shadow,none);background:var(--sa-surface,transparent);}
${R} .superapp-feature__item--wide{grid-column:span 2;}
${R} .superapp-feature__icon{display:inline-flex;inline-size:2.5rem;block-size:2.5rem;border-radius:999px;background:var(--sa-bg-subtle,rgba(0,0,0,.06));margin-block-end:.75rem;}
${R} .superapp-feature__title{font-size:1.1em;font-weight:700;margin:0 0 .35em;}
${R} .superapp-feature__text{opacity:.75;margin:0;}
@media (max-width:749px){${R} .superapp-feature__item--wide{grid-column:auto;}}`,

  gallery: (R) => `
${R} .superapp-gallery{display:grid;gap:var(--sa-gap,1rem);grid-template-columns:repeat(auto-fill,minmax(240px,1fr));}
${R} .superapp-gallery--masonry{grid-auto-rows:12rem;}
${R} .superapp-gallery__item{position:relative;margin:0;overflow:hidden;border-radius:var(--sa-radius,12px);}
${R} .superapp-gallery__item img{inline-size:100%;block-size:100%;object-fit:cover;}
${R} .superapp-gallery__item--tall{grid-row:span 2;}
${R} .superapp-gallery__item--wide{grid-column:span 2;}
${R} .superapp-gallery__caption{position:absolute;inset-inline:0;inset-block-end:0;padding:.75rem;background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;font-size:.85em;}
@media (max-width:749px){${R} .superapp-gallery__item--wide,${R} .superapp-gallery__item--tall{grid-column:auto;grid-row:auto;}}`,

  collection: (R) => `
${R} .superapp-collection{display:grid;gap:var(--sa-gap,1.5rem);}
${R} .superapp-collection__media img{inline-size:100%;border-radius:var(--sa-radius,12px);object-fit:cover;}
${R} .superapp-collection__eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.75em;opacity:.7;}
${R} .superapp-collection__title{font-size:clamp(1.5rem,4vw,2.5rem);font-weight:700;margin:.25em 0 .4em;}
${R} .superapp-collection__text{opacity:.8;margin:0 0 1rem;max-inline-size:64ch;}
${R} .superapp-collection__story{margin-block:1.5rem;}
${R} .superapp-collection__storyimg{inline-size:100%;border-radius:var(--sa-radius,8px);margin-block-end:.5rem;}
${R} .superapp-collection__caption{display:block;font-size:.8em;opacity:.6;font-style:italic;}
${R} .superapp-collection__cta{display:inline-flex;padding:.7em 1.4em;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);text-decoration:none;font-weight:600;}`,

  cta: (R) => `
${R} .superapp-cta{text-align:center;padding:var(--sa-pad,2rem);border-radius:var(--sa-radius,16px);background:var(--sa-surface,transparent);}
${R} .superapp-cta__title{font-size:clamp(1.5rem,3vw,2.25rem);font-weight:700;margin:0 0 .4em;}
${R} .superapp-cta__text{opacity:.8;margin:0 auto 1.25rem;max-inline-size:52ch;}
${R} .superapp-cta__button{display:inline-flex;align-items:center;justify-content:center;margin:.25rem;padding:.8em 1.75em;border-radius:var(--sa-btn-radius,8px);font-weight:600;text-decoration:none;transition:transform .2s;}
${R} .superapp-cta__button--primary{background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);}
${R} .superapp-cta__button--secondary{border:1px solid currentColor;}
${R} .superapp-cta__button--ghost,${R} .superapp-cta__button--link{text-decoration:underline;}
${R} .superapp-cta__button:hover{transform:translateY(-1px);}`,

  pricing: (R) => `
${R} .superapp-pricing{display:grid;gap:var(--sa-gap,1.5rem);grid-template-columns:repeat(auto-fit,minmax(240px,1fr));align-items:stretch;}
${R} .superapp-pricing--matrix{display:block;overflow-x:auto;}
${R} .superapp-pricing__plan{display:flex;flex-direction:column;padding:var(--sa-pad,1.5rem);border:1px solid var(--sa-border-subtle,rgba(0,0,0,.12));border-radius:var(--sa-radius,12px);box-shadow:var(--sa-shadow,none);position:relative;text-align:center;}
${R} .superapp-pricing__plan--featured{border-color:var(--sa-solid,currentColor);box-shadow:var(--sa-elevation,0 8px 30px rgba(0,0,0,.12));transform:translateY(-4px);}
${R} .superapp-pricing__badge{position:absolute;inset-block-start:-.8rem;inset-inline-start:50%;transform:translateX(-50%);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);padding:.2em .8em;border-radius:999px;font-size:.72em;font-weight:600;white-space:nowrap;}
${R} .superapp-pricing__name{font-size:1.1em;font-weight:600;margin:.25em 0;}
${R} .superapp-pricing__price{font-size:2.25em;font-weight:700;line-height:1;margin:.2em 0;}
${R} .superapp-pricing__period{font-size:.4em;opacity:.6;font-weight:400;}
${R} .superapp-pricing__features{list-style:none;padding:0;margin:1rem 0;text-align:start;flex:1;}
${R} .superapp-pricing__feature{padding:.35em 0;border-block-end:1px solid var(--sa-border-subtle,rgba(0,0,0,.08));}
${R} .superapp-pricing__cta{display:inline-flex;justify-content:center;margin-block-start:auto;padding:.7em 1.4em;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);text-decoration:none;font-weight:600;}
${R} .superapp-pricing__table{inline-size:100%;border-collapse:collapse;}
${R} .superapp-pricing__table th,${R} .superapp-pricing__table td{padding:.6em .8em;border-block-end:1px solid var(--sa-border-subtle,rgba(0,0,0,.1));text-align:center;}
${R} .superapp-pricing__table th[scope=row]{text-align:start;font-weight:500;}`,

  faq: (R) => `
${R} .superapp-faq{display:grid;gap:.5rem;max-inline-size:760px;margin-inline:auto;}
${R} .superapp-faq__item{border:1px solid var(--sa-border-subtle,rgba(0,0,0,.12));border-radius:var(--sa-radius,8px);}
${R} .superapp-faq__q{cursor:pointer;font-weight:600;padding:.85em 1em;list-style:none;display:flex;justify-content:space-between;align-items:center;}
${R} .superapp-faq__q::-webkit-details-marker{display:none;}
${R} .superapp-faq__q::after{content:"+";margin-inline-start:1rem;transition:transform .2s;}
${R} .superapp-faq__item[open] .superapp-faq__q::after{content:"\\2013";}
${R} .superapp-faq__a{padding:0 1em 1em;opacity:.8;}`,

  testimonial: (R) => `
${R} .superapp-testimonial{display:grid;gap:var(--sa-gap,1.5rem);grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
${R} .superapp-testimonial__card{padding:var(--sa-pad,1.5rem);border-radius:var(--sa-radius,12px);box-shadow:var(--sa-shadow,none);background:var(--sa-surface,transparent);border:1px solid var(--sa-border-subtle,rgba(0,0,0,.08));}
${R} .superapp-testimonial__rating{color:#f5a623;letter-spacing:.1em;margin-block-end:.5rem;}
${R} .superapp-testimonial__star.is-empty{opacity:.25;}
${R} .superapp-testimonial__quote{font-size:1.05em;line-height:1.5;margin:0 0 1rem;}
${R} .superapp-testimonial__author{font-weight:600;font-style:normal;}
${R} .superapp-testimonial__meta{display:block;font-weight:400;opacity:.6;font-size:.85em;}`,

  stats: (R) => `
${R} .superapp-stats{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--sa-gap,2rem);}
${R} .superapp-stats__stat{text-align:center;flex:1 1 140px;}
${R} .superapp-stats__value{font-size:clamp(2rem,5vw,3rem);font-weight:700;line-height:1;color:var(--sa-solid,inherit);}
${R} .superapp-stats__label{opacity:.7;margin-block-start:.35em;}
${R} .superapp-stats__caption{opacity:.55;font-size:.8em;margin:.25em 0 0;}`,

  trust: (R) => `
${R} .superapp-trust{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--sa-gap,2rem);}
${R} .superapp-trust__logo{display:inline-flex;align-items:center;opacity:.7;filter:grayscale(1);transition:opacity .2s,filter .2s;text-decoration:none;color:inherit;}
${R} .superapp-trust__logo:hover{opacity:1;filter:grayscale(0);}
${R} .superapp-trust__logo--word{font-weight:700;font-size:1.1em;letter-spacing:.02em;}
${R} .superapp-trust--badges .superapp-trust__badge{display:inline-flex;align-items:center;padding:.4em .6em;border:1px solid var(--sa-border-subtle,rgba(0,0,0,.12));border-radius:var(--sa-radius-sm,6px);}`,

  newsletter: (R) => `
${R} .superapp-newsletter{text-align:center;max-inline-size:520px;margin-inline:auto;}
${R} .superapp-newsletter__title{font-size:1.6em;font-weight:700;margin:0 0 .3em;}
${R} .superapp-newsletter__text{opacity:.75;margin:0 0 1rem;}
${R} .superapp-newsletter__form{display:flex;gap:.5rem;flex-wrap:wrap;}
${R} .superapp-newsletter__input{flex:1 1 200px;padding:.75em 1em;border:1px solid var(--sa-border-subtle,rgba(0,0,0,.25));border-radius:var(--sa-btn-radius,8px);font:inherit;}
${R} .superapp-newsletter__submit{padding:.75em 1.5em;border:0;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);font-weight:600;cursor:pointer;}
${R} .superapp-newsletter__disclaimer{opacity:.6;font-size:.8em;margin:.75rem 0 0;}
@media (max-width:480px){${R} .superapp-newsletter__form{flex-direction:column;}}`,

  launch: (R) => `
${R} .superapp-launch{text-align:center;max-inline-size:640px;margin-inline:auto;display:grid;gap:1rem;justify-items:center;}
${R} .superapp-launch__code{font-size:clamp(4rem,15vw,9rem);font-weight:800;line-height:.9;color:var(--sa-solid,inherit);opacity:.9;}
${R} .superapp-launch__eyebrow{text-transform:uppercase;letter-spacing:.1em;font-size:.75em;opacity:.7;}
${R} .superapp-launch__title{font-size:clamp(1.75rem,4vw,2.75rem);font-weight:700;margin:0;}
${R} .superapp-launch__sub{opacity:.8;margin:0;}
${R} .superapp-launch__text{opacity:.7;margin:0;}
${R} .superapp-launch__countdown{font-variant-numeric:tabular-nums;font-size:1.5em;font-weight:700;}
${R} .superapp-launch__search{display:flex;gap:.5rem;inline-size:100%;max-inline-size:420px;}
${R} .superapp-launch__search input{flex:1;padding:.7em 1em;border:1px solid var(--sa-border-subtle,rgba(0,0,0,.25));border-radius:var(--sa-btn-radius,8px);font:inherit;}
${R} .superapp-launch__search button{padding:.7em 1.2em;border:0;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);font-weight:600;cursor:pointer;}
${R} .superapp-launch__ctas{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;}
${R} .superapp-launch__cta{display:inline-flex;padding:.75em 1.5em;border-radius:var(--sa-btn-radius,8px);text-decoration:none;font-weight:600;}
${R} .superapp-launch__cta--primary{background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);}
${R} .superapp-launch__cta--secondary{border:1px solid currentColor;}
${R} .superapp-launch__links{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;inline-size:100%;}
${R} .superapp-launch__linkcard{display:block;text-decoration:none;color:inherit;border-radius:var(--sa-radius,12px);overflow:hidden;border:1px solid var(--sa-border-subtle,rgba(0,0,0,.1));}
${R} .superapp-launch__linkcard img{inline-size:100%;aspect-ratio:4/3;object-fit:cover;}
${R} .superapp-launch__linklabel{display:block;padding:.6em;font-weight:600;}
${R} .superapp-launch__linkcaption{display:block;padding:0 .6em .6em;opacity:.6;font-size:.85em;}`,

  contact: (R) => `
${R} .superapp-contactcard{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));}
${R} .superapp-contactcard__method{padding:var(--sa-pad,1rem);border:1px solid var(--sa-border-subtle,rgba(0,0,0,.1));border-radius:var(--sa-radius,10px);}
${R} .superapp-contactcard__label{display:block;text-transform:uppercase;letter-spacing:.06em;font-size:.72em;opacity:.6;margin-block-end:.3em;}
${R} .superapp-contactcard__value{font-weight:600;text-decoration:none;color:inherit;}`,

  team: (R) => `
${R} .superapp-team{display:grid;gap:var(--sa-gap,1.5rem);grid-template-columns:repeat(auto-fit,minmax(180px,1fr));}
${R} .superapp-team__member{margin:0;text-align:center;}
${R} .superapp-team__photo{inline-size:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--sa-radius,12px);margin-block-end:.6rem;}
${R} .superapp-team__name{font-weight:600;}
${R} .superapp-team__role{display:block;opacity:.65;font-size:.85em;}`,

  timeline: (R) => `
${R} .superapp-timeline{list-style:none;margin:0;padding:0;display:grid;gap:1.5rem;}
${R} .superapp-timeline__step{display:grid;grid-template-columns:auto 1fr;gap:1rem;align-items:start;}
${R} .superapp-timeline__marker{display:inline-flex;align-items:center;justify-content:center;min-inline-size:2.5rem;block-size:2.5rem;padding:0 .5em;border-radius:999px;background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);font-weight:700;font-size:.85em;}
${R} .superapp-timeline__title{margin:.2em 0;font-size:1.05em;}
${R} .superapp-timeline__text{opacity:.75;margin:0;}`,

  upsell: (R) => `
${R} .superapp-upsell{display:grid;gap:var(--sa-gap,1rem);grid-template-columns:repeat(auto-fit,minmax(160px,1fr));}
${R} .superapp-upsell__product{border:1px solid var(--sa-border-subtle,rgba(0,0,0,.1));border-radius:var(--sa-radius,10px);padding:.75rem;text-align:center;display:grid;gap:.4rem;}
${R} .superapp-upsell__thumb{inline-size:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--sa-radius-sm,6px);}
${R} .superapp-upsell__name{font-weight:600;font-size:.9em;}
${R} .superapp-upsell__price{color:var(--sa-solid,inherit);font-weight:700;}
${R} .superapp-upsell__cta{padding:.5em .9em;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);text-decoration:none;font-weight:600;font-size:.85em;}`,

  band: (R) => `
${R} .superapp-band{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:1rem;padding:.75em 1rem;text-align:center;}
${R} .superapp-band__text{font-weight:600;}
${R} .superapp-band__text--sub{font-weight:400;opacity:.8;}
${R} .superapp-band__countdown{font-variant-numeric:tabular-nums;font-weight:700;}
${R} .superapp-band__cta{padding:.4em 1em;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);text-decoration:none;font-weight:600;font-size:.9em;}`,

  technical: (R) => `
${R} .superapp-techcard{border:1px dashed var(--sa-border-subtle,rgba(0,0,0,.2));border-radius:var(--sa-radius,10px);padding:1rem;font-size:.9em;max-inline-size:520px;margin-inline:auto;}
${R} .superapp-techcard__type{display:inline-block;text-transform:uppercase;letter-spacing:.06em;font-size:.7em;opacity:.6;margin-block-end:.5rem;}
${R} .superapp-techcard__row{display:flex;gap:1rem;padding:.25em 0;}
${R} .superapp-techcard__key{font-weight:600;min-inline-size:6rem;}
${R} .superapp-techcard__val{opacity:.8;}`,

  generic: (R) => `
${R} .superapp-section__blocks{display:grid;gap:var(--sa-gap,1.25rem);grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}
${R} .superapp-section__block img{inline-size:100%;border-radius:var(--sa-radius,8px);margin-block-end:.5rem;}
${R} .superapp-section__btn{display:inline-flex;padding:.6em 1.2em;border-radius:var(--sa-btn-radius,8px);background:var(--sa-solid,currentColor);color:var(--sa-solid-content,#fff);text-decoration:none;font-weight:600;}`,
};

/**
 * Build the scoped `{% style %}` payload: the `--sa-*` token vars on the section
 * root (with structural defaults, since a native section has no pack wrapper to
 * supply them), the base surface rules, the archetype's structural CSS, a
 * reduced-motion guard, and the sanitized custom CSS — all scoped to
 * `#shopify-section-{{ section.id }}` so the file is self-contained.
 */
function buildScopedStyle(style: StorefrontStyle | undefined, archetype: string): string {
  const R = '#shopify-section-{{ section.id }}';
  const s = normalizeStyle(style);
  const archCss = ARCHETYPE_CSS[archetype] ?? ARCHETYPE_CSS.generic;
  const parts = [
    `${R}{${compileStyleVars(s, { structuralDefaults: true })}}`,
    compileStyleCss(s, `${R} .superapp-section`),
    `${R} .superapp-section{box-sizing:border-box;max-inline-size:var(--sa-width,1200px);margin-inline:auto;}`,
    `${R} .superapp-section *,${R} .superapp-section *::before,${R} .superapp-section *::after{box-sizing:border-box;}`,
    `${R} .superapp-section__title{font-size:clamp(1.5rem,3vw,2.25rem);font-weight:700;line-height:1.15;margin:0 0 .3em;}`,
    `${R} .superapp-section__subtitle{margin:0 auto 1.5em;opacity:.72;max-inline-size:60ch;}`,
    `${R} .superapp-section img{max-inline-size:100%;height:auto;}`,
    (archCss ? archCss(R) : '').trim(),
    `@media (prefers-reduced-motion: reduce){${R} .superapp-section *{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}}`,
    compileCustomCss(s, `${R} .superapp-section`),
  ];
  return parts.filter(Boolean).join('\n');
}

// ───────────────────────── Markup generation ────────────────────────────────

const SA = '{{ block.shopify_attributes }}';

/** Rendered inner markup for one `{% when '<type>' %}` block branch. */
function renderBlock(arch: string, type: string): string {
  const img = (cls: string, w: number, h: number, altExpr = "{{ block.settings.alt | default: block.settings.name | default: block.settings.text | escape }}") =>
    `{%- if block.settings.image != blank -%}<img${cls ? ` class="${cls}"` : ''} src="{{ block.settings.image }}" alt="${altExpr}" loading="lazy" width="${w}" height="${h}">{%- endif -%}`;

  switch (type) {
    case 'cta': {
      const cls =
        arch === 'hero' ? 'superapp-hero__cta' :
        arch === 'band' ? 'superapp-band__cta' :
        arch === 'launch' ? 'superapp-launch__cta' :
        arch === 'cta' ? 'superapp-cta__button' :
        'superapp-section__btn';
      const withMod = arch === 'hero' || arch === 'cta' || arch === 'launch';
      const modClass = withMod ? `{% if block.settings.style != blank %} ${cls}--{{ block.settings.style }}{% endif %}` : '';
      return `          {%- if block.settings.url != blank -%}<a class="${cls}${modClass}" ${SA} href="{{ block.settings.url }}">{{ block.settings.text | default: 'Learn more' | escape }}</a>{%- else -%}<span class="${cls}" ${SA}>{{ block.settings.text | escape }}</span>{%- endif -%}`;
    }
    case 'plan':
    case 'tier':
      return `          <div class="superapp-pricing__plan{% if block.settings.recommended %} superapp-pricing__plan--featured{% endif %}" ${SA}>
            {%- if block.settings.badge != blank -%}<span class="superapp-pricing__badge">{{ block.settings.badge | escape }}</span>{%- endif -%}
            {%- if block.settings.text != blank -%}<h3 class="superapp-pricing__name">{{ block.settings.text | escape }}</h3>{%- endif -%}
            {%- if block.settings.price != blank -%}<div class="superapp-pricing__price">{{ block.settings.price | escape }}{%- if block.settings.period != blank -%}<span class="superapp-pricing__period">/{{ block.settings.period | escape }}</span>{%- endif -%}</div>{%- endif -%}
            {%- if block.settings.savings_label != blank -%}<p class="superapp-pricing__tagline">{{ block.settings.savings_label | escape }}</p>{%- endif -%}
            {%- if block.settings.features != blank -%}<ul class="superapp-pricing__features">{%- assign sa_feats = block.settings.features | split: ', ' -%}{%- for sa_f in sa_feats -%}<li class="superapp-pricing__feature">{{ sa_f | escape }}</li>{%- endfor -%}</ul>{%- endif -%}
            {%- assign sa_purl = block.settings.url | default: block.settings.cta_url -%}
            {%- if sa_purl != blank -%}<a class="superapp-pricing__cta" href="{{ sa_purl }}">{{ block.settings.cta_label | default: 'Choose' | escape }}</a>{%- endif -%}
          </div>`;
    case 'faq-item':
      return `          <details class="superapp-faq__item"{% if block.settings.default_open %} open{% endif %} ${SA}>
            <summary class="superapp-faq__q">{{ block.settings.text | default: 'Question' | escape }}</summary>
            {%- assign sa_ans = block.settings.answer | default: block.settings.detail | default: block.settings.body -%}
            {%- if sa_ans != blank -%}<div class="superapp-faq__a">{{ sa_ans | escape | newline_to_br }}</div>{%- endif -%}
          </details>`;
    case 'review-card':
      return `          <figure class="superapp-testimonial__card" ${SA}>
            {%- assign sa_rt = block.settings.rating | default: 5 -%}
            <div class="superapp-testimonial__rating" role="img" aria-label="Rated {{ sa_rt }} out of 5">{%- for sa_i in (1..5) -%}<span class="superapp-testimonial__star{% if sa_i > sa_rt %} is-empty{% endif %}" aria-hidden="true">&#9733;</span>{%- endfor -%}</div>
            {%- if block.settings.text != blank -%}<blockquote class="superapp-testimonial__quote">{{ block.settings.text | escape }}</blockquote>{%- endif -%}
            {%- if block.settings.author != blank -%}<figcaption class="superapp-testimonial__author">{{ block.settings.author | escape }}{%- if block.settings.location != blank -%}<span class="superapp-testimonial__meta">{{ block.settings.location | escape }}</span>{%- endif -%}</figcaption>{%- endif -%}
          </figure>`;
    case 'stat':
      if (arch === 'hero') {
        return `          <div class="superapp-hero__proofitem" ${SA}><span class="superapp-hero__proofvalue">{{ block.settings.value | default: block.settings.text | escape }}</span>{%- if block.settings.label != blank -%}<span class="superapp-hero__prooflabel">{{ block.settings.label | escape }}</span>{%- endif -%}</div>`;
      }
      return `          <div class="superapp-stats__stat" ${SA}><div class="superapp-stats__value">{{ block.settings.prefix | escape }}{{ block.settings.value | default: block.settings.text | escape }}{{ block.settings.suffix | escape }}</div>{%- if block.settings.label != blank -%}<div class="superapp-stats__label">{{ block.settings.label | escape }}</div>{%- endif -%}{%- if block.settings.caption != blank -%}<p class="superapp-stats__caption">{{ block.settings.caption | escape }}</p>{%- endif -%}</div>`;
    case 'feature':
    case 'benefit':
      if (arch === 'hero') {
        return `          <div class="superapp-hero__proofitem" ${SA}><span class="superapp-hero__proofvalue">{{ block.settings.heading | default: block.settings.text | escape }}</span></div>`;
      }
      return `          <div class="superapp-feature__item{% if block.settings.span == 'wide' or block.settings.span == 'feature' %} superapp-feature__item--wide{% endif %}" ${SA}>
            {%- if block.settings.icon != blank -%}<span class="superapp-feature__icon" data-icon="{{ block.settings.icon | escape }}" aria-hidden="true"></span>{%- endif -%}
            {%- assign sa_ft = block.settings.heading | default: block.settings.text -%}
            {%- if sa_ft != blank -%}<h3 class="superapp-feature__title">{{ sa_ft | escape }}</h3>{%- endif -%}
            {%- if block.settings.heading != blank and block.settings.text != blank -%}<p class="superapp-feature__text">{{ block.settings.text | escape }}</p>{%- endif -%}
          </div>`;
    case 'slide':
    case 'media':
      if (arch === 'hero') {
        return `          <figure class="superapp-hero__slide" ${SA}>${img('superapp-hero__media', 1200, 800)}</figure>`;
      }
      return `          <figure class="superapp-gallery__item{% if block.settings.span != blank %} superapp-gallery__item--{{ block.settings.span }}{% endif %}" ${SA}>
            {%- if block.settings.url != blank -%}<a class="superapp-gallery__link" href="{{ block.settings.url }}">{%- endif -%}
            ${img('', 600, 600)}
            {%- if block.settings.url != blank -%}</a>{%- endif -%}
            {%- assign sa_cap = block.settings.caption | default: block.settings.headline | default: block.settings.text -%}
            {%- if sa_cap != blank -%}<figcaption class="superapp-gallery__caption">{{ sa_cap | escape }}</figcaption>{%- endif -%}
          </figure>`;
    case 'badge':
      return `          <div class="superapp-trust__badge" ${SA}>${img('', 80, 48)}{%- if block.settings.image == blank and block.settings.text != blank -%}{{ block.settings.text | escape }}{%- endif -%}</div>`;
    case 'logo':
      return `          {%- if block.settings.url != blank -%}<a class="superapp-trust__logo" ${SA} href="{{ block.settings.url }}">{%- else -%}<span class="superapp-trust__logo{% if block.settings.image == blank %} superapp-trust__logo--word{% endif %}" ${SA}>{%- endif -%}${img('', 160, 48)}{%- if block.settings.image == blank and block.settings.text != blank -%}{{ block.settings.text | escape }}{%- endif -%}{%- if block.settings.url != blank -%}</a>{%- else -%}</span>{%- endif -%}`;
    case 'team-member':
      return `          <figure class="superapp-team__member" ${SA}>${img('superapp-team__photo', 320, 320, '{{ block.settings.text | escape }}')}{%- if block.settings.text != blank -%}<figcaption class="superapp-team__name">{{ block.settings.text | escape }}</figcaption>{%- endif -%}{%- if block.settings.role != blank -%}<span class="superapp-team__role">{{ block.settings.role | escape }}</span>{%- endif -%}</figure>`;
    case 'milestone':
    case 'step':
    case 'event':
      return `          <li class="superapp-timeline__step" ${SA}><span class="superapp-timeline__marker" aria-hidden="true">{{ block.settings.date | default: block.settings.number | default: forloop.index }}</span><div>{%- assign sa_tt = block.settings.text | default: block.settings.heading -%}{%- if sa_tt != blank -%}<h3 class="superapp-timeline__title">{{ sa_tt | escape }}</h3>{%- endif -%}{%- assign sa_td = block.settings.detail | default: block.settings.body -%}{%- if sa_td != blank -%}<p class="superapp-timeline__text">{{ sa_td | escape | newline_to_br }}</p>{%- endif -%}</div></li>`;
    case 'contact-method':
      return `          <div class="superapp-contactcard__method" ${SA}>{%- if block.settings.text != blank -%}<span class="superapp-contactcard__label">{{ block.settings.text | escape }}</span>{%- endif -%}{%- assign sa_cv = block.settings.detail | default: block.settings.url -%}{%- if block.settings.url != blank -%}<a class="superapp-contactcard__value" href="{{ block.settings.url }}">{{ sa_cv | escape }}</a>{%- elsif sa_cv != blank -%}<span class="superapp-contactcard__value">{{ sa_cv | escape }}</span>{%- endif -%}</div>`;
    case 'story':
    case 'tile':
      return `          <div class="superapp-collection__story" ${SA}>${img('superapp-collection__storyimg', 800, 600, '{{ block.settings.caption | default: block.settings.text | escape }}')}{%- if block.settings.text != blank -%}<p class="superapp-collection__text">{{ block.settings.text | escape | newline_to_br }}</p>{%- endif -%}{%- if block.settings.caption != blank -%}<span class="superapp-collection__caption">{{ block.settings.caption | escape }}</span>{%- endif -%}</div>`;
    case 'link':
      if (arch === 'launch') {
        return `          <a class="superapp-launch__linkcard" ${SA} href="{{ block.settings.url }}">${img('', 400, 300, '{{ block.settings.text | escape }}')}<span class="superapp-launch__linklabel">{{ block.settings.text | escape }}</span>{%- if block.settings.caption != blank -%}<span class="superapp-launch__linkcaption">{{ block.settings.caption | escape }}</span>{%- endif -%}</a>`;
      }
      return `          <a class="superapp-section__btn" ${SA} href="{{ block.settings.url }}">{{ block.settings.text | default: 'Learn more' | escape }}</a>`;
    case 'product-card':
    case 'product':
    case 'addon':
      return `          <div class="superapp-upsell__product" ${SA}>${img('superapp-upsell__thumb', 240, 240, '{{ block.settings.text | escape }}')}{%- if block.settings.text != blank -%}<span class="superapp-upsell__name">{{ block.settings.text | escape }}</span>{%- endif -%}{%- if block.settings.price != blank -%}<span class="superapp-upsell__price">{{ block.settings.price | escape }}</span>{%- endif -%}{%- if block.settings.url != blank -%}<a class="superapp-upsell__cta" href="{{ block.settings.url }}">{{ block.settings.cta_label | default: 'Add' | escape }}</a>{%- endif -%}</div>`;
    default:
      return `          <div class="superapp-section__block superapp-section__block--{{ block.type }}" ${SA}>${img('', 600, 400, '{{ block.settings.text | escape }}')}{%- if block.settings.text != blank -%}<div class="superapp-section__text">{{ block.settings.text | escape | newline_to_br }}</div>{%- endif -%}{%- if block.settings.url != blank -%}<a class="superapp-section__btn" href="{{ block.settings.url }}">{{ block.settings.text | default: 'Learn more' | escape }}</a>{%- endif -%}</div>`;
  }
}

/** The reorderable `{% for block in section.blocks %}` loop for an archetype. */
function blockLoop(arch: string, blocks: SchemaBlock[]): string {
  if (blocks.length === 0) return '';
  const branches = blocks.map((b) => `        {%- when '${b.type}' -%}\n${renderBlock(arch, b.type)}`).join('\n');
  return `    {%- for block in section.blocks -%}
      {%- case block.type -%}
${branches}
        {%- else -%}
${renderBlock(arch, '__generic__')}
      {%- endcase -%}
    {%- endfor -%}
`;
}

/** `{% if section.settings.<id> %}<img …>{% endif %}` for a promoted URL setting. */
function sectionImg(id: string, altExpr: string, cls: string, w: number, h: number): string {
  return `    {%- if section.settings.${id} != blank -%}<img class="${cls}" src="{{ section.settings.${id} }}" alt="${altExpr}" loading="lazy" width="${w}" height="${h}">{%- endif -%}\n`;
}

/** First present string key from a candidate list (for image field resolution). */
function pickField(fields: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) if (typeof fields[k] === 'string' && (fields[k] as string).length > 0) return k;
  return undefined;
}

/**
 * The archetype container: section-level markup (settings-driven) + the block loop.
 * The shared title/subtitle header is emitted by the caller for non-self-header
 * archetypes; self-header archetypes frame their own.
 */
function renderArchetype(arch: string, blocks: SchemaBlock[], fields: Record<string, unknown>): string {
  const loop = blockLoop(arch, blocks);
  switch (arch) {
    case 'hero': {
      const mediaKey = pickField(fields, ['mediaImageUrl', 'backgroundImageUrl', 'posterImageUrl', 'heroImageUrl', 'imageUrl']);
      const variant =
        fields.backgroundImageUrl || fields.videoUrl || fields.overlayStrength ? 'overlay' :
        fields.mediaImageUrl || (fields.layout as { layout?: string } | undefined)?.layout === 'grid' ? 'split' :
        'centered';
      const media = mediaKey
        ? sectionImg(fieldSettingId(mediaKey), '{{ section.settings.media_alt | default: section.settings.background_alt | escape }}', 'superapp-hero__media', 1200, 900)
        : '';
      return `  <div class="superapp-hero superapp-hero--${variant}">
${media}    <div class="superapp-hero__content">
      {%- if section.settings.eyebrow != blank -%}<span class="superapp-hero__eyebrow">{{ section.settings.eyebrow | escape }}</span>{%- endif -%}
      {%- if section.settings.title != blank -%}<h2 class="superapp-hero__title">{{ section.settings.title | escape }}</h2>{%- endif -%}
      {%- if section.settings.subtitle != blank -%}<p class="superapp-hero__subtitle">{{ section.settings.subtitle | escape }}</p>{%- endif -%}
      {%- if section.settings.body_text != blank -%}<p class="superapp-hero__body">{{ section.settings.body_text | escape | newline_to_br }}</p>{%- endif -%}
      <div class="superapp-hero__ctas">
${loop}      </div>
    </div>
  </div>
`;
    }
    case 'cta':
      return `  <div class="superapp-cta">
    {%- if section.settings.title != blank -%}<h2 class="superapp-cta__title">{{ section.settings.title | escape }}</h2>{%- endif -%}
    {%- assign sa_ct = section.settings.subtitle | default: section.settings.body_text -%}
    {%- if sa_ct != blank -%}<p class="superapp-cta__text">{{ sa_ct | escape | newline_to_br }}</p>{%- endif -%}
${loop}  </div>
`;
    case 'band':
      return `  <div class="superapp-band">
    {%- assign sa_bt = section.settings.title | default: section.settings.message -%}
    {%- if sa_bt != blank -%}<span class="superapp-band__text">{{ sa_bt | escape }}</span>{%- endif -%}
    {%- if section.settings.subtitle != blank -%}<span class="superapp-band__text superapp-band__text--sub">{{ section.settings.subtitle | escape }}</span>{%- endif -%}
    {%- assign sa_bcd = section.settings.ends_at | default: section.settings.countdown_ends_at -%}
    {%- if sa_bcd != blank -%}<span class="superapp-band__countdown" data-sa-countdown="{{ sa_bcd | escape }}" hidden></span>{%- endif -%}
${loop}  </div>
`;
    case 'collection': {
      const mediaKey = pickField(fields, ['heroImageUrl', 'mediaImageUrl', 'imageUrl']);
      const media = mediaKey
        ? `    <div class="superapp-collection__media">
${sectionImg(fieldSettingId(mediaKey), '{{ section.settings.media_alt | escape }}', '', 1200, 800)}    </div>\n`
        : '';
      return `  <div class="superapp-collection">
${media}    <div class="superapp-collection__content">
      {%- if section.settings.eyebrow != blank -%}<span class="superapp-collection__eyebrow">{{ section.settings.eyebrow | escape }}</span>{%- endif -%}
      {%- assign sa_ch = section.settings.heading | default: section.settings.title -%}
      {%- if sa_ch != blank -%}<h2 class="superapp-collection__title">{{ sa_ch | escape }}</h2>{%- endif -%}
      {%- assign sa_ctx = section.settings.intro | default: section.settings.standfirst | default: section.settings.subtitle -%}
      {%- if sa_ctx != blank -%}<p class="superapp-collection__text">{{ sa_ctx | escape | newline_to_br }}</p>{%- endif -%}
${loop}      {%- assign sa_curl = section.settings.cta_url -%}
      {%- if sa_curl != blank -%}<a class="superapp-collection__cta" href="{{ sa_curl }}">{{ section.settings.cta_label | default: 'Shop the collection' | escape }}</a>{%- endif -%}
    </div>
  </div>
`;
    }
    case 'contact':
      return `  <div class="superapp-contactcard">
${loop}  </div>
`;
    case 'newsletter':
      return `  <div class="superapp-newsletter">
    {%- if section.settings.title != blank -%}<h2 class="superapp-newsletter__title">{{ section.settings.title | escape }}</h2>{%- endif -%}
    {%- assign sa_nt = section.settings.subtitle | default: section.settings.body_text -%}
    {%- if sa_nt != blank -%}<p class="superapp-newsletter__text">{{ sa_nt | escape }}</p>{%- endif -%}
    <form class="superapp-newsletter__form" method="post" action="/contact#superapp-news-{{ section.id }}">
      <input type="hidden" name="form_type" value="customer">
      <input type="hidden" name="utf8" value="&#10003;">
      <input type="hidden" name="contact[tags]" value="newsletter">
      <input class="superapp-newsletter__input" type="email" name="contact[email]" required placeholder="{{ section.settings.email_placeholder | default: 'you@email.com' | escape }}" aria-label="Email address">
      <button class="superapp-newsletter__submit" type="submit">{{ section.settings.cta_label | default: section.settings.capture_cta_label | default: 'Subscribe' | escape }}</button>
    </form>
    {%- if section.settings.consent_text != blank -%}<p class="superapp-newsletter__disclaimer">{{ section.settings.consent_text | escape }}</p>{%- endif -%}
  </div>
`;
    case 'launch': {
      const capture = Boolean(fields.captureEnabled || fields.captureMode || fields.captureEmail);
      const captureForm = capture
        ? `    <form class="superapp-newsletter superapp-launch__capture" method="post" action="/contact#superapp-launch-{{ section.id }}">
      <input type="hidden" name="form_type" value="customer">
      <input type="hidden" name="utf8" value="&#10003;">
      <input type="hidden" name="contact[tags]" value="launch-notify">
      <div class="superapp-newsletter__form">
        <input class="superapp-newsletter__input" type="email" name="contact[email]" required placeholder="{{ section.settings.email_placeholder | default: 'you@email.com' | escape }}" aria-label="Email address">
        <button class="superapp-newsletter__submit" type="submit">{{ section.settings.capture_cta_label | default: section.settings.cta_label | default: 'Notify me' | escape }}</button>
      </div>
      {%- if section.settings.consent_text != blank -%}<p class="superapp-newsletter__disclaimer">{{ section.settings.consent_text | escape }}</p>{%- endif -%}
    </form>\n`
        : '';
      const search = fields.searchEnabled
        ? `    <form class="superapp-launch__search" method="get" action="{{ section.settings.search_action | default: '/search' }}" role="search"><input type="search" name="q" placeholder="{{ section.settings.search_placeholder | default: 'Search the store' | escape }}" aria-label="Search the store"><button type="submit">Search</button></form>\n`
        : '';
      return `  <div class="superapp-launch">
    {%- if section.settings.status_label != blank -%}<div class="superapp-launch__code">{{ section.settings.status_label | escape }}</div>{%- endif -%}
    {%- if section.settings.eyebrow != blank -%}<span class="superapp-launch__eyebrow">{{ section.settings.eyebrow | escape }}</span>{%- endif -%}
    {%- if section.settings.title != blank -%}<h2 class="superapp-launch__title">{{ section.settings.title | escape }}</h2>{%- endif -%}
    {%- if section.settings.subtitle != blank -%}<p class="superapp-launch__sub">{{ section.settings.subtitle | escape }}</p>{%- endif -%}
    {%- if section.settings.body_text != blank -%}<p class="superapp-launch__text">{{ section.settings.body_text | escape | newline_to_br }}</p>{%- endif -%}
    {%- assign sa_lcd = section.settings.ends_at | default: section.settings.countdown_ends_at -%}
    {%- if sa_lcd != blank -%}<span class="superapp-launch__countdown" data-sa-countdown="{{ sa_lcd | escape }}" hidden></span>{%- endif -%}
${search}${captureForm}    <div class="superapp-launch__ctas">
${loop}    </div>
    {%- if section.settings.home_cta_url != blank -%}<a class="superapp-launch__cta superapp-launch__cta--primary" href="{{ section.settings.home_cta_url }}">{{ section.settings.home_cta_label | default: 'Back to home' | escape }}</a>{%- endif -%}
    {%- if section.settings.incentive_note != blank -%}<p class="superapp-launch__text">{{ section.settings.incentive_note | escape }}</p>{%- endif -%}
  </div>
`;
    }
    case 'pricing': {
      const hasRow = blocks.some((b) => b.type === 'row');
      const hasPlan = blocks.some((b) => b.type === 'plan' || b.type === 'tier');
      if (hasRow && !hasPlan) {
        return `  <div class="superapp-pricing superapp-pricing--matrix">
    <table class="superapp-pricing__table">
      {%- assign sa_cols = section.settings.plan_names | default: section.settings.column_names | split: ', ' -%}
      {%- if sa_cols.size > 0 -%}<thead><tr><th scope="col"></th>{%- for sa_c in sa_cols -%}<th scope="col">{{ sa_c | escape }}</th>{%- endfor -%}</tr></thead>{%- endif -%}
      <tbody>
        {%- for block in section.blocks -%}
          <tr {{ block.shopify_attributes }}><th scope="row">{{ block.settings.text | escape }}</th>{%- assign sa_cells = block.settings.cells | split: ', ' -%}{%- for sa_cell in sa_cells -%}<td>{{ sa_cell | escape }}</td>{%- endfor -%}</tr>
        {%- endfor -%}
      </tbody>
    </table>
  </div>
`;
      }
      return `  <div class="superapp-pricing">
${loop}  </div>
`;
    }
    case 'feature':
      return `  <div class="superapp-feature superapp-feature--grid">
${loop}  </div>
`;
    case 'gallery': {
      const layout = (fields.layout as { layout?: string } | undefined)?.layout;
      const variant = layout === 'masonry' ? 'masonry' : layout === 'carousel' ? 'carousel' : 'grid';
      return `  <div class="superapp-gallery superapp-gallery--${variant}">
${loop}  </div>
`;
    }
    case 'faq':
      return `  <div class="superapp-faq">
${loop}  </div>
`;
    case 'testimonial':
      return `  <div class="superapp-testimonial">
${loop}  </div>
`;
    case 'stats':
      return `  <div class="superapp-stats">
${loop}  </div>
`;
    case 'trust': {
      const badges = blocks.some((b) => b.type === 'badge');
      return `  <div class="superapp-trust superapp-trust--${badges ? 'badges' : 'logos'}">
${loop}  </div>
`;
    }
    case 'team':
      return `  <div class="superapp-team">
${loop}  </div>
`;
    case 'timeline':
      return `  <ol class="superapp-timeline">
${loop}  </ol>
`;
    case 'upsell':
      return `  <div class="superapp-upsell">
${loop}  </div>
`;
    case 'technical':
      return `  <div class="superapp-techcard">
    <span class="superapp-techcard__type">{{ section.settings.title | default: 'Section' | escape }}</span>
    {%- if section.settings.subtitle != blank -%}<div class="superapp-techcard__row"><span class="superapp-techcard__key">Summary</span><span class="superapp-techcard__val">{{ section.settings.subtitle | escape }}</span></div>{%- endif -%}
  </div>
`;
    default:
      return `  <div class="superapp-section__blocks superapp-section__blocks--{{ section.settings.layout }}">
${loop}  </div>
`;
  }
}

// ───────────────────────── Render entry point ───────────────────────────────

export interface RenderNativeSectionResult {
  /** The `sections/superapp-<slug>.liquid` filename. */
  filename: string;
  /** The full Liquid source (markup + {% schema %}). */
  liquid: string;
  /** The parsed `{% schema %}` object (for preflight validation without re-parsing). */
  schema: Record<string, unknown>;
  /** The section slug. */
  slug: string;
}

/**
 * Render a `theme.section` spec to a self-contained native section file.
 * `opts.slug` should be the moduleId (namespaced ownership); falls back to the name.
 */
export function renderNativeSection(
  spec: ThemeSectionSpec,
  opts: { slug: string },
): RenderNativeSectionResult {
  const cfg = spec.config as Record<string, unknown>;
  const kind = typeof cfg.kind === 'string' && cfg.kind.length > 0 ? cfg.kind : 'section';
  const slug = toSectionSlug(opts.slug);
  const style = (spec as { style?: StorefrontStyle }).style;
  const fields = (cfg.fields as Record<string, unknown>) ?? {};

  const { settings, defaults } = buildSettings(spec);
  const { blocks, presetBlocks } = buildBlocks(spec);
  const archetype = resolveArchetype(kind, blocks.length > 0);

  // ── {% schema %} object ────────────────────────────────────────────────────
  const schemaObj: Record<string, unknown> = {
    name: (spec.name || 'SuperApp Section').slice(0, 25),
    tag: 'section',
    class: `superapp-section-wrapper superapp-section--${liquidSafe(kind)}`,
    settings,
    max_blocks: 50,
  };
  if (blocks.length > 0) schemaObj.blocks = blocks;

  // Native section placement → `{% schema %}` enabled_on / disabled_on.
  const placement = (
    spec as {
      placement?: {
        enabled_on?: { templates?: string[]; groups?: string[] };
        disabled_on?: { templates?: string[]; groups?: string[] };
      };
    }
  ).placement;
  const placementClause = (p?: { templates?: string[]; groups?: string[] }): Record<string, unknown> | undefined => {
    if (!p) return undefined;
    const clause: Record<string, unknown> = {};
    if (p.templates?.length) clause.templates = p.templates;
    if (p.groups?.length) clause.groups = p.groups;
    return Object.keys(clause).length > 0 ? clause : undefined;
  };
  const enabledClause = placementClause(placement?.enabled_on);
  const disabledClause = placementClause(placement?.disabled_on);
  if (enabledClause) schemaObj.enabled_on = enabledClause;
  else if (disabledClause) schemaObj.disabled_on = disabledClause;

  const preset: Record<string, unknown> = { name: (spec.name || 'SuperApp Section').slice(0, 25), settings: defaults };
  if (presetBlocks.length > 0) preset.blocks = presetBlocks;
  schemaObj.presets = [preset];

  // ── Markup ─────────────────────────────────────────────────────────────────
  const styleCss = buildScopedStyle(style, archetype);
  const styleBlock = `{%- style -%}\n${styleCss}\n{%- endstyle -%}\n`;

  // Shared header for archetypes that don't frame their own.
  const sharedHeader = SELF_HEADER.has(archetype)
    ? ''
    : `  {%- if section.settings.title != blank -%}
    <h2 class="superapp-section__title">{{ section.settings.title | escape }}</h2>
  {%- endif -%}
  {%- if section.settings.subtitle != blank -%}
    <p class="superapp-section__subtitle">{{ section.settings.subtitle | escape }}</p>
  {%- endif -%}
`;

  const body = renderArchetype(archetype, blocks, fields);

  const liquid = `{%- comment -%} SuperApp — generated native section. module:${slug} kind:${liquidSafe(kind)} archetype:${archetype} {%- endcomment -%}
${styleBlock}<div class="superapp-section superapp-section--{{ section.settings.layout }}" {{ section.shopify_attributes }}>
${sharedHeader}${body}</div>

{% schema %}
${schemaJson(schemaObj)}
{% endschema %}
`;

  return { filename: nativeSectionFilename(slug), liquid, schema: schemaObj, slug };
}
