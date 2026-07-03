import { z } from 'zod';

/** CSP applied to sandboxed preview HTML responses (no scripts, no external JS). */
export const PREVIEW_SANDBOX_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none';";

/** Iframe sandbox attribute for the Next.js preview shell. */
export const PREVIEW_IFRAME_SANDBOX = '';

export const PreviewPolicyMetadataSchema = z.object({
  csp: z.string().min(1),
  sandbox: z.string(),
  liquidAllowed: z.literal(false),
  scriptsAllowed: z.literal(false),
});

export const PreviewEnvelopeSchema = z.object({
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  version: z.string().min(1),
  recipeSpecRef: z.string().min(1).optional(),
  renderConfig: z.record(z.unknown()).optional(),
  themeContext: z.record(z.unknown()).optional(),
  allowedAssets: z.array(z.string()).default([]),
  policy: PreviewPolicyMetadataSchema,
  storageKey: z.string().min(1),
  contentType: z.enum(['text/html', 'application/json']),
  assetId: z.string().min(1),
});

export const PreviewQuerySchema = z.object({
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1).optional(),
  assetId: z.string().min(1).default('preview_module_1'),
});

export type PreviewPolicyMetadata = z.infer<typeof PreviewPolicyMetadataSchema>;
export type PreviewEnvelope = z.infer<typeof PreviewEnvelopeSchema>;
export type PreviewQuery = z.infer<typeof PreviewQuerySchema>;

export function defaultPreviewPolicy(): PreviewPolicyMetadata {
  return {
    csp: PREVIEW_SANDBOX_CSP,
    sandbox: PREVIEW_IFRAME_SANDBOX,
    liquidAllowed: false,
    scriptsAllowed: false,
  };
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function buildAssetStorageKey(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  folder: 'images' | 'previews';
  assetId: string;
  extension: string;
}): string {
  const revisionSegment = input.revisionId ? `/revisions/${safePathSegment(input.revisionId)}` : '';
  return [
    'shops',
    safePathSegment(input.shopId),
    'modules',
    safePathSegment(input.moduleId),
    `${revisionSegment}/${input.folder}/${safePathSegment(input.assetId)}.${input.extension}`.replace(/^\//, ''),
  ].join('/');
}

export function buildPreviewStorageKey(input: {
  shopId: string;
  moduleId: string;
  revisionId?: string;
  assetId: string;
  contentType: 'text/html' | 'application/json';
}): string {
  const extension = input.contentType === 'text/html' ? 'html' : 'json';
  return buildAssetStorageKey({
    ...input,
    folder: 'previews',
    extension,
  });
}

export function assertPreviewContentIsRecipeSafe(body: string): void {
  if (/<script[\s>]/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /javascript:/i.test(body)) {
    throw new Error(
      'Preview artifacts must be RecipeSpec/config-safe and cannot include scripts or inline event handlers.',
    );
  }
}

// ── WS4 / 025: full working live preview for every surface ───────────────────

/**
 * Every RECIPE_SPEC_TYPES entry must map to an interactive preview renderer —
 * none may fall to the generic diagram. This package is `@superapp/core`-free,
 * so the list is mirrored here; `apps/web` asserts `RECIPE_SPEC_TYPES ⊆
 * PREVIEW_KINDS` in a test so the two cannot drift.
 */
export const PREVIEW_KINDS = [
  'theme.section',
  'proxy.widget',
  'functions.discountRules',
  'functions.deliveryCustomization',
  'functions.paymentCustomization',
  'functions.cartAndCheckoutValidation',
  'functions.cartTransform',
  'functions.fulfillmentConstraints',
  'functions.orderRoutingLocationRule',
  'functions.shippingDiscount',
  'functions.localPickupDeliveryOption',
  'functions.pickupPointDeliveryOption',
  'checkout.upsell',
  'checkout.block',
  'postPurchase.offer',
  'admin.block',
  'admin.action',
  'admin.discountUi',
  'pos.extension',
  'analytics.pixel',
  'integration.httpSync',
  'flow.automation',
  'messaging.campaign',
  'agentic.catalogProfile',
  'platform.extensionBlueprint',
  'customerAccount.blocks',
] as const;
export const PreviewKindSchema = z.enum(PREVIEW_KINDS);
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

/** One line item in a simulation fixture. */
export const PreviewLineItemSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  /** Unit price in major currency units (e.g. dollars). */
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().default(1),
  tags: z.array(z.string()).default([]),
});
export type PreviewLineItem = z.infer<typeof PreviewLineItemSchema>;

/**
 * Deterministic fixture fed through a compiled Function rule config to produce a
 * concrete preview outcome ("Cart $120, VIP → 15% off"; "method 'Economy' hidden").
 */
export const PreviewSimulationInputSchema = z.object({
  currency: z.string().min(3).max(3).default('USD'),
  countryCode: z.string().min(2).max(2).default('US'),
  customerTags: z.array(z.string()).default([]),
  lineItems: z.array(PreviewLineItemSchema).default([]),
  /** Available shipping/payment method names, for delivery/payment customizations. */
  methods: z.array(z.string()).default([]),
  /** Whether the simulated store is Shopify Plus (drives non-Plus fallback). */
  isPlus: z.boolean().default(true),
});
export type PreviewSimulationInput = z.infer<typeof PreviewSimulationInputSchema>;

export const PREVIEW_SIMULATION_EFFECTS = [
  'applied',
  'hidden',
  'renamed',
  'reordered',
  'blocked',
  'bundled',
  'constrained',
  'routed',
  'none',
] as const;
export const PreviewSimulationEffectSchema = z.enum(PREVIEW_SIMULATION_EFFECTS);

export const PreviewSimulationOutcomeSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
  effect: PreviewSimulationEffectSchema,
});
export type PreviewSimulationOutcome = z.infer<typeof PreviewSimulationOutcomeSchema>;

export const PreviewSimulationResultSchema = z.object({
  kind: PreviewKindSchema,
  outcomes: z.array(PreviewSimulationOutcomeSchema).default([]),
  /** Present when the simulated store is non-Plus and a fallback applies. */
  fallbackNote: z.string().optional(),
});
export type PreviewSimulationResult = z.infer<typeof PreviewSimulationResultSchema>;

/** Default fixture used when a caller doesn't supply one. */
export function defaultSimulationInput(): PreviewSimulationInput {
  return PreviewSimulationInputSchema.parse({
    currency: 'USD',
    countryCode: 'US',
    customerTags: ['VIP'],
    lineItems: [
      { sku: 'BACKPACK-1', title: 'Travel Backpack', price: 120, quantity: 1, tags: ['bags'] },
      { sku: 'CUBE-SET', title: 'Packing Cube Set', price: 32, quantity: 1, tags: [] },
    ],
    methods: ['Standard', 'Economy', 'Express'],
    isPlus: true,
  });
}
