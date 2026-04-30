# Backend services and modules

## Core domain services

- `RecipeService`: recipe parsing/validation
- `Compiler`: recipe to deploy operations
- `PublishService`: Shopify-side apply/publish logic
- `ModuleService`: module lifecycle, versions, rollback
- `CapabilityService`: plan/capability checks
- `PreviewService`: deterministic storefront preview rendering

## AI services

- provider routing and client abstraction
- structured output enforcement via JSON schema
- retries, timeout, request hashing, and usage accounting
- intent classification and low-confidence fallbacks

## Connector services

- `ConnectorService`: CRUD and secure outbound execution
- `MappingService`: AI-assisted mapping for connector payloads
- SSRF controls: HTTPS + allowlist + private-range blocking

## Flow and workflow services

- `FlowRunnerService`: trigger-driven step execution
- workflow engine services for graph-based DAG workflows
- built-in connector adapters (shopify/http/slack/email/storage)

## Data and billing services

- `DataStoreService`: store and record CRUD
- `BillingService`: plan lifecycle
- `QuotaService`: monthly quota checks before consuming actions
- `PlanConfigService`: internal plan config overrides

## Observability and security services

- correlation/request ID propagation
- API/error/activity/AI usage logging
- encryption helpers for secrets
- redaction for sensitive fields

## Extension-facing compiler modules

Compiler modules map recipe types to deployment logic for:

- theme and proxy surfaces
- checkout and customer account surfaces
- Shopify Functions
- admin extension blocks/actions
- automation and integration modules

## Canonical references

- Architecture reference: `docs/technical.md`
- Recipe and capability source: `docs/ai-module-main-doc.md`
- Runtime delivery status: `docs/implementation-status.md`
