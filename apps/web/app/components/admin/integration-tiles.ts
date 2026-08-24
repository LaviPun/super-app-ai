// Integrations Hub tile registry — data-driven list of every external service
// the internal admin surfaces as a marketplace-style tile. Populated
// incrementally: this file starts empty (Task 4) and gains one entry per
// wiring task (Task 5 = sentry, Tasks 9-13 = email/slack/uptimerobot/
// healthchecks/AI-provider-kind tiles, Tasks 20-22 = the rest) — a tile is
// never added here without its wire landing in the same commit.

export type IntegrationCategory = 'AI_PROVIDER' | 'OPS_SERVICE';

export interface IntegrationTileDef {
  /** Stable key, e.g. 'anthropic', 'sentry'. Used as the React key and the intent-routing id. */
  id: string;
  category: IntegrationCategory;
  label: string;
  /** simple-icons named export for this brand, e.g. 'siSentry'. Must have a
   * matching entry in `integration-icon.tsx`'s REGISTRY — that file imports
   * each slug explicitly so a typo/unavailable brand fails at build time
   * instead of silently rendering no icon in production. */
  simpleIconSlug: string;
  /** DB = full config in AppSettings (Decision G6). ENV_REFLECT = boot-time
   * env var, tile only reflects status + offers a test action (Decision G4). */
  configKind: 'DB' | 'ENV_REFLECT';
  description: string;
}

export const INTEGRATION_TILES: readonly IntegrationTileDef[] = [
  {
    id: 'sentry',
    category: 'OPS_SERVICE',
    label: 'Sentry',
    simpleIconSlug: 'siSentry',
    configKind: 'ENV_REFLECT',
    description: 'Error tracking — DSN is set via Railway env var; this sends a test event.',
  },
  {
    id: 'email',
    category: 'OPS_SERVICE',
    label: 'Email',
    // No single brand honestly represents this tile — it's one logical channel
    // spanning five interchangeable providers (smtp/sendgrid/generic/resend/
    // postmark), and simple-icons has no SendGrid export at all. 'generic-mail'
    // is a hand-authored, non-brand envelope glyph — see integration-icon.tsx.
    simpleIconSlug: 'generic-mail',
    configKind: 'DB',
    description: 'Transactional email for ops alerts and support notifications — SMTP, SendGrid, Resend, Postmark, or a generic JSON API.',
  },
  {
    id: 'slack-ops',
    category: 'OPS_SERVICE',
    label: 'Slack',
    // No siSlack export exists in simple-icons@16 (only siSlackware, a
    // different product) — 'generic-chat' is a hand-authored, non-brand
    // fallback, see integration-icon.tsx.
    simpleIconSlug: 'generic-chat',
    configKind: 'DB',
    description: 'Incoming-webhook alerts for ops failures — fires once the rolling-window failure threshold is crossed (Sentry always fires unconditionally; this and email are threshold-gated).',
  },
  {
    id: 'uptimerobot',
    category: 'OPS_SERVICE',
    label: 'UptimeRobot',
    // No siUptimerobot export exists in simple-icons@16 — 'generic-pulse' is
    // a hand-authored, non-brand fallback, see integration-icon.tsx.
    simpleIconSlug: 'generic-pulse',
    configKind: 'DB',
    description: 'Uptime monitor on /healthz. The monitor itself lives in the UptimeRobot dashboard — this tile only reflects its live status via a read-only API key.',
  },
  {
    id: 'healthchecks',
    category: 'OPS_SERVICE',
    label: 'Healthchecks.io',
    // No siHealthchecksdotio export exists in simple-icons@16 — 'generic-check'
    // is a hand-authored, non-brand fallback, see integration-icon.tsx.
    simpleIconSlug: 'generic-check',
    configKind: 'DB',
    description: 'Cron dead-man switch ("superapp-cron"). The ping itself is sent by the GitHub Actions cron workflow (PR #13, not yet merged) — this tile only reads status via a read-only API key.',
  },
];
