# Internal admin dashboard

**Full guide:** [`internal-admin.md`](../../internal-admin.md) (auth, ports, routes, jobs, providers).

Below is a **logic summary** aligned with that doc.

---

## Purpose

The internal admin dashboard is for the app owner team. It controls global platform behavior, provider/billing governance, and operational visibility across all shops.

## Access and security

- route namespace: `/internal/*`
- password-protected via `INTERNAL_ADMIN_PASSWORD`
- optional OIDC SSO flow (`/internal/sso/start`, `/internal/sso/callback`)
- session-based authentication and logout route

## Core admin sections

- Dashboard (`/internal`)
- AI Providers (`/internal/ai-providers`)
- Usage (`/internal/usage`)
- Error Logs (`/internal/logs`)
- API Logs (`/internal/api-logs`)
- Stores (`/internal/stores`)
- Plan Tiers (`/internal/plan-tiers`)
- Categories (`/internal/categories`)
- Recipe Edit (`/internal/recipe-edit`)
- Templates (`/internal/templates`)
- Activity (`/internal/activity`, `/internal/activity/:id`)
- Jobs (`/internal/jobs`)
- Settings (`/internal/settings`)

## Dashboard logic

- aggregates key metrics (stores, AI calls/cost, providers)
- links to deep operational pages
- surfaces short-window health snapshots (errors, jobs, activity)

## Configuration logic

- AI provider configs and model pricing
- per-store overrides for provider and retention controls
- plan-tier definitions and internal plan override controls
- category and template overrides through app settings

## Operational logic

- jobs page acts as queue/DLQ visibility surface
- API logs provide request-level traces with request IDs
- activity log captures broad admin/system/merchant actions with details
- error logs provide redacted diagnostics

## Governance logic

- recipe edit validates recipes before save
- plan/category updates validate input shapes
- store plan change is constrained to allowed tiers
- advanced settings consolidated under `/internal/settings`
