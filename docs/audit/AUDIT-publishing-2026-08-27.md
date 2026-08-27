# publishing.md Audit — 2026-08-27

Scope: `docs/publishing.md` (WS-J Task 6 — audit against house style; WS-E owns
the content itself) verified against the live repo (`ai-shopify-superapp`) at
`master@c201150` (branch `docs/ws-j-rewrite`, worktree HEAD at time of writing
`620dd54`). WS-D and WS-E are both merged to master, so `docs/publishing.md`
already existed on this branch (created by WS-E) rather than needing to be
written fresh from the "if WS-E has not merged" fallback path in the task
brief.

Source-of-truth checklist used (from the task brief): `apps/web/app/services/publish/publish.service.ts`,
`activation.service.ts`, `unpublish.service.ts`, `rollback.service.ts`,
`packages/core/src/extension-eligibility.ts`.

## ✅ Verified correct (no action needed)

1. **No-counts-in-prose compliance.** `grep -nE '[0-9]+ (publishes|surfaces|activations)' docs/publishing.md` returns empty. The one bare-looking numeric ("20 pages, 20" in §2) cites the named constants `MAX_DISCOUNT_LOOKUP_PAGES` / `MAX_DELIVERY_LOOKUP_PAGES` / `MAX_PAYMENT_LOOKUP_PAGES` / `MAX_VALIDATION_LOOKUP_PAGES`, all confirmed `= 20` in `activation.service.ts:56,63,69,79`, and the validation page-size claim ("25/page") matches `validations(first: 25, ...)` at `activation.service.ts:241`. Named-constant citations are the documented exemption from the no-bare-counts rule (per Task 5's audit precedent) — no change needed.
2. **No "progressive publish" / "canary" language presented as live.** The only occurrence is in the doc's own "Historical note", explicitly stating there is no such mechanism in the publish path — this is the correct, honest framing the verify grep expects (present but as an explicit negation, not a live-feature claim).
3. **Rollback = republish, honestly described.** `RollbackService.rollbackToVersion()` (`rollback.service.ts:19-40`) matches the doc's §4 description exactly: recompiles the target version's spec, resolves target theme from either the target version or the module's current active version (throws if neither recorded one), and only flips the DB pointer after a successful `PublishService.publish()` call. The class's own header comment confirms the doc's framing ("rollback previously flipped `activeVersionId` and touched nothing in Shopify... Real rollback = recompile the TARGET version's spec and run the normal publish pipeline").
4. **Partial-failure ledger.** `PublishService`'s in-memory ledger, `PublishPartialFailureError` fields (`failedOp`/`completed`/`cause`), and the "republish is safe" recovery contract are described accurately and match the class's actual behavior — spot-checked against the file structure (ledger reset at the top of `publish()`, `step()` helper).
5. **`ACTIVATION_WIRED_FUNCTION_TYPES` gate symbol name is current.** Confirmed at `packages/core/src/extension-eligibility.ts:634-641` — exactly the six function types the doc lists (`discountRules`, `deliveryCustomization`, `paymentCustomization`, `cartAndCheckoutValidation`, `fulfillmentConstraints`, `cartTransform`), with `shippingDiscount`/`orderRoutingLocationRule` correctly described as gated `needs_runtime` (wasm deployed, no activation kind yet) — the file's own adjacent comment confirms this framing.
6. **Doc's outline coverage matches the task brief's required list** (mirrors WS-E's own Task 16 outline): what publish writes per surface (§1), function activation objects (§2), unpublish/delete semantics (§3), rollback semantics (§4), partial-failure handling (§5), embed-activation onboarding (§6), and the deployability gate (§2's "gate seam" subsection). All six required topics are present.

## 🔧 Fixed in this pass

1. **No cross-links to `docs/generation.md` or the operational docs — everything was self-contained prose with zero outbound links.** The doc never pointed to `docs/generation.md` for how `RecipeSpec` compiles into the payloads it describes, nor to `docs/operations.md` / `docs/runbooks/publish-failure.md` for incident response — both explicitly required by the task brief ("cross-links... instead of duplicating either"). Added a "Related docs" block under the source-of-truth file list (linking `docs/generation.md`, `docs/operations.md`'s runbook index, `docs/runbooks/publish-failure.md`, and `docs/runbooks/publish-live-probe.md`), an inline link from the `compileRecipe` mention in §1 to `docs/generation.md`, and an inline pointer from §5 (partial failure) to `docs/runbooks/publish-failure.md` for the operator-facing triage procedure, making explicit that §5 covers only what the code does, not the incident-response steps.
2. **The `docs/operations.md` link target did not exist yet at the time this link was added** (Task 8, later in this same batch, creates it from `docs/release-operations.md`). Confirmed by end of this session's Task 8 commit that the file exists at the linked path — noting here since Task 6 was executed before Task 8 in this batch's ordering.

## Follow-ups (open)

None — this was a scoped house-style audit per the task brief (no-counts compliance, honesty on partial-failure/rollback, cross-links), not a ground-up content rewrite. WS-E owns the doc's factual content; a future dated audit should re-verify §1's metaobject/handle table and §2's activation-kind table against `publish.service.ts` if either changes.

## Drift-ledger rows closed by this pass

None — no new claim-vs-reality gap was found; this pass was a house-style/cross-link audit, not a factual-correction pass.
