import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * integration.httpSync (build #7a) — persists the sync config as a real shop
 * metafield so the type is DEPLOYABLE, not false-published (the R0.1 "deployable ⇒
 * compiler emits a non-AUDIT op" invariant, machine-checked by
 * module-deployability-audit.test.ts).
 *
 * What the module declares (schema: packages/core/src/recipe.ts):
 *  - `trigger`        a Shopify webhook topic the merchant reacts to (or MANUAL/SCHEDULED)
 *  - `connectorId`    the merchant's own connected service (a Connector row carrying
 *                     the destination baseUrl + auth the merchant supplied)
 *  - `endpointPath`   the path on that service the mapped payload is POSTed to
 *  - `payloadMapping` a {targetKey: "{{dot.path}}"} field map applied to the event
 *
 * Runtime note: HttpSyncRunnerService reads the module's active version `specJson`
 * (exactly like FlowRunnerService / MessagingRunnerService) to dispatch, so it does
 * NOT strictly need this metafield to run. We still emit a real op because publishing
 * a deployable type must WRITE something — and the metafield is a genuine, inspectable
 * deploy artifact (the sync config a merchant/ops can read back), never a fake.
 *
 * The two directions of the sync are runtime, not compile-time:
 *   - Store → connected service: HttpSyncRunnerService fires on the subscribed webhook
 *     (webhooks.tsx), maps fields, and dispatches to the connector with an HMAC
 *     signature header + retry/backoff/DLQ.
 *   - Connected service → store: /api/integration/httpsync/inbound records what the
 *     merchant's tool sends back into the module's typed data store (an optional
 *     `spec.dataModel`, provisioned at publish via provisionModuleDataStore).
 */
// Namespace satisfies the non-destructive guard's `superapp.` prefix invariant
// (services/recipes/compiler/non-destructive.ts rule 4) — the last-line enforcement
// that every SHOP_METAFIELD_SET stays inside a SuperApp-owned namespace.
const HTTP_SYNC_METAFIELD_NAMESPACE = 'superapp.integration';

/** kebab-ify a module name for the per-sync metafield key. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sync'
  );
}

export function compileIntegrationHttpSync(
  spec: Extract<RecipeSpec, { type: 'integration.httpSync' }>,
): CompileResult {
  const key = `sync_${slug(spec.name)}`.slice(0, 64);
  const value = JSON.stringify({ name: spec.name, config: spec.config });

  return {
    ops: [
      {
        kind: 'SHOP_METAFIELD_SET',
        namespace: HTTP_SYNC_METAFIELD_NAMESPACE,
        key,
        type: 'json',
        value,
      },
      {
        kind: 'AUDIT',
        action: 'compile.integration.httpSync',
        details: JSON.stringify({ trigger: spec.config.trigger, connectorId: spec.config.connectorId }),
      },
    ],
    compiledJson: value,
  };
}
