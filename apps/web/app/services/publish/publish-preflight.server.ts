import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec } from '@superapp/core';
import {
  FUNCTION_RUNTIME_HANDLES,
  getExtensionEligibility,
  isRuntimeShipped,
  MESSAGING_CHANNELS_SHIPPED,
  messagingChannelSendability,
  checkoutBlockPublishNotes,
  DECLARATIVE_PRICING_MECHANISMS,
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
 * Return the first DECLARATIVE-ONLY pricing mechanism a spec is pinned to, if any.
 * The pricing pack can ride at the root (`config.pricing`) or per-bundle
 * (`config.bundles[].pricing`, cartTransform); a declarative mechanism in EITHER
 * place would publish and enforce nothing (plan 1c). Returns undefined when every
 * pricing block uses a real Shopify-Function mechanism (or carries no pricing).
 */
function declarativePricingMechanism(config: unknown): string | undefined {
  if (!config || typeof config !== 'object') return undefined;
  const c = config as {
    pricing?: { mechanism?: unknown };
    bundles?: Array<{ pricing?: { mechanism?: unknown } } | null>;
  };
  const candidates: unknown[] = [
    c.pricing?.mechanism,
    ...(Array.isArray(c.bundles) ? c.bundles.map((b) => b?.pricing?.mechanism) : []),
  ];
  for (const mechanism of candidates) {
    if (
      typeof mechanism === 'string' &&
      (DECLARATIVE_PRICING_MECHANISMS as readonly string[]).includes(mechanism)
    ) {
      return mechanism;
    }
  }
  return undefined;
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

  // Per-channel gate (build #7b): messaging.campaign is a DEPLOYABLE type, but a
  // campaign can only publish if its PRIMARY channel can actually send. `email`/`slack`
  // always can; `sms`/`push` have shipped connectors but need the MERCHANT's provider
  // credentials (SMS SID/token/from; VAPID keys) — absent those the channel is honestly
  // `needs_runtime` (never a fake send). Only fires when the spec carries a channel (the
  // type-level audit passes bare `{ type }`).
  if (type === 'messaging.campaign') {
    const channel = (spec.config as { channel?: string } | undefined)?.channel;
    if (channel) {
      if (!(MESSAGING_CHANNELS_SHIPPED as readonly string[]).includes(channel)) {
        return ModulePublishPreflightResultSchema.parse({
          moduleType: type,
          status: 'needs_runtime',
          reasons: [
            `Messaging channel '${channel}' has no shipped connector.`,
          ],
          willDeploy: false,
        });
      }
      const sendability = messagingChannelSendability(channel as never, process.env);
      if (sendability.status !== 'ready') {
        return ModulePublishPreflightResultSchema.parse({
          moduleType: type,
          status: 'needs_runtime',
          reasons: [
            `Messaging channel '${channel}' has a shipped connector but is not configured — ` +
              `missing ${sendability.missing.join(', ')}. Add the provider credentials (SMS SID/token/from; ` +
              `VAPID keys) to send; until then this campaign is blocked at publish (needs_runtime), not faked.`,
          ],
          willDeploy: false,
        });
      }
    }
  }

  // Pricing-mechanism honesty (plan 1c): a spec pinned to a DECLARATIVE-ONLY pricing
  // mechanism (`discount-code` / `draft-order`) has no shipped runtime — the compiler
  // lowers only the two `shopify-function-*` mechanisms — so publishing it would flip
  // the module to PUBLISHED while changing nothing at checkout. Classify it honestly as
  // `needs_runtime` (never a fake-published discount). Only fires when the spec actually
  // carries a pricing block; bare type-level audits pass `{ type }` and are unaffected.
  const declarativeMechanism = declarativePricingMechanism(spec.config);
  if (declarativeMechanism) {
    return ModulePublishPreflightResultSchema.parse({
      moduleType: type,
      status: 'needs_runtime',
      reasons: [
        `Pricing mechanism '${declarativeMechanism}' is declarative-only — no shipped runtime enforces it, ` +
          `so publishing would change nothing at checkout. Use a Shopify Function mechanism ` +
          `('shopify-function-discount' or 'shopify-function-cart-transform') to deploy this discount.`,
      ],
      willDeploy: false,
    });
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
