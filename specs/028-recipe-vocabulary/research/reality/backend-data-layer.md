# Reality Audit — Backend Data Layer

Subsystem: `DataStore` / `DataStoreRecord` service + `data.$storeKey` route; `DataStore.schemaJson` write-time validation; `DataCapture`; CSV / PDF / print export routes.

## Re-audit delta (2026-07-03, HEAD 4f056da)

Branch `feat/027-unified-builder`, HEAD `4f056da` (prior audit was `feat/superapp-redesign` @ `a948f1c`).
Every prior finding was re-verified by reading the code at current HEAD.

| # | PRIOR finding | Status | Current evidence |
|---|---------------|--------|------------------|
| 1 | `ensureTypedStore` is the only `DataStore.schemaJson` writer and has **zero non-test callers** → `schemaJson` never set → typed validation is a permanent no-op | **STILL-OPEN** | `ensureTypedStore` at `apps/web/app/services/data/data-store.service.ts:109-143` (the only writer; upsert sets `schemaJson` at lines 136/140). Repo-wide grep for `ensureTypedStore` returns exactly two files: the definition and `apps/web/app/__tests__/data-store-provisioning.test.ts:24,53,67`. No route, service, publish, blueprint, or release path calls it. The validation gate in `createRecord` (`data-store.service.ts:188-192`) runs only `if (model)` where `model = parseDataModel(store?.schemaJson ?? null)`; since `schemaJson` is never populated on the live path, `model` is always `null` and validation is skipped. |
| 2 | CRUD + record grid + CSV export + browser print-to-PDF + DataCapture ingestion + captures admin view are ALL live (docs understate it) | **STILL-OPEN (confirmed live; docs still understate)** | CRUD action `apps/web/app/routes/api.data-stores.tsx:7`; record grid loader `data.$storeKey.tsx:26-33` (typed form via `dataModelToForm`, line 37); CSV export `data.$storeKey_.export.tsx:11` emitting `text/csv` + `Content-Disposition: attachment` (lines 46-47); print-to-PDF `data.$storeKey_.print.tsx:11` → `recordsToPrintHtml` (line 26, browser "Save as PDF"); DataCapture ingestion action `api.module-captures.tsx:12,37` → `ModuleCaptureService.capture` (`module-capture.service.ts:59`); captures admin view loader `modules.$moduleId_.captures.tsx:14`. All still wired. |
| 3 | `SuperAppConnector` class exists but is never registered | **STILL-OPEN** | Class defined at `apps/web/app/services/workflows/connectors/superapp.connector.ts:28`. Registry `connectors/index.ts:8-14` registers only `shopify`, `http`, `slack`, `email`, `storage`. No `registerConnector('superapp', …)` and no `new SuperAppConnector()` anywhere outside its own file (grep-confirmed). The `storage` connector (`storage.connector.ts:16`) is the one actually wired for flow data-store I/O. |

**Conflict resolution (stale memory claim).** MEMORY / extension-eligibility notes claim "additive data-model provisioning for single+complex modules" and that `provisionFromModuleSpec` runs at publish for single modules + blueprint members. **This is FALSE at HEAD 4f056da.** `provisionFromModuleSpec` does not exist anywhere in the repo (zero grep hits). The blueprint, publish, and release services (`apps/web/app/services/blueprints`, `.../publish`, `.../releases`) contain **no** reference to `DataStoreService`, `ensureTypedStore`, or typed-store provisioning (grep-confirmed empty). The only dynamic "provisioning" is untyped store creation at record-write time (see N1), which never sets `schemaJson`.

**NEW findings this pass:**

- **N1 — Two runtime paths auto-create stores, but always UNTYPED.** `ModuleCaptureService.capture` auto-creates a store via `createCustomStore` when `storeKey` is supplied (`module-capture.service.ts:127-134`), and the flow-runner `WRITE_TO_STORE` step + `StorageConnector` auto-enable/create via `enableStore` (`flow-runner.service.ts:368-371`; `storage.connector.ts` manifest says "Auto-provisions the store if it doesn't exist", line 31). None pass `schemaJson`, so stores get a null schema — reinforcing that typed validation can never fire on the live path.
- **N2 — This subsystem is untouched by the 027 unified-builder changes.** Commits since `a948f1c` (`50c67ac`, `f459b49`, `ba30bea`, `84417b1`, etc.) touched builder/preview/eligibility surfaces; the git-tracked backend-data files (`data-store.service.ts`, `module-capture.service.ts`, `superapp.connector.ts`, `connectors/index.ts`) are unchanged relative to the prior audit. No regression, no fix.

Net: **0 fixed / 3 still-open** (plus 2 new corroborating findings).

---

## Current-state body

### Claim: Module publish provisions typed data stores from the module spec (`provisionFromModuleSpec` / additive data-model provisioning)
- **reality:** `provisionFromModuleSpec` does not exist in the repo. No publish/blueprint/release path calls any DataStore provisioning. The only schema-setting function is `ensureTypedStore` (`data-store.service.ts:109`), called only by tests.
- **wired:** absent
- **verdict:** required
- **action:** Either wire `ensureTypedStore(shopId, key, { label, description, schemaJson })` into the publish path (single module + each blueprint member, using the module's declared data model), or delete the typed-store machinery and the docs/memory that claim it runs. Until then, correct the memory line asserting publish-time provisioning.

### Claim: `DataStore.schemaJson` typed validation protects record writes
- **reality:** `createRecord` gates validation on `parseDataModel(store.schemaJson)` (`data-store.service.ts:188-192`), but `schemaJson` is never written on any live path, so `model` is always null and validation is a permanent no-op.
- **wired:** built-not-wired (validation logic exists; its precondition — a populated `schemaJson` — is never met)
- **verdict:** required
- **action:** Populate `schemaJson` at provisioning time (see above). The additive-merge logic (`mergeSchemaAdditively`, lines 34-47) and `ensureTypedStore` are ready; they just have no caller.

### Claim: Merchant + admin data-store UX (CRUD, grid, CSV, print/PDF, captures) is live
- **reality:** Fully live. CRUD `api.data-stores.tsx:7`; grid `data.$storeKey.tsx:26`; CSV `data.$storeKey_.export.tsx:11` (text/csv download); print/PDF `data.$storeKey_.print.tsx:11`; capture ingestion `api.module-captures.tsx:12` → `ModuleCaptureService`; captures admin view `modules.$moduleId_.captures.tsx:14`; internal admin store list/detail `internal.data-stores._index.tsx` / `internal.data-stores.$key.tsx` (`$key.tsx:52-56` only READS `schemaJson` for display).
- **wired:** live
- **verdict:** already-executed
- **action:** Update docs — they understate this surface. No code change needed.

### Claim: `SuperAppConnector` links flows to module data-store I/O
- **reality:** Class complete (`superapp.connector.ts:28-127`) but never registered. Registry (`connectors/index.ts:8-14`) has shopify/http/slack/email/storage only. The `StorageConnector` (`storage.connector.ts:16`) is the live data-store connector for flows.
- **wired:** built-not-wired
- **verdict:** required if flows are meant to address module stores by `module_<id>` key; otherwise not-required and it should be deleted
- **action:** Either `registerConnector('superapp', new SuperAppConnector())` in `connectors/index.ts`, or remove the class + its docs. It shares record-write semantics with `StorageConnector`, so confirm it isn't redundant before wiring.

### Claim: Runtime auto-provisioning of stores exists
- **reality:** Yes, but only UNTYPED. `ModuleCaptureService.capture` (`module-capture.service.ts:127-134`) and flow `WRITE_TO_STORE` / `StorageConnector` create/enable stores on demand with no `schemaJson`.
- **wired:** live
- **verdict:** partial (creates stores but never typed → does not satisfy the "typed provisioning" claim)
- **action:** If typed validation is desired, route these through `ensureTypedStore` with the module's declared schema rather than `createCustomStore`/`enableStore`.

---

**Bottom line:** The data layer's CRUD/grid/CSV/print/capture surface is fully live and under-documented, but typed-store provisioning is still vaporware at HEAD 4f056da — `ensureTypedStore` remains the sole `schemaJson` writer with zero non-test callers, `provisionFromModuleSpec` does not exist, no publish/blueprint path provisions anything, and `SuperAppConnector` is still unregistered; the stale memory claiming publish-time typed provisioning is false.
