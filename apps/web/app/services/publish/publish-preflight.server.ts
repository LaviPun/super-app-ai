import type { AdminApiContext } from '~/types/shopify';
import type { RecipeSpec } from '@superapp/core';
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

/** Types whose compiler only emits AUDIT today — gated, "not publishable yet". */
export const AUDIT_ONLY_TYPES = new Set<string>([
  'checkout.block',
  'postPurchase.offer',
  'pos.extension',
  'analytics.pixel',
  'integration.httpSync',
  'flow.automation',
  'platform.extensionBlueprint',
]);

/** Function types with real compiler wiring → the wasm extension handle they need. */
export const FUNCTION_EXTENSION_HANDLES: Record<string, string> = {
  'functions.discountRules': 'discount-function',
  'functions.deliveryCustomization': 'delivery-customization-function',
  'functions.paymentCustomization': 'payment-customization-function',
  'functions.cartAndCheckoutValidation': 'cart-checkout-validation-function',
  'functions.cartTransform': 'cart-transform-function',
  'functions.fulfillmentConstraints': 'fulfillment-constraints-function',
  'functions.orderRoutingLocationRule': 'order-routing-location-rule-function',
};

export interface ModulePublishabilityContext {
  /** Extension handles known to be deployed via `shopify app deploy` (layer a). */
  deployedExtensions?: Iterable<string>;
}

/**
 * Classify a module for publish so nothing silently no-ops. The caller must
 * refuse to report "published" unless `willDeploy === true`.
 *  - `deployable` — real compiler/publish wiring exists; proceed.
 *  - `gated`      — explicitly "not publishable yet" (AUDIT-only); publishes nothing.
 *  - `blocked`    — function type whose wasm extension is not deployed → fail loudly.
 *
 * Mirrors the compiler dispatch in `services/recipes/compiler/index.ts`.
 */
export function classifyModulePublishability(
  spec: RecipeSpec,
  ctx: ModulePublishabilityContext = {},
): ModulePublishPreflightResult {
  const type = spec.type;
  const deployed = new Set(ctx.deployedExtensions ?? []);

  if (AUDIT_ONLY_TYPES.has(type)) {
    return ModulePublishPreflightResultSchema.parse({
      moduleType: type,
      status: 'gated',
      reasons: [`${type} has no publish wiring yet — gated as "not publishable yet" (publishes nothing).`],
      willDeploy: false,
    });
  }

  const requiresExtension = FUNCTION_EXTENSION_HANDLES[type];
  if (requiresExtension) {
    if (!deployed.has(requiresExtension)) {
      return ModulePublishPreflightResultSchema.parse({
        moduleType: type,
        status: 'blocked',
        reasons: [
          `No deployed extension "${requiresExtension}" behind ${type}. Ship it via \`shopify app deploy\` before publishing (two-layer Functions contract).`,
        ],
        requiresExtension,
        willDeploy: false,
      });
    }
    return ModulePublishPreflightResultSchema.parse({
      moduleType: type,
      status: 'deployable',
      reasons: [],
      requiresExtension,
      willDeploy: true,
    });
  }

  // theme.section, proxy.widget, checkout.upsell, customerAccount.blocks,
  // admin.block, admin.action → real wiring.
  return ModulePublishPreflightResultSchema.parse({
    moduleType: type,
    status: 'deployable',
    reasons: [],
    willDeploy: true,
  });
}
