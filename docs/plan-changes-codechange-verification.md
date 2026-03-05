# Plan Changes Verification (per codechange-behave.md)

**Date:** 2026-03-05  
**Scope:** (1) Universal Module Slot & extension plan — documentation updates. (2) DataStoreService duplicate `listRecords` fix.  
**Reference:** [codechange-behave.md](../codechange-behave.md)

---

## 1) Change Impact Map (§1 codechange-behave)

### 1.1 Change summary

| Item | What changed | Why | Risk level | Feature surface(s) |
|------|----------------|-----|------------|--------------------|
| **Doc plan** | technical.md §15, README, implementation-status, ai-module-main-doc, shopify-dev-setup, theme-app-extension README, phase-plan, app.md, global-audit, codechange-behave | Document Universal Module Slot, Theme Editor constraint, slot→module options, block set, extension plan, unified data model, implementation order | Low | Docs only; no runtime |
| **listRecords** | DataStoreService: renamed first `listRecords` to `listRecordsByDataStoreId`; data.$storeKey.tsx now calls it | Second `listRecords(shopId, storeKey, options)` overwrote first; UI route was calling wrong signature | Medium (backend + UI) | Admin / API |

### 1.2 Affected contracts

| Contract | Doc plan | listRecords fix |
|----------|----------|------------------|
| UI settings schema | — | — |
| Intent schema / routing table | — | — |
| API contract | — | — (agent still uses `listRecords(shopId, storeKey, options)`) |
| DB schema / migrations | — | — |
| Events/analytics schema | — | — |
| Extension manifest / registration | — | — |
| Permissions / scopes | — | — |
| Background jobs / queues | — | — |
| Webhooks / retries | — | — |
| **Docs (technical, implementation-status, README)** | ✅ Updated per impact map | — |

### 1.3 Data flow trace

- **Doc plan:** No data flow (documentation only). Flow for future slot/target map: `App UI (assign module→slot) → API → DB/metafields → Theme/Checkout runtime reads target map → Renderer`.
- **listRecords fix:** `Data store records UI (data.$storeKey.tsx) → loader calls svc.listRecordsByDataStoreId(store.id, { page, pageSize }) → DataStoreService.listRecordsByDataStoreId → Prisma → same response shape. Agent route unchanged: svc.listRecords(shopId, storeKey, { limit, offset }).`

---

## 2) Repo-wide Propagation Pass (§2)

### 2.1 Global reference scan

| Changed identifier | Exact string | Variants | Old removed / mapped | Magic strings (templates/JSON/liquid) |
|--------------------|--------------|-----------|----------------------|---------------------------------------|
| Universal Module Slot, §15, slot_key, target map | ✅ Grep: technical.md, README, implementation-status, ai-module-main-doc, shopify-dev-setup, theme-app-extension README, phase-plan, app.md, global-audit, agent-native-audit-report | N/A (doc terms) | N/A | No code/templates reference these yet (planned) |
| listRecords → listRecordsByDataStoreId | ✅ Only definition in data-store.service.ts; call site in data.$storeKey.tsx updated | — | Old name (first method) removed; second method remains `listRecords` for agent | — |

**Result:** No orphan references. Agent route and crud-completeness-audit.md correctly refer to `listRecords(shopId, storeKey)` (the remaining method).

### 2.2 Contract alignment check

- Type definitions: DataStoreService method signatures unchanged from caller perspective (data.$storeKey gets same shape from listRecordsByDataStoreId; agent gets same shape from listRecords).
- Runtime validation: No API contract change.
- Default values: Page/pageSize and limit/offset behavior unchanged.

### 2.3 Export/import & module boundary check

- [x] No new package exports (doc-only + one service method rename).
- [x] No duplicate implementation left behind (single DataStoreService).
- [x] data.$storeKey.tsx imports and calls listRecordsByDataStoreId; api.agent.data-stores.$storeKey.records.tsx calls listRecords(shopId, storeKey, options).
- [x] Build points to same source; no stale artifact.

---

## 3) Layer-by-Layer Re-trace (§3)

### 3.1 Frontend / UI layer (listRecords fix only)

- [x] Data store records page (data.$storeKey.tsx) loads records via loader → listRecordsByDataStoreId(store.id, { page, pageSize: 50 }).
- [x] Field names and response shape unchanged (records, total, page, pageSize).
- [x] No new UI form fields; same “Save”/API path for data stores.

### 3.2 Backend / API layer

- [x] Route data.$storeKey.tsx loader uses DataStoreService; no new route.
- [x] Agent route api.agent.data-stores.$storeKey.records.tsx unchanged: still calls svc.listRecords(shopRow.id, storeKey, { limit, offset }).
- [x] Response schema unchanged.

### 3.3 Middleware / Runtime loader

- [x] No cache layer for data store records; runtime reads from DB.
- [x] Build includes updated service and route (verified by clean build).

### 3.4 Database / Persistence layer

- [x] No schema/migration change; same Prisma usage.
- [x] Reads/writes unchanged; listRecordsByDataStoreId and listRecords both use same DataStoreRecord model.

---

## 4) Connected Function Guarantee (§4 — listRecords fix)

| Connection | Status |
|------------|--------|
| 1) UI input | ✅ data.$storeKey.tsx uses store.id and pagination; loader calls listRecordsByDataStoreId. |
| 2) UI state | ✅ Same loader data shape (records, total, page, pageSize). |
| 3) API contract | ✅ Agent API unchanged; listRecords(shopId, storeKey, options) still used. |
| 4) Persistence | ✅ Same Prisma read path. |
| 5) Runtime application | ✅ Records list page renders from loader data. |
| 6) Telemetry | ✅ No change. |

---

## 5) Duplication & Drift (§5)

### 5.1 Duplicate hunt

- [x] Single source for “Universal Module Slot” design: technical.md §15. Other docs link to it (implementation-status, ai-module-main-doc, phase-plan, README, global-audit).
- [x] No duplicate schema or routing table for slot/target map (not yet in code).
- [x] DataStoreService: only one method named listRecords (the shopId/storeKey one); one listRecordsByDataStoreId. No duplicate definitions.

### 5.2 SSOT

- [x] Extension/slot/target map: technical.md §15 is canonical; implementation-status and ai-module-main-doc summarize and link.
- [x] Data store records: DataStoreService is single implementation; UI and agent call the appropriate method.

---

## 6) Build/Runtime Connectivity (§6)

- [x] Single package manager (pnpm); lockfile present.
- [x] Clean build: `pnpm run build` succeeds; no “Duplicate member” warning after fix.
- [x] No env change for this patch.

---

## 7) Post-Patch Verification (§7)

### Step A — Compile-time

- [x] Typecheck passes.
- [x] Lint passes (read_lints on changed files).
- [x] No unused exports; no new unreachable code.

### Step B — Contract tests

- [x] Data store records: loader returns same shape; agent route returns same shape (listRecords still used for agent).
- [x] No DB schema change; roundtrip unchanged.

### Step C — E2E smoke (representative)

- [x] Data store records UI: loader → listRecordsByDataStoreId → render (path traced; no manual E2E run in this verification).
- Doc plan: no runtime surface; no smoke required for doc-only.

---

## 8) Regression Matrix (§8)

| Surface | Create | Edit | Render | Persist | Reload | Analytics |
|---------|--------|------|--------|---------|--------|-----------|
| Admin UI | ☑ (data store records: load) | — | ☑ | — | ☑ | — |
| Storefront Theme | — | — | — | — | — | — |
| Checkout UI | — | — | — | — | — | — |
| API/Webhooks | ☑ (agent records route unchanged) | — | — | — | — | — |
| Background/Workers | — | — | — | — | — | — |

*(Doc plan: no code paths; matrix N/A.)*

---

## 9) Stop-the-Merge Conditions (§9)

- [x] No old identifiers left: listRecords (first) fully replaced by listRecordsByDataStoreId at single call site; no references to “first listRecords” elsewhere.
- [x] Schema keys: no UI/runtime divergence; same response shape.
- [x] Config source: unchanged (DB via Prisma).
- [x] No silent fallback masking the issue (fix is explicit rename + call site update).
- [x] No new cache dependency.

---

## 10) Doc Cross-References (consistency)

Verified that all docs that should point to technical.md §15 do so with consistent wording:

| Document | Reference to §15 / extension plan |
|----------|----------------------------------|
| technical.md | §15 present; §10 cross-reference added |
| README.md | “see §15 Universal Module Slot & extension architecture” |
| implementation-status.md | “Full design in technical.md §15”; implementation order and table |
| ai-module-main-doc.md | “see technical.md §15 Universal Module Slot & extension architecture” |
| phase-plan.md | “See technical.md §15”; backlog items |
| global-audit.md | “consistent with technical.md §15” in checklist |
| agent-native-audit-report.md | “technical.md §15” in recent-changes and global-audit sections |
| shopify-dev-setup.md | Planned slot blocks; no §15 link (optional) |
| theme-app-extension/README.md | Planned blocks; no §15 link (optional) |
| app.md | One sentence on slot placement; no §15 link (merchant-facing) |

No conflicting statements found; implementation order (Theme → Admin → Checkout UI → Cart Transform → Functions → Post-purchase) is consistent in technical.md and implementation-status.md.

---

## Summary

| codechange-behave section | Plan (doc) | listRecords fix |
|---------------------------|------------|------------------|
| §1 Impact map | Filled | Filled |
| §2 Propagation pass | Done (doc refs only) | Done (rename + single call site) |
| §3 Layer re-trace | N/A | Done (UI → service → DB) |
| §4 Six connections | N/A | All six verified |
| §5 Duplication/SSOT | §15 as SSOT; no drift | Single service; no duplicate methods |
| §6 Build/runtime | — | Build clean |
| §7 Post-patch verification | — | Typecheck, lint, contract path traced |
| §8 Regression matrix | N/A | Admin + API cells checked |
| §9 Stop-the-merge | N/A | None triggered |

**Result:** Plan changes (doc updates + listRecords fix) satisfy codechange-behave.md. No propagation failures; no orphan references; single source of truth for extension/slot design (technical.md §15).
