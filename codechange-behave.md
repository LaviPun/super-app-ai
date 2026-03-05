# AI Change Propagation & Regression Protocol (SuperApp AI / Shopify App)

> **Goal:** Every code change must *fully propagate* across **frontend → backend → middleware/edge → database → runtime registrations → analytics**, with **zero orphan references** and **no “it changed in one place only” bugs**.

Use this file as the **mandatory post-change runbook** for any AI-assisted patch (or manual patch).

---

## 0) Prime directive: “No partial updates”
If you rename, move, add, or change **any** of these, you must update **all connected layers**:

- **Identifiers:** module names, intent names, action keys, event names, setting keys
- **Contracts:** JSON schemas, types, validators, API request/response, DB columns
- **Registrations:** extension manifests, routers, DI containers, exports, feature flags
- **UI bindings:** forms, defaults, previews, state, validation, rendering
- **Runtime wiring:** loaders, middleware, build pipeline, deployment artifacts

**Definition of Done =** *All references updated + app compiles + tests pass + smoke flow works end-to-end*.

---

## 1) The Change Impact Map (must be filled for every patch)
Before (or immediately after) editing files, write a 1–3 minute “impact map”:

### 1.1 Change summary
- **What changed:**  
- **Why:**  
- **Risk level:** Low / Medium / High (breaking contract? runtime registration? DB schema?)  
- **Feature surface(s):** Theme / Checkout / Accounts / Admin / API / Worker / Webhook / Flow-like engine

### 1.2 Affected contracts (check all that apply)
- [ ] UI settings schema (defaults/validators)
- [ ] Intent schema / routing table
- [ ] API contract (REST/GraphQL)
- [ ] DB schema / migrations
- [ ] Events/analytics schema
- [ ] Extension manifest / registration
- [ ] Permissions / scopes
- [ ] Background jobs / queues
- [ ] Webhooks / retries
- [ ] Docs (technical.md, implementation-status.md, README) — when changing slot→module binding, Theme/Checkout/Function config source, or extension block set, update these per impact map.

### 1.3 Data flow trace (write the path)
Example format:
`Admin UI form → Settings save API → DB write → Storefront runtime loads config → Component renderer applies settings → Analytics event fires`

---

## 2) Mandatory “Repo-wide Propagation Pass” (no exceptions)
After editing, AI must do a **full propagation sweep**:

### 2.1 Global reference scan (rename/move/keys/contracts)
For every changed identifier/key/type/schema:
- [ ] Search exact string
- [ ] Search kebab/snake/camel variants
- [ ] Search old + new names (ensure old is removed or mapped)
- [ ] Search “magic strings” in templates, JSON, liquid, extension configs

**Rules**
- If a key is used in **settings**, it must exist in:
  - UI form
  - defaults
  - validator
  - renderer
  - serializer/deserializer
  - any migration or backward-compat mapping (if applicable)
- If an intent/action exists, it must exist in:
  - intent list
  - router table
  - prompt/template mapping
  - output schema validator
  - UI preview renderer (if surfaced)
  - tests for routing

### 2.2 Contract alignment check (types/validators)
- [ ] Type definitions match JSON schema
- [ ] Runtime validation exists (zod/joi/ajv/etc.)
- [ ] API request/response schemas updated
- [ ] Any “default values” updated everywhere they’re derived/duplicated

### 2.3 Export/import & module boundary check
Common “it changed but didn’t propagate” causes:
- Barrel exports not updated (`index.ts` not exporting new symbol)
- Duplicate modules (“old/legacy” folder still referenced)
- Two runtime entrypoints pointing to different versions
- Path aliases misconfigured

Checklist:
- [ ] Correct file exported from the package boundary
- [ ] No duplicate implementation left behind
- [ ] No stale imports still pointing to old path
- [ ] Build output points to the same source as dev runtime

---

## 3) Layer-by-layer Re-trace Checklist (frontend → backend → middleware → DB)
Run this in order.

### 3.1 Frontend / UI layer
- [ ] UI form fields exist for all settings
- [ ] Field names match schema keys exactly
- [ ] Validation errors are surfaced to user
- [ ] Defaults match renderer defaults (no double-default divergence)
- [ ] Preview uses the same schema + renderer path as production (avoid mock divergence)
- [ ] “Save” triggers correct API route and payload matches API contract
- [ ] Any derived state (computed fields) updated

**UI failure patterns**
- UI saves, but preview reads from a different store (draft vs published)
- UI writes new key, renderer still reads old key
- UI shows changes, but serialization drops fields

### 3.2 Backend / API layer
- [ ] Route exists and is registered (router wiring)
- [ ] Auth/session middleware applied
- [ ] Request validated (reject unknown/missing fields)
- [ ] Response schema updated
- [ ] Versioning strategy clear (if contract changed)
- [ ] Logging shows request accepted + persisted

**Backend failure patterns**
- Route implemented but not mounted
- Body parser/middleware not applied (payload becomes empty)
- Validation silently strips fields (unknown keys dropped)

### 3.3 Middleware / Edge / Runtime loader
- [ ] Runtime reads the correct config source (DB/cache)
- [ ] Cache invalidation on settings change (or version bump)
- [ ] Any CDN/edge caching rules accounted for
- [ ] The compiled bundle includes the updated code (no stale build artifact)

**Runtime failure patterns**
- Dev server runs HMR, but extension runtime loads built artifact
- Cache returns old config for X minutes
- Worker/edge uses separate env vars or separate DB

### 3.4 Database / Persistence layer
- [ ] Schema/migration added if structure changed
- [ ] Backfill strategy defined (old rows → new format)
- [ ] Reads handle missing keys safely (defaults)
- [ ] Writes are atomic (no partial writes)
- [ ] Indexes updated if queries changed

**DB failure patterns**
- Data saved under new key, old data still read by renderer
- Migration missing in one environment
- JSON blobs partially updated (merge vs replace bug)

---

## 4) “Connected Function” Guarantee (no orphan logic)
For each change, AI must ensure **all connected functions** are updated.

### 4.1 The “6 connections” rule
If you change a feature, verify these 6 connections explicitly:

1) **UI input** (field/control exists)  
2) **UI state** (stored & serialized correctly)  
3) **API contract** (validated, accepted, returned)  
4) **Persistence** (DB write + read consistent)  
5) **Runtime application** (renderer/engine uses it)  
6) **Telemetry** (event emitted correctly, no PII leakage)

If any of the six is missing → change is **not complete**.

---

## 5) Duplication & Drift Kill-Switch (your exact problem)
When “it updates in one place but not elsewhere,” you almost always have **duplicate sources of truth**.

### 5.1 Mandatory duplicate hunt
- [ ] Search for multiple configs defining the same keys
- [ ] Search for multiple prompt templates for same intent
- [ ] Search for multiple schema versions in different folders
- [ ] Search for older generators still referenced (“old/new code both present”)

### 5.2 Enforce Single Source of Truth (SSOT)
Pick **one** canonical place for each:
- Settings schema
- Default settings
- Intent routing table
- Prompt templates
- Output schemas
- Component registry

Then:
- [ ] Any other copies must be deleted OR replaced with imports from the canonical source
- [ ] Add a test that fails if duplicates appear again

---

## 6) Build/Runtime Connectivity Checklist (libraries “not connected”)
If you suspect imports/build/runtime are not wired:

### 6.1 Dependency + lockfile integrity
- [ ] Only one package manager in use (npm OR pnpm OR yarn)
- [ ] Lockfile updated and committed
- [ ] Workspace deps resolved correctly (no “phantom” local packages)

### 6.2 Build artifact sanity
- [ ] Clean build (no cached artifacts)
- [ ] Verify build output timestamp changes after your code changes
- [ ] Verify runtime points to latest output (not an old `/dist`)

### 6.3 Environment parity
- [ ] Same env vars in dev vs runtime
- [ ] Same API base URL
- [ ] Same DB / same shop / same app config

---

## 7) AI Post-Patch Verification Steps (must run every time)
After AI edits code, AI must perform this verification sequence:

### Step A — Compile-time guarantees
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] No unused exports / unreachable files introduced

### Step B — Contract tests
- [ ] Settings schema validates sample payload
- [ ] API accepts payload and returns expected schema
- [ ] DB read/write roundtrip preserves all keys

### Step C — End-to-end smoke flow (the real truth)
Pick at least one representative scenario and trace fully:
- [ ] Create/update module settings in Admin UI
- [ ] Confirm persisted state changed
- [ ] Confirm storefront runtime loads new config
- [ ] Confirm UI changes visible
- [ ] Confirm analytics emitted

**If any step fails:** treat as *propagation failure*, not “minor bug.”

---

## 8) Regression Matrix (minimum coverage)
Every patch must declare which cells were validated:

| Surface | Create | Edit | Render | Persist | Reload | Analytics |
|--------|--------|------|--------|---------|--------|-----------|
| Admin UI | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Storefront Theme | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Checkout UI | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| API/Webhooks | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Background/Workers | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## 9) “Stop the merge” conditions
A patch must NOT be considered done if:
- [ ] Old identifiers still referenced anywhere (unless explicit compatibility mapping exists)
- [ ] Schema keys differ between UI and runtime
- [ ] Runtime uses different config source than Admin UI saves to
- [ ] Any layer uses silent fallback masking the problem
- [ ] Any part of the feature depends on cached data without invalidation strategy

---

## 10) Optional but recommended: Add guard tests (prevents recurrence)
Add tests that *force propagation correctness*:

- **Schema drift test:** UI schema keys == runtime schema keys
- **Routing completeness test:** every intent has template + output schema
- **Registry test:** every module/intent registered exactly once (no duplicates)
- **Roundtrip test:** settings serialize → persist → read → render (no key loss)

---

## References
- Shopify app build & architecture docs. :contentReference[oaicite:0]{index=0}
- Shopify Agents docs (if you’re using/aligning with Shopify’s agent patterns). :contentReference[oaicite:1]{index=1}