# Agentic-commerce surface — add or defer? (M13)

**Phase #4 / spec 031 — composites & new surfaces**
**Decision piece:** should the module generator gain a first-class "AI channel" / agentic-commerce **target surface** (UCP + Catalog/Cart/Checkout MCPs + the Catalog API), distinct from `online_store` / `checkout` / `admin` / `pos`?

> **DECISION: ADD — but as a NARROW, real "AI-channel product-data" surface, not the full MCP/UCP stack.**
> Ship exactly one new module type, `agentic.catalogProfile`, whose runtime is an app-served read-only feed endpoint we already know how to build (the `pos.extension` precedent). Everything that needs an unbuilt runtime — a hosted MCP endpoint, agent-profile registration, sponsored-products, Cart/Checkout MCP — is marked `needs_runtime` and left an explicit follow-up. This is the smallest additive step that (a) puts "generate for AI channels" in the vocabulary honestly and (b) ships a runtime on day one instead of an AUDIT no-op.

Rationale in §8. The rest of the doc is the buildable spec for that narrow add.

---

## 1. Current state (file:line)

There is **no agentic/AI-channel surface anywhere in the model.** Confirmed:

- **`CapabilitySurface`** — `packages/core/src/capability-graph.ts:5-13` enumerates `THEME | ADMIN | CHECKOUT | FUNCTIONS | CUSTOMER_ACCOUNT | POS | INTEGRATION | FLOW`. No agentic member. `inferSurface()` (`capability-graph.ts:22-31`) has no branch for it.
- **`ExtensionRuntimeKind`** — `packages/core/src/extension-eligibility.ts:31-41` is `theme | checkout-ui | customer-account-ui | admin-ui | flow | web-pixel | pos-ui | app-proxy | function | composite`. No `agentic-feed`.
- **`RECIPE_SPEC_TYPES`** — `packages/core/src/allowed-values.ts:714-743`. 21 types, none agentic. Parallel maps that MUST stay total (a missing key is a TS error): `MODULE_TYPE_TO_CATEGORY` (`allowed-values.ts:804-826`), `MODULE_TYPE_DEFAULT_REQUIRES` (`:829-851`), `MODULE_TYPE_TO_SURFACE` (`:854-876`).
- **`ShopifySurface`** — `allowed-values.ts:791-801` = `online_store | checkout | customer_accounts | admin | pos | flow | marketing_analytics | payments`. No agentic channel.
- **Compiler dispatch** — `apps/web/app/services/recipes/compiler/index.ts:20-64`. `compileRecipe` `switch (spec.type)` is exhaustive with a `never` guard (`:60-63`); a new type without a case is a compile error.
- **RecipeSpec discriminated union** — `packages/core/src/recipe.ts:111` (`z.discriminatedUnion('type', […])`); adding a variant is additive to the union.
- **Eligibility `REGISTRY`** — `extension-eligibility.ts:107-262` (`Record<ModuleType, …>`, must stay total).
- **`grep -rln "agentic|UCP|Catalog API|syndication|product feed"` over `apps/web/app` + `packages/core/src` → zero hits.** Greenfield.

**The reusable precedent (this is what makes the add real, not faked):** `pos.extension` is a `PLATFORM` type whose config is **not** read by a shipped Shopify extension via metaobjects — it is served from *our own app backend* and read by an external consumer over HTTP:
- Route `apps/web/app/routes/api.pos.config.tsx` (loader authenticates, returns JSON + CORS).
- Reader `apps/web/app/services/pos/pos-config.server.ts:53-70` — `readPublishedPosConfig()` queries `prisma.module.findMany({ type, status:'PUBLISHED', shop, include:{ activeVersion } })`, parses the persisted `RecipeSpec`, projects a render-safe shape. **No metaobject, no Shopify write.**
- Compiler `apps/web/app/services/recipes/compiler/index.ts` routes `pos.extension` to the AUDIT-only branch (`:56`) because the "deploy" is just persisting the config the backend route already reads.
- Eligibility `extension-eligibility.ts:243-252` marks it `runtimeShipped: true` with a note that config comes from `/api/pos/config`.

An AI-channel product feed is the **same shape**: publish persists config, an app-served endpoint reads the active PUBLISHED version and emits it to an external consumer (here, an AI crawler / agent instead of the POS device). We are not inventing a runtime class — we are reusing one.

---

## 2. Target shape (exact types + example)

### 2.1 New module type

Add one type to `RECIPE_SPEC_TYPES` (`allowed-values.ts:714-743`):

```ts
'agentic.catalogProfile',
```

New surface + runtime enums:

```ts
// capability-graph.ts:5-13
export type CapabilitySurface =
  | 'THEME' | 'ADMIN' | 'CHECKOUT' | 'FUNCTIONS'
  | 'CUSTOMER_ACCOUNT' | 'POS' | 'INTEGRATION' | 'FLOW'
  | 'AGENTIC';                                   // NEW

// allowed-values.ts:791-801
export const SHOPIFY_SURFACES = [ …, 'agentic_channel' ] as const;   // NEW member

// extension-eligibility.ts:31-41
export type ExtensionRuntimeKind =
  | … | 'composite'
  | 'agentic-feed';                              // NEW (app-served read feed)
```

### 2.2 Config enums (append to `allowed-values.ts`, near the other RecipeSpec enums ~`:401`)

```ts
/** agentic.catalogProfile — which AI-channel artifacts this module produces. */
export const AGENTIC_ARTIFACTS = [
  'catalog-feed',        // REAL today: app-served product feed (JSON) for AI crawlers/agents
  'attribute-map',       // REAL today: enriches feed rows with normalized attributes (size/color/gtin/…)
  'compliance-disclosure', // REAL today: adds required disclosures to feed rows
  'mcp-endpoint',        // needs_runtime: a hosted Catalog-MCP endpoint (follow-up)
  'agent-profile',       // needs_runtime: Dev-Dashboard agent registration (follow-up)
  'sponsored-products',  // needs_runtime: Catalog-API sponsored placement (follow-up)
] as const;
export type AgenticArtifact = (typeof AGENTIC_ARTIFACTS)[number];

/** Which product set the feed syndicates. Static, resolver-backed — no free-form query. */
export const AGENTIC_PRODUCT_SOURCES = ['all', 'collection', 'manual'] as const;

/** Normalized attribute keys an AI channel expects (feeds `attribute-map`). */
export const AGENTIC_ATTRIBUTE_KEYS = [
  'gtin', 'mpn', 'brand', 'size', 'color', 'material', 'gender', 'ageGroup', 'condition',
] as const;

export const AGENTIC_LIMITS = {
  manualProductsMax: 250,      // mirrors Catalog-API product-lookup ceiling posture
  collectionsMax: 25,
  attributeMapRowsMax: 50,
  disclosuresMax: 20,
  disclosureTextMax: 500,
} as const;
```

### 2.3 RecipeSpec variant (append to the union at `recipe.ts:111`)

Shape is deliberately close to the pricing/recommendation packs already in the union — flat `config`, static resolvers, no runtime that doesn't exist.

```ts
Base.extend({
  type: z.literal('agentic.catalogProfile'),
  category: z.literal('INTEGRATION').default('INTEGRATION'),
  requires: z.array(z.custom<Capability>()).default([]),
  config: z.object({
    /** Which artifacts to produce. `catalog-feed` is the always-real default. */
    artifacts: z.array(z.enum(AGENTIC_ARTIFACTS)).min(1).default(['catalog-feed']),

    /** Product set the feed syndicates. */
    source: z.object({
      kind: z.enum(AGENTIC_PRODUCT_SOURCES).default('all'),
      collectionIds: z.array(z.string().regex(COLLECTION_GID_RE)).max(AGENTIC_LIMITS.collectionsMax).optional(),
      productIds: z.array(z.string().regex(PRODUCT_GID_RE)).max(AGENTIC_LIMITS.manualProductsMax).optional(),
    }).default({ kind: 'all' }),

    /** attribute-map: map a normalized key ← a product metafield / attribute path. */
    attributeMap: z.array(z.object({
      key: z.enum(AGENTIC_ATTRIBUTE_KEYS),
      /** e.g. "metafield:custom.gtin" | "vendor" | "productType" | "variant.sku". */
      from: z.string().min(1).max(120),
    })).max(AGENTIC_LIMITS.attributeMapRowsMax).default([]),

    /** compliance-disclosure: rows appended to every feed item. */
    disclosures: z.array(z.object({
      label: z.string().min(1).max(80),
      text: z.string().min(1).max(AGENTIC_LIMITS.disclosureTextMax),
    })).max(AGENTIC_LIMITS.disclosuresMax).default([]),

    /** Public feed handle (URL slug under /agentic/<handle>/feed.json). */
    feedHandle: z.string().regex(/^[a-z0-9-]{3,40}$/).default('catalog'),
  }),
}),
```

### 2.4 Example spec

```jsonc
{
  "type": "agentic.catalogProfile",
  "name": "AI Channel — Summer Catalog",
  "category": "INTEGRATION",
  "requires": [],
  "config": {
    "artifacts": ["catalog-feed", "attribute-map", "compliance-disclosure"],
    "source": { "kind": "collection", "collectionIds": ["gid://shopify/Collection/12345"] },
    "attributeMap": [
      { "key": "gtin",  "from": "metafield:custom.gtin" },
      { "key": "brand", "from": "vendor" },
      { "key": "color", "from": "metafield:custom.color" }
    ],
    "disclosures": [
      { "label": "Country of origin", "text": "Made in Portugal." }
    ],
    "feedHandle": "summer-catalog"
  }
}
```

Published, this is readable at `GET /agentic/{shop}/{feedHandle}/feed.json` (see §5).

---

## 3. Files to change

**`packages/core` (types — additive, no behaviour):**
1. `allowed-values.ts:714` — add `'agentic.catalogProfile'` to `RECIPE_SPEC_TYPES`.
2. `allowed-values.ts:791` — add `'agentic_channel'` to `SHOPIFY_SURFACES`.
3. `allowed-values.ts` (~`:401`, RecipeSpec-config enums block) — add `AGENTIC_ARTIFACTS`, `AGENTIC_PRODUCT_SOURCES`, `AGENTIC_ATTRIBUTE_KEYS`, `AGENTIC_LIMITS`.
4. `allowed-values.ts:804` `MODULE_TYPE_TO_CATEGORY` — `'agentic.catalogProfile': 'INTEGRATION'`.
5. `allowed-values.ts:829` `MODULE_TYPE_DEFAULT_REQUIRES` — `'agentic.catalogProfile': []`.
6. `allowed-values.ts:854` `MODULE_TYPE_TO_SURFACE` — `'agentic.catalogProfile': 'agentic_channel'`.
7. `allowed-values.ts:945` `CLASSIFICATION_RULES` — add a rule: keywords `['ai channel','agentic','ai shopping','chatgpt shopping','product feed','catalog syndication','ai crawler','ai discovery']` → `type: 'agentic.catalogProfile'`.
8. `allowed-values.ts:748` `MODULE_TYPE_ORDER` — insert near `integration.httpSync` (display order; missing → falls to end harmlessly).
9. `capability-graph.ts:5` — add `'AGENTIC'` to `CapabilitySurface`; `:22-31` `inferSurface` — `if (moduleType.startsWith('agentic.')) return 'AGENTIC';`. `inferAllowedTargets` (`:33-35`) already returns `['PLATFORM']` for any non-THEME surface — correct, no change.
10. `recipe.ts:111` — add the §2.3 variant to the discriminated union. Import the new enums.
11. `extension-eligibility.ts:31` — add `'agentic-feed'` to `ExtensionRuntimeKind`; `:107` add the `REGISTRY` entry (§6).

**`apps/web` (runtime — the real work):**
12. `apps/web/app/services/recipes/compiler/agentic.catalogProfile.ts` — **new** compiler (§4).
13. `apps/web/app/services/recipes/compiler/index.ts:14` import + `:20` add `case 'agentic.catalogProfile': return compileAgenticCatalogProfile(spec);`.
14. `apps/web/app/services/agentic/feed.server.ts` — **new** reader (§5), mirrors `services/pos/pos-config.server.ts`.
15. `apps/web/app/routes/agentic.$shop.$handle.feed[.]json.tsx` — **new** public loader (§5).

**Tests:** §7.

---

## 4. Generation wiring

The generator already emits any type in `RECIPE_SPEC_TYPES` and validates against `RecipeSpecSchema`; adding the variant + a classification rule is sufficient for the model to *produce* it. Concretely:

- **Classification** (change #7) routes prompts like "make my products discoverable in ChatGPT / AI shopping" to `agentic.catalogProfile`. Confirmed path: `CLASSIFICATION_RULES` at `allowed-values.ts:945` is the same table every other type uses.
- **Authoring** (flat-pin path, per constraints — no composer): the type appears in `MODULE_TYPES_DISPLAY_ORDER` (derived from `RECIPE_SPEC_TYPES`, `allowed-values.ts:776`) and its `config` is edited via the live `generate._index.tsx` builder + SchemaForm. Non-storefront types in that route already fall through to "edit `recipe.config` directly" (`generate._index.tsx:409`), so `agentic.catalogProfile` needs no bespoke UI — its Zod config drives SchemaForm.
- **Prompt/preview:** no new preview kind. Preview shows a summary card ("Feed: N products · M attributes mapped · K disclosures") — deterministic, computed from config, consistent with the "PreviewService generates previews deterministically, no AI preview" rule. Add a summary branch in the preview service keyed on `spec.type === 'agentic.catalogProfile'`.
- **Dev-MCP grounding (optional, ai-leverage §A1):** when compiling this type, the attribute-map `from` paths could be validated against the shop's real metafield definitions via the connected `shopify-dev-mcp` / admin. **Not required for v1** — mark as a follow-up; v1 accepts any `from` string and resolves best-effort at feed time (§5).

---

## 5. Runtime / compile / render / publish wiring (make-or-break)

This is the section that decides whether the add is real. It is, because it reuses the `pos.extension` app-served model end-to-end.

### 5.1 Compile — `agentic.catalogProfile.ts` (new)

No Shopify write. Persisting the config *is* the deploy (identical to `pos.extension`, `compiler/index.ts:56`). Emit an AUDIT op so the publish pipeline records it, and a small `compiledJson` for the modules UI.

```ts
import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

const REAL_ARTIFACTS = new Set(['catalog-feed', 'attribute-map', 'compliance-disclosure']);

export function compileAgenticCatalogProfile(
  spec: Extract<RecipeSpec, { type: 'agentic.catalogProfile' }>,
): CompileResult {
  const { artifacts, feedHandle, source } = spec.config;
  const deferred = artifacts.filter((a) => !REAL_ARTIFACTS.has(a)); // mcp/agent-profile/sponsored
  const ops: CompileResult['ops'] = [
    { kind: 'AUDIT', action: 'compile.agentic.catalogProfile',
      details: JSON.stringify({ feedHandle, source: source.kind, artifacts }) },
  ];
  if (deferred.length) {
    // Honesty: name what did NOT deploy. Preflight (§5.4) surfaces this to the merchant.
    ops.push({ kind: 'AUDIT', action: 'agentic.deferred-artifacts', details: deferred.join(',') });
  }
  return {
    ops,
    compiledJson: JSON.stringify({ feedUrl: `/agentic/{shop}/${feedHandle}/feed.json`, artifacts }),
  };
}
```

> **Deliberately no new `DeployOperation` kind.** The feed is served live from the DB (§5.2); nothing is written to Shopify, so `types.ts:1-24` needs no change. This keeps `publish.service.ts:106` (the op switch) untouched.

### 5.2 Render — `services/agentic/feed.server.ts` (new)

Mirror `pos-config.server.ts:53-70`: read the active PUBLISHED `agentic.catalogProfile` module for the shop, parse its `RecipeSpec`, then resolve products.

```ts
export async function readPublishedAgenticFeed(
  prisma: PrismaClient, shopDomain: string, feedHandle: string,
): Promise<AgenticFeedConfig | null> {
  const mod = await prisma.module.findFirst({
    where: { type: 'agentic.catalogProfile', status: 'PUBLISHED', shop: { shopDomain } },
    include: { activeVersion: true }, orderBy: { updatedAt: 'desc' },
  });
  // parse mod.activeVersion.spec via RecipeSpecSchema; match config.feedHandle === feedHandle
  // return null when unconfigured (NO placeholder data — same fence as POS)
}
```

Product resolution uses the **existing** authenticated admin/Storefront client the app already holds for the shop (offline session) — the same client the theme/recommendation resolvers use. `source.kind`:
- `all` → paginated `products` query (bounded page count).
- `collection` → `collection(id).products`.
- `manual` → `nodes(ids: productIds)`.

For each product emit `{ id, title, description, url, price, availability, images, attributes }`, where `attributes` applies `attributeMap` (`from` = `metafield:<ns>.<key>` | a top-level field like `vendor`/`productType` | `variant.<field>`), and `disclosures` are appended verbatim. This is deterministic projection — no LLM at render time.

### 5.3 Route — `agentic.$shop.$handle.feed[.]json.tsx` (new)

Public, unauthenticated **read-only** loader (an AI crawler has no session), scoped by `{shop, handle}`:

```ts
export async function loader({ params }: LoaderFunctionArgs) {
  const { shop, handle } = params;
  const cfg = await readPublishedAgenticFeed(getPrisma(), shop!, handle!);
  if (!cfg) return json({ configured: false, items: [] }, { status: 404 });
  const items = await resolveFeedItems(cfg /*, admin client for shop */);
  return json({ shop, handle, items }, {
    headers: { 'Cache-Control': 'public, max-age=900', 'Access-Control-Allow-Origin': '*' },
  });
}
```

Wrap in `withApiLogging` (as POS does). Public product data only — no PII, no auth needed; rate-limit + cache via `Cache-Control` (feeds are re-crawled, not per-request-critical). This route is the shipped "runtime" that makes `runtimeShipped: true` honest.

### 5.4 Publish / preflight

`classifyModulePublishability` (`publish-preflight.server.ts:100+`) consults the eligibility registry. With the §6 entry (`runtime:'agentic-feed'`, `runtimeShipped:true`), preflight returns `deployable` — publish persists the version, the feed goes live. **The three real artifacts deploy; the three deferred ones are surfaced as a merchant note** (from the compiler's `agentic.deferred-artifacts` AUDIT op → a preflight `reason`), never silently "published". No plan gate (`requiresPlan` undefined), scopes `['read_products']` (feed needs product reads).

---

## 6. Back-compat

Every change is **additive** and the type maps stay total, so nothing existing changes shape or behaviour:

- New union variant → existing specs still parse; `RecipeSpecSchema` is a discriminated union keyed on `type`.
- New `RECIPE_SPEC_TYPES` member → the total `Record<ModuleType,…>` maps (`MODULE_TYPE_TO_CATEGORY`, `_DEFAULT_REQUIRES`, `_TO_SURFACE`, eligibility `REGISTRY`) get one new key each; TS enforces totality, so we can't forget one.
- New `CapabilitySurface`/`ShopifySurface`/`ExtensionRuntimeKind` members are string-union extensions — no existing consumer narrows on absence.
- `compileRecipe`'s `never`-guarded switch (`index.ts:60-63`) **forces** us to add the case (compile error otherwise) — a feature, not a risk.
- No new `DeployOperation` kind → `publish.service.ts` op switch, publish contract, and drift tests are untouched.
- No DB migration: reuses `Module` + `ModuleVersion` (persisted `RecipeSpec`), exactly like `pos.extension`.

**Eligibility registry entry (`extension-eligibility.ts:107`):**

```ts
'agentic.catalogProfile': {
  moduleType: 'agentic.catalogProfile',
  runtime: 'agentic-feed',
  runtimeShipped: true, // the app-served /agentic/.../feed.json route is shipped
  requiredScopes: ['read_products'],
  note: 'Publishes an AI-channel product feed served from the app backend (/agentic/{shop}/{handle}/feed.json). MCP endpoint, agent-profile registration, and sponsored products are not yet shipped and are omitted from a published module.',
},
```

---

## 7. Test plan

1. **`packages/core` totality (compile-time):** adding the type without the four map keys must fail `tsc`. Add a `__tests__` assertion that `RECIPE_SPEC_TYPES.every(t => t in MODULE_TYPE_TO_SURFACE && …)` — mirror the existing map-totality test.
2. **Schema round-trip** (`recipe.ts`): `RecipeSpecSchema.parse(example)` from §2.4 succeeds; bad `feedHandle` (`UPPER`), over-limit `collectionIds`, and a non-GID `productIds` entry each fail.
3. **Eligibility audit** (`__tests__/module-deployability-audit.test.ts`): `getExtensionEligibility('agentic.catalogProfile')` → `runtime:'agentic-feed'`, `runtimeShipped:true`; `classifyModulePublishability(spec)` → `status:'deployable'`. Add the new type to that test's coverage set so the registry stays pinned.
4. **Compiler** (`__tests__/compile.test.ts`): `compileRecipe(spec, {kind:'PLATFORM'})` returns an `AUDIT compile.agentic.catalogProfile` op; a spec requesting `mcp-endpoint` additionally yields an `agentic.deferred-artifacts` op naming it.
5. **Feed reader** (new test): seed a PUBLISHED module + a DRAFT of the same type; `readPublishedAgenticFeed` returns only the published one and `null` for an unknown handle / unconfigured shop (the no-placeholder fence, matching the POS reader test).
6. **Route** (new test): unconfigured shop → 404 `{configured:false, items:[]}`; configured shop → items with mapped attributes + appended disclosures; response carries `Cache-Control` + CORS headers.
7. **Classification** (`classify` test): "make my catalog discoverable in ChatGPT shopping" → `agentic.catalogProfile`.
8. **Attribute projection** (unit): `attributeMap` `from` variants (`metafield:custom.gtin`, `vendor`, `variant.sku`) resolve to the right source; unknown metafield → attribute omitted (not `null`).

---

## 8. Risks + DECISION the human must make

**Recommendation: ADD the narrow `agentic.catalogProfile` surface now; DEFER the MCP/UCP runtime.**

Why add rather than defer entirely:
- The strategic signal (editions §1a, ai-leverage §B2) is strong and this is the one Phase-#4 surface where a **real runtime is cheap** — we already ship the exact "publish config → app-served endpoint reads active PUBLISHED version → external consumer fetches" pattern for POS. We can ship *something that deploys* day one instead of another AUDIT-only `needs_runtime` type.
- It slots into the flat-pin substrate with zero composer resurrection and zero DB migration.

Why NOT the full stack now (defer, honestly):
- A hosted **Catalog/Cart/Checkout MCP endpoint**, **agent-profile registration** (Dev Dashboard), and **sponsored products** each need infrastructure we do **not** have (a public MCP server, Dashboard credentials, a revenue integration). Building `mcp-endpoint` as a real artifact = a new spec, not a sub-task. Per the honesty discipline, those three enum values exist in the vocabulary but a module requesting them publishes only the real artifacts and the compiler names the deferred ones (§5.1/§5.4). We do not fake an MCP.

**Risks:**
- **R1 — feed correctness / cost.** `source.kind:'all'` on a large catalog is an unbounded admin read at crawl time. *Mitigation:* bounded pagination + `Cache-Control: max-age=900`; consider a nightly precompute if traffic warrants (follow-up, not v1).
- **R2 — attribute-map `from` is a free-form string.** v1 resolves best-effort and omits unresolved keys. Tightening it to the shop's real metafield definitions is the Dev-MCP-grounding follow-up (§4); acceptable for v1 because omission is safe.
- **R3 — the deferred trio invites "looks done but isn't."** Mitigated structurally: `runtimeShipped:true` is *only* true for the feed; a spec that asks for `mcp-endpoint` still publishes (the feed part) but the merchant note + AUDIT op state plainly that MCP/agent-profile/sponsored did not deploy. This is the same pattern `admin.discountUi` / `integration.httpSync` use for partial reality.
- **R4 — auth on a public route.** The feed is public product data only (title/price/availability/images) — no PII — so unauthenticated read is correct; the review gate must confirm no customer/order data leaks into the projection (§5.2 emits product fields only).

**The single human decision:** *Is a product-data syndication feed the right first wedge into agentic commerce, or does the org want to wait for a hosted MCP endpoint so the first agentic module is "an actual AI shopping endpoint" rather than "a feed an AI can crawl"?* If the answer is "feed is a fine wedge," this spec is buildable as written. If the answer is "MCP or nothing," then **defer entirely** — do not ship `agentic.catalogProfile`, because a feed-only surface would set the expectation that we're "in agentic commerce" when we're really only doing syndication.
