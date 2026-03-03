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
 * Slack connector — posts messages to Slack channels via the Web API.
 * Auth: OAuth (bot token) or API key (webhook URL).
 */
export class SlackConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'slack',
      displayName: 'Slack',
      version: '1.0.0',
      description: 'Post messages to Slack channels.',
      icon: 'slack',
      auth: {
        type: 'oauth',
        scopes: ['chat:write'],
        tokenStore: 'tenant',
      },
      operations: [
        {
          name: 'message.post',
          displayName: 'Post message',
          description: 'Send a text message to a Slack channel.',
          inputSchema: {
            type: 'object',
            required: ['channel', 'text'],
            properties: {
              channel: { type: 'string', description: 'Channel name or ID (e.g. #ops or C12345)' },
              text: { type: 'string', description: 'Message text (supports mrkdwn)' },
              thread_ts: { type: 'string', description: 'Optional thread timestamp to reply in a thread' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              ts: { type: 'string', description: 'Message timestamp' },
              channel: { type: 'string' },
            },
          },
          idempotency: { supported: false },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'], rateLimitStrategy: 'respect-retry-after' },
        },
        {
          name: 'webhook.send',
          displayName: 'Send via Incoming Webhook',
          description: 'Send a message using a Slack Incoming Webhook URL.',
          inputSchema: {
            type: 'object',
            required: ['webhookUrl', 'text'],
            properties: {
              webhookUrl: { type: 'string', description: 'Slack Incoming Webhook URL' },
              text: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
          },
          idempotency: { supported: false },
          retryHints: { retryOn: ['429', '5xx', 'network', 'timeout'] },
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

    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  }

  async invoke(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    switch (req.operation) {
      case 'message.post':
        return this.postMessage(auth, req);
      case 'webhook.send':
        return this.sendWebhook(req);
      default:
        return connectorError('VALIDATION', `Unknown operation: ${req.operation}`);
    }
  }

  private async postMessage(auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (auth.type !== 'oauth') {
      return connectorError('AUTH', 'Slack message.post requires OAuth auth (bot token)');
    }

    const { channel, text, thread_ts } = req.inputs;
    const body: Record<string, unknown> = { channel, text };
    if (thread_ts) body.thread_ts = thread_ts;

    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = await res.json() as Record<string, unknown>;

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        return connectorError('RATE_LIMIT', 'Slack rate limited', {
          retryable: true,
          retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 10000,
        });
      }

      if (json.ok === false) {
        const isRetryable = json.error === 'ratelimited' || json.error === 'internal_error';
        return connectorError('UPSTREAM', `Slack error: ${json.error}`, { retryable: isRetryable });
      }

      return connectorSuccess(
        { ok: true, ts: json.ts, channel: json.channel },
        { statusCode: res.status, meta: { durationMs: Date.now() - start } },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'Slack API timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  private async sendWebhook(req: InvokeRequest): Promise<InvokeResult> {
    const { webhookUrl, text } = req.inputs;

    if (typeof webhookUrl !== 'string' || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return connectorError('VALIDATION', 'webhookUrl must be a valid Slack webhook URL');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return connectorError('UPSTREAM', `Slack webhook returned ${res.status}`, { retryable: res.status >= 500 });
      }

      return connectorSuccess({ ok: true });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return connectorError('TIMEOUT', 'Slack webhook timed out', { retryable: true });
      }
      return connectorError('NETWORK', err instanceof Error ? err.message : String(err), { retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }
}
