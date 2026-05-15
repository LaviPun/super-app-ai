import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';

type EmailProvider = 'sendgrid' | 'generic';

const DEFAULT_SENDGRID_API_URL = 'https://api.sendgrid.com/v3/mail/send';

export class EmailConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'email',
      displayName: 'Email',
      version: '1.0.0',
      description: 'Send transactional emails via configured email service.',
      icon: 'email',
      auth: {
        type: 'api_key',
        tokenStore: 'global',
      },
      operations: [
        {
          name: 'send',
          displayName: 'Send email',
          description: 'Send a transactional email.',
          inputSchema: {
            type: 'object',
            required: ['to', 'subject', 'body'],
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              subject: { type: 'string', maxLength: 500 },
              body: { type: 'string', description: 'HTML or plain text body' },
              from: { type: 'string', description: 'Sender email (defaults to configured sender)' },
              replyTo: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              messageId: { type: 'string' },
              accepted: { type: 'boolean' },
            },
          },
          idempotency: { supported: false },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
        },
        {
          name: 'sendInternal',
          displayName: 'Send internal notification',
          description: 'Send a notification to configured app admin email(s).',
          inputSchema: {
            type: 'object',
            required: ['subject', 'body'],
            properties: {
              subject: { type: 'string' },
              body: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { sent: { type: 'boolean' } },
          },
          idempotency: { supported: false },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    const op = this.manifest().operations.find(o => o.name === operation);
    if (!op) return { ok: false, errors: [{ path: 'operation', message: `Unknown operation: ${operation}` }] };

    const errors: { path: string; message: string }[] = [];
    const required = (op.inputSchema as Record<string, unknown>).required as string[];
    for (const field of required) {
      if (!inputs[field]) errors.push({ path: field, message: `"${field}" is required` });
    }

    if (operation === 'send' && inputs.to && typeof inputs.to === 'string') {
      if (!inputs.to.includes('@')) {
        errors.push({ path: 'to', message: 'Invalid email address' });
      }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    const apiKey = auth.type === 'api_key' ? auth.apiKey : undefined;
    if (!apiKey) {
      return connectorError('AUTH', 'Email connector requires api_key auth context');
    }

    const provider = this.getProvider();
    const apiUrl = this.getApiUrl(provider);
    if (!apiUrl) {
      return connectorError(
        'AUTH',
        'EMAIL_API_URL not configured for generic email provider. Set EMAIL_API_URL or use EMAIL_CONNECTOR_PROVIDER=sendgrid.',
      );
    }

    switch (req.operation) {
      case 'send':
        return this.sendEmail({ provider, apiUrl, apiKey, req });
      case 'sendInternal':
        return this.sendInternalNotification({ provider, apiUrl, apiKey, req });
      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private getProvider(): EmailProvider {
    const configured = process.env.EMAIL_CONNECTOR_PROVIDER;
    if (configured === 'generic') return 'generic';
    if (configured === 'sendgrid') return 'sendgrid';
    return process.env.EMAIL_API_URL ? 'generic' : 'sendgrid';
  }

  private getApiUrl(provider: EmailProvider): string | undefined {
    const configuredUrl = process.env.EMAIL_API_URL?.trim();
    if (provider === 'sendgrid') return configuredUrl || DEFAULT_SENDGRID_API_URL;
    return configuredUrl;
  }

  private buildApiKeyHeader(apiKey: string): Record<string, string> {
    const keyHeader = process.env.EMAIL_API_KEY_HEADER?.trim() || 'Authorization';
    const defaultPrefix = keyHeader.toLowerCase() === 'authorization' ? 'Bearer ' : '';
    const keyPrefix = process.env.EMAIL_API_KEY_PREFIX ?? defaultPrefix;
    return { [keyHeader]: `${keyPrefix}${apiKey}` };
  }

  private parseRetryAfterMs(value: string | null): number | undefined {
    if (!value) return undefined;
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber) || asNumber < 0) return undefined;
    return Math.floor(asNumber * 1000);
  }

  private parseMessageId(responseText: string, headerMessageId: string | null): string {
    if (headerMessageId && headerMessageId.trim()) return headerMessageId.trim();
    if (!responseText) return `email-${Date.now()}`;
    try {
      const parsed = JSON.parse(responseText) as { messageId?: string; id?: string };
      if (parsed.messageId && parsed.messageId.trim()) return parsed.messageId;
      if (parsed.id && parsed.id.trim()) return parsed.id;
    } catch {
      // Ignore parse errors; message id falls back to synthetic id.
    }
    return `email-${Date.now()}`;
  }

  private buildPayload(provider: EmailProvider, inputs: Record<string, unknown>, fromEmail: string): Record<string, unknown> {
    const { to, subject, body, replyTo } = inputs;
    if (provider === 'sendgrid') {
      return {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail },
        reply_to: typeof replyTo === 'string' && replyTo.trim() ? { email: replyTo } : undefined,
        subject,
        content: [{ type: 'text/html', value: body }],
      };
    }

    return {
      to,
      subject,
      body,
      from: fromEmail,
      replyTo: typeof replyTo === 'string' && replyTo.trim() ? replyTo : undefined,
      contentType: 'text/html',
    };
  }

  private async sendEmail({
    provider,
    apiUrl,
    apiKey,
    req,
  }: {
    provider: EmailProvider;
    apiUrl: string;
    apiKey: string;
    req: InvokeRequest;
  }): Promise<InvokeResult> {
    const { to, subject, body, from, replyTo } = req.inputs;
    const defaultFrom = process.env.EMAIL_FROM?.trim();
    const selectedFrom = typeof from === 'string' && from.trim() ? from.trim() : defaultFrom;

    if (!selectedFrom) {
      return connectorError('AUTH', 'Email sender is not configured. Set EMAIL_FROM or provide "from" input.');
    }

    const controller = new AbortController();
    const timeoutMs = Number.isFinite(req.timeoutMs) && req.timeoutMs > 0 ? req.timeoutMs : 15000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const payload = this.buildPayload(provider, { to, subject, body, replyTo }, selectedFrom);

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.buildApiKeyHeader(apiKey),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await res.text();

      if (res.status === 429) {
        return connectorError('RATE_LIMIT', 'Email API rate limited', {
          retryable: true,
          retryAfterMs: this.parseRetryAfterMs(res.headers.get('Retry-After')) ?? 5000,
        });
      }

      if (res.status >= 500) {
        return connectorError('UPSTREAM', `Email API returned ${res.status}`, { retryable: true });
      }

      if (!res.ok) {
        const safeError = responseText.slice(0, 500);
        return connectorError('UPSTREAM', `Email API returned ${res.status}: ${safeError || 'unknown error'}`);
      }

      const messageId = this.parseMessageId(responseText, res.headers.get('x-message-id'));
      return connectorSuccess({ messageId, accepted: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'Email API timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendInternalNotification({
    provider,
    apiUrl,
    apiKey,
    req,
  }: {
    provider: EmailProvider;
    apiUrl: string;
    apiKey: string;
    req: InvokeRequest;
  }): Promise<InvokeResult> {
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    if (!adminEmail) {
      return connectorSuccess({ sent: false });
    }

    return this.sendEmail({
      provider,
      apiUrl,
      apiKey,
      req: {
        ...req,
        inputs: { ...req.inputs, to: adminEmail },
      },
    });
  }
}
