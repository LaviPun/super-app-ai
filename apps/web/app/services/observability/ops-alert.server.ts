import { getPrisma } from '~/db.server';
import { captureException, captureMessage } from '~/services/observability/sentry.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { decryptJson } from '~/services/security/crypto.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { sendSlackAlert } from './ops-alert-slack.server';

export type OpsAlertKind =
  | 'API_REQUEST_FAILED' // withApiLogging catch
  | 'JOB_FAILED' // JobService.fail
  | 'WEBHOOK_FANOUT_FAILED' // messaging/httpSync/restock/loyalty catches
  | 'TRIAGE_FAILED' // notifySupportEvent('triage_failed', ...)
  | 'STUCK_JOB_SWEPT'; // Task 17

export interface OpsAlertInput {
  kind: OpsAlertKind;
  message: string;
  error?: unknown;
  context?: Record<string, string | undefined>; // shopDomain, jobId, path, correlationId, etc.
}

type SlackSender = (webhookUrl: string, text: string) => Promise<{ sent: boolean; error?: string }>;

/**
 * Cross-call-site de-dup marker (fix round 1). Some services fire an ops alert
 * as a side effect of another call (e.g. `JobService.fail` fires `JOB_FAILED`)
 * and then re-throw the same error so an outer caller can still surface it
 * (an HTTP 400, a retryable connector result, etc). Without a marker, an outer
 * catch that ALSO calls `OpsAlertService.fire` (e.g. webhooks.tsx's fan-out
 * catches) would fire a second, redundant alert for the identical underlying
 * failure — doubling Sentry noise and advancing two independent threshold
 * counters for one real incident. The inner call marks the error; the outer
 * catch checks the marker and skips re-firing while still doing its own
 * logging/response handling.
 */
export function markOpsAlerted(error: unknown): void {
  if (error && typeof error === 'object') {
    (error as { __opsAlerted?: boolean }).__opsAlerted = true;
  }
}

export function wasOpsAlerted(error: unknown): boolean {
  return !!(error && typeof error === 'object' && (error as { __opsAlerted?: boolean }).__opsAlerted === true);
}

type OpsAlertSettings = {
  enableEmailAlerts: boolean;
  alertRecipients: string | null;
  opsSlackWebhookUrlEnc: string | null;
  opsAlertThresholdCount: number;
  opsAlertThresholdWindowMin: number;
};

/**
 * Single fan-out point for ops alerting (Decision G1): Sentry + email + Slack.
 * Sentry fires unconditionally on every alert with an error (Decision G3);
 * email/Slack are gated behind a rolling-window occurrence-count threshold read
 * from AppSettings, and degrade independently via Promise.allSettled (G2) —
 * a Slack failure must never block the email send, and vice versa.
 *
 * Occurrence-counting vs. fired-counting (fix round 1): every `fire()` call
 * unconditionally records an `OPS_ALERT_OCCURRED` row BEFORE the threshold
 * gate. The threshold is evaluated against a rolling-window count of THOSE
 * rows. `OPS_ALERT_FIRED` is written only once the gate opens and no cooldown
 * is active, and IS the cooldown: while an `OPS_ALERT_FIRED` for the same
 * alert kind exists within the window, further occurrences keep recording
 * (so the count for the *next* window stays accurate) but delivery is
 * suppressed — at most one send per kind per window (Decision G3).
 *
 * (Superseded design note: the original version counted `OPS_ALERT_FIRED`
 * rows for the threshold itself, but that row was only ever written AFTER
 * the gate passed — a bootstrap deadlock where the counter could never
 * organically leave zero. Fixed by splitting "occurred" from "fired".)
 */
export class OpsAlertService {
  private readonly sendSlack: SlackSender;
  private readonly activity: ActivityLogService;

  constructor(deps: { sendSlack?: SlackSender } = {}) {
    this.sendSlack = deps.sendSlack ?? sendSlackAlert;
    this.activity = new ActivityLogService();
  }

  /** Fire-and-forget-safe: never throws. Sentry unconditional; email/Slack gated by rolling-window threshold + cooldown. */
  async fire(input: OpsAlertInput): Promise<{ sentry: boolean; email: boolean; slack: boolean }> {
    const sentry = this.tryCaptureSentry(input);

    // Record every occurrence unconditionally, BEFORE the threshold gate —
    // see class doc. Never throws (best-effort bookkeeping).
    await this.recordOccurrence(input);

    let settings: OpsAlertSettings | null = null;
    try {
      settings = await getPrisma().appSettings.findUnique({
        where: { id: 'singleton' },
        select: {
          enableEmailAlerts: true,
          alertRecipients: true,
          opsSlackWebhookUrlEnc: true,
          opsAlertThresholdCount: true,
          opsAlertThresholdWindowMin: true,
        },
      });
    } catch {
      // AppSettings unreadable — Sentry already fired above; degrade silently.
    }
    if (!settings) return { sentry, email: false, slack: false };

    const overThreshold = await this.isOverThreshold(
      input.kind,
      settings.opsAlertThresholdCount,
      settings.opsAlertThresholdWindowMin,
    );
    if (!overThreshold) return { sentry, email: false, slack: false };

    const inCooldown = await this.isInCooldown(input.kind, settings.opsAlertThresholdWindowMin);
    if (inCooldown) return { sentry, email: false, slack: false };

    // Record the fire BEFORE attempting delivery so the cooldown applies to the
    // decision to send, not to the delivery outcome — a channel failure must
    // not cause the next occurrence in the same window to retry the send.
    await this.recordFired(input);

    const [emailResult, slackResult] = await Promise.allSettled([
      this.tryEmail(input, settings),
      this.trySlack(input, settings.opsSlackWebhookUrlEnc),
    ]);

    return {
      sentry,
      email: emailResult.status === 'fulfilled' && emailResult.value,
      slack: slackResult.status === 'fulfilled' && slackResult.value,
    };
  }

  private tryCaptureSentry(input: OpsAlertInput): boolean {
    try {
      if (input.error) captureException(input.error, { alertKind: input.kind, ...input.context });
      else captureMessage(input.message, 'error', { alertKind: input.kind, ...input.context });
      return true;
    } catch {
      return false;
    }
  }

  private async recordOccurrence(input: OpsAlertInput): Promise<void> {
    await this.activity
      .log({
        actor: 'SYSTEM',
        action: 'OPS_ALERT_OCCURRED',
        details: { kind: input.kind, message: input.message },
      })
      .catch(() => {});
  }

  private async recordFired(input: OpsAlertInput): Promise<void> {
    await this.activity
      .log({
        actor: 'SYSTEM',
        action: 'OPS_ALERT_FIRED',
        details: { kind: input.kind, message: input.message },
      })
      .catch(() => {});
  }

  /** Rolling-window count of OPS_ALERT_OCCURRED rows for this alert kind — includes
   *  the occurrence just recorded by this same fire() call (recordOccurrence runs
   *  before this is called). */
  private async isOverThreshold(kind: OpsAlertKind, thresholdCount: number, windowMin: number): Promise<boolean> {
    try {
      const since = new Date(Date.now() - windowMin * 60_000);
      const count = await getPrisma().activityLog.count({
        where: { action: 'OPS_ALERT_OCCURRED', createdAt: { gte: since }, details: { contains: `"kind":"${kind}"` } },
      });
      return count >= thresholdCount;
    } catch {
      return false; // unreadable window — do not spam on a DB hiccup
    }
  }

  /** True if an OPS_ALERT_FIRED for this kind already exists within the window —
   *  i.e. we already alerted this window, so suppress a repeat send. */
  private async isInCooldown(kind: OpsAlertKind, windowMin: number): Promise<boolean> {
    try {
      const since = new Date(Date.now() - windowMin * 60_000);
      const count = await getPrisma().activityLog.count({
        where: { action: 'OPS_ALERT_FIRED', createdAt: { gte: since }, details: { contains: `"kind":"${kind}"` } },
      });
      return count > 0;
    } catch {
      return true; // unreadable cooldown state — fail toward suppression, not spam
    }
  }

  private async tryEmail(
    input: OpsAlertInput,
    settings: { enableEmailAlerts: boolean; alertRecipients: string | null },
  ): Promise<boolean> {
    if (!settings.enableEmailAlerts) return false;
    const recipients = (settings.alertRecipients ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.includes('@'));
    if (recipients.length === 0) return false;
    const result = await sendEmail({
      to: recipients,
      subject: `[SuperApp Ops] ${input.kind}: ${input.message}`.slice(0, 200),
      html: `<p><strong>${input.kind}</strong></p><p>${input.message}</p>${
        input.context ? `<pre>${JSON.stringify(input.context, null, 2)}</pre>` : ''
      }`,
      text: `${input.kind}: ${input.message}`,
    });
    return result.sent;
  }

  private async trySlack(input: OpsAlertInput, webhookUrlEnc: string | null): Promise<boolean> {
    if (!webhookUrlEnc) return false;
    let url: string;
    try {
      url = decryptJson<{ url: string }>(webhookUrlEnc).url;
    } catch {
      return false;
    }
    const result = await this.sendSlack(url, `*${input.kind}*: ${input.message}`);
    return result.sent;
  }
}
