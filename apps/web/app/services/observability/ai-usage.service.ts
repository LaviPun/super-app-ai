import { getPrisma } from '~/db.server';

export class AiUsageService {
  async record(params: {
    providerId: string;
    shopId?: string;
    action: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    requestCount?: number;
    meta?: unknown;
  }) {
    const prisma = getPrisma();
    await prisma.aiUsage.create({
      data: {
        providerId: params.providerId,
        shopId: params.shopId ?? null,
        action: params.action,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        costCents: params.costCents,
        requestCount: params.requestCount ?? 1,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      },
    });
  }
}
