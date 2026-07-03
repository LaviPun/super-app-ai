# R2.1 — Rule-builder primitive + `targeting.rule-engine` control pack

**Phase #3 (compositional control-packs) · flagship piece.** A merchant-authored
condition primitive — an ordered list of `{object, attribute, operator, value}`
rows combined AND/OR, evaluated top-to-bottom — plus a new `rule-builder` field
type, a `targeting.rule-engine` control pack, and, critically, a **storefront
evaluator** so a rule actually gates whether a module shows. Grounded in Rebuy
Data Sources (`plugins/rebuy.md:32-36`), Justuno 80+ conditions
(`plugins/justuno.md:34-37`), settings pack #14 (`settings-vocabulary.md:274-291`),
and gap M1 / R2.1 (`gap-analysis.md:80-87,247`).

This doc is buildable end-to-end: schema → registry/manifest → recipe wiring →
generation prompt → compile → **storefront runtime evaluation** → back-compat →
tests. It is deliberately **additive** (new optional `config.ruleEngine`
namespace; no existing field changes) and **constrained** (fixed object/attribute/
operator enums; no `eval`; a hard resolver allowlist).

---

## 1. Current state (file:line evidence)

**No condition vocabulary exists.** The recipe's `theme.section` config is flat
`kind / activation / title / subtitle / fieldSchema / fields / blocks[] / audience /
schedule / advancedCustom` with an open `.catchall` — no condition-row type
(`packages/core/src/recipe.ts:120-149`). `control-packs/types.ts` field types are
fixed widget-hint strings (`textarea | color | select | datetime | toggle`), with
no `rule-builder` widget and no repeater-of-typed-rows shape
(`control-packs/types.ts:31-45`).

**The closest existing primitives are single-purpose, not a reusable rule tree:**
- `audience.pack.ts` — a flat AND-only predicate: `loggedInOnly`, `visitor`,
  `customerTags[]`, `minCartValue`, `minOrderCount` (`audience.pack.ts:11-17`).
  Not ordered, not OR-able, not multi-object. **Never evaluated on the storefront**
  (persisted to `config.audience`, read by no runtime).
- `page-targeting.pack.ts` — `pages` enum + `templates[]` + `urlIncludes/Excludes`
  + `devices[]` + `countries[]` (`page-targeting.pack.ts:12-25`). Page/URL scope
  only; enforced by *placement* (which block a module is injected into), not a
  runtime predicate.
- `functions.discountRules` has a `when { customerTags, minSubtotal, skuIn }`
  shape (`recipe.ts:172-185`) — a discount-only, server-side, non-reusable
  ancestor of the primitive.
- `CONDITION_OPERATORS` already exists for the (dormant) flow engine:
  `equal_to, not_equal_to, greater_than, less_than, greater_than_or_equal,
  less_than_or_equal, contains, not_contains, starts_with, ends_with, is_set,
  is_not_set` (`allowed-values.ts:458-471`). **Reuse this enum** — do not invent a
  parallel operator vocabulary.

**The storefront runtime that must evaluate rules:**
`extensions/theme-app-extension/assets/superapp-modules.js` (233 lines, vanilla,
no deps) does exactly two things: a popup engine (`setupPopup`,
`superapp-modules.js:58-173`) and app-proxy contact-form submission
(`setupProxyForm`, `:186-225`). Display gating today is **frequency-only**:
`isSuppressed(id, frequency)` / `markShown` over local/session storage
(`:29-53`), checked at the top of `open()` (`:95`) and again before wiring
triggers (`:132`). **There is no targeting evaluation of any kind at runtime** —
`audience` and behavioral conditions are silently ignored.

**The render seam (where a rule must be injected):**
`snippets/superapp-module.liquid` renders every module kind from the parsed
`config_json` metaobject (`superapp-module.liquid:24 assign mod_cfg =
mod_ref.fields.config_json.value`). Because `config_json` is stored as a JSON
metafield (`metaobject.service.ts:127` `JSON.stringify(payload.config)`), **Liquid
receives `mod_cfg` as a parsed object** — so a nested `mod_cfg.ruleEngine` tree is
directly readable in Liquid *and* serializable into a `data-*` attribute. The
popup branch already emits `data-trigger` / `data-frequency` /
`data-delay-seconds` from `mod_cfg` (`superapp-module.liquid:82-91`); this is the
exact pattern the rule payload follows. Every kind's root element carries
`data-module-id` (`:53,73,85,110,202,226,252`).

**Storefront objects natively resolvable in Liquid** (server-side, no JS):
`customer` (id, tags, orders_count, total_spent, email), `cart`
(item_count, total_price, items[]), `product` (tags, type, vendor, price,
handle, collections), `template` (name/page type), `localization.country.iso_code`.
The contact-form branch already reads `customer.id/email` and
`shop.permanent_domain` in Liquid (`superapp-module.liquid:138-142`). **This is the
key constraint that shapes the evaluator split** (§5): Product/Customer/Cart/Geo/
Temporal are server-resolvable; Behavioral (recently-viewed, scroll, exit-intent,
session-count, UTM) is client-only.

**Generation wiring today:** packs feed the prompt only as a namespace hint list —
`mustHaveControlsForType(type, tier)` returns each manifest pack's `namespace`
(`requirement-spec.server.ts:32-42`). The `theme.section` manifest is
`['content','style','trigger','page-targeting','frequency-cap','countdown',
'behavior']` + advanced `['audience','schedule','advanced-custom']`
(`module-manifests.ts:24-29`). The recipe schema itself hand-pins only `audience /
schedule / advancedCustom` from the pack registry (`recipe.ts:8-10,139-142`) — the
composer (`composeConfig`) is built-not-wired, so **the live path is: add the pack
schema to the registry AND hand-pin its schema into the `theme.section` recipe
branch** (mirror how `audience` is wired).

---

## 2. Target shape (exact TS/Zod types + example JSON)

### 2.1 New enums (append to `packages/core/src/allowed-values.ts`)

```ts
// ─── Rule-builder primitive (targeting.rule-engine, R2.1) ────────────────────

/** Objects a condition row can address. Constrained allowlist — each maps to a
 *  storefront resolver (server-side Liquid or client-side JS). No free-form objects. */
export const RULE_OBJECTS = [
  'product',    // current PDP / line context   (server)
  'customer',   // logged-in customer           (server)
  'cart',       // current cart                 (server)
  'geo',        // storefront country/market    (server)
  'temporal',   // date / day-of-week / time    (server or client)
  'behavioral', // session / recently-viewed / scroll / exit / UTM (client only)
] as const;
export type RuleObject = (typeof RULE_OBJECTS)[number];

/** Attributes per object. The pair (object, attribute) is validated against this
 *  map at schema time AND is the resolver dispatch key at runtime. Adding a row
 *  the resolver can't answer is a schema error, not a silent no-op. */
export const RULE_ATTRIBUTES = {
  product: ['tags', 'type', 'vendor', 'handle', 'price', 'collectionIds', 'available'],
  customer: ['loggedIn', 'tags', 'ordersCount', 'totalSpent', 'countryCode', 'acceptsMarketing'],
  cart: ['subtotal', 'itemCount', 'lineCount', 'containsProductId', 'containsCollectionId', 'discountCode'],
  geo: ['countryCode'],
  temporal: ['date', 'dayOfWeek', 'timeOfDay'],
  behavioral: ['recentlyViewedProductId', 'pagesViewedThisSession', 'sessionCount', 'utmSource', 'utmCampaign', 'referrerContains', 'scrollPercent', 'exitIntent'],
} as const satisfies Record<RuleObject, readonly string[]>;

/** Value data-type per attribute — drives the value field's parse + the admin
 *  widget. Used to reject "price contains foo" style category errors. */
export const RULE_ATTRIBUTE_VALUE_TYPES: Record<string, 'string' | 'number' | 'boolean' | 'stringList'> = {
  'product.tags': 'stringList', 'product.type': 'string', 'product.vendor': 'string',
  'product.handle': 'string', 'product.price': 'number', 'product.collectionIds': 'stringList',
  'product.available': 'boolean',
  'customer.loggedIn': 'boolean', 'customer.tags': 'stringList', 'customer.ordersCount': 'number',
  'customer.totalSpent': 'number', 'customer.countryCode': 'string', 'customer.acceptsMarketing': 'boolean',
  'cart.subtotal': 'number', 'cart.itemCount': 'number', 'cart.lineCount': 'number',
  'cart.containsProductId': 'string', 'cart.containsCollectionId': 'string', 'cart.discountCode': 'string',
  'geo.countryCode': 'string',
  'temporal.date': 'string' /* ISO */, 'temporal.dayOfWeek': 'number' /* 0-6 */, 'temporal.timeOfDay': 'string' /* HH:MM */,
  'behavioral.recentlyViewedProductId': 'string', 'behavioral.pagesViewedThisSession': 'number',
  'behavioral.sessionCount': 'number', 'behavioral.utmSource': 'string', 'behavioral.utmCampaign': 'string',
  'behavioral.referrerContains': 'string', 'behavioral.scrollPercent': 'number', 'behavioral.exitIntent': 'boolean',
};

/** Reuse CONDITION_OPERATORS (allowed-values.ts:458-471). Not re-declared here. */

/** What to do when the top-to-bottom evaluation settles. */
export const RULE_MATCH_ACTIONS = ['SHOW', 'HIDE'] as const;
export type RuleMatchAction = (typeof RULE_MATCH_ACTIONS)[number];

/** Limits — keep bounded for prompt/JSON-Schema/token budget and runtime cost. */
export const RULE_LIMITS = {
  maxGroups: 8,        // top-level groups combined by outer logic
  maxRowsPerGroup: 12, // condition rows per group
  maxValueLen: 200,
  maxValueListLen: 30,
} as const;
```

> **Note — objects/attributes are a strict superset-aware allowlist.** The
> `RULE_ATTRIBUTES` map is both the schema validator and the runtime resolver's
> dispatch table. A row whose `(object, attribute)` pair is not in the map fails
> Zod validation, so "built-not-wired" rows are impossible by construction.

### 2.2 New pack: `packages/core/src/control-packs/packs/rule-engine.pack.ts`

```ts
import { z } from 'zod';
import {
  RULE_OBJECTS, RULE_ATTRIBUTES, RULE_ATTRIBUTE_VALUE_TYPES,
  RULE_MATCH_ACTIONS, RULE_LIMITS, CONDITION_OPERATORS,
} from '../../allowed-values.js';
import type { ControlPack } from '../types.js';

/** One condition row: {object, attribute, operator, value}. */
export const RuleConditionSchema = z
  .object({
    object: z.enum(RULE_OBJECTS),
    attribute: z.string().min(1).max(60),
    operator: z.enum(CONDITION_OPERATORS),
    /** Value is a string OR string[] (for is-in / list attributes) OR number/bool
     *  coerced from string at author time. Runtime coerces per RULE_ATTRIBUTE_VALUE_TYPES. */
    value: z.union([
      z.string().max(RULE_LIMITS.maxValueLen),
      z.array(z.string().max(RULE_LIMITS.maxValueLen)).max(RULE_LIMITS.maxValueListLen),
      z.number(),
      z.boolean(),
    ]).default(''),
  })
  .superRefine((row, ctx) => {
    // (object, attribute) must be a known pair — this is the anti-drift guard.
    const attrs = RULE_ATTRIBUTES[row.object] as readonly string[];
    if (!attrs.includes(row.attribute)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        message: `Unknown attribute "${row.attribute}" for object "${row.object}"` });
    }
    // is_set / is_not_set take no value; everything else requires one.
    const valueless = row.operator === 'is_set' || row.operator === 'is_not_set';
    const empty = row.value === '' || (Array.isArray(row.value) && row.value.length === 0);
    if (!valueless && empty) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Operator "${row.operator}" requires a value` });
    }
  });
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

/** A group of rows combined by an inner logic. Groups are combined by outer logic. */
export const RuleGroupSchema = z.object({
  logic: z.enum(['AND', 'OR']).default('AND'),
  conditions: z.array(RuleConditionSchema).min(1).max(RULE_LIMITS.maxRowsPerGroup),
});
export type RuleGroup = z.infer<typeof RuleGroupSchema>;

export const RuleEnginePackSchema = z.object({
  /** Master switch. When false (or the pack absent) the module always shows —
   *  this is what makes the pack purely additive and back-compat-safe. */
  enabled: z.boolean().default(false),
  /** Outer combinator across groups. */
  logic: z.enum(['AND', 'OR']).default('AND'),
  /** Ordered groups, evaluated top-to-bottom (Rebuy/Justuno semantics). */
  groups: z.array(RuleGroupSchema).max(RULE_LIMITS.maxGroups).default([]),
  /** What a MATCH means: SHOW the module when rules pass (default) or HIDE it. */
  matchAction: z.enum(RULE_MATCH_ACTIONS).default('SHOW'),
  /** Behavior when a client-only object (behavioral) can't be resolved server-side:
   *  'defer' → render hidden, let JS decide; 'ignore' → treat that row as pass. */
  onUnresolved: z.enum(['defer', 'ignore']).default('defer'),
});
export type RuleEnginePack = z.infer<typeof RuleEnginePackSchema>;

export const ruleEnginePack: ControlPack<typeof RuleEnginePackSchema> = {
  id: 'rule-engine',
  namespace: 'ruleEngine',
  label: 'Display Rules',
  tier: 'advanced',
  schema: RuleEnginePackSchema,
  uiSchema: {
    groupLabel: 'Display rules',
    order: ['enabled', 'logic', 'groups', 'matchAction', 'onUnresolved'],
    fields: {
      groups: { widget: 'rule-builder', help: 'Conditions that decide when this module appears.' },
      logic: { showWhen: { field: 'enabled', equals: true }, help: 'Combine groups: match ALL (AND) or ANY (OR).' },
      matchAction: { tier: 'advanced', showWhen: { field: 'enabled', equals: true } },
      onUnresolved: { tier: 'advanced', hidden: true }, // system-tuned default; not merchant-facing initially
    },
  },
};
```

### 2.3 New field-type contract (extend `control-packs/types.ts`)

`FieldUiHint.widget` is a free `string?` today (`types.ts:33`), so `'rule-builder'`
is already representable with **no type change**. Add it to the documented enum
comment and (optionally) a named export so the SchemaForm renderer can switch on
it:

```ts
/** Known SchemaForm widget overrides. 'rule-builder' renders the ordered
 *  condition-row editor for a RuleEnginePack.groups value. */
export type FieldWidget =
  | 'textarea' | 'color' | 'select' | 'datetime' | 'toggle'
  | 'rule-builder';
```

### 2.4 Example persisted JSON (`config.ruleEngine`)

Upsell shown only to returning US customers with a cart ≥ $75 that already
contains a product from the "coffee" collection — OR to anyone who arrived from a
`spring-sale` UTM campaign:

```json
{
  "ruleEngine": {
    "enabled": true,
    "logic": "OR",
    "matchAction": "SHOW",
    "onUnresolved": "defer",
    "groups": [
      {
        "logic": "AND",
        "conditions": [
          { "object": "customer", "attribute": "ordersCount", "operator": "greater_than_or_equal", "value": 1 },
          { "object": "geo", "attribute": "countryCode", "operator": "equal_to", "value": "US" },
          { "object": "cart", "attribute": "subtotal", "operator": "greater_than_or_equal", "value": 75 },
          { "object": "cart", "attribute": "containsCollectionId", "operator": "equal_to", "value": "gid://shopify/Collection/123" }
        ]
      },
      {
        "logic": "AND",
        "conditions": [
          { "object": "behavioral", "attribute": "utmCampaign", "operator": "equal_to", "value": "spring-sale" }
        ]
      }
    ]
  }
}
```

Evaluation: outer `OR` over two groups. Group 1 is all-server-resolvable → Liquid
can decide at render. Group 2 is behavioral → `onUnresolved: defer` renders the
module hidden and lets `superapp-modules.js` finish the decision client-side.

---

## 3. Files to change (each with what changes)

| # | File | Change |
|---|------|--------|
| 1 | `packages/core/src/allowed-values.ts` | **Add** `RULE_OBJECTS`, `RULE_ATTRIBUTES`, `RULE_ATTRIBUTE_VALUE_TYPES`, `RULE_MATCH_ACTIONS`, `RULE_LIMITS` (§2.1). Reuse existing `CONDITION_OPERATORS`. |
| 2 | `packages/core/src/control-packs/packs/rule-engine.pack.ts` | **New file** — the pack + schemas (§2.2). |
| 3 | `packages/core/src/control-packs/registry.ts` | **Register** `ruleEnginePack` in `ALL_PACKS` (import + array entry), mirroring `audiencePack` (`registry.ts` import block + array). |
| 4 | `packages/core/src/control-packs/index.ts` | **Export** `RuleEnginePackSchema, ruleEnginePack` (+ `RuleConditionSchema`, `RuleGroupSchema` for tests), mirroring the `audience` export line. |
| 5 | `packages/core/src/control-packs/module-manifests.ts` | **Add** `'rule-engine'` to `theme.section` `advancedPacks` (`module-manifests.ts:27`). Keeps it opt-in/advanced. |
| 6 | `packages/core/src/control-packs/types.ts` | Add `FieldWidget` union incl. `'rule-builder'` (§2.3); doc-comment update on `FieldUiHint.widget`. |
| 7 | `packages/core/src/recipe.ts` | **Import** `RuleEnginePackSchema`; **hand-pin** `ruleEngine: RuleEnginePackSchema.optional()` into the `theme.section` `config` object (after `advancedCustom`, `recipe.ts:142`). This is the live-path wiring (composer is dormant). **Also** add the same optional field to `proxy.widget.config` (`recipe.ts:158-163`) so app-proxy widgets can gate too. |
| 8 | `packages/core/src/recipe.ts` (shared helper) | **Export** a pure `evaluateRuleEngine(rules, ctx)` from a new `packages/core/src/rule-engine/evaluate.ts` (see §5.1) — shared by the deterministic preview, server-side compile hints, and tests. Client JS re-implements the same tiny algorithm (it can't import TS at runtime). |
| 9 | `apps/web/app/services/recipes/compiler/theme-module.ts` | **Emit** a compiled, server-resolvable subset marker into `themeModulePayload` (see §5.2) so the metaobject carries `ruleEngine` (already flows via `config`) and, optionally, a `ruleServerHint`. No behavior change to existing modules (field absent → unchanged). |
| 10 | `extensions/theme-app-extension/snippets/superapp-module.liquid` | **Add** a shared rule-gate at the top of the snippet (§5.3): compute `sa_rule_visible` server-side from `mod_cfg.ruleEngine`; emit `data-sa-rules='{{ mod_cfg.ruleEngine | json }}'` + `data-sa-rule-server="pass|fail|defer"` on each kind's root; wrap render in the server verdict when fully resolvable. |
| 11 | `extensions/theme-app-extension/assets/superapp-modules.js` | **Add** a `evaluateRules` client evaluator + a `gateModules()` pass (§5.4) that reads `data-sa-rules` / `data-sa-rule-server`, resolves behavioral/temporal client-side, and shows/hides. Popup `setupPopup` gains a rule check alongside `isSuppressed` (`superapp-modules.js:95,132`). |
| 12 | `apps/web/app/services/preview/preview.service.ts` | **Call** `evaluateRuleEngine` with a synthetic "preview visitor" context so the deterministic preview reflects `matchAction`/rules (shows a "hidden by rules" state when they fail). Reuses the shared evaluator (#8). |
| 13 | `apps/web/app/services/ai/requirement-spec.server.ts` | No code change required (it already returns pack namespaces); the new `ruleEngine` namespace flows automatically once in the manifest. **Add** a prompt-expectations snippet describing the primitive (§4). |
| 14 | Prompt/system text (see §4 for exact location) | **Add** the rule-builder authoring contract + the object/attribute/operator allowlist to the create-module system prompt. |

---

## 4. Generation wiring (how the AI emits it)

**Where.** The generator emits a full `RecipeSpec`; validation is `RecipeSpecSchema`.
Because `ruleEngine` is an **optional** namespace on `theme.section.config`
(#7 above), the model can emit it or omit it and both validate. The manifest
change (#5) makes `ruleEngine` appear in `mustHaveControlsForType('theme.section',
'advanced')` (`requirement-spec.server.ts:32-42`) so the requirement-spec already
signals its availability to the prompt at the advanced tier.

**Prompt-expectations to add** (to the create-module system prompt; the same body
the requirement spec feeds). Keep it terse and enum-anchored so the model cannot
drift outside the resolver allowlist:

```
DISPLAY RULES (optional, advanced). To make a storefront module appear only for
some visitors, emit config.ruleEngine:
  { enabled: true, logic: 'AND'|'OR', matchAction: 'SHOW'|'HIDE',
    groups: [ { logic: 'AND'|'OR', conditions: [ {object, attribute, operator, value}, ... ] } ] }
Objects & attributes (use ONLY these pairs):
  product: tags,type,vendor,handle,price,collectionIds,available
  customer: loggedIn,tags,ordersCount,totalSpent,countryCode,acceptsMarketing
  cart: subtotal,itemCount,lineCount,containsProductId,containsCollectionId,discountCode
  geo: countryCode
  temporal: date,dayOfWeek,timeOfDay
  behavioral: recentlyViewedProductId,pagesViewedThisSession,sessionCount,
              utmSource,utmCampaign,referrerContains,scrollPercent,exitIntent
Operators: equal_to,not_equal_to,greater_than,less_than,greater_than_or_equal,
  less_than_or_equal,contains,not_contains,starts_with,ends_with,is_set,is_not_set.
Rules are evaluated top-to-bottom. Omit config.ruleEngine (or set enabled:false)
to always show. Do NOT invent objects/attributes; unknown pairs are rejected.
```

**Emit expectations / self-checks (add to prompt-expectations test corpus):**
- "show this upsell only to returning customers" → one `customer.ordersCount
  >= 1` row, `enabled:true`, `matchAction:'SHOW'`.
- "hide the banner on the cart page for logged-out users" → `matchAction:'HIDE'`
  with `customer.loggedIn == false` (page scope still handled by placement/
  page-targeting; rule-engine adds the audience predicate).
- unconstrained prompt → **no** `ruleEngine` field (proves the model doesn't
  over-emit; default is always-show).

**Token discipline.** The pack is advanced-tier and enum-bounded; `RULE_LIMITS`
caps groups/rows so a worst-case emission is small. No types-list bloat: the
attribute allowlist is ~40 short tokens.

---

## 5. Runtime / compile / render wiring — the make-or-break section

The primitive is worthless without an evaluator. There are **two evaluation sites**
by necessity, split on *what data is resolvable where*:

| Object | Server (Liquid, at render) | Client (`superapp-modules.js`) |
|--------|:--:|:--:|
| product, customer, cart, geo | ✅ native Liquid objects | ✅ (from injected JSON) |
| temporal (date/day/time) | ✅ `'now'` in Liquid (cache caveat) | ✅ (authoritative) |
| behavioral (session, recently-viewed, scroll, exit, UTM) | ❌ not available server-side | ✅ only here |

**Strategy: server-first, client-finishes.** Liquid resolves everything it can and
emits a per-module verdict `data-sa-rule-server = pass | fail | defer`:
- **fail** (a fully-resolvable rule set evaluated to not-show) → the snippet renders
  nothing (or renders hidden with `hidden`), and the client leaves it hidden.
- **pass** (fully resolvable, evaluates to show) → normal render; client no-ops.
- **defer** (any behavioral/temporal-client row present, or resolution incomplete)
  → render **hidden**, ship the full `data-sa-rules` JSON, and let the client
  compute the final verdict and reveal.

This keeps the fast/private path server-side (no flash, no JS needed for the
common customer/cart/geo case) while still supporting behavioral conditions.

### 5.1 Shared pure evaluator — `packages/core/src/rule-engine/evaluate.ts`

One canonical algorithm, imported by preview + tests (TS) and **re-implemented
byte-small in the client JS** (it cannot import TS). Keep both in lockstep; a test
(§7) pins parity on a shared fixture set.

```ts
export interface RuleContext {
  // resolved primitive values keyed by `${object}.${attribute}`; undefined = unresolved
  values: Record<string, string | number | boolean | string[] | undefined>;
}
export type RowVerdict = 'pass' | 'fail' | 'unresolved';

export function evalRow(row: RuleCondition, ctx: RuleContext): RowVerdict {
  const key = `${row.object}.${row.attribute}`;
  const actual = ctx.values[key];
  if (row.operator === 'is_set') return actual != null && actual !== '' ? 'pass' : 'fail';
  if (row.operator === 'is_not_set') return actual == null || actual === '' ? 'pass' : 'fail';
  if (actual === undefined) return 'unresolved';
  return compare(actual, row.operator, row.value) ? 'pass' : 'fail';
}
// compare(): numeric ops coerce to Number; contains/starts/ends do string or
// array membership; equal_to on stringList = membership. No eval, no RegExp from
// user input (regex operator intentionally NOT in CONDITION_OPERATORS).

export function evaluateRuleEngine(
  rules: RuleEnginePack, ctx: RuleContext,
): { verdict: 'show' | 'hide'; resolvable: boolean } {
  if (!rules.enabled || rules.groups.length === 0) return { verdict: 'show', resolvable: true };
  let anyUnresolved = false;
  const groupResults = rules.groups.map((g) => {
    const rows = g.conditions.map((r) => evalRow(r, ctx));
    if (rows.includes('unresolved')) anyUnresolved = true;
    const resolved = rows.filter((v) => v !== 'unresolved');
    // unresolved rows are neutral within a group per onUnresolved handling upstream
    return g.logic === 'AND' ? resolved.every((v) => v === 'pass')
                             : resolved.some((v) => v === 'pass');
  });
  const matched = rules.logic === 'AND' ? groupResults.every(Boolean) : groupResults.some(Boolean);
  const show = rules.matchAction === 'SHOW' ? matched : !matched;
  return { verdict: show ? 'show' : 'hide', resolvable: !anyUnresolved };
}
```

> **Note.** `CONDITION_OPERATORS` deliberately has **no `regex`** — this is a
> safety choice (no user-supplied RegExp on the storefront). `starts_with` /
> `ends_with` / `contains` cover the substring needs the corpus lists.

### 5.2 Compile (`theme-module.ts`)

`config.ruleEngine` already flows to the metaobject via
`payload.config = spec.config` (`theme-module.ts:37`) → `config_json` metafield
(`metaobject.service.ts:127`). **Minimal change:** none is strictly required for
data flow. Optionally add a compiled convenience so the snippet doesn't re-derive
which rows are server-resolvable:

```ts
// in compileThemeModule, after building payload.config:
const re = (spec.config as any).ruleEngine as RuleEnginePack | undefined;
payload.ruleServerResolvable = re?.enabled
  ? re.groups.every((g) => g.conditions.every((c) => c.object !== 'behavioral'))
  : true;
```

`ruleServerResolvable=false` tells Liquid to emit `defer` without walking the tree.
Keep this optional; the Liquid gate (§5.3) can also compute it inline.

### 5.3 Render (`superapp-module.liquid`) — the server gate

Add **once** near the top (after `assign mod_cfg`, `superapp-module.liquid:24`),
before the `{% case kind %}`:

```liquid
{% liquid
  assign sa_rules = mod_cfg.ruleEngine
  assign sa_rule_server = 'pass'
  if sa_rules and sa_rules.enabled
    # Build the resolved-values map from native Liquid objects, then evaluate.
    # (Implemented as a small include: snippets/superapp-rule-eval.liquid returns
    #  sa_rule_server = 'pass' | 'fail' | 'defer' via capture, resolving
    #  product/customer/cart/geo/temporal; any behavioral row ⇒ 'defer'.)
    render 'superapp-rule-eval', rules: sa_rules  # sets sa_rule_server
  endif
%}
{% if sa_rule_server == 'fail' %}{% # module suppressed by display rules %}{% else %}
  {% # ...existing {% case kind %} render, unchanged... %}
  {% # each kind's root element gains, in addition to data-module-id: %}
  {%   #   data-sa-rules='{{ sa_rules | json | escape }}'  (only when enabled) %}
  {%   #   data-sa-rule-server='{{ sa_rule_server }}'      (pass|defer) %}
  {%   #   and `hidden` when sa_rule_server == 'defer'                     %}
{% endif %}
```

`superapp-rule-eval.liquid` (new snippet) does the server resolution in plain
Liquid. It mirrors §5.1 but only for server objects; example row handling:

```liquid
{% # customer.ordersCount >= N %}
{% if row.object == 'customer' and row.attribute == 'ordersCount' %}
  {% assign actual = customer.orders_count | default: 0 %}
  {% if row.operator == 'greater_than_or_equal' and actual >= row.value %}...pass...{% endif %}
{% endif %}
{% # geo.countryCode == 'US' %}
{% if row.object == 'geo' and row.attribute == 'countryCode' %}
  {% assign actual = localization.country.iso_code %}
  ...
{% endif %}
{% # any behavioral row ⇒ defer (client resolves) %}
{% if row.object == 'behavioral' %}{% assign sa_rule_server = 'defer' %}{% endif %}
```

Because full server-side Liquid rule-walking is verbose, a pragmatic v1 can:
resolve **only the four highest-value server objects inline** (customer.loggedIn,
customer.ordersCount, geo.countryCode, cart.subtotal/itemCount) for the "fail-fast
hide" path, and mark everything else `defer`. The client evaluator (§5.4) is the
authoritative full implementation; the server gate is a progressive-enhancement
optimization that prevents flash for the common cases. **Correctness lives in the
client; the server gate only ever hides earlier, never shows something the client
would hide** — enforced by: server emits `fail` only when the *entire* rule set is
server-resolvable AND evaluates to hide.

### 5.4 Client evaluator (`superapp-modules.js`) — authoritative

Add a `gateModules()` pass in `ready(...)` (`superapp-modules.js:227`) that runs
**before** `setupPopup`, and a rule check inside popup `open()`:

```js
// Resolve the client-side context once per page.
function ruleContext() {
  var params = new URLSearchParams(location.search);
  return {
    'geo.countryCode': (window.Shopify && Shopify.country) || null,
    'temporal.dayOfWeek': new Date().getDay(),
    'temporal.timeOfDay': new Date().toTimeString().slice(0,5),
    'behavioral.utmSource': params.get('utm_source') || '',
    'behavioral.utmCampaign': params.get('utm_campaign') || '',
    'behavioral.referrerContains': document.referrer || '',
    'behavioral.pagesViewedThisSession': sessionPageCount(),   // sessionStorage counter
    'behavioral.sessionCount': allTimeSessionCount(),          // localStorage counter
    'behavioral.recentlyViewedProductId': recentlyViewed(),    // Shopify recently-viewed cookie/api
    // customer/cart/product client values come from window.__superappCtx (see below) or data-* mirror
    // scrollPercent / exitIntent are evaluated lazily by the popup/trigger layer
  };
}

function gateModules() {
  var els = document.querySelectorAll('[data-sa-rules]');
  Array.prototype.forEach.call(els, function (el) {
    var rules; try { rules = JSON.parse(el.getAttribute('data-sa-rules')); } catch (e) { return; }
    if (!rules || !rules.enabled) return;
    var serverVerdict = el.getAttribute('data-sa-rule-server'); // 'pass' | 'defer'
    if (serverVerdict === 'pass') { el.hidden = false; return; } // server already OK'd
    var res = evaluateRules(rules, mergedContext(el)); // §5.1 re-impl
    if (res.verdict === 'show') el.hidden = false;
    else el.parentNode && el.parentNode.removeChild(el); // hide = remove from flow
  });
}
```

`evaluateRules` is the §5.1 algorithm hand-ported to ES5-ish vanilla (no
`RegExp`, no `eval`). `mergedContext(el)` overlays server-resolved values (mirrored
onto `data-sa-ctx` for customer/cart/product so the client doesn't re-fetch) with
the client-resolved `ruleContext()`.

**Popup integration:** in `setupPopup`, read the same `data-sa-rules` on the popup
root and gate `open()` with `if (!rulesPass(popup)) return;` alongside the existing
`isSuppressed` guard (`superapp-modules.js:95,132`). `scrollPercent` / `exitIntent`
behavioral rows fold naturally into the existing scroll/exit trigger handlers
(`:136-158`) — a behavioral scroll rule is satisfied by the same listener.

**Client customer/cart context.** For behavioral-deferred modules that *also* have
customer/cart rows, mirror those resolved values server-side into
`data-sa-ctx='{"customer.loggedIn":true,"cart.subtotal":82.0,...}'` on the root
(the snippet already has `customer` and `cart` in scope). The client never has to
call the Ajax cart API for the common case; if a value is missing it falls back to
`/cart.js` only when a `cart.*` row is present and unresolved.

### 5.5 App-proxy path (`proxy.widget`)

Because `proxy.widget.config` also gets the optional `ruleEngine` (#7), an
app-proxy-rendered widget can gate server-side in the proxy route (full Node
evaluator via §5.1 with a request-time context) — the strongest evaluation site,
since the proxy has the authenticated `customer` + `cart` server-side. This is the
Rebuy-parity path for cart/upsell widgets. v1 can reuse the same `evaluateRuleEngine`
in the proxy loader and simply not render the widget HTML on `hide`.

---

## 6. Back-compat (existing persisted recipes MUST keep validating + rendering)

- **Schema:** `ruleEngine` is `.optional()` on `theme.section.config` and
  `proxy.widget.config`. Every already-persisted recipe (no `ruleEngine` key)
  validates unchanged. `.catchall(z.unknown())` on `theme.section` already
  tolerates unknown keys, so even a stray `ruleEngine` on an old spec wouldn't
  have thrown.
- **Default = always show:** `enabled` defaults to `false` and
  `evaluateRuleEngine` returns `{verdict:'show'}` when `!enabled || groups.length
  === 0`. A recipe without the pack, or with `enabled:false`, renders exactly as
  today.
- **Liquid:** the server gate is wrapped in `if sa_rules and sa_rules.enabled` —
  when `mod_cfg.ruleEngine` is absent, `sa_rule_server` stays `'pass'` and the
  existing `{% case kind %}` render runs byte-identically. No `data-sa-*`
  attributes are emitted for legacy modules.
- **Client:** `gateModules()` selects `[data-sa-rules]` only. Legacy modules carry
  no such attribute → untouched. `setupPopup`'s rule check is guarded by presence
  of `data-sa-rules`.
- **Metaobject storage:** unchanged — `ruleEngine` is just another key inside the
  existing `config_json` JSON metafield; no new metafield definition, no migration.
- **Manifest:** added to `advancedPacks` only, so Basic-tier composition (and every
  existing Basic module) is unaffected; `composeConfig(type,'basic')` still
  includes it as `.optional()` per existing composer semantics
  (`compose.ts:74-78`) — forward-compatible.
- **Preview:** `preview.service.ts` treats absent/disabled `ruleEngine` as
  always-show, so existing previews are unchanged.

---

## 7. Test plan (concrete assertions)

**Core / schema (`packages/core`):**
1. `RuleEnginePackSchema.parse({})` → `{enabled:false, logic:'AND', groups:[],
   matchAction:'SHOW', onUnresolved:'defer'}` (defaults; back-compat).
2. A row with `{object:'product', attribute:'zzz', ...}` **fails** parse
   (unknown-pair `superRefine`).
3. `{operator:'greater_than', value:''}` **fails** (valueless-operator guard);
   `{operator:'is_set'}` with no value **passes**.
4. `RecipeSpecSchema.parse(<theme.section without ruleEngine>)` still passes
   (optional field, no regression) — extend an existing `recipe` test fixture.
5. Group/row/value caps: `groups` > `RULE_LIMITS.maxGroups` fails;
   `conditions` > `maxRowsPerGroup` fails.

**Evaluator parity (`packages/core/src/rule-engine`):**
6. Fixture table (≥12 cases) driving `evaluateRuleEngine`: AND-all-pass→show,
   OR-any-pass→show, `matchAction:'HIDE'` inverts, empty groups→show,
   unresolved behavioral row with `onUnresolved:'defer'`→`resolvable:false`.
7. **Client-parity test:** run the same fixture table through the vanilla
   `evaluateRules` (extract it to a tiny testable module or a jsdom harness) and
   assert identical verdicts to the TS `evaluateRuleEngine`. This is the guard
   against server/client drift.

**Compile (`apps/web` compiler tests, alongside `compile.test.ts`):**
8. A `theme.section` spec with `ruleEngine.enabled:true` and only
   customer/geo/cart rows → `payload.ruleServerResolvable === true`.
9. Add one `behavioral` row → `ruleServerResolvable === false`.
10. `config.ruleEngine` survives round-trip into `config_json`
    (`metaobject.service` mock asserts the key is present in the serialized value).

**Render (Liquid — theme-check + snapshot in `live-preview-all-surfaces.test.ts`):**
11. Snapshot: module with disabled/absent `ruleEngine` emits **no** `data-sa-*`
    attributes and identical markup to the current snapshot (back-compat lock).
12. Snapshot: enabled server-resolvable rule that fails → snippet renders the
    suppressed branch (no module markup).
13. Snapshot: enabled behavioral rule → root has `hidden` +
    `data-sa-rule-server="defer"` + a `data-sa-rules` JSON payload.

**Runtime (jsdom over `superapp-modules.js`):**
14. `gateModules()` reveals a `defer` module whose client rules pass; removes one
    whose rules fail.
15. Popup with a failing rule never calls `open()` even when its trigger fires.
16. Malformed `data-sa-rules` JSON → module left as-is (no throw), matching the
    defensive `try/catch` pattern already in the file.

**Prompt-expectations (generation corpus):**
17. "returning customers only" prompt → spec contains the expected single-row
    `ruleEngine`; unconstrained prompt → **no** `ruleEngine` (over-emission guard).

---

## 8. Risks + open questions

**Risks**
- **Server/client evaluator drift (highest).** Two implementations of §5.1 (TS +
  vanilla). Mitigated by the shared fixture parity test (#7), but any new operator
  must be added in both places. Consider generating the vanilla file from the TS
  algorithm in a later pass; for v1, the parity test is the contract.
- **Liquid rule-walking verbosity / page-cache.** Full server evaluation in Liquid
  is painful and `'now'`-based temporal checks interact with full-page caching.
  Mitigation: v1 resolves only the cheap high-value server objects inline for the
  fail-fast hide; everything else defers to the client (correctness lives client-
  side). Never emit server `fail` unless the whole set is server-resolvable.
- **Flash-of-hidden-content.** `defer` modules render `hidden` then reveal — for
  above-the-fold modules this is a layout consideration. Popups are unaffected
  (already hidden). Sections should reserve no space until revealed (they're
  removed from flow on hide, not just visually hidden).
- **PII / privacy.** Mirroring `customer.*` values into `data-sa-ctx` exposes
  logged-in-state and cart totals in page HTML. This is already visible to the
  logged-in visitor's own browser (their own data) — acceptable — but never emit
  another customer's data and keep tags/email out of the mirror (use booleans /
  counts only). Documented constraint in the snippet.
- **Cart freshness.** Cart changes after page load aren't reflected until the
  client refetches `/cart.js`. Acceptable for v1 (matches how the frequency cap and
  popup already behave); note it for cart-drawer composites in phase #4.

**Open questions**
1. **`exitIfMatched` / cumulative-fill (Rebuy) vs simple show/hide.** This design
   implements the *targeting* half (show/hide a whole module). Rebuy's
   ordered-with-exit *slot-fill* semantics belong to `recommendation.source`
   (R2.3) and `offer.funnel`. Confirm R2.1 scope = module-level gate only. (Assumed
   yes; `matchAction` + ordered groups is the agreed v1.)
2. **`product` object on non-PDP surfaces.** `product` rows only resolve on product
   templates. Should an unresolved `product.*` row on a non-PDP page be `ignore`
   (neutral) or `fail`? Current default: `unresolved` → neutral within its group,
   which effectively means "no product context → that row doesn't constrain."
   Confirm this matches merchant expectation.
3. **Where does the merchant edit rules?** The `rule-builder` widget needs a real
   admin UI. This doc specifies the field-type + `data-*` contract; the SchemaForm
   `rule-builder` renderer (drag-order rows, object→attribute→operator→value
   cascading selects) is a follow-on UI task (references `control-packs.md` R2.4
   composer decision — the widget only renders once `ConfigEditor` is mounted).
4. **Collections API compile target.** `gap-analysis.md:247` suggests compiling
   product/collection rows toward the Spring-26 Collections API for native
   variant-level conditions. Out of scope for the storefront-gate v1; revisit when
   rules drive discount/function surfaces (R2.2).
5. **`onUnresolved` exposure.** Kept hidden/system-default (`defer`) in v1. Promote
   to a merchant control only if a real case needs `ignore`.
```
