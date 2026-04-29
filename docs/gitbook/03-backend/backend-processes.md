# Backend Processes

## Process 1: AI generate module

1. classify prompt and resolve likely module intent
2. select provider (store override or global active)
3. request structured output from provider
4. validate against `RecipeSpecSchema`
5. create draft module/version
6. record AI usage, API/activity logs

## Process 2: Template-based module creation

1. merchant picks template ID
2. template lookup from curated template catalog
3. enforce quota
4. create draft module/version
5. log activity

## Process 3: Preview and publish

1. draft spec compiled to deploy operations
2. pre-publish validation checks constraints and capability gates
3. publish service applies operations to Shopify surfaces
4. module version transitions to published
5. activity and API logs recorded

## Process 4: Rollback

1. merchant/admin selects target version
2. service validates module ownership/state
3. publish transition points active module to selected version
4. state and logs updated

## Process 5: Connector lifecycle

1. connector create/update stores metadata and encrypted auth config
2. endpoint testing validates integration behavior
3. saved endpoints support repeat API tests
4. flow steps can call connectors during runtime

## Process 6: Flow execution

1. trigger source (manual/webhook/schedule/system event)
2. resolve matching published flow modules/workflows
3. execute each step with retry/backoff policy
4. persist step logs and job status
5. surface failures in jobs/logs for replay

## Process 7: Data-store writes

- user/API writes records via data-store APIs
- flows write via `WRITE_TO_STORE` step
- agent API writes using data-store intents
- records are scoped to shop and paginated on read
