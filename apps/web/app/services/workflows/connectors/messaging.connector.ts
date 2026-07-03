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
 * Messaging connector — the ONE operation the durable scheduler fires to send the
 * NEXT page of a paged campaign fan-out (R3.4 cross-run paging on R3.5).
 *
 * A campaign whose audience exceeds one bounded batch parks the remainder as a
 * WorkflowRun (see messaging-page-park.ts). The existing cron resume sweep
 * (`resumeDueWorkflowRuns`) fires this action node once due; `invoke` re-enters the
 * MessagingRunnerService for that page, which sends up to `batchSize` recipients and
 * parks the page after if the list is still not exhausted.
 *
 * This is deliberately thin: it is a resume seam, NOT a second delivery path. All
 * real sending (the EmailConnector/SlackConnector calls, consent, rule-engine,
 * sent-marker dedupe) lives in the runner. The runner is imported LAZILY to avoid a
 * connector↔runner import cycle (StorageConnector reaches DataStoreService the same
 * way).
 */
export class MessagingConnector implements Connector {
  manifest(): ConnectorManifest {
    return {
      provider: 'messaging',
      displayName: 'SuperApp Messaging',
      version: '1.0.0',
      description:
        'Sends the next page of a paged messaging campaign fan-out. Fired by the durable scheduler on resume; not authored directly.',
      icon: 'send',
      auth: { type: 'none' },
      operations: [
        {
          name: 'sendPage',
          displayName: 'Send campaign page',
          description: 'Send one bounded page of a campaign audience, starting at a durable cursor offset.',
          inputSchema: {
            type: 'object',
            required: ['moduleId', 'offset', 'runToken', 'trigger'],
            properties: {
              moduleId: { type: 'string', description: 'The messaging.campaign module id.' },
              offset: { type: 'number', description: 'DataStore cursor offset this page starts at.' },
              runToken: { type: 'string', description: 'Stable per-fan-out id (the sent-marker dedupe key).' },
              trigger: { type: 'string', description: 'The trigger that started the fan-out.' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              sent: { type: 'number' },
              failed: { type: 'number' },
              skipped: { type: 'number' },
              total: { type: 'number' },
              paged: { type: 'boolean' },
              parkedNextOffset: { type: 'number' },
            },
          },
          idempotency: { supported: true, keyHint: 'moduleId + runToken + offset (durable cursor)' },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    if (operation !== 'sendPage') {
      return { ok: false, errors: [{ path: 'operation', message: `Unknown operation "${operation}"` }] };
    }
    const errors = [];
    if (typeof inputs.moduleId !== 'string' || !inputs.moduleId) {
      errors.push({ path: 'moduleId', message: 'moduleId (string) is required' });
    }
    if (typeof inputs.runToken !== 'string' || !inputs.runToken) {
      errors.push({ path: 'runToken', message: 'runToken (string) is required' });
    }
    if (!Number.isFinite(Number(inputs.offset))) {
      errors.push({ path: 'offset', message: 'offset (number) is required' });
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  async invoke(_auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (req.operation !== 'sendPage') {
      return connectorError('VALIDATION', `Unknown operation "${req.operation}"`);
    }
    const moduleId = String(req.inputs.moduleId ?? '');
    const runToken = String(req.inputs.runToken ?? '');
    const offset = Number(req.inputs.offset ?? 0);
    const trigger = String(req.inputs.trigger ?? 'SCHEDULED');
    if (!moduleId || !runToken || !Number.isFinite(offset)) {
      return connectorError('VALIDATION', 'sendPage requires moduleId, runToken and a numeric offset');
    }

    // tenantId on a resumed WorkflowRun is the shopId; the runner needs a shopDomain.
    // Lazy import breaks the connector↔runner cycle.
    const { MessagingRunnerService } = await import('~/services/messaging/messaging-runner.service');
    const { getPrisma } = await import('~/db.server');

    const shop = await getPrisma().shop.findUnique({ where: { id: req.tenantId } });
    if (!shop) {
      return connectorError('NOT_FOUND', `Shop ${req.tenantId} not found for messaging page resume`);
    }

    try {
      const result = await new MessagingRunnerService().runCampaignPage(shop.shopDomain, moduleId, {
        offset,
        runToken,
        trigger: trigger as never,
      });
      return connectorSuccess({
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        total: result.total,
        paged: result.paged,
        parkedNextOffset: result.parkedNextOffset ?? -1,
      });
    } catch (err) {
      return connectorError('UPSTREAM', err instanceof Error ? err.message : String(err), { retryable: true });
    }
  }
}
