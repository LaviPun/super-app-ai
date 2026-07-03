# R3.2 — Blueprint co-deploy ("Publish all N")

**Spec:** 031-composites-and-surfaces · Phase #4 · Piece R3.2
**Feeds:** the composite parity goal (`gap-analysis.md:254-256`). Depends on the *generation half* of blueprints, which is real and wired end-to-end behind `BLUEPRINTS_ENABLED` (`research/reality/blueprints.md:35-37`).
**Substrate note:** authoring is flat-pin `RecipeSpec.config` + the live `generate._index.tsx` builder + `SchemaForm`; the control-pack composer / `moduleSystemVersion` were pruned (a17a748). This spec adds **nothing** to the authoring path — it operates entirely at publish time on already-persisted `ModuleVersion.specJson`. No composer resurrection.

---

## 1. Current state (file:line)

The generation → persist half is genuinely live; the **publish/co-deploy half is a facade** — three functions with zero real callers wire nothing together:

| Symbol | File:line | State |
|---|---|---|
| `BlueprintService.publishBlueprint(admin, shop, recipeId, opts)` | `apps/web/app/services/blueprints/blueprint.service.ts:121-167` | Fully implemented, **zero callers** (`blueprints.md:24`). No route/UI/job invokes it. |
| `injectResolvedBundle(spec, bundle)` | `blueprint.service.ts:25-43` | **Test-only caller** (`__tests__/blueprint-deployability.test.ts:17`). The would-be caller is `publishBlueprint`, which never runs (`blueprints.md:27,82`). |
| `BundleProductService` (`resolveComponents` / `ensureParentBundleProduct` / `activateCartTransform` / `resolveBundleWithPricing`) | `apps/web/app/services/bundles/bundle-product.service.ts:196-327` | The whole "resolve SKUs → real GIDs, ensure parent product, activate cart-transform" layer has **zero non-test callers** (grep confirmed). |

Consequences on the live path:
- Blueprint members persist as N independent **DRAFT** modules (`blueprint.service.ts:78-88`) and can only be published **one at a time** via the ordinary per-module publish UI (`/api/publish` → `PublishService.publish`, `api.publish.tsx:224-225`; or `/api/agent/modules/$id/publish`, `api.agent.modules.$moduleId.publish.tsx:167-168`).
- No SKU→GID resolution runs, so a bundle member deploys with the **AI-generated placeholder GIDs** (`blueprints.md:82`). The `theme.section` bundle widget references `bundleId`/`components` that no member ever populates; the `functions.cartTransform` member writes a `$app:bundle_config` with unresolved component SKUs. They do not wire to each other.
- `publishBlueprint` as written **does not call the bundle resolver at all** — it just loops members through `PublishService.publish` (`blueprint.service.ts:135-164`). So even if it were wired, cross-references would still be placeholders. **This is the core defect R3.2 must fix, not just "add a caller."**

What already works and must be reused unchanged:
- `PublishService.publish(spec, target)` writes real metaobjects per surface and is idempotent (`publish.service.ts:52-145`). Co-deploy must call **this**, not reimplement writes.
- `BundleProductService` already does the correct resolution + `productSet` + `cartTransformCreate` + `$app:bundle_config` write (`bundle-product.service.ts:200-312`). Co-deploy must call **this**, not reimplement it.
- `DeployTarget` union (`packages/core/src/recipe.ts:63-77`): `{kind:'THEME', themeId, moduleId}` | `{kind:'PLATFORM', moduleId}`.

---

## 2. Target shape (exact types + example)

### 2.1 The resolution problem, stated precisely

A blueprint's members reference each other through **shared identifiers the AI cannot know at generation time** (real variant/product GIDs, the parent bundle variant, a stable `bundleId`). "Co-deploy" = publish members **in dependency order**, resolving those identifiers once (from live store data) and injecting them into each dependent member's spec *before* it compiles.

The only cross-reference that exists in the current catalog (`blueprint-catalog.ts:48-101`) is the **bundle triangle**:

```
functions.cartTransform (cart-merge)   ← owns componentSkus → resolves to real GIDs + parent variant + bundleId
        │  produces ResolvedBundle
        ▼
theme.section kind=product-bundle (bundle-builder-ui)  ← needs bundleId + components[]
checkout.block / checkout.upsell (checkout-display)    ← needs parent bundle variant
```

The `promo.discount_reveal` blueprint (`blueprint-catalog.ts:80-100`) has **no cross-reference** — a `theme.section` popup + a `functions.discountRules` that share only a discount code string already present in both specs. Co-deploy for it is "publish both members"; no resolution needed. **Design for both: a resolver that no-ops when there is nothing to resolve.**

### 2.2 New types (add to `blueprint.service.ts`)

```ts
/** One member ready to publish: its spec (post-injection) + the target it deploys to. */
type PlannedMember = {
  moduleId: string;
  versionId: string;
  type: ModuleType;
  spec: RecipeSpec;
  target: DeployTarget;
};

/** Per-member outcome. `skipped` = a required upstream member failed, so this
 *  dependent was not attempted (kept DRAFT, retryable). */
export type BlueprintPublishResult = {
  recipeId: string;
  published: Array<{ moduleId: string; type: string }>;
  failed: Array<{ moduleId: string; type: string; error: string }>;
  skipped: Array<{ moduleId: string; type: string; reason: string }>;
  /** The resolved bundle when a bundle triangle was co-deployed; else null. */
  resolvedBundle: ResolvedBundle | null;
};
```

`BlueprintPublishResult` **replaces** the current `{published, failed}` shape (`blueprint.service.ts:51-54`) — additive fields, existing consumers are none (zero callers today), so this is a free widening.

### 2.3 The co-deploy contract (new signature)

```ts
async publishBlueprint(
  admin: AdminClient,
  shopDomain: string,
  recipeId: string,
  opts?: { themeId?: string },
): Promise<BlueprintPublishResult>
```

Same signature as today (`blueprint.service.ts:121-126`) — the *body* changes. Ordering + resolution described in §5.

### 2.4 Example: bundle blueprint co-deploy

Input — 3 DRAFT members persisted from the `upsell.bundle_builder` catalog entry:

```jsonc
// cart-merge (functions.cartTransform) — the resolution SOURCE
{ "type": "functions.cartTransform",
  "config": { "mode": "BUNDLE",
    "bundles": [{ "title": "Starter Set", "componentSkus": ["CLEANSER-1","SERUM-1"], "bundleSku": "STARTER" }] } }

// bundle-builder-ui (theme.section) — placeholder GIDs the AI invented
{ "type": "theme.section",
  "config": { "kind": "product-bundle", "title": "Build your bundle",
    "bundleId": "PLACEHOLDER", "components": [] } }

// checkout-display (checkout.block) — placeholder variant
{ "type": "checkout.block", "config": { "productVariantGid": "gid://shopify/ProductVariant/0" } }
```

After co-deploy, the resolver runs the cart-transform member's `bundles[0]` through `BundleProductService`, producing:

```jsonc
{ "bundleId": "starter-set", "title": "Starter Set",
  "parentVariantId": "gid://shopify/ProductVariant/500",
  "discountPercentage": 0,
  "components": [ { "sku": "CLEANSER-1", "variantId": "gid://shopify/ProductVariant/11", ... },
                  { "sku": "SERUM-1",    "variantId": "gid://shopify/ProductVariant/12", ... } ] }
```

…and injects it into the dependent members via `injectResolvedBundle` (already handles `theme.section product-bundle` + `checkout.upsell`, `blueprint.service.ts:28-40`) **plus a new `checkout.block` branch** (§3). Each member then compiles + publishes against real GIDs.

---

## 3. Files to change

| File | Change | Why |
|---|---|---|
| `apps/web/app/services/blueprints/blueprint.service.ts` | Rewrite `publishBlueprint` body (§5). Widen `injectResolvedBundle` to also handle `checkout.block` (parent variant) — currently only `theme.section`+`checkout.upsell` (`:28-40`), but the bundle catalog uses `checkout.block` (`blueprint-catalog.ts:73`). Add `resolveBundleForBlueprint` private helper. Replace `BlueprintPublishResult` shape. | The make-or-break wiring. |
| `apps/web/app/routes/api.blueprints.$recipeId.publish.tsx` | **New route.** Auth → flag gate → resolve default `themeId` → `BlueprintService.publishBlueprint` → mark members published → return `BlueprintPublishResult`. Mirrors `api.publish.tsx` preflight/policy per member. | Gives `publishBlueprint` its first real caller. |
| `apps/web/app/routes/generate._index.tsx` | After `finishBlueprint` (`:721-731`) succeeds and returns `recipeId`, add a "Publish all N" affordance that POSTs to the new route. Alternatively surface it on the sibling banner. | The merchant-facing entry point. |
| `apps/web/app/routes/modules.$moduleId.tsx` | In the existing sibling banner (`:479-490`) add a "Publish all N" button when `data.blueprint` is present and members are DRAFT. | Second entry point (the banner is already there). |
| `apps/web/app/__tests__/blueprint-co-deploy.test.ts` | **New test file** (§7). | The contract. |
| `docs/blueprints.md` | Update §co-deploy: was "unshipped, zero callers" → now wired; document ordering + resolution + non-atomicity. | Honesty discipline (`gap-analysis.md:220`). |

**No changes** to `packages/core/src/recipe-blueprint.ts`, the catalog, the planner, `PublishService`, or `BundleProductService` — all reused as-is.

---

## 4. Generation wiring

**None required, and that is deliberate.** The generation half already emits everything co-deploy needs:
- The cart-transform member carries `config.bundles[].componentSkus` (`recipe.ts:287-297`) — the resolution source.
- The blueprint's `links[]` (`recipe-blueprint.ts:28-33`) are human-readable notes ("not auto-wired yet"). Co-deploy does **not** read `links` to decide wiring — it detects the bundle triangle **structurally** (a member of type `functions.cartTransform` with `config.mode === 'BUNDLE'` + `config.bundles`). This keeps co-deploy robust to the AI omitting/mislabeling links.
- `recommendationHint` / `kindHint` (`blueprint-catalog.ts:22-34`) already steer the generated `theme.section` config; co-deploy overwrites only `bundleId`/`components` (bundle identity), never the recommendation config.

**Follow-up (not this piece):** a general cross-ref mechanism (member A declares "inject my published GID into member B's `config.foo`") would let *arbitrary* new composites co-deploy without a bespoke bundle path. Out of scope — the only live cross-ref is the bundle triangle. Mark explicitly: **R3.2 wires the bundle triangle concretely; a declarative cross-ref graph is a separate follow-up** (ties to R3.1 "composites as manifests over a shared record", `gap-analysis.md:255`).

---

## 5. Runtime / compile / render / publish wiring  ← make-or-break

### 5.1 Ordering

Members publish in **dependency order**, not catalog order:

1. **Resolution source first.** If the blueprint contains a `functions.cartTransform` bundle member, run `resolveBundleForBlueprint` (§5.2) *before publishing any member*. This does the SKU→GID resolution and `productSet` (creates the parent variant) but is **read/ensure only for identity** — it does not depend on the theme/checkout members existing yet.
2. **Publish the cart-transform member** (writes `$app:bundle_config` via its own compile path *and* `BundleProductService.activateCartTransform`). See §5.4 for who owns the `$app:bundle_config` write.
3. **Inject the `ResolvedBundle` into each dependent member's spec**, then publish theme + checkout members (order among them irrelevant — they only depend on the resolved bundle, not each other).
4. **Members with no bundle dependency** (e.g. the whole `promo.discount_reveal` blueprint) publish in catalog order with no injection.

Ordering is derived, not configured:
```ts
const SOURCE_TYPES = new Set(['functions.cartTransform']);
const source = members.find(m => SOURCE_TYPES.has(m.type) && isBundleConfig(m.spec));
// publish order: [source, ...rest] when source exists, else members as-is
```

### 5.2 `resolveBundleForBlueprint` (new private helper)

```ts
private async resolveBundleForBlueprint(
  admin: AdminClient,
  cartTransformSpec: RecipeSpec,
): Promise<ResolvedBundle | null> {
  const cfg = (cartTransformSpec as any).config;
  const first = cfg?.bundles?.[0];
  if (!first?.componentSkus?.length) return null;      // nothing to resolve → no-op
  const svc = new BundleProductService(admin);
  const components = await svc.resolveComponents(first.componentSkus);   // SKU → real GID
  if (components.length < 2) {
    throw new Error(`Bundle "${first.title}": only ${components.length}/${first.componentSkus.length} component SKUs resolved to store variants.`);
  }
  const bundleId = bundleIdFromTitle(first.title);
  const parentVariantId = await svc.ensureParentBundleProduct({ bundleId, title: first.title, components }); // productSet
  let bundle: ResolvedBundle = { bundleId, title: first.title, parentVariantId, discountPercentage: 0, components };
  bundle = resolveBundleWithPricing(bundle, first.pricing);             // R2.2 lowered pricing, if any
  return bundle;
}
```

Notes:
- Uses `resolveComponents` (`bundle-product.service.ts:200`), `ensureParentBundleProduct` (`:241`), `bundleIdFromTitle` (`:83`), `resolveBundleWithPricing` (`:127`) — all existing, all pure-or-Admin, none reimplemented.
- **Fails loud** when SKUs don't resolve (matches the "never report published when nothing wires" discipline of `PublishService`, `publish.service.ts:52-58`). A partially-resolved bundle is a hard error, not a silent placeholder.

### 5.3 `injectResolvedBundle` widening

Add a third branch to the existing function (`blueprint.service.ts:25-43`), because the bundle catalog's checkout member is `checkout.block` (`blueprint-catalog.ts:73`), not `checkout.upsell`:

```ts
if (spec.type === 'checkout.block') {
  return { ...spec, config: { ...config, productVariantGid: bundle.parentVariantId, offerTitle: bundle.title } } as RecipeSpec;
}
```

Keep the existing `theme.section product-bundle` and `checkout.upsell` branches unchanged (still valid; a future catalog may use `checkout.upsell`).

### 5.4 Who writes `$app:bundle_config` — the one subtlety

Two writers exist and they must not fight:
- `BundleProductService.activateCartTransform(config)` (`bundle-product.service.ts:279`) writes `$app:bundle_config` on the cart transform, keyed by `buildBundleRuntimeConfig([resolvedBundle])`.
- `PublishService.publish` for a `functions.cartTransform` member emits `FUNCTION_CONFIG_UPSERT` → writes the **`superapp.functions/fn_cartTransform` metaobject** (`publish.service.ts:119-120,191-215`) — a *different* metaobject namespace, read by the compiler-config path.

These write **different objects** (the cart-transform's own `$app:bundle_config` metafield vs. the app's `superapp.functions` metaobject). The wasm handler reads `$app:bundle_config` (`bundle-product.service.ts:64,289`). **Decision:** co-deploy must call `activateCartTransform` **after** `PublishService.publish` of the cart-transform member so the runtime config (with resolved GIDs) is authoritative. Sequence for the source member:
```
PublishService.publish(cartTransformSpec, {kind:'PLATFORM', moduleId})   // metaobject config + preflight gate
await new BundleProductService(admin).activateCartTransform(buildBundleRuntimeConfig([bundle]))  // $app:bundle_config w/ real parentVariantId
```
This is the single line that turns "cart-transform deployed with placeholder config" into "cart-transform running against the real parent variant."

### 5.5 Full `publishBlueprint` body (pseudocode)

```ts
async publishBlueprint(admin, shopDomain, recipeId, opts): Promise<BlueprintPublishResult> {
  const recipe = await this.getBlueprint(shopDomain, recipeId);
  if (!recipe) throw new Error('Blueprint not found');

  // 1. Materialize members (DRAFT version + parsed spec + target).
  const members: PlannedMember[] = recipe.modules.map(m => {
    const draft = m.versions.find(v => v.status === 'DRAFT') ?? m.versions[0];
    const spec = RecipeSpecSchema.parse(JSON.parse(draft.specJson));
    const isTheme = m.type.startsWith('theme.') || m.type === 'proxy.widget';
    const target = isTheme ? { kind:'THEME', themeId: opts?.themeId ?? '', moduleId: m.id }
                           : { kind:'PLATFORM', moduleId: m.id };
    return { moduleId: m.id, versionId: draft.id, type: m.type, spec, target };
  });

  // 2. Resolve the bundle triangle (if any) BEFORE publishing dependents.
  const sourceIdx = members.findIndex(m => m.type === 'functions.cartTransform' && isBundleConfig(m.spec));
  let bundle: ResolvedBundle | null = null;
  const failed = [], published = [], skipped = [];

  if (sourceIdx >= 0) {
    try { bundle = await this.resolveBundleForBlueprint(admin, members[sourceIdx].spec); }
    catch (e) {
      // resolution failed → the whole triangle is unpublishable; skip dependents.
      failed.push({ ...members[sourceIdx], error: msg(e) });
      for (const dep of dependents(members)) skipped.push({ ...dep, reason: 'bundle resolution failed' });
      return { recipeId, published, failed, skipped, resolvedBundle: null };
    }
  }

  // 3. Publish in dependency order.
  const order = sourceIdx >= 0 ? [members[sourceIdx], ...members.filter((_,i)=>i!==sourceIdx)] : members;
  const publisher = new PublishService(admin);
  for (const member of order) {
    try {
      const spec = bundle ? injectResolvedBundle(member.spec, bundle) : member.spec;
      if (member.target.kind === 'THEME' && !member.target.themeId)
        throw new Error('themeId is required to publish a theme member.');
      await publisher.publish(spec, member.target);              // real metaobject writes, gated
      if (member.type === 'functions.cartTransform' && bundle)   // §5.4
        await new BundleProductService(admin).activateCartTransform(buildBundleRuntimeConfig([bundle]));
      await this.markMemberPublished(member);                     // Module + ModuleVersion → PUBLISHED
      published.push({ moduleId: member.moduleId, type: member.type });
    } catch (e) {
      failed.push({ moduleId: member.moduleId, type: member.type, error: msg(e) });
      // member stays DRAFT → retryable. Non-atomic by design (metaobject writes
      // across surfaces can't be transactional — same rationale as the current doc comment).
    }
  }
  return { recipeId, published, failed, skipped, resolvedBundle: bundle };
}
```

`markMemberPublished` mirrors the existing status flip (`blueprint.service.ts:151-159`) — set `Module.status` + `ModuleVersion.status`/`publishedAt`/`targetThemeId`.

### 5.6 Route: `api.blueprints.$recipeId.publish.tsx`

Mirror `api.publish.tsx` structure (auth `shopify.authenticate.admin`, `withApiLogging`, `enforceRateLimit`), then:
1. **Flag gate:** `if (!isBlueprintsEnabled()) return json({error:'Blueprints are not enabled.'}, {status:403})` (matches `api.ai.create-blueprint.tsx:23-25`).
2. **Resolve default themeId** when any member is a theme module and none supplied: reuse `ThemeService(admin).listThemes()` (`api.publish.tsx:186-187`) → pick the main/published theme id. (Same theme-existence check as `api.publish.tsx:185-196`.)
3. **Per-member preflight/policy is inherited from `PublishService.publish`**, which already runs `classifyModulePublishability` and throws `ModuleNotPublishableError` (`publish.service.ts:55-58`). Co-deploy catches per member → `failed[]`. This means the route does **not** need to duplicate the full `api.publish.tsx` policy stack for a first cut; document that plan-tier/feature-flag gating is enforced only for single publish today and co-deploy relies on the `PublishService` gate. **Follow-up:** thread `PublishPolicyService` + feature-flag evaluation per member for parity with single publish (`api.publish.tsx:130-179`).
4. Return `BlueprintPublishResult` as JSON. Log `MODULE_PUBLISHED` per published member (reuse `ActivityLogService`).

### 5.7 Render

Nothing new to render. Once members flip PUBLISHED, existing render paths apply unchanged: the `theme.section` bundle widget reads the injected `bundleId`/`components` from its published metaobject; the wasm cart-transform reads `$app:bundle_config`. The `modules.$moduleId.tsx` sibling banner (`:479-490`) already shows membership; it just needs the button.

---

## 6. Back-compat

- **Purely additive on the live path.** `BLUEPRINTS_ENABLED` is `false` everywhere (`blueprints.md:19,50`), so co-deploy is dark in production until the flag flips — identical risk posture to the existing generation half. Single-module publish (`/api/publish`, `/api/agent/…/publish`) is untouched.
- **`injectResolvedBundle` widening is additive** — the new `checkout.block` branch only triggers for that type; existing `theme.section`/`checkout.upsell` branches and the "return unchanged" fallthrough are preserved. The existing test (`blueprint-deployability.test.ts:99-138`) still passes.
- **`BlueprintPublishResult` shape change is free** — zero current consumers of the old `{published, failed}` shape.
- **`publishBlueprint` signature unchanged** — only the body changes, so any future caller binds to the same contract.
- **Non-atomic, retryable** — a partial failure leaves failed members DRAFT; re-running co-deploy is idempotent (`PublishService` writes are handle-keyed/idempotent, `publish.service.ts:196-207`; `ensureParentBundleProduct` is idempotent by handle, `bundle-product.service.ts:246`; `activateCartTransform` reuses the existing cart transform, `:288-291`). Re-publish of already-PUBLISHED members is safe.
- **`promo.discount_reveal` and any non-bundle blueprint** flow through the `bundle === null` path — publish each member, no injection — so co-deploy is correct for blueprints with no cross-reference.

---

## 7. Test plan

New file `apps/web/app/__tests__/blueprint-co-deploy.test.ts` (vitest, mock the Admin client + Prisma like the existing blueprint tests):

**Unit — `injectResolvedBundle` widening**
1. `checkout.block` spec → `productVariantGid` becomes `bundle.parentVariantId`, `offerTitle` becomes bundle title.
2. Existing `theme.section product-bundle` + `checkout.upsell` branches still pass (regression — keep `blueprint-deployability.test.ts` green).
3. `functions.cartTransform` / unrelated spec returned by reference (unchanged).

**Unit — `resolveBundleForBlueprint`** (mock `BundleProductService`)
4. Happy path: 2 SKUs resolve → returns `ResolvedBundle` with `bundleId` from title, `parentVariantId` from `ensureParentBundleProduct`, `components` in requested order.
5. `< 2` SKUs resolve → throws (fail-loud), no `ensureParentBundleProduct` call.
6. Cart-transform member with no `bundles` → returns `null` (no-op).
7. `pricing` present → `resolveBundleWithPricing` threads `price`/`tiers` (assert lowered shape flows through).

**Integration — `publishBlueprint`** (mock `PublishService.publish`, Prisma, Admin)
8. **Bundle triangle order:** cart-transform publishes first; theme + checkout members receive the injected `ResolvedBundle` (assert the spec passed to `publisher.publish` for the theme member has real `bundleId`/`components`, not placeholders).
9. **`$app:bundle_config` write:** `activateCartTransform` called exactly once, after the cart-transform member's `publish`, with `buildBundleRuntimeConfig([bundle])` (assert real `parentVariantId`).
10. **Resolution failure:** `resolveComponents` throws → source in `failed[]`, all dependents in `skipped[]`, no dependent `publish` called, `resolvedBundle: null`.
11. **Partial member failure:** theme member `publish` throws → it lands in `failed[]`, stays DRAFT (no status flip), other members still published; result is non-atomic.
12. **Non-bundle blueprint (`promo.discount_reveal`):** both members publish, no injection, `activateCartTransform` never called, `resolvedBundle: null`.
13. **themeId missing for a theme member** → that member fails with the themeId error; platform members unaffected.
14. **Idempotent re-run:** running twice yields the same PUBLISHED set (mock idempotent writes) with no duplicate `ensureParentBundleProduct` effect.

**Guardrail (extend existing `blueprint-deployability.test.ts`)**
15. For every catalog entry, assert the co-deploy `order` derivation puts the resolution source first (or leaves order intact when none) — a pure function, no mocks.

**Route smoke (`api.blueprints.$recipeId.publish.tsx`)**
16. Flag off → 403. Flag on, unknown recipeId → error surfaced. Flag on, valid → returns `BlueprintPublishResult` JSON, logs one `MODULE_PUBLISHED` per published member.

Run: `cd apps/web && npx vitest run app/__tests__/blueprint-co-deploy.test.ts app/__tests__/blueprint-deployability.test.ts app/__tests__/blueprints.test.ts`.

---

## 8. Risks + DECISIONS for the human

**DECISION 1 (the one that gates the piece) — default `themeId` for co-deploy.** Single publish makes the merchant pick a theme in the UI (`modules.$moduleId.tsx:404`, `api.publish.tsx:185-196`). Co-deploy publishes ≥1 theme member in a batch. Options: (a) auto-select the store's **main/published** theme via `ThemeService.listThemes()` and publish there; (b) require the merchant to pick a theme in the "Publish all N" affordance and pass it to every theme member; (c) publish non-theme members immediately, theme members deferred until a theme is chosen. **Recommendation: (b)** — one theme picker in the co-deploy UI, passed as `opts.themeId`; it is explicit, matches merchant mental model, and avoids silently publishing to the live theme. This is the single UX decision the human must confirm before build.

**RISK 1 — the `$app:bundle_config` dual-writer (§5.4).** If ordering is wrong (activate before the member's own publish, or the compiler's `FUNCTION_CONFIG_UPSERT` clobbers the runtime metafield), the wasm reads stale/placeholder config and the bundle silently misbehaves at checkout. Mitigated by the explicit sequence in §5.4 and test #9, but it is the highest-consequence correctness point — the reviewer should scrutinize it.

**RISK 2 — resolution is bundle-specific, not general.** R3.2 hard-codes the bundle triangle. Any *new* composite with a different cross-reference (loyalty ledger ↔ theme widget, subscription contract ↔ checkout) needs its own resolver branch until the declarative cross-ref graph (the §4 follow-up / R3.1) lands. Documented as an explicit follow-up, not faked.

**RISK 3 — per-member policy gate parity (§5.6 step 3).** First cut relies on `PublishService`'s `classifyModulePublishability` gate and skips the full `PublishPolicyService` + feature-flag stack that single publish runs. A plan-tier-blocked member would be caught by the publishability gate but not by tier policy. Acceptable for a flag-dark first cut; flagged as a follow-up for parity. **Do not** let co-deploy report a member "published" when its single-publish path would have blocked it — the shared `PublishService` gate is what prevents that, so it must stay the sole publish entry point (no reimplemented writes).
