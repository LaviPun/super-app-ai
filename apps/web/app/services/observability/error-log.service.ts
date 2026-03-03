import { getPrisma } from '~/db.server';
import { redact, redactString } from '~/services/observability/redact.server';
import { captureException } from '~/services/observability/sentry.server';

export class ErrorLogService {
  async info(message: string, meta?: unknown) {
    await this.write('INFO', message, undefined, meta);
  }

  async warn(message: string, meta?: unknown) {
    await this.write('WARN', message, undefined, meta);
  }

  async error(message: string, stack?: string, meta?: unknown, err?: unknown) {
    await this.write('ERROR', message, stack, meta);
    if (err) captureException(err, typeof meta === 'object' && meta !== null ? meta as Record<string, string> : undefined);
  }

  async write(level: 'INFO'|'WARN'|'ERROR', message: string, stack?: string, meta?: unknown, route?: string, shopId?: string) {
    if (process.env.NODE_ENV === 'test') return;

    const prisma = getPrisma();
    await prisma.errorLog.create({
      data: {
        level,
        message: redactString(message),
        stack: stack ? redactString(stack) : null,
        meta: meta ? JSON.stringify(redact(meta)) : null,
        route: route ?? null,
        shopId: shopId ?? null,
      },
    });
  }
}
