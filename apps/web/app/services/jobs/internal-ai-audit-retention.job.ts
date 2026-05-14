/**
 * Retention job for InternalAiToolAudit rows.
 *
 * Hard-deletes audit rows older than INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS
 * (default 90). Intended to be invoked from the cron loader. The work is
 * idempotent: running more frequently than once a day is harmless but
 * usually a no-op after the first daily run.
 */
import {
  INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS_DEFAULT,
  InternalAssistantStoreService,
} from '~/services/ai/internal-assistant-store.server';

export interface AuditRetentionResult {
  deleted: number;
  retentionDays: number;
  cutoff: string;
}

export function resolveRetentionDays(envValue: string | undefined): number {
  if (!envValue) return INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS_DEFAULT;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS_DEFAULT;
  return Math.floor(parsed);
}

export function computeRetentionCutoff(retentionDays: number, now: Date = new Date()): Date {
  const days = retentionDays > 0 ? Math.floor(retentionDays) : INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS_DEFAULT;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function runInternalAiAuditRetention(
  options: { store?: Pick<InternalAssistantStoreService, 'purgeOldToolAudits'>; retentionDays?: number } = {},
): Promise<AuditRetentionResult> {
  const retentionDays = options.retentionDays ?? resolveRetentionDays(process.env.INTERNAL_AI_TOOL_AUDIT_RETENTION_DAYS);
  const store = options.store ?? new InternalAssistantStoreService();
  const deleted = await store.purgeOldToolAudits(retentionDays);
  return {
    deleted,
    retentionDays,
    cutoff: computeRetentionCutoff(retentionDays).toISOString(),
  };
}
