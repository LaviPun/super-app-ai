/**
 * Internal-SSO identity allowlist (WS-QF / Ops-2).
 *
 * The SSO callback previously granted internal-admin to ANY identity the IdP
 * authenticated. These helpers gate the callback on INTERNAL_SSO_ALLOWED_EMAILS
 * (comma-separated, exact-match, case-insensitive) against the ID-token email
 * claim: the claim must be present, and when the IdP sends email_verified it
 * must be true. Denials are audit-logged (best-effort, never throwing).
 */
import { ActivityLogService } from '~/services/activity/activity.service';
import { getClientIp } from '~/services/security/rate-limit.server';

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export type SsoIdentityVerdict =
  | { ok: true; email: string }
  | { ok: false; email: string | null; reason: 'missing_email_claim' | 'email_not_verified' | 'allowlist_empty' | 'not_on_allowlist' };

export function evaluateSsoIdentity(
  claims: Record<string, unknown>,
  allowedEmails: string[],
): SsoIdentityVerdict {
  const raw = claims.email;
  const email = typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase() : null;
  if (!email) return { ok: false, email: null, reason: 'missing_email_claim' };
  if ('email_verified' in claims && claims.email_verified !== true) {
    return { ok: false, email, reason: 'email_not_verified' };
  }
  if (allowedEmails.length === 0) return { ok: false, email, reason: 'allowlist_empty' };
  if (!allowedEmails.includes(email)) return { ok: false, email, reason: 'not_on_allowlist' };
  return { ok: true, email };
}

/** Best-effort denial audit — a failed audit write must never mask the denial. */
export async function auditSsoDenied(
  request: Request,
  verdict: { email: string | null; reason: string },
): Promise<void> {
  await new ActivityLogService()
    .log({
      actor: 'INTERNAL_ADMIN',
      action: 'LOGIN',
      resource: 'internal:sso',
      details: { outcome: 'denied', email: verdict.email, reason: verdict.reason },
      ip: getClientIp(request),
    })
    .catch(() => {});
}
