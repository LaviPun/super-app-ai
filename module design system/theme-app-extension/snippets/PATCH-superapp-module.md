# Patch — `snippets/superapp-module.liquid` (stylePack + `.superapp-scope` wrapper)

Three edits wire the pack toggle + accent override + the design-system token wrapper
into the shared renderer. Markup inside the `{% case kind %}` is **unchanged** — the
wrapper only carries the `--sa-*` token map (see `assets/superapp-modules.css`).

Params now passed by all four blocks: `style_pack` (`auto|luxe|bold`) and
`accent_override` (hex or blank).

---

## Edit 1 — resolve the pack + accent (add a new `{% liquid %}` block)

**Find** the end of the first `{% liquid %}` block that computes `kind` (the back-compat
`case mod_type` mapping):

```liquid
      else
        assign kind = 'section'
    endcase
  endif
%}
```

**Insert immediately after it:**

```liquid
{% # Design-system pack resolution (docs/design-system/module-design-system.md §3.3). %}
{% liquid
  # Precedence: block/embed setting → compiled style_json.pack → 'auto'.
  assign sa_pack = style_pack | default: mod_sty.pack | default: 'auto'
  # 'auto' is resolved app-side at publish (writes mod_sty.pack); fall back to Luxe
  # (the can't-look-wrong pack) if it ever reaches the storefront unresolved.
  if sa_pack == 'auto' or sa_pack == blank
    assign sa_pack = mod_sty.pack | default: 'luxe'
    if sa_pack == 'auto' or sa_pack == blank
      assign sa_pack = 'luxe'
    endif
  endif
  # Accent override: block/embed setting → compiled brand accent → merchant seed.
  assign sa_accent = accent_override | default: mod_sty.colors.accent | default: mod_sty.colors.seed
%}
```

---

## Edit 2 — open the `.superapp-scope` wrapper

**Find:**

```liquid
{% # Per-module compiled style (colors/spacing/tokens/custom CSS), scoped to [data-module-id]. Server-sanitized. %}
{% if mod_sty.css != blank %}<style>{{ mod_sty.css }}</style>{% endif %}
```

**Replace with** (adds the wrapper open on the next line):

```liquid
{% # Per-module compiled style (colors/spacing/tokens/custom CSS), scoped to [data-module-id]. Server-sanitized. %}
{% if mod_sty.css != blank %}<style>{{ mod_sty.css }}</style>{% endif %}
<div class="superapp-scope" data-sa-pack="{{ sa_pack | escape }}"{% if sa_accent != blank %} style="--sa-accent-override:{{ sa_accent | escape }}"{% endif %}>
```

---

## Edit 3 — close the `.superapp-scope` wrapper

**Find** (near the end of the snippet):

```liquid
{% # R2.1: close the gate wrapper opened for non-popup kinds. %}
{% if sa_rules_enabled and kind != 'popup' %}
  </div>
{% endif %}
{% endunless %}
```

**Replace with** (adds the wrapper close before `{% endunless %}`):

```liquid
{% # R2.1: close the gate wrapper opened for non-popup kinds. %}
{% if sa_rules_enabled and kind != 'popup' %}
  </div>
{% endif %}
</div>{% # /superapp-scope — design-system token wrapper %}
{% endunless %}
```

---

## Result

Every module now renders inside:

```html
<div class="superapp-scope" data-sa-pack="luxe|bold" style="--sa-accent-override:#hex">
  …existing module markup (unchanged)…
</div>
```

`assets/superapp-modules.css` reads `[data-sa-pack]` to apply the pack's `--sa-*` token
map; the optional `--sa-accent-override` layers the merchant accent on top. Colours and
fonts still inherit from the theme (`font: inherit` / `currentColor`) — the pack supplies
only structural tokens (radius, border, shadow, motion, decoration). Precedence and the
full contract: `docs/design-system/module-design-system.md` §3.3 + §9.

### App-side note (`auto` resolution)
`auto` should be resolved at **publish** by `style-packs.server.ts` (writing the winning
pack into the compiled `style_json.pack`), so the storefront rarely sees `auto`. The
Liquid fallback to `luxe` is a safety net only — never the primary path.
