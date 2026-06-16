---
description: >-
  The documentation home for the AI Shopify SuperApp — a Shopify embedded app
  that turns plain-language intent into safe, validated modules, flows, and
  integrations.
---

# AI Shopify SuperApp — documentation

Welcome. This tree is optimized for **GitBook** (left nav from `SUMMARY.md`) and for **repo** readers — canonical deep docs live in `docs/*.md` and are linked from here, so there is never a second copy of a long specification.

{% hint style="info" %}
**New here?** Follow the three steps below. Each one is a 5-minute read that builds on the last.
{% endhint %}

## Start here

{% stepper %}
{% step %}
### Understand the product

What SuperApp is, who it's for, and the prompt → preview → publish loop.

[Documentation map](00-welcome/documentation-map.md) · [Platform overview](01-overview/platform-overview.md)
{% endstep %}

{% step %}
### See what's shipped

The live delivery log — what's done, what's stabilizing, and the latest changes (incl. the 2026-06-16 SuperApp redesign).

[Progress till now](10-progress/progress-till-now.md) · [Implementation status](../implementation-status.md)
{% endstep %}

{% step %}
### Go deep on your area

Pick the surface you work on (below) and follow its section guide into the canonical docs.
{% endstep %}
{% endstepper %}

## Jump to your surface

{% tabs %}
{% tab title="Merchants" %}
The embedded Shopify app: generate modules with AI, preview, publish, build flows, manage data and billing.

{% content-ref url="05-merchant-dashboard/merchant-dashboard-section-guide.md" %}
[merchant-dashboard-section-guide.md](05-merchant-dashboard/merchant-dashboard-section-guide.md)
{% endcontent-ref %}

Full merchant guide: [`app.md`](../app.md)
{% endtab %}

{% tab title="App owner / internal" %}
The internal admin control plane: stores, jobs, providers, plans, logs, traces, and the internal AI assistant.

{% content-ref url="06-internal-admin/internal-admin-section-guide.md" %}
[internal-admin-section-guide.md](06-internal-admin/internal-admin-section-guide.md)
{% endcontent-ref %}

Full internal admin guide: [`internal-admin.md`](../internal-admin.md)
{% endtab %}

{% tab title="Build / integrate" %}
RecipeSpec, the compiler, the catalog, and the agent/HTTP API surface.

{% content-ref url="../ai-module-main-doc.md" %}
[ai-module-main-doc.md](../ai-module-main-doc.md)
{% endcontent-ref %}

Technical reference: [`technical.md`](../technical.md)
{% endtab %}

{% tab title="Operate / on-call" %}
SLOs, runbooks, observability, and incident response.

{% content-ref url="../runbooks/index.md" %}
[index.md](../runbooks/index.md)
{% endcontent-ref %}

SLOs: [`slos.md`](../slos.md)
{% endtab %}
{% endtabs %}

{% hint style="success" %}
**Design system:** the Internal Admin and Merchant Dashboard are a 1:1 build of the approved Claude Design handoff. Tokens, shells, and nav are documented in [`DESIGN.md`](../../DESIGN.md) § *Implemented Design System* and [`uiux-guideline.md`](../uiux-guideline.md).
{% endhint %}

## How this book is organized

| # | Part | What lives here |
|---|------|-----------------|
| 1 | **Welcome** | Map, reading order, progress snapshot |
| 2 | **Product & guides** | Merchant and app-owner experiences (source files in `docs/`) |
| 3 | **Architecture** | High-level system + data; links to the full technical doc |
| 4 | **Backend & platform** | Processes, services, modules, flows |
| 5 | **Dashboards** | Merchant UI vs internal admin behavior (internal AI hub: `06-internal-admin/internal-ai-assistant.md`) |
| 6 | **API & agents** | Route surfaces and patterns |
| 7 | **Reference library** | Specs, catalog, data models, providers |
| 8 | **Operations** | Security, observability, runbooks, debug, dev setup, UI guidelines |
| 9 | **Planning** | Status and roadmap (canonical files, linked) |

Short **synthesis** pages live under `gitbook/*/…`. **Authoritative detail** stays in the linked files so we never fork two versions of the same truth.

## GitBook sync (repo)

{% hint style="warning" %}
If you use **GitBook Git Sync**, point the space at this folder (`docs/gitbook`) *or* at `docs/` and set the summary file to `gitbook/SUMMARY.md` per GitBook's import settings. Parent paths like `../technical.md` resolve to other files in the same repository.
{% endhint %}

GitBook's default theme is clean and typography-driven. This book leans on **clear part titles, short pages, hints, tabs, and steppers** so the outline reads like a product manual, not a wall of audits.
