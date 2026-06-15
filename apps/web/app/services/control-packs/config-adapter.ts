/**
 * Adapter between the legacy flat `spec.config` (v1) and the grouped, pack-based
 * value shape the v2 SchemaForm edits. Mapping is intentionally lossless on save:
 * `groupedToSpec` starts from the previous config and only overwrites keys the
 * current packs own, so controls not yet covered by a pack (e.g. popup countdown
 * before Phase 3 adds that pack) are preserved untouched.
 *
 * Pure + client-safe (no server imports). Extended per module type as packs grow.
 */
import type { RecipeSpec } from '@superapp/core';

export type GroupedValue = Record<string, Record<string, unknown>>;

interface Cta { text?: unknown; url?: unknown }

function cta(text: unknown, url: unknown): Cta | undefined {
  if (text == null && url == null) return undefined;
  return { text, url };
}

/** Project a RecipeSpec into the grouped value the v2 SchemaForm renders. */
export function specToGrouped(spec: RecipeSpec): GroupedValue {
  const config = ((spec as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;
  const style = ((spec as { style?: Record<string, unknown> }).style ?? {}) as Record<string, unknown>;

  switch (spec.type) {
    case 'theme.section':
      // theme.section is the generic storefront type; collapsed kinds (banner,
      // popup, notification-bar, …) keep their config keys top-level via catchall,
      // so the full pack surface maps here.
      return {
        content: {
          heading: config.title,
          body: config.body ?? config.subtitle,
          primaryCta: cta(config.ctaText, config.ctaUrl),
          secondaryCta: cta(config.secondaryCtaText, config.secondaryCtaUrl),
        },
        style,
        trigger: { mode: config.trigger, delaySeconds: config.delaySeconds },
        targeting: { pages: config.showOnPages, urlIncludes: config.customPageUrls },
        frequencyCap: { frequency: config.frequency, maxShowsPerDay: config.maxShowsPerDay },
        countdown: {
          enabled: config.countdownEnabled,
          seconds: config.countdownSeconds,
          label: config.countdownLabel,
        },
        behavior: { showCloseButton: config.showCloseButton, autoCloseSeconds: config.autoCloseSeconds },
        // Nested v2-native packs persist 1:1 on config.
        audience: (config.audience as Record<string, unknown>) ?? {},
        schedule: (config.schedule as Record<string, unknown>) ?? {},
        advancedCustom: (config.advancedCustom as Record<string, unknown>) ?? {},
      };
    default:
      return { content: {}, style };
  }
}

/** Merge a grouped value back into a RecipeSpec, preserving keys no pack owns. */
export function groupedToSpec(spec: RecipeSpec, grouped: GroupedValue): RecipeSpec {
  const prev = ((spec as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;
  const content = (grouped.content ?? {}) as Record<string, unknown>;
  const primaryCta = (content.primaryCta ?? {}) as Cta;
  const secondaryCta = (content.secondaryCta ?? {}) as Cta;
  const style = grouped.style ?? (spec as { style?: unknown }).style;

  const isEmptyObj = (o: Record<string, unknown>) => Object.values(o).every((v) => v == null || (Array.isArray(v) && v.length === 0));

  switch (spec.type) {
    case 'theme.section': {
      const trigger = (grouped.trigger ?? {}) as Record<string, unknown>;
      const targeting = (grouped.targeting ?? {}) as Record<string, unknown>;
      const frequencyCap = (grouped.frequencyCap ?? {}) as Record<string, unknown>;
      const countdown = (grouped.countdown ?? {}) as Record<string, unknown>;
      const behavior = (grouped.behavior ?? {}) as Record<string, unknown>;
      const audience = (grouped.audience ?? {}) as Record<string, unknown>;
      const schedule = (grouped.schedule ?? {}) as Record<string, unknown>;
      const advancedCustom = (grouped.advancedCustom ?? {}) as Record<string, unknown>;
      const config = {
        ...prev,
        title: content.heading ?? prev.title,
        body: content.body,
        ctaText: primaryCta.text,
        ctaUrl: primaryCta.url,
        secondaryCtaText: secondaryCta.text,
        secondaryCtaUrl: secondaryCta.url,
        trigger: trigger.mode ?? prev.trigger,
        delaySeconds: trigger.delaySeconds ?? prev.delaySeconds,
        showOnPages: targeting.pages ?? prev.showOnPages,
        customPageUrls: targeting.urlIncludes ?? prev.customPageUrls,
        frequency: frequencyCap.frequency ?? prev.frequency,
        maxShowsPerDay: frequencyCap.maxShowsPerDay ?? prev.maxShowsPerDay,
        countdownEnabled: countdown.enabled ?? prev.countdownEnabled,
        countdownSeconds: countdown.seconds ?? prev.countdownSeconds,
        countdownLabel: countdown.label ?? prev.countdownLabel,
        showCloseButton: behavior.showCloseButton ?? prev.showCloseButton,
        autoCloseSeconds: behavior.autoCloseSeconds ?? prev.autoCloseSeconds,
        // Omit empty advanced packs so optional schema fields stay undefined.
        audience: isEmptyObj(audience) ? undefined : audience,
        schedule: isEmptyObj(schedule) ? undefined : schedule,
        advancedCustom: isEmptyObj(advancedCustom) ? undefined : advancedCustom,
      };
      return { ...spec, config, style } as unknown as RecipeSpec;
    }
    default:
      return { ...spec, style } as RecipeSpec;
  }
}
