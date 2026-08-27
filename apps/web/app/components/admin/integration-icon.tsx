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
// Task 9 (email tile): the Hub's single `email` tile spans five interchangeable
// providers (smtp/sendgrid/generic/resend/postmark) — no single brand logo
// honestly represents "the email channel" (and simple-icons has no SendGrid
// entry at all — verified via a full-package keyword search). Rather than pick
// one provider's logo to stand in for the whole channel, `generic-mail` below
// is a hand-authored, license-free envelope glyph (Material Design's "email"
// outline, Apache-2.0) added to the registry as a non-brand fallback — same
// `REGISTRY[slug] ?? null` lookup contract as every simple-icons entry, so an
// unresolvable/mistyped slug still fails silently-to-nothing rather than
// breaking the build (only real simple-icons imports get the build-time
// missing-export safety net; this one synthetic entry is exempt by design).
//
// Task 10 (Slack tile): confirmed (again) against the installed package that
// no `siSlack` export exists (only `siSlackware`, a different product).
// `generic-chat` below is the same non-brand-fallback treatment as
// `generic-mail` — a chat-bubble glyph, since it represents the "incoming
// webhook chat alert" channel, not a Slack-branded mark.
//
// Task 11 (UptimeRobot tile): confirmed (again) that no `siUptimerobot`
// export exists — `generic-pulse` (a bolt/pulse glyph) is the same
// non-brand-fallback treatment, representing "uptime monitor" generically.
//
// Task 12 (Healthchecks.io tile): confirmed (again) that no
// `siHealthchecksdotio` export exists — `generic-check` (a check-circle
// glyph) is the same non-brand-fallback treatment, representing "dead-man's-
// switch status" generically.
//
// Task 13 (AI provider tiles — Grok/DeepSeek/Mistral + the existing OpenAI/
// Anthropic/Gemini rows getting Hub tiles): re-verified against the installed
// package — `siAnthropic`, `siGooglegemini`, `siDeepseek`, `siMistralai` DO
// exist under those names and are imported directly below. `siOpenai` and
// `siGrok`/`siXdotai` do NOT exist (confirmed again: only `siOpenaigym` and
// `siNgrok` respectively, both different products) — `generic-spark` (OpenAI
// tile) and `generic-bolt` (Grok tile) are the same non-brand-fallback
// treatment as the ops-service tiles above.
//
// Each real simple-icons slug actually in use is imported by name below, so
// an unresolvable brand fails at BUILD time (missing export) rather than
// silently rendering a blank icon in production. The hand-authored `generic-*`
// entries are exempt from that safety net by design (see above).

import type { SimpleIcon } from 'simple-icons';
import { siSentry, siAnthropic, siGooglegemini, siDeepseek, siMistralai } from 'simple-icons';

/** Hand-authored, non-brand icon for tiles that don't map to one company's logo.
 * Glyph: Material Design's "email" outline (Apache-2.0), not a Simple Icons export. */
const GENERIC_MAIL_PATH =
  'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z';
const GENERIC_MAIL_ICON: SimpleIcon = {
  title: 'Email',
  slug: 'generic-mail',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_MAIL_PATH}"/></svg>`,
  path: GENERIC_MAIL_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280', // DESIGN.md muted neutral — deliberately not a brand color.
};

/** Slack tile fallback — chat-bubble glyph (Material "chat", Apache-2.0). */
const GENERIC_CHAT_PATH = 'M20,2H4C2.9,2,2,2.9,2,4v18l4-4h14c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2z';
const GENERIC_CHAT_ICON: SimpleIcon = {
  title: 'Slack (incoming webhook)',
  slug: 'generic-chat',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_CHAT_PATH}"/></svg>`,
  path: GENERIC_CHAT_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280',
};

/** UptimeRobot tile fallback — bolt/pulse glyph (Material "bolt", Apache-2.0). */
const GENERIC_PULSE_PATH = 'M7,2v11h3v9l7-12h-4l4-8H7z';
const GENERIC_PULSE_ICON: SimpleIcon = {
  title: 'UptimeRobot',
  slug: 'generic-pulse',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_PULSE_PATH}"/></svg>`,
  path: GENERIC_PULSE_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280',
};

/** Healthchecks.io tile fallback — check-circle glyph (Material "check_circle", Apache-2.0). */
const GENERIC_CHECK_PATH =
  'M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M10,17l-5-5l1.41-1.41L10,14.17l7.59-7.59L19,8L10,17z';
const GENERIC_CHECK_ICON: SimpleIcon = {
  title: 'Healthchecks.io',
  slug: 'generic-check',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_CHECK_PATH}"/></svg>`,
  path: GENERIC_CHECK_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280',
};

/** OpenAI tile fallback — spark/sparkle glyph (Material "auto_awesome", Apache-2.0). */
const GENERIC_SPARK_PATH =
  'M19,9l1.25-2.75L23,5l-2.75-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5-5.5L17,12L11.5,9.5z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23l1.25-2.75L23,19l-2.75-1.25L19,15z';
const GENERIC_SPARK_ICON: SimpleIcon = {
  title: 'OpenAI',
  slug: 'generic-spark',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_SPARK_PATH}"/></svg>`,
  path: GENERIC_SPARK_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280',
};

/** Grok (xAI) tile fallback — bolt glyph (Material "bolt", Apache-2.0). Reuses the
 * same shape family as UptimeRobot's generic-pulse but registered under its own
 * slug since the two tiles must never share a `simpleIconSlug` (registry test). */
const GENERIC_BOLT_PATH = 'M11,21l1-7H7l6-11h2l-1,7h5L11,21z';
const GENERIC_BOLT_ICON: SimpleIcon = {
  title: 'Grok (xAI)',
  slug: 'generic-bolt',
  svg: `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${GENERIC_BOLT_PATH}"/></svg>`,
  path: GENERIC_BOLT_PATH,
  source: 'https://fonts.google.com/icons (Material Symbols, Apache-2.0)',
  hex: '6B7280',
};

const REGISTRY: Record<string, SimpleIcon> = {
  siSentry,
  siAnthropic,
  siGooglegemini,
  siDeepseek,
  siMistralai,
  'generic-mail': GENERIC_MAIL_ICON,
  'generic-chat': GENERIC_CHAT_ICON,
  'generic-pulse': GENERIC_PULSE_ICON,
  'generic-check': GENERIC_CHECK_ICON,
  'generic-spark': GENERIC_SPARK_ICON,
  'generic-bolt': GENERIC_BOLT_ICON,
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
