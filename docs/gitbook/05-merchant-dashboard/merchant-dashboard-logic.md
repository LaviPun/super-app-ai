# Merchant dashboard

**Full merchant-facing guide:** [`app.md`](../../app.md) (features, billing, flows, data stores, Style Builder).

This page is a **compact route map** for navigation inside GitBook.

---

## Primary merchant journey

1. generate module from AI or template
2. inspect/edit draft spec and settings
3. preview module behavior
4. publish to selected surface/theme
5. monitor usage, logs, and rollback if needed

## Main merchant sections

- Home
- Modules (`/modules`, `/modules/:moduleId`)
- Connectors (`/connectors`, `/connectors/:connectorId`)
- Flows (`/flows`, `/flows/build/:flowId`)
- Data models (`/data`, `/data/:storeKey`)
- Billing (`/billing`)
- Settings (`/settings`)
- Advanced features (`/advanced`)

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
