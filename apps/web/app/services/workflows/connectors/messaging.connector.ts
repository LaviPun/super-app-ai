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
        {
          name: 'sendDripStep',
          displayName: 'Send drip step',
          description: 'Deliver one step of a multi-step drip sequence, then park the next step.',
          inputSchema: {
            type: 'object',
            required: ['moduleId', 'stepIndex', 'dripToken', 'trigger'],
            properties: {
              moduleId: { type: 'string', description: 'The messaging.campaign module id.' },
              stepIndex: { type: 'number', description: 'The drip step index to deliver (1-based).' },
              dripToken: { type: 'string', description: 'Stable per-enrolment id.' },
              trigger: { type: 'string', description: 'The entry trigger that started the sequence.' },
              entryEvent: { type: 'object', description: 'Snapshot of the entry event (the recipient).' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              sent: { type: 'number' },
              failed: { type: 'number' },
              skipped: { type: 'number' },
              parkedNextStep: { type: 'number' },
            },
          },
          idempotency: { supported: true, keyHint: 'moduleId + dripToken + stepIndex' },
        },
      ],
    };
  }

  validate(operation: string, inputs: Record<string, unknown>): ValidationResult {
    if (operation === 'sendPage') {
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
    if (operation === 'sendDripStep') {
      const errors = [];
      if (typeof inputs.moduleId !== 'string' || !inputs.moduleId) {
        errors.push({ path: 'moduleId', message: 'moduleId (string) is required' });
      }
      if (typeof inputs.dripToken !== 'string' || !inputs.dripToken) {
        errors.push({ path: 'dripToken', message: 'dripToken (string) is required' });
      }
      if (!Number.isFinite(Number(inputs.stepIndex))) {
        errors.push({ path: 'stepIndex', message: 'stepIndex (number) is required' });
      }
      return errors.length ? { ok: false, errors } : { ok: true };
    }
    return { ok: false, errors: [{ path: 'operation', message: `Unknown operation "${operation}"` }] };
  }

  async invoke(_auth: AuthContext, req: InvokeRequest): Promise<InvokeResult> {
    if (req.operation === 'sendPage') return this.invokeSendPage(req);
    if (req.operation === 'sendDripStep') return this.invokeSendDripStep(req);
    return connectorError('VALIDATION', `Unknown operation "${req.operation}"`);
  }

  private async invokeSendPage(req: InvokeRequest): Promise<InvokeResult> {
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

  private async invokeSendDripStep(req: InvokeRequest): Promise<InvokeResult> {
    const moduleId = String(req.inputs.moduleId ?? '');
    const dripToken = String(req.inputs.dripToken ?? '');
    const stepIndex = Number(req.inputs.stepIndex ?? 0);
    const trigger = String(req.inputs.trigger ?? 'SCHEDULED');
    const entryEvent = req.inputs.entryEvent ?? {};
    if (!moduleId || !dripToken || !Number.isFinite(stepIndex)) {
      return connectorError('VALIDATION', 'sendDripStep requires moduleId, dripToken and a numeric stepIndex');
    }

    const { MessagingRunnerService } = await import('~/services/messaging/messaging-runner.service');
    const { getPrisma } = await import('~/db.server');

    const shop = await getPrisma().shop.findUnique({ where: { id: req.tenantId } });
    if (!shop) {
      return connectorError('NOT_FOUND', `Shop ${req.tenantId} not found for messaging drip resume`);
    }

    try {
      const result = await new MessagingRunnerService().runDripStep(shop.shopDomain, moduleId, {
        stepIndex,
        dripToken,
        trigger: trigger as never,
        entryEvent,
      });
      return connectorSuccess({
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        parkedNextStep: result.parkedNextStep ?? -1,
      });
    } catch (err) {
      return connectorError('UPSTREAM', err instanceof Error ? err.message : String(err), { retryable: true });
    }
  }
}
