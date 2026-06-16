---
description: Route map and feature logic for the embedded merchant Shopify app.
---

# Merchant dashboard

{% hint style="info" %}
This page is a **compact route map**. The full merchant-facing guide — features, billing, flows, data stores, Style Builder — is [`app.md`](../../app.md).
{% endhint %}

## Primary merchant journey

{% stepper %}
{% step %}
### Generate

Describe a module in plain language (AI) **or** start from a template.
{% endstep %}

{% step %}
### Inspect & edit

Review the draft RecipeSpec, tune settings, and use the Style Builder for storefront UI.
{% endstep %}

{% step %}
### Preview

See the module behave in an embedded preview before anything ships.
{% endstep %}

{% step %}
### Publish

Publish to the selected surface / theme.
{% endstep %}

{% step %}
### Monitor & roll back

Watch usage and logs; roll back to a prior version if needed.
{% endstep %}
{% endstepper %}

## Main merchant sections

Top-level nav is **Shopify App Bridge** (`<s-app-nav>` in `root.tsx`), rendered *outside* the embedded app: **Dashboard · Build · Insights · Settings · Billing**. Inside the app, `MerchantShell` renders `MerchantSubnav` (in-app sub-tabs) under Build and Insights.

{% hint style="success" %}
The five top-level items mirror the Claude Design handoff exactly. See [DESIGN.md](../../../DESIGN.md) § *Implemented Design System*.
{% endhint %}

{% tabs %}
{% tab title="Dashboard" %}
`/` — home: quota, module counts, attributed-revenue sparkline, quick actions, recent modules + activity.
{% endtab %}

{% tab title="Build" %}
Top item `/modules`; in-app sub-tabs:

* **Modules** — `/modules`, `/modules/:moduleId` (incl. AI builder at `/generate`)
* **Flows** — `/flows`, `/flows/build/:flowId`
* **Connectors** — `/connectors`, `/connectors/:connectorId`
* **Data models** — `/data`, `/data/:storeKey`
* **Templates** — `/templates`, `/templates/:templateId`
{% endtab %}

{% tab title="Insights" %}
Top item `/analytics`; in-app sub-tabs:

* **Analytics** — `/analytics`
* **Activity** — `/activity`
{% endtab %}

{% tab title="Billing & Settings" %}
* **Billing** — `/billing` (history at `/billing/history`)
* **Settings** — `/settings`
* **Help & guides** — `/help`
{% endtab %}
{% endtabs %}

{% hint style="info" %}
The legacy **Advanced features** hub (`/advanced`) is still reachable but no longer on the primary rail — its links (Connectors, Flows) now live under **Build**.
{% endhint %}

## Module page logic

- shows current draft/published state
- supports config edits and style builder for storefront UI modules
- allows AI modify and confirm flows
- supports preview, publish, and rollback actions

## Connector page logic

- connector CRUD and secure auth storage
- API tester for request simulation
- saved endpoints for repeatable testing
- usable by flow steps and integration modules

## Flows page logic

- visual builder for chain-like automations
- trigger and step management
- schedule integration for cron-driven execution
- run and status monitoring via jobs/logs

## Data models logic

- predefined stores can be enabled/disabled
- custom stores can be created per merchant
- records can be added/viewed/deleted
- data updates can come from manual entry, flows, and agent API

## Polling and consistency behavior

Merchant list pages are designed to revalidate periodically and on focus so external writes (like agent actions) appear without manual hard refresh.

## Canonical references

- Merchant guide: `docs/app.md`
- Settings and config model: `docs/module-settings-modernization.md`
- Current delivery status: `docs/implementation-status.md`
