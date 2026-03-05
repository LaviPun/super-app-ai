# Global App Audit & Auto-Fix Loop Protocol (Production-Grade)

> **Use this file as a reusable “command + checklist” to ask AI to audit the entire app, trace every connection, find every bug, and loop until the app reaches production-quality.**  
> Works for any full-stack app; includes Shopify-specific checks (Public app, OS 2.0 only, no deprecated features).

---

## 1) How to use (copy/paste instructions)

### 1.1 Operator rule
When I say **“Start Global Audit”**, you (AI) must:
- Build a full **dependency + connection map**
- Run **static + runtime + end-to-end** verification
- Log issues with **severity + root-cause + fix plan**
- Apply fixes in small safe batches
- Re-run all checks
- **Repeat until zero critical/high issues remain** and all acceptance gates pass

### 1.2 “Start Global Audit” prompt (copy/paste into AI)
Paste this into your AI chat when you want the full loop:

**PROMPT:**
You are the “Production Audit & Auto-Fix Agent” for this app.

**Objective:** Find and fix all bugs and broken connections across frontend, backend, middleware/edge, database, integrations, and Shopify surfaces. Loop until production-grade quality is achieved.

**Constraints:**
- No partial updates: every change must propagate to all connected layers.
- No deprecated Shopify features. Support **Online Store 2.0 only** (no vintage theme support).
- Each fix must include verification and must not regress other flows.
- Maintain existing feature behavior unless explicitly changed; preserve backwards compatibility only if required and explicitly defined.
- Prefer Single Source of Truth (SSOT) for schemas, settings, routing, registries.

**Process (loop):**
1) Build a repo map (folders, packages, entrypoints, manifests, runtime surfaces).
2) Build a Connection Graph (all routes, links, registries, schemas, events, webhooks, jobs, extensions).
3) Run Static Audit (search, typecheck, lint, schema validation, dead code, duplicate implementations).
4) Run Runtime Audit (build outputs, env parity, routing mount checks, cache behavior, DB connectivity).
5) Run End-to-End Smoke Matrix for each surface (Admin, Theme, Checkout, Accounts, API/Webhooks, Jobs).
6) Create an Issue Ledger: severity, reproduction, root cause, exact fix, affected files.
7) Apply fixes in safe batches:
   - patch → run tests → smoke → update ledger → repeat
8) Stop only when acceptance gates pass and Issue Ledger has no Critical/High items.

**Deliverables each iteration:**
- Connection Graph summary
- Issue Ledger table
- File-by-file patch list
- Verification Matrix
- Remaining risks (if any) + next steps

Start now. Ask only for *missing repo inputs that block progress*, otherwise proceed with reasonable assumptions.

---

## 2) Acceptance Gates (Definition of Done)

### 2.1 Release gate (must pass)
- [ ] App builds cleanly (no stale artifacts)
- [ ] Typecheck + lint pass
- [ ] Unit tests + integration tests pass (or explicitly documented gaps)
- [ ] Schema validation passes for all canonical contracts
- [ ] End-to-end smoke pass on all supported surfaces
- [ ] No Critical/High issues in ledger
- [ ] Observability present (logs + errors + key metrics)
- [ ] Security baseline met (OAuth, HMAC verification, PII rules)

### 2.2 “No partial updates” gate
For every change, all of these must be true:
- [ ] UI/inputs updated
- [ ] State/serialization updated
- [ ] API contract updated
- [ ] Persistence updated
- [ ] Runtime application updated
- [ ] Telemetry/event schema updated

If any is missing → change is incomplete.

---

## 3) Global Connection Graph (the “everything is linked” map)

AI must generate and keep updated a graph/registry of:

### 3.1 Entrypoints
- Frontend entrypoints (Admin UI, embedded app, storefront runtime, theme assets)
- Backend entrypoints (server index, routes, webhooks, workers)
- Edge/middleware entrypoints (if any)
- Extension entrypoints (Theme App Extension blocks, Checkout UI Extensions, Customer Account UI, etc.)

### 3.2 Contracts / SSOT
- Settings schema(s)
- Intent/routing schema(s) (if AI-driven)
- API request/response schemas
- DB schema/migrations
- Analytics/event schema
- Connector schemas (external integrations)

### 3.3 Runtime wiring
- Routers (mounted vs implemented)
- Middleware (auth/session/body parsing)
- DI container / registries / exports
- Feature flags
- Cache and invalidation paths

### 3.4 Integrations
- Shopify Admin APIs + API version usage
- Webhooks + HMAC verification + retry strategy
- App proxies (if used)
- Billing / plans / usage limits
- Flow-like workflows (if applicable)
- Third-party APIs/queues

---

## 4) Static Audit Checklist (repo-wide propagation)

### 4.1 Global reference propagation
For any changed identifier/key/type:
- [ ] Search exact string
- [ ] Search variants (snake/camel/kebab)
- [ ] Remove old references or add explicit mapping
- [ ] Update docs + examples + tests

### 4.2 Duplicate/drift detection (most common “not propagating” cause)
- [ ] Find multiple schema copies defining same keys
- [ ] Find multiple registries for same module
- [ ] Find old/new implementations both referenced
- [ ] Find multiple entrypoints pointing to different builds

**Mandatory:** enforce **Single Source of Truth (SSOT)** for:
- schemas
- defaults
- registries
- routing tables
- templates/prompt maps (if AI)

### 4.3 Module/export boundary checks
- [ ] index/barrel exports updated
- [ ] imports point to canonical path (no legacy folders)
- [ ] path aliases correct
- [ ] build output uses correct source

### 4.4 Types/schemas/validators alignment
- [ ] Type definitions match JSON schema
- [ ] Runtime validation exists (don’t trust types only)
- [ ] Defaults consistent across UI + backend + renderer
- [ ] Unknown keys policy is intentional (strip vs reject)

---

## 5) Runtime Audit Checklist (build + environment + “connected or not” problems)

### 5.1 Build artifact sanity
- [ ] clean build (no stale dist)
- [ ] verify output timestamps change
- [ ] dev runtime uses the same artifact path as production runtime expectations
- [ ] no dual “dev server vs built extension” divergence

### 5.2 Dependency integrity
- [ ] one package manager + single lockfile
- [ ] workspace deps resolved correctly
- [ ] no duplicated versions of critical packages
- [ ] node runtime version consistent across environments

### 5.3 Env parity
- [ ] env vars aligned dev/stage/prod
- [ ] API base URLs correct
- [ ] DB connection string correct
- [ ] Shopify app credentials and redirect URLs correct

### 5.4 Cache + invalidation correctness
- [ ] settings/config changes invalidate cache
- [ ] CDN/edge caching does not pin stale config
- [ ] versioned config strategy exists if needed

---

## 6) End-to-End Smoke Matrix (production confidence)

For each supported surface, run:
- Create → Edit → Persist → Reload → Render → Analytics

### 6.1 Surfaces
- [ ] Admin embedded UI (settings + module editor)
- [ ] Storefront Theme App Extension (OS 2.0 blocks)
- [ ] Checkout UI Extensions (if supported)
- [ ] Customer Accounts UI (if supported)
- [ ] API routes (public/private)
- [ ] Webhooks (install/uninstall/updates)
- [ ] Background jobs/workers/queues (if any)

### 6.2 “Data Flow Re-trace” (must write path)
Example:
`Admin UI → Save API → DB write → Storefront loader reads config → Renderer applies props → Event emitted`

If the trace breaks anywhere, log it and fix.

---

## 7) Link/Route/Trace Validation (the “check every link” part)

AI must verify **all** references are live and connected:

### 7.1 UI links & navigation
- [ ] All internal routes exist and render
- [ ] No dead links in menus/settings pages
- [ ] Buttons trigger correct handlers
- [ ] Deep-links include correct shop context (if embedded)

### 7.2 API endpoints
- [ ] Every frontend call maps to a mounted backend route
- [ ] No 404/405 from route mismatch
- [ ] Request/response matches schema
- [ ] Consistent error format

### 7.3 Webhooks / callbacks
- [ ] Webhook endpoints registered and reachable
- [ ] Signature verification (HMAC) implemented
- [ ] Idempotency keys or dedupe strategy present
- [ ] Retry handling (Shopify retries) accounted for

### 7.4 Extension registrations
- [ ] Theme App Extension blocks referenced by correct handles
- [ ] Checkout extension points valid (no deprecated patterns)
- [ ] Customer accounts extensions registered correctly (if used)
- [ ] No “declared but not built” extension entrypoints
- [ ] Extension plan alignment: Theme slots (Universal/Product/Cart/Embed), Checkout UI, Cart Transform, Functions, Post-purchase, Admin UI documented and target map / config sources consistent with [technical.md](docs/technical.md) §15

---

## 8) Shopify-Specific “No Deprecated Features” Gate (OS 2.0 only)

AI must confirm:
- [ ] No vintage theme support paths exist (or they are removed)
- [ ] Theme App Extension is the primary mechanism for storefront UI
- [ ] Checkout uses **Checkout Extensibility** patterns (no deprecated checkout customizations)
- [ ] API versions used are supported and not in/near deprecation window (log exact versions)
- [ ] Scopes are minimal + correct; installation flow consistent

---

## 9) Security, Privacy, and Compliance Baseline

- [ ] OAuth flow correct, state parameter used, redirect URL exact
- [ ] Session storage secure
- [ ] HMAC verification for Shopify callbacks/webhooks
- [ ] Rate limiting on public endpoints
- [ ] Input validation everywhere (server-side)
- [ ] PII rules enforced (never log sensitive data)
- [ ] CSP/clickjacking protections where relevant (embedded)

---

## 10) Performance & Reliability Baseline

- [ ] No N+1 DB queries on hot paths
- [ ] Bundle sizes acceptable (especially storefront)
- [ ] Caching strategy documented and safe
- [ ] Job retries with backoff + dead-letter strategy (if using queues)
- [ ] Timeouts set for external API calls
- [ ] Circuit breaker / fallback behavior defined

---

## 11) Observability & Debuggability Baseline

- [ ] Structured logs (request id, shop id, trace id)
- [ ] Error tracking (stack traces, grouping)
- [ ] Key metrics (latency, error rate, webhook failures)
- [ ] Health check endpoint
- [ ] Audit trail for config changes

---

## 12) Issue Ledger (must be maintained every iteration)

Use this table format:

| ID | Severity | Layer | Surface | Symptom | Root Cause | Fix | Files | Verification |
|----|----------|-------|---------|---------|------------|-----|-------|--------------|
| 001 | High | Backend | API | 404 on save | route not mounted | mount router | server/routes.ts | e2e pass |

**Severity rules:**
- **Critical:** data loss, broken install, security issue, checkout break, app unusable
- **High:** core feature broken, config not applying, major surface failing
- **Medium:** partial feature break, wrong defaults, inconsistent UI
- **Low:** cosmetic, minor UX polish, non-blocking logs

---

## 13) Auto-Fix Loop Algorithm (repeat until clean)

### Loop steps (must follow in order)
1) **Detect**: gather errors from logs/tests/smokes
2) **Classify**: severity + affected surfaces
3) **Localize**: smallest root cause + dependency chain
4) **Patch**: minimal safe change, SSOT enforced
5) **Propagate**: update every connected layer
6) **Verify**: typecheck + lint + tests + smoke
7) **Record**: update Issue Ledger + patch list
8) **Repeat** until:
   - Issue Ledger has **no Critical/High**, and gates pass

### Stop conditions (don’t stop early)
- Not allowed: “looks fine” without proofs.
- Only allowed: acceptance gates pass + smoke matrix checked.

---

## 14) Output format required from AI each iteration

AI must produce:
1) **Connection Graph summary** (what connects to what)
2) **Issue Ledger**
3) **File-by-file patch list** (PR-style)
4) **Verification Matrix** (checked boxes)
5) **Remaining risks** (if any) + next iteration plan

---

## 15) Optional guard tests (prevents recurrence of your propagation issue)

Add tests that fail if drift returns:
- Schema drift: UI schema keys == runtime renderer keys
- Routing completeness: every intent/action has handler + template + output validator
- Registry uniqueness: no duplicate module registrations
- Roundtrip: settings serialize → persist → reload → render (no key loss)

---

## 16) Quick “Start Commands” phrases you can use

- “Start Global Audit (full loop)”
- “Run Static Audit only”
- “Run Runtime Connectivity Audit”
- “Run End-to-End Smoke Matrix for Admin + Theme”
- “Regenerate Connection Graph and find duplicates/drift”
- “Stop only when acceptance gates pass”

---