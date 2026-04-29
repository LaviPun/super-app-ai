# Agent API and Core Routes

## API layers

- Merchant/UI APIs (`/api/*`)
- Agent APIs (`/api/agent/*`)
- Webhooks (`/webhooks/*`)
- Internal admin APIs/routes (`/internal/*`)

## Agent API design goals

- JSON-only contracts
- full parity with merchant actions where possible
- discovery endpoint for machine-readable capability map
- explicit separation of read-only validation/generation versus mutating actions

## High-value agent surfaces

- module lifecycle: create, update spec, publish, rollback, delete, modify flows
- connectors: CRUD and test
- data stores: store and record management
- schedules and flows: list/run/control
- AI primitives: classify, generate options, validate spec

## Logging and traceability

- mutating calls write activity log entries
- API logs carry request IDs for correlation
- usage and errors are captured in dedicated observability tables

## Core non-agent routes

- publish, rollback, preview, module detail routes
- connector management and endpoint routes
- data-store and flow runtime routes
- cron route for scheduled triggers

## Webhook and action callbacks

- Shopify webhooks validate authenticity and deduplicate events
- Flow action callbacks verify HMAC and route to correct executors
