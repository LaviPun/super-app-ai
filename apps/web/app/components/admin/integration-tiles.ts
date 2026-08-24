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
];
