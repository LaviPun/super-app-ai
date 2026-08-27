/**
 * Fix round (Critical #1, controller ruling): per-kind BullMQ retry policy
 * for the "superapp-ops" queue's owned job types (job-executors.server.ts).
 *
 * Deliberately ISOMORPHIC (no `.server` suffix) — imported both server-side
 * (ops-queue.server.ts, to set the real BullMQ `attempts` option) and
 * client-side (internal.jobs.tsx, to label a manual DLQ replay of a
 * non-auto-retried kind as "may repeat side effects"). Must never import
 * anything server-only.
 *
 * A kind gets `attempts: 3` (automatic BullMQ retry) ONLY when its executor
 * is verified idempotent — re-running it with the same payload must not
 * duplicate a side effect:
 *  - RESTOCK_WATCH_RUN: gated on DataCapture.payload's "waiting" status
 *    marker, flipped only after a successful send — a retry re-queries and
 *    skips anything already notified.
 *  - LOYALTY_ACCRUAL_RUN: keyed by the order's GID in the ledger row — a
 *    retry accruing the same order is a no-op.
 *  - MESSAGING_RUN: all three audience sources now carry a durable
 *    per-(runToken, recipient) sent-marker — data_store via the existing
 *    `__sentRuns` record field, literal/event_recipient via the new
 *    `MessagingRecipientSent` table (see messaging-runner.service.ts).
 *
 * Everything else gets `attempts: 1` (no automatic retry — a transient
 * failure is terminal and lands in the DLQ for a CONSCIOUS manual replay
 * instead of silently re-running side effects):
 *  - FLOW_RUN / HTTP_SYNC_RUN: arbitrary external side effects (Shopify
 *    writes, outbound webhooks to merchant-configured endpoints) with no
 *    cheap idempotency guard available — the controller ruling explicitly
 *    declined to force one.
 *  - CONNECTOR_TEST: the admin picks an arbitrary HTTP method (including
 *    POST/PUT/PATCH/DELETE) and path against the connector's base URL —
 *    unverified whether a given configured test is idempotent, so it
 *    defaults to the safe choice.
 *  - SUPPORT_TRIAGE_RUN: `recordTicketEvent`/`notifySupportEvent` are not
 *    idempotent — a retry would duplicate ticket events and merchant/admin
 *    notification emails.
 */
export const JOB_RETRY_ATTEMPTS: Record<string, number> = {
  CONNECTOR_TEST: 1,
  FLOW_RUN: 1,
  MESSAGING_RUN: 3,
  HTTP_SYNC_RUN: 1,
  RESTOCK_WATCH_RUN: 3,
  LOYALTY_ACCRUAL_RUN: 3,
  SUPPORT_TRIAGE_RUN: 1,
};

/** Unknown/unlisted kinds default to the safe choice — no automatic retry. */
export function retryAttemptsFor(type: string): number {
  return JOB_RETRY_ATTEMPTS[type] ?? 1;
}

/** True when this kind is configured for automatic BullMQ retry (attempts > 1). */
export function isAutoRetried(type: string): boolean {
  return retryAttemptsFor(type) > 1;
}

export const REPLAY_SIDE_EFFECT_WARNING = 'Replay may repeat side effects — confirm before retrying.';

/**
 * For the DLQ replay UI (internal.jobs.tsx): a non-auto-retried kind has no
 * verified idempotency guard, so a manual replay is a CONSCIOUS action that
 * may re-run side effects (send another email, re-POST to a merchant
 * endpoint, etc.) — surface that before the admin confirms. `null` for an
 * auto-retried (guarded) kind, where replay is safe to fire without a
 * special warning.
 */
export function replayWarningFor(type: string): string | null {
  return isAutoRetried(type) ? null : REPLAY_SIDE_EFFECT_WARNING;
}
