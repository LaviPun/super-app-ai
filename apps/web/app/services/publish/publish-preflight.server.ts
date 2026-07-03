import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec } from '@superapp/core';
import {
  FUNCTION_RUNTIME_HANDLES,
  getExtensionEligibility,
  isRuntimeShipped,
  MESSAGING_CHANNELS_SHIPPED,
  checkoutBlockPublishNotes,
} from '@superapp/core';
import {
  ModulePublishPreflightResultSchema,
  type ModulePublishPreflightResult,
} from '@superapp/platform-contracts';

const ACCESS_SCOPES_QUERY = `#graphql
  query CurrentAppScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

export type PublishPreflightResult = {
  ok: boolean;
  missingScopes: string[];
  grantedScopes: string[];
  requiredScopes: string[];
  error?: string;
};

export async function runPublishPreflight(
  admin: AdminApiContext['admin'],
  input: { isThemeModule: boolean },
): Promise<PublishPreflightResult> {
  const requiredScopes = [
    'write_metaobjects',
    ...(input.isThemeModule ? ['read_themes'] : []),
  ];

  try {
    const response = await admin.graphql(ACCESS_SCOPES_QUERY);
    const json = (await response.json()) as {
      errors?: Array<{ message?: string }>;
      data?: { currentAppInstallation?: { accessScopes?: Array<{ handle?: string }> } };
    };
    const graphqlError = json?.errors?.[0]?.message as string | undefined;
    if (graphqlError) {
      return {
        ok: false,
        missingScopes: [],
        grantedScopes: [],
        requiredScopes,
        error: `Unable to verify granted scopes: ${graphqlError}`,
      };
    }

    const grantedScopes: string[] = (json?.data?.currentAppInstallation?.accessScopes ?? [])
      .map((row: { handle?: string }) => row.handle)
      .filter((v: unknown): v is string => typeof v === 'string');

    const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    return {
      ok: missingScopes.length === 0,
      missingScopes,
      grantedScopes,
      requiredScopes,
    };
  } catch (err) {
    return {
      ok: false,
      missingScopes: [],
      grantedScopes: [],
      requiredScopes,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── WS5 / 026: module publishability classification ──────────────────────────

/**
 * Function type → wasm extension handle, straight from the eligibility registry
 * (the single source of truth; handles match extensions/[*]/shopify.extension.toml).
 * Re-exported for compatibility with existing consumers/tests.
 */
export const FUNCTION_EXTENSION_HANDLES: Record<string, string> = FUNCTION_RUNTIME_HANDLES;

export interface ModulePublishabilityContext {
  /** Extension handles known to be deployed via `shopify app deploy` (layer a). */
  deployedExtensions?: Iterable<string>;
}

/**
 * Classify a module for publish so nothing silently no-ops. The caller must
 * refuse to report "published" unless `willDeploy === true`.
 *
 * Delegates to the extension-eligibility registry in @superapp/core — the single
 * source of truth for how every module type deploys (see extension-eligibility.ts):
 *  - `deployable`    — the backing runtime is shipped (for functions: its wasm
 *                      handle is in the deployed manifest); publish writes the
 *                      config that runtime reads. Plan/scope requirements surface
 *                      as merchant-facing notes in `reasons`, never a block.
 *  - `needs_runtime` — the runtime extension is not shipped yet → fail loudly.
 *
 * Consistency with the registry is pinned by __tests__/module-deployability-audit.test.ts.
 */
export function classifyModulePublishability(
  spec: RecipeSpec,
  ctx: ModulePublishabilityContext = {},
): ModulePublishPreflightResult {
  const type = spec.type;
  const eligibility = getExtensionEligibility(type);
  const shipped = isRuntimeShipped(type, { deployedFunctionHandles: ctx.deployedExtensions ?? [] });

  // R3.4 per-channel gate: messaging.campaign is a DEPLOYABLE type (email/slack ship),
  // but a campaign whose PRIMARY channel is sms/push has no shipped connector — block
  // PUBLISH honestly (needs_runtime), scoped to the channel, never faking a send. Only
  // fires when the spec carries a channel (the type-level audit passes bare `{ type }`).
  if (type === 'messaging.campaign') {
    const channel = (spec.config as { channel?: string } | undefined)?.channel;
    if (channel && !(MESSAGING_CHANNELS_SHIPPED as readonly string[]).includes(channel)) {
      return ModulePublishPreflightResultSchema.parse({
        moduleType: type,
        status: 'needs_runtime',
        reasons: [
          `Messaging channel '${channel}' has no shipped connector yet — email and Slack send today; ${channel} needs its connector shipped before this campaign can publish.`,
        ],
        willDeploy: false,
      });
    }
  }

  if (!shipped) {
    const detail =
      eligibility.runtime === 'function' && eligibility.functionHandle
        ? `No deployed extension "${eligibility.functionHandle}" behind ${type}. Ship it via \`shopify app deploy\` before publishing (two-layer Functions contract).`
        : `${type} needs its ${eligibility.runtime} runtime shipped before it can publish. ${eligibility.note}`;
    return ModulePublishPreflightResultSchema.parse({
      moduleType: type,
      status: 'needs_runtime',
      reasons: [detail],
      ...(eligibility.functionHandle ? { requiresExtension: eligibility.functionHandle } : {}),
      willDeploy: false,
    });
  }

  // Plan requirements are notes, not blocks (e.g. "runs on Shopify Plus").
  const reasons: string[] = eligibility.requiresPlan ? [eligibility.note] : [];
  // checkout.block: surface protected-customer-data + buyer-input write notes (build #2).
  // `spec.config` may be absent in bare type-level audits — guard before reading it.
  if (type === 'checkout.block' && spec.config) {
    reasons.push(...checkoutBlockPublishNotes(spec.config as Parameters<typeof checkoutBlockPublishNotes>[0]));
  }

  return ModulePublishPreflightResultSchema.parse({
    moduleType: type,
    status: 'deployable',
    reasons,
    ...(eligibility.functionHandle ? { requiresExtension: eligibility.functionHandle } : {}),
    willDeploy: true,
  });
}
