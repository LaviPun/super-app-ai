import type { CompileResult } from './types';
import type { RecipeSpec } from '@superapp/core';

/**
 * messaging.campaign (R3.4) — persists the campaign config as a real shop metafield
 * so the type is DEPLOYABLE, not false-published (the R0.1 "deployable ⇒ compiler
 * emits a non-AUDIT op" invariant).
 *
 * Runtime note: MessagingRunnerService reads the module's active version `specJson`
 * (exactly like FlowRunnerService) to fan out, so it does NOT strictly need this
 * metafield to run. We still emit a real op because publishing a deployable type
 * must write something — and the metafield is a genuine, inspectable deploy
 * artifact (the campaign config a merchant/ops can read back), never a fake.
 *
 * No storefront render: messaging is a server-side fan-out effect (email/slack via
 * the shipped connectors). SMS/push are accepted by the schema but blocked at
 * publish preflight (needs_runtime) — see publish-preflight + MESSAGING_CHANNELS_SHIPPED.
 */
const MESSAGING_METAFIELD_NAMESPACE = '$app:superapp_messaging';

/** kebab-ify a module name for the per-campaign metafield key. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'campaign'
  );
}

export function compileMessagingCampaign(
  spec: Extract<RecipeSpec, { type: 'messaging.campaign' }>,
): CompileResult {
  const key = `campaign_${slug(spec.name)}`.slice(0, 64);
  const value = JSON.stringify({ name: spec.name, config: spec.config });

  return {
    ops: [
      {
        kind: 'SHOP_METAFIELD_SET',
        namespace: MESSAGING_METAFIELD_NAMESPACE,
        key,
        type: 'json',
        value,
      },
      { kind: 'AUDIT', action: 'compile.messaging.campaign', details: JSON.stringify({ channel: spec.config.channel }) },
    ],
    compiledJson: value,
  };
}
