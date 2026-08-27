# Runbook: Scope re-consent rollout (19-scope list)

**Type:** One-time owner-run release + verification sequence (not an incident runbook)
**Owner:** requires access to `shopify app deploy`/`shopify app config validate` for this app, plus an existing pre-deploy install on a dev store to exercise the re-consent path.

**STATUS: Not yet executed.** The deploy step (and the CLI validate step) are blocked by an
upstream Shopify CLI bug ([cli#8386](https://github.com/Shopify/cli/issues/8386)) that fails
schema validation on `[events]` for `shopify.app.production.toml`-style configs. Nothing below
has been run against a live app or dev store. Run this procedure when the CLI bug is fixed
upstream, or via the Partner Dashboard config-release contingency noted in Step 3.

---

## Why this exists

`shopify.app.production.toml` documents the audit-restored 19-scope list (`[access_scopes]`,
`scopes = "read_checkouts,…,write_products"`, `shopify.app.production.toml:120`). Existing
installs are still running on the old shrunk 8-scope grant from the regression documented in
the audit comment at `shopify.app.production.toml:109-119`. Until those installs re-consent,
bundle publishes / function-config writes on those shops keep failing silently
(`ACCESS_DENIED` on cartTransformCreate, discount/payment/delivery-customization function
writes, etc.).

Rollout mechanics (managed installation, no reinstall, no OAuth URL work required): deploying
the TOML makes Shopify prompt existing merchants to approve the added scopes the next time they
open the app. `app/scopes_update` fires on approval — already subscribed
(`shopify.app.production.toml:79`) and logged by the handler at `webhooks.tsx:203-219`. No
scopes are being removed in this list, so there's no silent-drop concern this round.
`optional_scopes = ["write_themes"]` (`shopify.app.production.toml:128`) prompts nobody until
the app calls `shopify.scopes.request(['write_themes'])` at runtime — it must NOT appear in the
re-consent grant screen.

**Precondition:** the conformance-fix tasks that this scope restoration accompanies are merged,
and their install verification is green, before this deploy ships.

---

## Step 1 — Pre-deploy validation

```bash
shopify app config validate --config production   # TOML valid
pnpm --dir apps/web test                          # suite green
git status                                        # clean tree on the release commit
```

**Known blocker:** `shopify app config validate` currently fails with a `[events]: Required`
schema error — this is the upstream CLI bug (cli#8386), not a problem with this repo's TOML.
`shopify app deploy` (Step 3) hits the same schema gate and is blocked the same way. Do not
attempt to work around this by editing the TOML to satisfy the buggy schema; wait for the CLI
fix, or use the Partner Dashboard contingency in Step 3.

The `pnpm --dir apps/web test` and `git status` legs of this step are not blocked and should be
run and recorded normally before proceeding.

---

## Step 2 — Record the currently-granted scopes on the dev store (baseline)

Requires the live embedded app running on a dev store (App Bridge loaded).

In the embedded app's DevTools console:

```js
await shopify.scopes.query()
```

Save the `granted` list. Expected: the old 8-scope set on a pre-existing install (the
regression scopes listed in the `shopify.app.production.toml:109-112` audit comment should be
absent).

---

## Step 3 — Deploy

```bash
shopify app deploy --config production
```

Confirm the release includes the config change — the CLI prints a config diff; verify the
scopes line it shows matches `shopify.app.production.toml`'s `scopes = "..."` line verbatim.

**Contingency if `shopify app deploy` is still blocked by cli#8386 at the time this runs:**
release the config change via the Partner Dashboard's config-release UI instead of the CLI
(Partner Dashboard → app → Configuration → release the current `shopify.app.production.toml`
version manually). Confirm the dashboard's rendered scopes list matches the 19 scopes in
`shopify.app.production.toml:120` before releasing.

---

## Step 4 — Verify the re-consent prompt path

Requires the live embedded app on the dev store used in Step 2.

1. Open the app on the dev store (existing install). Expected: Shopify interposes the
   "additional permissions" grant screen before the app loads.
2. Approve. Expected: app loads; `shopify.scopes.query()` now lists all 19 scopes as granted
   (compare against `shopify.app.production.toml:120`, and against the final merged list — see
   the forward-note below before treating 19 as final).
3. Verify the `app/scopes_update` webhook landed: internal admin → Activity log shows an
   `APP_SCOPES_UPDATE` entry with the new `appScopes` array (handler `webhooks.tsx:203-219`,
   which writes an `ActivityLog` row with `actor: 'WEBHOOK'`, `action: 'APP_SCOPES_UPDATE'`).
4. Functional probe of the restored scopes via GraphiQL on the dev store:
   - `query { cartTransforms(first: 1) { nodes { id } } }` — confirm no `ACCESS_DENIED`.
   - A `productCreate`/`productUpdate` (or a metaobject write) — confirm no `ACCESS_DENIED`.
   - The real cart-transform end-to-end proof (function config write + storefront checkout
     effect) is covered separately by WS-E Task 17 Step 6, not by this probe.
5. **Negative check:** confirm `write_themes` was NOT prompted during the Step 4.1 grant screen
   — it's `optional_scopes`, not `scopes`. `shopify.scopes.query()` should show it as
   optional/not granted after the flow completes.

---

## Scope-count forward note (cross-workstream — read before treating 19 as final)

WS-E Tasks 6-7 add **two more scopes** — `write_validations` and
`write_fulfillment_constraint_rules` — for function activation, on WS-E's own branch. Once WS-E
merges, the re-consent list becomes **21 scopes, not 19**. This runbook (and the Step 4.2
comparison above) must be re-checked against the final merged `shopify.app.production.toml`
scopes line at execution time — do not run this rollout against a stale 19-scope expectation if
WS-E has already merged. WS-D does not own those two additions and this runbook does not modify
the scopes line to add them; WS-E's branch does, and the two workstreams reconcile at merge.

---

## Step 5 — Document the rollout state (after a real deploy + verification)

Once Steps 1-4 have actually been executed against a live app and dev store, append one dated
line to the audit comment block in `shopify.app.production.toml`
(`shopify.app.production.toml:106-119`) recording what was verified, e.g.:

```
# 2026-XX-XX: 19-scope list deployed; re-consent verified on dev store (see WS-D Task 9).
```

Only write a line like this once the verification actually happened — do not pre-date or
pre-write a "verified" claim. Commit:

```bash
git add shopify.app.production.toml
git commit -m "chore(scopes): mark 19-scope re-consent rollout deployed + verified"
```

For production merchants: post-submission there are none yet (this ships pre-launch), so no
further action is needed there — every future install gets the full scope list at install time
regardless of this rollout.

---

## Owner-run vs blocked-upstream — quick reference

| Step | What it is | Blocker / where |
|---|---|---|
| 1a. `shopify app config validate` | CLI command | **Blocked upstream (cli#8386)** |
| 1b. `pnpm --dir apps/web test` | Local command | Not blocked — run directly |
| 1c. `git status` | Local command | Not blocked — run directly |
| 2. Baseline `shopify.scopes.query()` | Owner action | Live embedded app on dev store |
| 3. `shopify app deploy` | CLI command | **Blocked upstream (cli#8386)** — use Partner Dashboard config-release contingency |
| 4. Re-consent prompt + webhook + functional probes | Owner action | Live embedded app + dev store + GraphiQL |
| 5. Dated annotation + commit | Code artifact | This repo, only after Steps 1-4 actually ran |

---

Cross-reference: [`docs/runbooks/app-pricing-setup.md`](./app-pricing-setup.md) for the style
this runbook follows (status header, owner-run vs code-side table, explicit "don't fabricate
success" discipline).
