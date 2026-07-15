/**
 * Minimal transactional mailer for app-side notifications (support alerts, etc.).
 *
 * Mirrors the env conventions of the workflow EmailConnector
 * (services/workflows/connectors/email.connector.ts) so a single provider config
 * powers both. Raw `fetch` only — no SDK dependency.
 *
 * Env:
 *   EMAIL_CONNECTOR_PROVIDER  'sendgrid' (default) | 'generic'
 *   EMAIL_API_URL             endpoint (default https://api.sendgrid.com/v3/mail/send;
 *                             required for the generic provider)
 *   EMAIL_API_KEY             API key (required — unset ⇒ mailer disabled)
 *   EMAIL_API_KEY_HEADER      header name for the key (default Authorization)
 *   EMAIL_API_KEY_PREFIX      value prefix (default "Bearer " for Authorization, else "")
 *   EMAIL_FROM                sender address (required — unset ⇒ mailer disabled)
 *
 * Contract: never throws. Returns { sent: false, error } on any misconfiguration,
 * timeout, or upstream failure so callers can treat email as strictly best-effort.
 */

type EmailProvider = 'sendgrid' | 'generic';

const DEFAULT_SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';
const SEND_TIMEOUT_MS = 10_000;

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

function resolveProvider(): EmailProvider {
  const configured = process.env.EMAIL_CONNECTOR_PROVIDER?.trim().toLowerCase();
  if (configured === 'generic') return 'generic';
  if (configured === 'sendgrid') return 'sendgrid';
  // Match the connector's inference: a bare EMAIL_API_URL implies a generic endpoint.
  return process.env.EMAIL_API_URL?.trim() ? 'generic' : 'sendgrid';
}

function resolveApiUrl(provider: EmailProvider): string | undefined {
  const configured = process.env.EMAIL_API_URL?.trim();
  if (provider === 'sendgrid') return configured || DEFAULT_SENDGRID_API_URL;
  return configured;
}

function buildAuthHeader(apiKey: string): Record<string, string> {
  const keyHeader = process.env.EMAIL_API_KEY_HEADER?.trim() || 'Authorization';
  const defaultPrefix = keyHeader.toLowerCase() === 'authorization' ? 'Bearer ' : '';
  const keyPrefix = process.env.EMAIL_API_KEY_PREFIX ?? defaultPrefix;
  return { [keyHeader]: `${keyPrefix}${apiKey}` };
}

function buildPayload(
  provider: EmailProvider,
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

/**
 * Sends one email. Never throws. When EMAIL_API_KEY or EMAIL_FROM is unset the
 * mailer is considered disabled: returns { sent: false, error: 'mailer not
 * configured' } after a single console.warn (so a missing-config environment
 * doesn't spam logs on every attempt beyond the one-line notice per send).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.EMAIL_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn('[mailer] not configured (EMAIL_API_KEY and/or EMAIL_FROM unset) — skipping email send');
    return { sent: false, error: 'mailer not configured' };
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((r) => r.trim())
    .filter((r) => r.includes('@'));
  if (recipients.length === 0) return { sent: false, error: 'no valid recipients' };

  const provider = resolveProvider();
  const apiUrl = resolveApiUrl(provider);
  if (!apiUrl) return { sent: false, error: 'EMAIL_API_URL not configured for generic provider' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeader(apiKey) },
      body: JSON.stringify(buildPayload(provider, recipients, from, input)),
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
