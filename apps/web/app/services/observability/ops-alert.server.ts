import { getPrisma } from '~/db.server';
import { captureException, captureMessage } from '~/services/observability/sentry.server';
import { sendEmail } from '~/services/notifications/mailer.server';
import { decryptJson } from '~/services/security/crypto.server';
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
 * Single fan-out point for ops alerting (Decision G1): Sentry + email + Slack.
 * Sentry fires unconditionally on every alert with an error (Decision G3);
 * email/Slack are gated behind a rolling-window failure-count threshold read
 * from AppSettings, and degrade independently via Promise.allSettled (G2) —
 * a Slack failure must never block the email send, and vice versa.
 */
export class OpsAlertService {
  private readonly sendSlack: SlackSender;

  constructor(deps: { sendSlack?: SlackSender } = {}) {
    this.sendSlack = deps.sendSlack ?? sendSlackAlert;
  }

  /** Fire-and-forget-safe: never throws. Sentry unconditional; email/Slack gated by rolling-window threshold. */
  async fire(input: OpsAlertInput): Promise<{ sentry: boolean; email: boolean; slack: boolean }> {
    const sentry = this.tryCaptureSentry(input);

    let settings: {
      enableEmailAlerts: boolean;
      alertRecipients: string | null;
      opsSlackWebhookUrlEnc: string | null;
      opsAlertThresholdCount: number;
      opsAlertThresholdWindowMin: number;
    } | null = null;
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

    const [emailResult, slackResult] = await Promise.allSettled([
      this.tryEmail(input, settings),
      this.trySlack(input, settings.opsSlackWebhookUrlEnc),
    ]);

    // Record the fire itself so the next window's threshold count includes it.
    await getPrisma()
      .activityLog.create({
        data: {
          actor: 'SYSTEM',
          action: 'OPS_ALERT_FIRED',
          details: JSON.stringify({ kind: input.kind, message: input.message }),
        },
      })
      .catch(() => {});

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

  /** Rolling-window count of this alert kind already fired via ActivityLog OPS_ALERT_FIRED,
   *  PLUS this occurrence — mirrors JobService/ApiLog style best-effort counting. */
  private async isOverThreshold(kind: OpsAlertKind, thresholdCount: number, windowMin: number): Promise<boolean> {
    try {
      const since = new Date(Date.now() - windowMin * 60_000);
      const count = await getPrisma().activityLog.count({
        where: { action: 'OPS_ALERT_FIRED', createdAt: { gte: since }, details: { contains: `"kind":"${kind}"` } },
      });
      return count + 1 >= thresholdCount;
    } catch {
      return false; // unreadable window — do not spam on a DB hiccup
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
