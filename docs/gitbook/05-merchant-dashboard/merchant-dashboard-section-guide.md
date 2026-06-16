---
description: Navigation map for merchant-facing behavior in the embedded Shopify app.
---

# Merchant dashboard section guide

This section is the navigation map for merchant-facing behavior.

{% hint style="info" %}
The merchant app was rebuilt 1:1 from the Claude Design handoff (2026-06-16). Nav is now **Dashboard · Build · Insights · Settings · Billing** (App Bridge) with in-app sub-tabs under Build/Insights. See [DESIGN.md](../../../DESIGN.md) § *Implemented Design System*.
{% endhint %}

## Read order

{% stepper %}
{% step %}
### Route map & feature logic

{% content-ref url="merchant-dashboard-logic.md" %}
[merchant-dashboard-logic.md](merchant-dashboard-logic.md)
{% endcontent-ref %}
{% endstep %}

{% step %}
### Full merchant documentation

{% content-ref url="../../app.md" %}
[app.md](../../app.md)
{% endcontent-ref %}
{% endstep %}

{% step %}
### Advanced settings model

{% content-ref url="../../module-settings-modernization.md" %}
[module-settings-modernization.md](../../module-settings-modernization.md)
{% endcontent-ref %}
{% endstep %}
{% endstepper %}

## Focus points

* Draft-to-publish merchant journey
* Connectors, flows, and data-store interactions
* Where user-facing validations and limits appear

## Canonical references

* Merchant product guide: [`app.md`](../../app.md)
* Settings model details: [`module-settings-modernization.md`](../../module-settings-modernization.md)
* Delivery updates: [`implementation-status.md`](../../implementation-status.md)
