/**
 * Native-section renderer (spec 033).
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
 * and compiled style (reusing `compileThemeStyleCss`, re-scoped to
 * `#shopify-section-{{ section.id }}`); `advancedCustom` flows through the same
 * sanitizer. Only the OUTPUT medium changes.
 */
import type { RecipeSpec, StorefrontStyle } from '@superapp/core';
import { compileThemeStyleCss } from './theme-module';

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

/**
 * Build the `settings[]` for the section from `config.fieldSchema` + title/subtitle.
 * `title`/`subtitle` become text settings (with defaults) so the merchant can edit
 * them in the theme editor; declared `fieldSchema` fields map by type.
 */
function buildSettings(spec: ThemeSectionSpec): { settings: SchemaSetting[]; defaults: Record<string, unknown> } {
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

  // Declared typed settings from config.fieldSchema.
  const fieldSchema = cfg.fieldSchema as { fields?: Array<Record<string, unknown>> } | undefined;
  const fieldValues = (cfg.fields as Record<string, unknown>) ?? {};
  const seen = new Set(settings.map((s) => s.id));
  for (const f of fieldSchema?.fields ?? []) {
    const name = typeof f.name === 'string' ? f.name : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
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

  return { settings, defaults };
}

/**
 * Build `blocks[]` (one type definition per DISTINCT `config.blocks[].kind`) and
 * `presets[0].blocks[]` (one instance per authored block, so the designed layout
 * appears the instant the section is added). Per-block field types are inferred
 * from the authored values; a `text`/`imageUrl`/`url` become `text`/`image_picker`/`url`.
 */
function buildBlocks(spec: ThemeSectionSpec): { blocks: SchemaBlock[]; presetBlocks: PresetBlock[] } {
  const cfg = spec.config as Record<string, unknown>;
  const authored = (cfg.blocks as Array<Record<string, unknown>>) ?? [];
  const byType = new Map<string, SchemaBlock>();
  const presetBlocks: PresetBlock[] = [];

  for (const b of authored) {
    const type = toBlockType(typeof b.kind === 'string' ? b.kind : 'item');
    // Merge settings across all instances of this type so every authored key is declared.
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
    if (typeof b.imageUrl === 'string') addSetting('image', 'image_picker', 'Image', undefined);
    if (typeof b.url === 'string') addSetting('url', 'url', 'Link', b.url);

    const fields = (b.fields as Record<string, unknown>) ?? {};
    for (const [k, v] of Object.entries(fields)) {
      const id = toBlockType(k) || 'field';
      // Arrays (e.g. features[]) have no clean native setting type → delimited text (documented limitation).
      if (Array.isArray(v)) {
        addSetting(id, 'text', humanize(id), v.map((x) => String(x)).join(', '));
      } else if (typeof v === 'boolean') {
        addSetting(id, 'checkbox', humanize(id), v);
      } else if (typeof v === 'number') {
        addSetting(id, 'number', humanize(id), v);
      } else {
        addSetting(id, 'text', humanize(id), v === undefined || v === null ? undefined : String(v));
      }
    }

    presetBlocks.push({ type, settings: instanceSettings });
  }

  return { blocks: [...byType.values()], presetBlocks };
}

function humanize(s: string): string {
  const words = String(s).replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : s;
}

/**
 * Re-scope compiled theme style CSS from the app-block `[data-module-id="…"]`
 * selector to the native `#shopify-section-{{ section.id }}` selector. Reuses
 * `compileThemeStyleCss` verbatim (with a placeholder id) then swaps the root
 * selector, so the SAME token compiler drives both mediums.
 */
function scopedSectionStyle(style: StorefrontStyle | undefined, kind: string): string {
  if (!style) return '';
  const placeholder = '__superapp_native__';
  const css = compileThemeStyleCss(style, placeholder, kind);
  return css.replace(new RegExp(`\\[data-module-id="${placeholder}"\\]`, 'g'), '#shopify-section-{{ section.id }}');
}

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

  const { settings, defaults } = buildSettings(spec);
  const { blocks, presetBlocks } = buildBlocks(spec);

  // ── {% schema %} object ────────────────────────────────────────────────────
  const schemaObj: Record<string, unknown> = {
    name: (spec.name || 'SuperApp Section').slice(0, 25),
    tag: 'section',
    class: `superapp-section-wrapper superapp-section--${liquidSafe(kind)}`,
    settings,
    max_blocks: 50,
  };
  if (blocks.length > 0) schemaObj.blocks = blocks;

  // Native section placement (config.placement.enabled_on.templates → enabled_on).
  const placement = (spec as { placement?: { enabled_on?: { templates?: string[] } } }).placement;
  if (placement?.enabled_on?.templates?.length) {
    schemaObj.enabled_on = { templates: placement.enabled_on.templates };
  }

  const preset: Record<string, unknown> = { name: (spec.name || 'SuperApp Section').slice(0, 25), settings: defaults };
  if (presetBlocks.length > 0) preset.blocks = presetBlocks;
  schemaObj.presets = [preset];

  // ── Markup ─────────────────────────────────────────────────────────────────
  const styleCss = scopedSectionStyle(style, kind);
  const styleBlock = styleCss ? `{%- style -%}\n${styleCss}\n{%- endstyle -%}\n` : '';

  const blockBranches = blocks
    .map((b) => {
      const lines = b.settings.map((s) => {
        if (s.type === 'image_picker') {
          // width/height from the picked image object (avoids CLS; satisfies theme-check).
          return `            {%- if block.settings.${s.id} != blank -%}<img class="superapp-section__img" src="{{ block.settings.${s.id} | image_url: width: 800 }}" alt="{{ block.settings.text | escape }}" width="{{ block.settings.${s.id}.width }}" height="{{ block.settings.${s.id}.height }}" loading="lazy">{%- endif -%}`;
        }
        if (s.type === 'url') {
          return `            {%- if block.settings.${s.id} != blank -%}<a class="superapp-section__link" href="{{ block.settings.${s.id} }}">{{ block.settings.text | default: block.settings.${s.id} | escape }}</a>{%- endif -%}`;
        }
        if (s.id === 'text') {
          return `            {%- if block.settings.text != blank -%}<div class="superapp-section__text">{{ block.settings.text | escape }}</div>{%- endif -%}`;
        }
        return `            {%- if block.settings.${s.id} != blank -%}<span class="superapp-section__field superapp-section__field--${s.id}">{{ block.settings.${s.id} | escape }}</span>{%- endif -%}`;
      });
      return `        {%- when '${b.type}' -%}\n${lines.join('\n')}`;
    })
    .join('\n');

  const blockLoop =
    blocks.length > 0
      ? `  <div class="superapp-section__blocks superapp-section__blocks--{{ section.settings.layout }}">
    {%- for block in section.blocks -%}
      <div class="superapp-section__block superapp-section__block--{{ block.type }}" {{ block.shopify_attributes }}>
        {%- case block.type -%}
${blockBranches}
        {%- endcase -%}
      </div>
    {%- endfor -%}
  </div>\n`
      : '';

  const liquid = `{%- comment -%} SuperApp — generated native section. module:${slug} kind:${liquidSafe(kind)} {%- endcomment -%}
${styleBlock}<div class="superapp-section superapp-section--{{ section.settings.layout }}" {{ section.shopify_attributes }}>
  {%- if section.settings.title != blank -%}
    <h2 class="superapp-section__title">{{ section.settings.title | escape }}</h2>
  {%- endif -%}
  {%- if section.settings.subtitle != blank -%}
    <p class="superapp-section__subtitle">{{ section.settings.subtitle | escape }}</p>
  {%- endif -%}
${blockLoop}</div>

{% schema %}
${schemaJson(schemaObj)}
{% endschema %}
`;

  return { filename: nativeSectionFilename(slug), liquid, schema: schemaObj, slug };
}
