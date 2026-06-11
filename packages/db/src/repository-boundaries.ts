/**
 * V2 repository boundaries (Phase 15).
 *
 * Job ledger is implemented in this package. Other bounded contexts keep explicit
 * repository interfaces here so Fastify/workers never import apps/web Prisma modules.
 *
 * Prisma client packaging for legacy Remix data remains in apps/web until a safe
 * Postgres cutover completes; V2 services depend on these interfaces + SQL drivers.
 */

export type { JobLedgerRepository } from './job-ledger.js';

export type ModuleRepository = {
  // Phase 16+: module catalog + merchant instances
};

export type AiUsageRepository = {
  // Phase 16+: token/cost ledger for observability billing
};

export type ConnectorRepository = {
  // Phase 10+: connector configs and token references
};

export type FlowRepository = {
  // Phase 9+: workflow runs and step logs
};

export type ObservabilityRepository = {
  // Phase 16+: trace/audit persistence adapters
};

export type InternalAiRepository = {
  // Phase 8+: internal assistant sessions/messages (see internal-assistant-ledger.ts)
};
