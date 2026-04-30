# Flows and logic

## Flow types

- `flow.automation` modules (merchant-facing automation)
- graph-based workflows (advanced DAG execution)
- Shopify Flow integrations (trigger and action extensions)

## Trigger model

Supported trigger sources include:

- manual runs
- Shopify webhooks (order/product/customer/etc.)
- scheduled cron runs
- SuperApp system events (module published, connector synced, data record created, workflow completed/failed)

## Step logic

Common step kinds:

- `HTTP_REQUEST`
- `SEND_HTTP_REQUEST`
- `TAG_CUSTOMER`
- `TAG_ORDER`
- `ADD_ORDER_NOTE`
- `WRITE_TO_STORE`
- `SEND_EMAIL_NOTIFICATION`
- `SEND_SLACK_MESSAGE`
- `CONDITION`

## Execution behavior

- flow matching by trigger and shop
- ordered step execution with retry policy
- per-step log persistence
- job lifecycle states (`QUEUED`, `RUNNING`, `SUCCESS`, `FAILED`)
- failed runs retained for inspection and replay

## Graph workflow logic (v2)

- node/edge graph validation
- expression evaluation for conditions
- transform nodes for context mutation
- action nodes delegated to connector SDK
- optional Shopify Flow delegation mode

## Shopify Flow connector behavior

- SuperApp emits custom Flow triggers
- Shopify Flow calls SuperApp actions via runtime endpoint
- runtime verifies HMAC and routes action handles to executors

## Data flow examples

- webhook event -> flow run -> connector call -> store write -> step/job logs
- module publish event -> Flow trigger emit -> Shopify Flow action callback -> execution route

## Canonical references

- Full workflow architecture: `docs/technical.md`
- Incident handling: `docs/runbooks/index.md`
- Delivery progression: `docs/implementation-status.md`
