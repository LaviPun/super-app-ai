/**
 * Control Pack system (Module System v2) — public surface.
 * See docs/module-system-v2.md for the design rationale.
 */
export * from './types.js';
export * from './registry.js';
export * from './module-manifests.js';
export * from './type-enums.js';

// Concrete pack schemas (exported for tests, presets, and prompt derivation).
export { ContentPackSchema, contentPack } from './packs/content.pack.js';
export { StylePackSchema, stylePack } from './packs/style.pack.js';
export { TriggerPackSchema, triggerPack } from './packs/trigger.pack.js';
export { PageTargetingPackSchema, pageTargetingPack } from './packs/page-targeting.pack.js';
export { FrequencyCapPackSchema, frequencyCapPack } from './packs/frequency-cap.pack.js';
export { CountdownPackSchema, countdownPack } from './packs/countdown.pack.js';
export { BehaviorPackSchema, behaviorPack } from './packs/behavior.pack.js';
export { AudiencePackSchema, audiencePack } from './packs/audience.pack.js';
export { SchedulePackSchema, schedulePack } from './packs/schedule.pack.js';
export { AdvancedCustomPackSchema, advancedCustomPack } from './packs/advanced-custom.pack.js';
export { LayoutArchetypePackSchema, layoutArchetypePack } from './packs/layout-archetype.pack.js';
export {
  RuleEnginePackSchema,
  RuleConditionSchema,
  RuleGroupSchema,
  ruleEnginePack,
} from './packs/rule-engine.pack.js';
export type { RuleEnginePack, RuleCondition, RuleGroup } from './packs/rule-engine.pack.js';
export {
  PricingPackSchema,
  DiscountSchema,
  PricingGateSchema,
  StackingSchema,
  TierSchema,
  TiersSchema,
  BogoSchema,
  GiftSchema,
  pricingPack,
  DISCOUNT_KINDS,
  THRESHOLD_BASIS,
  MECHANISMS,
} from './packs/pricing.pack.js';
export type {
  PricingPack,
  Discount,
  PricingGate,
  Stacking,
  Tier,
  Tiers,
  Bogo,
  Gift,
} from './packs/pricing.pack.js';
export {
  RecommendationPackSchema,
  recommendationPack,
  RECOMMENDATION_STRATEGIES,
  STATIC_RECOMMENDATION_STRATEGIES,
  RECOMMENDATION_FALLBACKS,
} from './packs/recommendation.pack.js';
export type {
  RecommendationPack,
  RecommendationStrategy,
  StaticRecommendationStrategy,
  RecommendationFallback,
} from './packs/recommendation.pack.js';
export {
  MessagingPackSchema,
  MessageTemplateSchema,
  MessagingAudienceSchema,
  MessagingTriggerSchema,
  messagingPack,
} from './packs/messaging.pack.js';
export type {
  MessagingPack,
  MessageTemplate,
  MessagingAudience,
  MessagingTrigger,
} from './packs/messaging.pack.js';
export {
  ProgressGoalPackSchema,
  ProgressTierSchema,
  progressGoalPack,
  PROGRESS_GOAL_BASES,
  PROGRESS_REWARD_TYPES,
  PROGRESS_BAR_STYLES,
} from './packs/progress-goal.pack.js';
export type {
  ProgressGoalPack,
  ProgressTier,
  ProgressGoalBasis,
  ProgressRewardType,
  ProgressBarStyle,
} from './packs/progress-goal.pack.js';
export {
  DevicePackSchema,
  devicePack,
  DEVICE_MOBILE_COLUMNS,
} from './packs/device.pack.js';
export type { DevicePack, DeviceMobileColumns } from './packs/device.pack.js';
export {
  FormFieldsPackSchema,
  FormFieldSchema,
  FormStepSchema,
  FormSuccessStepSchema,
  formFieldsPack,
  FORM_FIELD_TYPES,
} from './packs/form-fields.pack.js';
export type { FormFieldsPack, FormField, FormStep } from './packs/form-fields.pack.js';
export {
  ExperimentPackSchema,
  ExperimentVariantSchema,
  ExperimentOverridesSchema,
  experimentPack,
  EXPERIMENT_GOALS,
} from './packs/experiment.pack.js';
export type { ExperimentPack, ExperimentVariant } from './packs/experiment.pack.js';
