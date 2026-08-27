# Listing image checklist — Super App AI

Format: PNG, 1600×900 (16:9), one distinct feature/state per image (4.4.5 —
Shopify enforces uniqueness since 2026-03-26; do not submit two screenshots
of the same screen with only cosmetic differences). 4-7 total. Order matters:
image 1-3 appear in the App Store search/preview card.

Every route below is re-verified to exist on master @ 8a656af (2026-08-27,
post WS-C/F/G/H merge) — all six paths still resolve unchanged. Re-check each
path still resolves immediately before capturing, in case a later change
renames or restructures a page.

| # | Screen | State to capture | Why this one |
|---|---|---|---|
| 1 | `/generate` (`apps/web/app/routes/generate._index.tsx`) | Mid-generation with 2-3 draft options visible, real (non-lorem) prompt text | Primary "what does this app do" shot — leads the listing |
| 2 | Module detail page, `/modules/:moduleId` (`apps/web/app/routes/modules.$moduleId.tsx`) | Preview panel + Publish/Rollback controls visible, real module name | Shows the core publish/rollback loop |
| 3 | Storefront rendering a published module | Actual theme storefront, not the admin — proves the module is real, not mocked | Requirement: "showcase the customer-facing output" is standard review-team guidance for this pattern |
| 4 | Discount/Function module config | A discount rules or bundle module's settings, form-driven via `apps/web/app/components/SchemaForm.tsx` | Shows Function-backed modules, not just UI widgets |
| 5 | `/billing` (`apps/web/app/routes/billing._index.tsx`) | Current plan display (Free/Starter/Growth/Pro tier visible) | Shows honest, working billing UI |
| 6 | Flow Builder canvas, `/flows/build/:flowId` (`apps/web/app/routes/flows.build.$flowId.tsx`) | A configured automation (trigger → action) | Shows the automation surface, distinct from module generation |
| 7 (optional) | Connectors / API Tester, `/connectors/:connectorId` (`apps/web/app/routes/connectors.$connectorId.tsx`) | A configured connector's saved-endpoint list | Only include if it renders cleanly with real (non-empty) data |

Note on image 3: capturing this requires a first-time theme app embed to
already be enabled on the capture store (module detail shows an
`embed=not_added` nudge otherwise — `apps/web/app/services/publish/embed-status.server.ts`).
Enable the embed via the theme editor deep link before capturing, not after.

## App icon
1200×1200, PNG or JPEG, square with rounded corners handled by Shopify's
frame (don't pre-round the corners), no Shopify trademarks (4.4.3), bold
simple pattern — legible at the small size the App Store list renders it.

## Feature media
Either a 2-3 minute screencast (can reuse Task 5's walkthrough,
`docs/launch/review-notes.md`, as the script — refreshed 2026-08-27: the
publish ceremony/confirm-dialog/"view on storefront" link (WS-F) and the
AI-disclosure fix (WS-F, D4) are both merged and live on master now, so the
screencast can show the real UI end-to-end; the one remaining conditional is
whether the deployed service has `JOB_EXECUTION_MODE=queue` set — see that
doc's step 2) or one additional 1600×900 static image. If a video: show install → generate →
publish → storefront result end-to-end — this doubles as material for the
demo screencast requirement (4.5.3) if it's long/detailed enough; confirm
with the Partner Dashboard's current guidance on whether the feature-media
video satisfies 4.5.3 or whether a separate, more detailed screencast is
required (this has changed across Shopify's policy revisions — check at
submission time, don't assume).

## Data hygiene before capturing (4.3.3/4.3.6/4.3.7, general realism)
- No lorem ipsum, no "Test Test" customer names, no visible internal debug
  panels, no console errors open in devtools.
- No fabricated stats/counters baked into any screenshot.
- No customer reviews or testimonial text anywhere in an image.
- No pricing numbers rendered inside a non-pricing screenshot (4.2.2) —
  crop the billing screenshot to the plan name/quota, not a $ figure if that
  reads as "advertising a price outside the pricing section."

## Capture (owner-run)

Using the dev store from the `docs/runbooks/publish-live-probe.md` runbook
(already populated with real modules from that probe — reuse its state
rather than re-seeding), capture all 4-7 images per the checklist above at
1600×900 against the live Railway-hosted app. Save as
`docs/launch/assets/screenshot-N-<slug>.png` locally (this repo, or wherever
the owner keeps release assets — the Partner Dashboard is the actual
destination, this repo is just staging). Capture the app icon and feature
media/video separately. Evidence to keep: the exported PNG files themselves,
and a note of which build/commit was live when they were taken (screenshots
go stale as fast as any other artifact).
