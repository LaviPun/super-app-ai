import type {
  Connector,
  ConnectorManifest,
  AuthContext,
  InvokeRequest,
  InvokeResult,
  ValidationResult,
} from '@superapp/core';
import { connectorError, connectorSuccess } from '@superapp/core';

/**
 * Email connector — sends emails via SMTP relay or HTTP-based email API.
 *
 * In production, wire to SendGrid, Postmark, AWS SES, or any SMTP relay.
 * This implementation uses a generic HTTP email API contract.
 */
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
    /**
     * Stub implementation — in production, call SendGrid / Postmark / SES API.
     *
     * ENV vars expected:
     *   EMAIL_API_URL — e.g. https://api.sendgrid.com/v3/mail/send
     *   EMAIL_FROM    — default sender
     *
     * The auth context provides the API key.
     */
    const apiUrl = process.env.EMAIL_API_URL;
    if (!apiUrl) {
      return connectorError('AUTH', 'EMAIL_API_URL not configured. Email connector requires an email service.');
    }

    const apiKey = auth.type === 'api_key' ? auth.apiKey : undefined;
    if (!apiKey) {
      return connectorError('AUTH', 'Email connector requires api_key auth context');
    }

    switch (req.operation) {
      case 'send':
        return this.sendEmail(apiUrl, apiKey, req);
      case 'sendInternal':
        return this.sendInternalNotification(apiUrl, apiKey, req);
      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private async sendEmail(apiUrl: string, apiKey: string, req: InvokeRequest): Promise<InvokeResult> {
    const { to, subject, body, from, replyTo } = req.inputs;
    const defaultFrom = process.env.EMAIL_FROM ?? 'noreply@superapp.ai';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from ?? defaultFrom },
          reply_to: replyTo ? { email: replyTo } : undefined,
          subject,
          content: [{ type: 'text/html', value: body }],
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        return connectorError('RATE_LIMIT', 'Email API rate limited', { retryable: true, retryAfterMs: 5000 });
      }

      if (res.status >= 500) {
        return connectorError('UPSTREAM', `Email API returned ${res.status}`, { retryable: true });
      }

      if (!res.ok) {
        const text = await res.text();
        return connectorError('UPSTREAM', `Email API error: ${text}`);
      }

      const messageId = res.headers.get('x-message-id') ?? `email-${Date.now()}`;
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

  private async sendInternalNotification(apiUrl: string, apiKey: string, req: InvokeRequest): Promise<InvokeResult> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return connectorSuccess({ sent: false });
    }

    return this.sendEmail(apiUrl, apiKey, {
      ...req,
      inputs: { ...req.inputs, to: adminEmail },
    });
  }
}
