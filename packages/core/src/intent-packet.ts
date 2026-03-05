/**
 * IntentPacket — strict schema for the contract between local classification and heavy AI.
 * Source: docs/ai-module-main-doc.md Section 15.5, 15.13.
 * The heavy AI receives only this shape (+ optional images/context) and outputs OutputSchema only.
 */

import { z } from 'zod';

// ─── Clean Intent List (doc 15.11) — canonical intent IDs for classification & routing ───
export const CLEAN_INTENTS = [
  // Storefront promo
  'promo.popup',
  'promo.banner',
  'promo.slideout',
  'promo.inline_block',
  'promo.countdown',
  'promo.free_shipping_bar',
  'promo.discount_reveal',
  // Upsell & conversion
  'upsell.product_reco',
  'upsell.cart_upsell',
  'upsell.bundle_builder',
  'upsell.cross_sell_addon',
  'upsell.post_purchase',
  // Trust & info
  'trust.badges',
  'trust.reviews_snippet',
  'info.faq_accordion',
  'info.size_guide',
  'info.shipping_returns',
  // Engagement
  'engage.newsletter_capture',
  'engage.exit_intent',
  'engage.quiz',
  'engage.survey',
  'engage.social_proof',
  // Merchandising
  'merch.collection_grid',
  'merch.product_grid',
  'merch.before_after',
  'merch.video_block',
  // Utility
  'utility.announcement',
  'utility.localization_prompt',
  'utility.age_gate',
  'utility.effect',
  'utility.floating_widget',
  // Admin
  'admin.dashboard_card',
  'admin.campaign_builder',
  'admin.analytics_report',
  'admin.settings_editor',
  'admin.workflow_builder',
  // Flow
  'flow.create_workflow',
  'flow.edit_workflow',
  'flow.debug_workflow',
  'flow.import_template',
  // Support
  'support.troubleshoot',
  'support.how_to',
  'support.generate_copy_only',
  'support.generate_assets',
] as const;

export type CleanIntentId = (typeof CLEAN_INTENTS)[number];

export const SURFACES = [
  'storefront_theme',
  'admin',
  'checkout',
  'accounts',
  'pos',
  'flow',
  'pixel',
] as const;

export type Surface = (typeof SURFACES)[number];

export const MODULE_ARCHETYPES = [
  'modal',
  'inline_block',
  'banner',
  'drawer',
  'embed',
  'admin_card',
  'pos_tile',
  'popup',
  'notification_bar',
] as const;

export type ModuleArchetype = (typeof MODULE_ARCHETYPES)[number];

export const INTENT_MODES = ['create', 'update', 'troubleshoot', 'explain', 'optimize'] as const;
export type IntentMode = (typeof INTENT_MODES)[number];

const OfferTypeSchema = z.enum([
  'percent_discount',
  'fixed_discount',
  'free_shipping',
  'bogo',
  'gift',
  'none',
]);
const AudienceSegmentSchema = z.enum([
  'all',
  'new_visitors',
  'returning_visitors',
  'logged_in',
  'not_logged_in',
]);
const PlacementPagesSchema = z.enum([
  'all',
  'home',
  'product',
  'collection',
  'cart',
  'checkout',
  'custom',
]);
const PositionSchema = z.enum(['center', 'top', 'bottom', 'inline']);
const TriggerSchema = z.enum([
  'on_load',
  'after_delay',
  'exit_intent',
  'scroll_percent',
  'add_to_cart',
  'time_on_page',
]);
const CtaActionSchema = z.enum([
  'apply_discount',
  'go_to_url',
  'add_to_cart',
  'open_chat',
  'submit_form',
]);
const BrandToneSchema = z.enum(['minimal', 'bold', 'playful', 'luxury', 'friendly', 'auto']);
const AnimationSchema = z.enum(['none', 'subtle', 'lively']);
const ModelTierSchema = z.enum(['cheap', 'standard', 'premium']);

const ImageRefSchema = z.object({
  image_id: z.string(),
  purpose: z.enum([
    'style_reference',
    'layout_reference',
    'content_reference',
    'unknown',
  ]).optional(),
  notes: z.string().optional(),
});

const StoreContextSchema = z.object({
  shop_domain: z.string().optional(),
  currency: z.string().optional(),
  primary_language: z.string().optional(),
  theme_os2: z.boolean().optional(),
});

const ClassificationSchema = z.object({
  intent: z.string(), // CleanIntentId when from classifier
  surface: z.string(), // Surface
  module_archetype: z.string().optional(), // ModuleArchetype
  mode: z.enum(INTENT_MODES).default('create'),
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.object({
    intent: z.string(),
    confidence: z.number().min(0).max(1),
  })).default([]),
  reasons: z.array(z.string()).default([]),
});

const EntitiesSchema = z.object({
  offer: z.object({
    type: OfferTypeSchema.optional(),
    value: z.number().optional().nullable(),
    code: z.string().optional().nullable(),
    min_purchase: z.number().optional().nullable(),
    applies_to: z.object({
      scope: z.enum(['all', 'collection', 'product', 'cart']).optional(),
      handles: z.array(z.string()).optional(),
    }).optional().nullable(),
  }).optional(),
  audience: z.object({
    segment: AudienceSegmentSchema.optional(),
    geo: z.array(z.string()).optional(),
    device: z.enum(['all', 'mobile', 'desktop']).optional(),
    customer_tags: z.array(z.string()).optional(),
    exclusions: z.array(z.string()).optional(),
  }).optional(),
  placement: z.object({
    pages: PlacementPagesSchema.optional(),
    selectors: z.array(z.string()).optional(),
    position: PositionSchema.optional(),
  }).optional(),
  behavior: z.object({
    trigger: TriggerSchema.optional(),
    delay_seconds: z.number().optional(),
    scroll_percent: z.number().optional().nullable(),
    frequency_cap: z.object({
      type: z.enum(['none', 'per_session', 'per_day', 'per_week']).optional(),
      max_impressions: z.number().optional(),
    }).optional(),
    dismiss: z.object({
      show_close: z.boolean().optional(),
      close_on_overlay: z.boolean().optional(),
      close_on_esc: z.boolean().optional(),
    }).optional(),
  }).optional(),
  content: z.object({
    headline: z.string().optional().nullable(),
    subheadline: z.string().optional().nullable(),
    body: z.string().optional().nullable(),
    cta: z.object({
      label: z.string().optional().nullable(),
      action: CtaActionSchema.optional(),
      url: z.string().optional().nullable(),
    }).optional(),
    fields: z.array(z.object({
      type: z.enum(['email', 'phone', 'text', 'none']).optional(),
      required: z.boolean().optional(),
      consent: z.boolean().optional(),
    })).optional(),
  }).optional(),
  style: z.object({
    brand_tone: BrandToneSchema.optional(),
    colors: z.object({
      primary: z.string().optional().nullable(),
      background: z.string().optional().nullable(),
      text: z.string().optional().nullable(),
    }).optional(),
    typography: z.object({ scale: z.string().optional(), font: z.string().optional() }).optional(),
    radius: z.string().optional(),
    shadow: z.string().optional(),
    spacing: z.string().optional(),
    animation: AnimationSchema.optional(),
  }).optional(),
}).optional();

const ConstraintsSchema = z.object({
  platform: z.object({
    shopify_os2_only: z.boolean().optional(),
    no_deprecated_features: z.boolean().optional(),
    allowed_surfaces: z.array(z.string()).optional(),
  }).optional(),
  privacy: z.object({
    pii_allowed: z.boolean().optional(),
    collect_email: z.enum(['optional', 'required', 'disallowed']).optional(),
    collect_phone: z.enum(['optional', 'required', 'disallowed']).optional(),
  }).optional(),
  performance: z.object({
    max_js_kb: z.number().optional(),
    no_blocking_render: z.boolean().optional(),
  }).optional(),
  accessibility: z.object({ wcag_min: z.string().optional() }).optional(),
}).optional();

const RoutingSchema = z.object({
  /** Prompt scaffold ID (not a MODULE_TEMPLATES lookup key). Used for prompt composition only. */
  prompt_scaffold_id: z.string(),
  prompt_profile: z.string(),
  output_schema: z.string(),
  model_tier: ModelTierSchema.optional(),
});

export const IntentPacketInputSchema = z.object({
  text: z.string(),
  language_hint: z.string().optional(),
  images: z.array(ImageRefSchema).optional(),
  store_context: StoreContextSchema.optional(),
});

export const IntentPacketSchema = z.object({
  schema_version: z.literal('1.0').optional(),
  request_id: z.string().optional(),
  timestamp: z.string().optional(),
  input: IntentPacketInputSchema,
  classification: ClassificationSchema,
  entities: EntitiesSchema.optional(),
  constraints: ConstraintsSchema.optional(),
  routing: RoutingSchema,
});

export type IntentPacketInput = z.infer<typeof IntentPacketInputSchema>;
export type IntentPacket = z.infer<typeof IntentPacketSchema>;

// ─── Routing table (doc 15.15): intent → prompt_scaffold_id, prompt_profile, output_schema ───
export interface RoutingEntry {
  /** Prompt scaffold ID for prompt composition; do not resolve via findTemplate(). */
  prompt_scaffold_id: string;
  prompt_profile: string;
  output_schema: string;
  model_tier?: 'cheap' | 'standard' | 'premium';
}

/**
 * Storefront routing uses this schema name. The app validates RecipeSpec (Zod union) and expects
 * LLM output shape { options: [ { recipe: RecipeSpec, explanation?: string } ] }.
 */
export const OUTPUT_SCHEMA_STOREFRONT = 'StorefrontModuleSpecV1';

/** Intent prefix or exact intent → routing. output_schema StorefrontModuleSpecV1 = RecipeSpec in this codebase. */
export const ROUTING_TABLE: Record<string, RoutingEntry> = {
  // Storefront promo (theme.popup, theme.banner, theme.notificationBar map here)
  'promo.popup': { prompt_scaffold_id: 'tpl_promo_popup_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.banner': { prompt_scaffold_id: 'tpl_promo_banner_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.slideout': { prompt_scaffold_id: 'tpl_promo_slideout_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.inline_block': { prompt_scaffold_id: 'tpl_promo_inline_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.countdown': { prompt_scaffold_id: 'tpl_promo_countdown_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.free_shipping_bar': { prompt_scaffold_id: 'tpl_promo_free_shipping_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'promo.discount_reveal': { prompt_scaffold_id: 'tpl_promo_discount_reveal_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  // Upsell
  'upsell.product_reco': { prompt_scaffold_id: 'tpl_upsell_product_reco_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'upsell.cart_upsell': { prompt_scaffold_id: 'tpl_upsell_cart_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'upsell.bundle_builder': { prompt_scaffold_id: 'tpl_upsell_bundle_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'upsell.cross_sell_addon': { prompt_scaffold_id: 'tpl_upsell_cross_sell_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'upsell.post_purchase': { prompt_scaffold_id: 'tpl_upsell_post_purchase_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  // Trust & info & merch & utility
  'trust.badges': { prompt_scaffold_id: 'tpl_content_trust_badges_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'trust.reviews_snippet': { prompt_scaffold_id: 'tpl_content_reviews_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'info.faq_accordion': { prompt_scaffold_id: 'tpl_content_faq_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'info.size_guide': { prompt_scaffold_id: 'tpl_content_size_guide_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'info.shipping_returns': { prompt_scaffold_id: 'tpl_content_shipping_returns_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'engage.newsletter_capture': { prompt_scaffold_id: 'tpl_engage_newsletter_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'engage.exit_intent': { prompt_scaffold_id: 'tpl_engage_exit_intent_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'engage.quiz': { prompt_scaffold_id: 'tpl_engage_form_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'engage.survey': { prompt_scaffold_id: 'tpl_engage_form_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'engage.social_proof': { prompt_scaffold_id: 'tpl_content_social_proof_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'merch.collection_grid': { prompt_scaffold_id: 'tpl_content_collection_grid_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'merch.product_grid': { prompt_scaffold_id: 'tpl_content_product_grid_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'merch.before_after': { prompt_scaffold_id: 'tpl_content_before_after_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'merch.video_block': { prompt_scaffold_id: 'tpl_content_video_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'utility.announcement': { prompt_scaffold_id: 'tpl_content_announcement_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'utility.localization_prompt': { prompt_scaffold_id: 'tpl_content_localization_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'utility.age_gate': { prompt_scaffold_id: 'tpl_content_age_gate_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'utility.effect': { prompt_scaffold_id: 'tpl_effect_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  'utility.floating_widget': { prompt_scaffold_id: 'tpl_floating_widget_v1', prompt_profile: 'storefront_ui_v1', output_schema: 'StorefrontModuleSpecV1' },
  // Admin
  'admin.dashboard_card': { prompt_scaffold_id: 'tpl_admin_dashboard_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
  'admin.campaign_builder': { prompt_scaffold_id: 'tpl_admin_campaign_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
  'admin.analytics_report': { prompt_scaffold_id: 'tpl_admin_analytics_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
  'admin.settings_editor': { prompt_scaffold_id: 'tpl_admin_settings_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
  'admin.workflow_builder': { prompt_scaffold_id: 'tpl_admin_workflow_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
  // Flow
  'flow.create_workflow': { prompt_scaffold_id: 'tpl_flow_create_v1', prompt_profile: 'workflow_v1', output_schema: 'WorkflowSpecV1' },
  'flow.edit_workflow': { prompt_scaffold_id: 'tpl_flow_edit_v1', prompt_profile: 'workflow_v1', output_schema: 'WorkflowSpecV1' },
  'flow.debug_workflow': { prompt_scaffold_id: 'tpl_flow_debug_v1', prompt_profile: 'workflow_v1', output_schema: 'WorkflowSpecV1' },
  'flow.import_template': { prompt_scaffold_id: 'tpl_flow_import_v1', prompt_profile: 'workflow_v1', output_schema: 'WorkflowSpecV1' },
  // Support
  'support.troubleshoot': { prompt_scaffold_id: 'tpl_support_debug_v1', prompt_profile: 'support_v1', output_schema: 'TroubleshootPlanV1' },
  'support.how_to': { prompt_scaffold_id: 'tpl_support_how_to_v1', prompt_profile: 'support_v1', output_schema: 'TroubleshootPlanV1' },
  'support.generate_copy_only': { prompt_scaffold_id: 'tpl_copy_pack_v1', prompt_profile: 'copy_v1', output_schema: 'CopyPackV1' },
  'support.generate_assets': { prompt_scaffold_id: 'tpl_assets_v1', prompt_profile: 'copy_v1', output_schema: 'CopyPackV1' },
  // Fallback for unknown intents: safe "we can build it" plan (no generic popup)
  'platform.extensionBlueprint': { prompt_scaffold_id: 'tpl_blueprint_v1', prompt_profile: 'admin_ui_v1', output_schema: 'AdminUISpecV1' },
};

/** Map module type (e.g. theme.popup) to intent for routing when intent is not from Clean Intent List. */
export const MODULE_TYPE_TO_INTENT: Record<string, string> = {
  'theme.popup': 'promo.popup',
  'theme.banner': 'promo.banner',
  'theme.notificationBar': 'utility.announcement',
  'theme.effect': 'utility.effect',
  'theme.floatingWidget': 'utility.floating_widget',
  'proxy.widget': 'utility.floating_widget',
  'checkout.upsell': 'upsell.cart_upsell',
  'checkout.block': 'upsell.cross_sell_addon',
  'postPurchase.offer': 'upsell.post_purchase',
  'admin.block': 'admin.dashboard_card',
  'pos.extension': 'admin.dashboard_card',
  'analytics.pixel': 'support.generate_copy_only',
  'customerAccount.blocks': 'info.faq_accordion',
  'flow.automation': 'flow.create_workflow',
  'integration.httpSync': 'support.generate_copy_only',
  'functions.discountRules': 'promo.discount_reveal',
  'functions.deliveryCustomization': 'info.shipping_returns',
  'functions.paymentCustomization': 'support.generate_copy_only',
  'functions.cartAndCheckoutValidation': 'support.troubleshoot',
  'functions.cartTransform': 'upsell.bundle_builder',
  'functions.fulfillmentConstraints': 'info.shipping_returns',
  'functions.orderRoutingLocationRule': 'info.shipping_returns',
  'platform.extensionBlueprint': 'admin.settings_editor',
};

/** Fallback route when intent is unknown — blueprint plan instead of generic popup. */
const BLUEPRINT_FALLBACK: RoutingEntry = ROUTING_TABLE['platform.extensionBlueprint']!;

/**
 * Resolve routing for an intent or module type. Prefers exact intent, then intent group (prefix), then module type map.
 * Unknown intents resolve to platform.extensionBlueprint (safe "we can build it" plan), not promo popup.
 */
export function resolveRouting(intentOrModuleType: string): RoutingEntry {
  const exact = ROUTING_TABLE[intentOrModuleType];
  if (exact) return exact;
  const byPrefix = Object.entries(ROUTING_TABLE).find(([key]) => intentOrModuleType.startsWith(key.split('.')[0] + '.'));
  if (byPrefix) return byPrefix[1];
  const byModuleType = MODULE_TYPE_TO_INTENT[intentOrModuleType];
  if (byModuleType) return resolveRouting(byModuleType);
  return BLUEPRINT_FALLBACK;
}
