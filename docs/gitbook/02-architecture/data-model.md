# Data Model

## Multi-tenant model

All merchant data is scoped by shop. Core entities:

- `Shop`
- `Module`, `ModuleVersion`
- `Connector`, `ConnectorEndpoint`
- `DataStore`, `DataStoreRecord`
- `Job`, `FlowStepLog`
- `AiProvider`, `AiUsage`, `AiModelPrice`
- `ApiLog`, `ErrorLog`, `ActivityLog`
- `WorkflowDef`, `WorkflowRun`, `WorkflowRunStep`
- `AppSettings`, `PlanTierConfig`, `RetentionPolicy`

## Module and versioning model

- `Module` is the logical container (type, category, status)
- `ModuleVersion` stores immutable recipe snapshots
- publish marks a version as active
- rollback points active state to older version

## Data stores

Data stores are app-owned per-shop stores for structured JSON payload records.

- predefined stores: `product`, `inventory`, `order`, `analytics`, `marketing`, `customer`
- custom stores: merchant-defined keys (sanitized, unique per shop)
- records can be written manually, via flows, or via agent API

## Workflow persistence

- definitions are versioned (`WorkflowDef`)
- runs and step-level execution logs are persisted (`WorkflowRun`, `WorkflowRunStep`, `FlowStepLog`)
- failed jobs are retained as DLQ records for debugging/replay

## Logging and observability tables

- `ApiLog`: request path/status/duration/requestId
- `ErrorLog`: structured error events with redaction
- `ActivityLog`: actor action trace for major operations
- `AiUsage`: tokens and modeled cost tracking
