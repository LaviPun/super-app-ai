---
description: The app-owner control plane — stores, jobs, providers, plans, logs, traces, AI.
---

# Internal admin section guide

This section explains the app-owner control plane.

{% hint style="warning" %}
The internal admin is **not** merchant-facing. It is protected by `INTERNAL_ADMIN_PASSWORD` (+ optional OIDC SSO) and renders through the vendored `AdminChrome` shell (2026-06-16 redesign). See [`internal-admin.md`](../../internal-admin.md) and [DESIGN.md](../../../DESIGN.md) § *Implemented Design System*.
{% endhint %}

## Navigation at a glance

The left rail is grouped into five collapsible sections, with a top-bar **⌘K** command palette:

{% tabs %}
{% tab title="Overview" %}
Dashboard — store count, error count, AI calls (24h), job success rate.
{% endtab %}

{% tab title="Operations" %}
Stores · Jobs (DLQ) · Activity Log · API Logs · Error Logs · Webhooks · Audit Log.
{% endtab %}

{% tab title="Platform" %}
Modules · Flows · Connectors · Data Stores · Customers.
{% endtab %}

{% tab title="AI & Models" %}
AI Providers · AI Assistant · Local AI Setting · Usage & Costs · Release Gate.
{% endtab %}

{% tab title="Catalog" %}
Plan Tiers · Categories · Templates · Recipe Edit.
{% endtab %}
{% endtabs %}

## Read order

{% stepper %}
{% step %}
### Behavior map

{% content-ref url="internal-admin-dashboard-logic.md" %}
[internal-admin-dashboard-logic.md](internal-admin-dashboard-logic.md)
{% endcontent-ref %}
{% endstep %}

{% step %}
### Internal AI assistant

Routes, probes, release gate, retention.

{% content-ref url="internal-ai-assistant.md" %}
[internal-ai-assistant.md](internal-ai-assistant.md)
{% endcontent-ref %}
{% endstep %}

{% step %}
### Full internal admin guide

Security, routes, operations.

{% content-ref url="../../internal-admin.md" %}
[internal-admin.md](../../internal-admin.md)
{% endcontent-ref %}
{% endstep %}
{% endstepper %}

## Focus points

* Provider, plan, and store governance
* Operational visibility (activity / API / errors / jobs / traces)
* Authentication and internal control boundaries

## Canonical references

* Internal admin full guide: [`internal-admin.md`](../../internal-admin.md)
* Operations controls: [`runbooks/index.md`](../../runbooks/index.md)
* Delivery status: [`implementation-status.md`](../../implementation-status.md)
