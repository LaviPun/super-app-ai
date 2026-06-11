import { ConnectorJobPayloadSchema } from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { assertSafeTargetUrl } from '@superapp/security';
import { failureResult, successResult } from './handler-utils.js';

export function createConnectorHandler(): JobHandler {
  return async (job) => {
    const parsed = ConnectorJobPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      return failureResult(job, 'connector', {
        code: 'INVALID_CONNECTOR_PAYLOAD',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }, 'Connector worker rejected invalid payload');
    }

    const payload = parsed.data;
    const allowlist =
      payload.allowlistDomains.length > 0
        ? payload.allowlistDomains
        : [new URL(payload.baseUrl).hostname];

    try {
      await assertSafeTargetUrl(payload.baseUrl, {
        allowedHostnames: allowlist,
        context: 'Connector base URL',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSRF validation failed';
      return failureResult(job, 'connector', {
        code: 'CONNECTOR_SSRF_BLOCKED',
        message,
      }, 'Connector SSRF validation failed');
    }

    return successResult(
      job,
      'connector',
      {
        jobId: payload.jobId,
        shopId: payload.shopId,
        connectorId: payload.connectorId,
        operation: payload.operation,
        validated: true,
        baseUrl: payload.baseUrl,
        status: payload.operation === 'CONNECTOR_TEST' ? 'reachable' : 'queued_for_sync',
      },
      `Connector ${payload.operation} validated`,
    );
  };
}
