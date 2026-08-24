// Inline simple-icons SVG renderer for Integrations Hub tiles — CSP-safe
// (no CDN fetch), matches Decision "icons INLINED" in the plan.
//
// simple-icons@16 does NOT export every brand under the "natural" camelCase
// name a naive read of the API would assume — verified against the
// installed package's index.d.ts before writing this file: there is no
// `siOpenai` (only `siOpenaigym`), no `siSlack` (only `siSlackware`), no
// `siGrok`/`siXdotai`, no `siUptimerobot`, no `siHealthchecksdotio`, no
// `siPostmark`. `siSentry`, `siAnthropic`, `siGooglegemini`, `siDeepseek`,
// `siMistralai`, and `siResend` DO exist under their expected names.
// Consequence for later tasks: tiles for OpenAI/Slack/Grok/UptimeRobot/
// Healthchecks.io/Postmark will need a substitute icon (a close visual
// analog, or the `simpleIconSlug` field repurposed to a local fallback) —
// not solved here since this task only wires the Sentry tile (`siSentry`,
// which exists).
//
// Each slug actually in use is imported by name below, so an unresolvable
// brand fails at BUILD time (missing export) rather than silently rendering
// a blank icon in production.

import type { SimpleIcon } from 'simple-icons';
import { siSentry } from 'simple-icons';

const REGISTRY: Record<string, SimpleIcon> = {
  siSentry,
};

export function IntegrationIcon({
  slug,
  size = 20,
  color = 'brand',
}: {
  slug: string;
  size?: number;
  /** 'brand' (default) uses the icon's official hex; 'currentColor' lets the
   * light-only admin theme apply a muted state (e.g. a disconnected tile). */
  color?: 'brand' | 'currentColor';
}) {
  const icon = REGISTRY[slug];
  if (!icon) return null;
  const fill = color === 'currentColor' ? 'currentColor' : `#${icon.hex}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true" role="img">
      <path d={icon.path} />
    </svg>
  );
}
