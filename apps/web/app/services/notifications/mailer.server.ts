/**
 * Transactional mailer for app-side notifications (support alerts, etc.).
 *
 * Configuration is resolved DB-first: the AppSettings singleton row supplies the
 * provider, sender and credentials (secrets stored AES-GCM-encrypted via
 * encryptJson). Any DB field left null falls back to the matching EMAIL_* env var,
 * so a deployment can be configured entirely from the admin UI, entirely from the
 * environment, or a mix of both.
 *
 * Providers:
 *   smtp     — real SMTP via nodemailer (host/port/secure/user/pass)
 *   sendgrid — SendGrid v3 mail/send over raw fetch
 *   generic  — any JSON HTTP email API over raw fetch
 *
 * Env fallbacks (used only when the corresponding DB field is null):
 *   EMAIL_CONNECTOR_PROVIDER  'sendgrid' (default) | 'generic'  (env has no 'smtp')
 *   EMAIL_API_URL             endpoint (default https://api.sendgrid.com/v3/mail/send;
 *                             required for the generic provider)
 *   EMAIL_API_KEY             API key (required for fetch providers — unset ⇒ disabled)
 *   EMAIL_API_KEY_HEADER      header name for the key (default Authorization)
 *   EMAIL_API_KEY_PREFIX      value prefix (default "Bearer " for Authorization, else "")
 *   EMAIL_FROM                sender address (required — unset ⇒ mailer disabled)
 *
 * Contract: never throws. Returns { sent: false, error } on any misconfiguration,
 * timeout, or upstream failure so callers can treat email as strictly best-effort.
 */

import nodemailer from 'nodemailer';
import { getPrisma } from '~/db.server';
import { decryptJson } from '~/services/security/crypto.server';

type EmailProvider = 'smtp' | 'sendgrid' | 'generic';

const DEFAULT_SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 15_000;

export interface SendEmailInput {
  /** One or more recipient addresses. */
  to: string | string[];
  subject: string;
  html: string;
  /** Optional plain-text alternative. */
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  error?: string;
}

/** Fully resolved delivery config (DB-first, env fallback). */
interface ResolvedMailerConfig {
  provider: EmailProvider;
  from: string | null;
  // fetch providers
  apiUrl: string | null;
  apiKey: string | null;
  // smtp provider
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPass: string | null;
}

/** Shape of the AppSettings email columns we read. */
interface EmailSettingsRow {
  emailProvider: string | null;
  emailFrom: string | null;
  emailApiUrl: string | null;
  emailApiKeyEnc: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassEnc: string | null;
  smtpSecure: boolean;
}

function envStr(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

/** Decrypt an encrypted { apiKey } / { pass } blob; null on any failure so a bad
 * ciphertext or missing ENCRYPTION_KEY degrades to "unconfigured", never throws. */
function tryDecrypt<T>(ciphertext: string | null, field: keyof T): string | null {
  if (!ciphertext) return null;
  try {
    const decoded = decryptJson<Record<string, unknown>>(ciphertext);
    const value = decoded[field as string];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Load the AppSettings email columns; null on any DB error (missing row/table). */
async function loadEmailSettings(): Promise<EmailSettingsRow | null> {
  try {
    const row = await getPrisma().appSettings.findUnique({
      where: { id: 'singleton' },
      select: {
        emailProvider: true,
        emailFrom: true,
        emailApiUrl: true,
        emailApiKeyEnc: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpPassEnc: true,
        smtpSecure: true,
      },
    });
    return row ?? null;
  } catch {
    return null;
  }
}

/** Env-only provider inference, mirroring the workflow EmailConnector. */
function resolveEnvProvider(): EmailProvider {
  const configured = process.env.EMAIL_CONNECTOR_PROVIDER?.trim().toLowerCase();
  if (configured === 'generic') return 'generic';
  if (configured === 'sendgrid') return 'sendgrid';
  // A bare EMAIL_API_URL implies a generic endpoint.
  return envStr('EMAIL_API_URL') ? 'generic' : 'sendgrid';
}

/** Resolve full config: each field is DB value if set, else env fallback. */
async function resolveConfig(): Promise<ResolvedMailerConfig> {
  const row = await loadEmailSettings();

  const dbProvider = row?.emailProvider?.trim().toLowerCase();
  const provider: EmailProvider =
    dbProvider === 'smtp' || dbProvider === 'sendgrid' || dbProvider === 'generic'
      ? dbProvider
      : resolveEnvProvider();

  const from = (row?.emailFrom?.trim() || null) ?? envStr('EMAIL_FROM');

  const apiUrlRaw = (row?.emailApiUrl?.trim() || null) ?? envStr('EMAIL_API_URL');
  const apiUrl =
    provider === 'sendgrid' ? apiUrlRaw ?? DEFAULT_SENDGRID_API_URL : apiUrlRaw;
  const apiKey = tryDecrypt<{ apiKey: string }>(row?.emailApiKeyEnc ?? null, 'apiKey') ?? envStr('EMAIL_API_KEY');

  return {
    provider,
    from,
    apiUrl,
    apiKey,
    smtpHost: (row?.smtpHost?.trim() || null) ?? envStr('SMTP_HOST'),
    smtpPort: row?.smtpPort ?? (envStr('SMTP_PORT') ? Number(envStr('SMTP_PORT')) : null),
    // smtpSecure defaults true in the DB; env SMTP_SECURE='false' can override when DB has no row.
    smtpSecure: row ? row.smtpSecure : envStr('SMTP_SECURE') !== 'false',
    smtpUser: (row?.smtpUser?.trim() || null) ?? envStr('SMTP_USER'),
    smtpPass: tryDecrypt<{ pass: string }>(row?.smtpPassEnc ?? null, 'pass') ?? envStr('SMTP_PASS'),
  };
}

function buildAuthHeader(apiKey: string): Record<string, string> {
  const keyHeader = process.env.EMAIL_API_KEY_HEADER?.trim() || 'Authorization';
  const defaultPrefix = keyHeader.toLowerCase() === 'authorization' ? 'Bearer ' : '';
  const keyPrefix = process.env.EMAIL_API_KEY_PREFIX ?? defaultPrefix;
  return { [keyHeader]: `${keyPrefix}${apiKey}` };
}

function buildFetchPayload(
  provider: 'sendgrid' | 'generic',
  recipients: string[],
  from: string,
  input: SendEmailInput,
): Record<string, unknown> {
  if (provider === 'sendgrid') {
    const content: { type: string; value: string }[] = [];
    // SendGrid requires text/plain before text/html when both are present.
    if (input.text) content.push({ type: 'text/plain', value: input.text });
    content.push({ type: 'text/html', value: input.html });
    return {
      personalizations: [{ to: recipients.map((email) => ({ email })) }],
      from: { email: from },
      subject: input.subject,
      content,
    };
  }
  return {
    to: recipients.length === 1 ? recipients[0] : recipients,
    from,
    subject: input.subject,
    html: input.html,
    text: input.text,
    contentType: 'text/html',
  };
}

async function sendViaFetch(
  provider: 'sendgrid' | 'generic',
  config: ResolvedMailerConfig,
  recipients: string[],
  from: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!config.apiKey) return { sent: false, error: 'mailer not configured' };
  if (!config.apiUrl) return { sent: false, error: 'EMAIL_API_URL not configured for generic provider' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeader(config.apiKey) },
      body: JSON.stringify(buildFetchPayload(provider, recipients, from, input)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300);
      return { sent: false, error: `email upstream ${res.status}${body ? `: ${body}` : ''}` };
    }
    return { sent: true };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { sent: false, error: `email send timed out after ${SEND_TIMEOUT_MS}ms` };
    }
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSmtp(
  config: ResolvedMailerConfig,
  recipients: string[],
  from: string,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  if (!config.smtpHost) return { sent: false, error: 'mailer not configured' };
  const port = config.smtpPort ?? (config.smtpSecure ? 465 : 587);
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass ?? '' } : undefined,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
    await transporter.sendMail({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Sends one email. Never throws. Config is resolved DB-first with env fallback.
 * When no sender (EMAIL_FROM / emailFrom) or provider credentials are available
 * the mailer is disabled: returns { sent: false, error: 'mailer not configured' }
 * after a single console.warn.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = await resolveConfig();

  if (!config.from) {
    console.warn('[mailer] not configured (no sender address — emailFrom/EMAIL_FROM unset) — skipping email send');
    return { sent: false, error: 'mailer not configured' };
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((r) => r.trim())
    .filter((r) => r.includes('@'));
  if (recipients.length === 0) return { sent: false, error: 'no valid recipients' };

  if (config.provider === 'smtp') {
    const result = await sendViaSmtp(config, recipients, config.from, input);
    if (!result.sent && result.error === 'mailer not configured') {
      console.warn('[mailer] SMTP selected but smtpHost is unset — skipping email send');
    }
    return result;
  }

  const result = await sendViaFetch(config.provider, config, recipients, config.from, input);
  if (!result.sent && result.error === 'mailer not configured') {
    console.warn('[mailer] not configured (no API key — emailApiKeyEnc/EMAIL_API_KEY unset) — skipping email send');
  }
  return result;
}

export interface MailerStatus {
  configured: boolean;
  provider: string | null;
  from: string | null;
}

/**
 * Report whether the mailer is currently able to send, for the admin UI.
 * "configured" means a sender address plus the credentials the selected provider
 * needs (SMTP host, or an API key for the fetch providers) are present.
 */
export async function resolveMailerStatus(): Promise<MailerStatus> {
  const config = await resolveConfig();
  const hasCreds =
    config.provider === 'smtp' ? !!config.smtpHost : !!config.apiKey;
  return {
    configured: !!config.from && hasCreds,
    provider: config.provider,
    from: config.from,
  };
}
