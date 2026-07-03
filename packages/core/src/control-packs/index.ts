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
