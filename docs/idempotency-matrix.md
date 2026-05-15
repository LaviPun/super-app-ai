# Idempotency Scope Matrix

## Goal

Ensure retries and duplicate deliveries do not create duplicate side effects across event, release, step, and connector-call boundaries.

| Scope | Idempotency Key | Storage Boundary | Duplicate Behaviour | Owner |
| --- | --- | --- | --- | --- |
| Webhook Event | `x-shopify-webhook-id` | `WebhookEvent` table | Skip duplicate event processing | Flows |
| Release Publish Attempt | `publish:<shop>:<module>:<version>:<target>` | `RELEASE_TRANSITION` audit entries + module active version | Mark as `IDEMPOTENT` when already active | Publish |
| Release Stage Step | `<release_id>:<stage>` | Job payload + stage decision | Keep latest stage result, do not re-run succeeded stage | Releases |
| Connector HTTP Call | `<workflow_run_id>:<step_id>:<attempt>` | Connector execution logs | Retry with backoff, maintain same semantic action | Connectors |
| Rollback Trigger | `<release_id>:rollback` | Activity log + module version pointer | Multiple rollback requests converge to same target version | Publish |

## Notes

- Release idempotency is enforced at module/version activation boundary.
- Event idempotency uses unique DB constraints for at-least-once delivery safety.
- Progressive publish stages should be treated as monotonic state transitions.
- Connector retries are idempotent at orchestration level; external endpoints must still be validated for idempotent semantics.

