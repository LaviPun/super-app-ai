import { getPrisma } from '~/db.server';
import { redact, redactString } from '~/services/observability/redact.server';
import { captureException } from '~/services/observability/sentry.server';
import { getRequestContext } from '~/services/observability/correlation.server';

export type ErrorLogSource = 'API' | 'ERROR_BOUNDARY' | 'CLIENT' | 'SERVER';

export class ErrorLogService {
  async info(message: string, meta?: unknown) {
    await this.write('INFO', message, undefined, meta);
  }

  async warn(message: string, meta?: unknown) {
    await this.write('WARN', message, undefined, meta);
  }

  async error(message: string, stack?: string, meta?: unknown, err?: unknown, source?: ErrorLogSource) {
    await this.write('ERROR', message, stack, meta, undefined, undefined, source);
    if (err) captureException(err, typeof meta === 'object' && meta !== null ? meta as Record<string, string> : undefined);
  }

  /** Source of the error for filtering: API, ERROR_BOUNDARY, CLIENT, SERVER */
  async write(
    level: 'INFO'|'WARN'|'ERROR',
    message: string,
    stack?: string,
    meta?: unknown,
    route?: string,
    shopId?: string,
    source?: ErrorLogSource
  ) {
    if (process.env.NODE_ENV === 'test') return;

    try {
      const prisma = getPrisma();
      const ctx = getRequestContext();
      await prisma.errorLog.create({
        data: {
          level,
          message: redactString(message),
          stack: stack ? redactString(stack) : null,
          meta: meta ? JSON.stringify(redact(meta)) : null,
          route: route ?? null,
          shop: shopId ? { connect: { id: shopId } } : undefined,
          source: source ?? null,
          requestId: ctx?.requestId ?? null,
          correlationId: ctx?.correlationId ?? null,
        },
      });
    } catch {
      // Logging failures must not crash the main request
    }
  }
}
