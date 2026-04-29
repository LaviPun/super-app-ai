import { getPrisma } from '~/db.server';

type AiAccountInfo = {
  accountName?: string;
  accountEmail?: string;
  accountId?: string;
  dashboardUrl?: string;
};

type AiBillingInfo = {
  currentBalanceUsd?: number;
  dailyLimitUsd?: number;
  alertLimitUsd?: number;
  currency?: string;
};

type AiProviderExtraConfig = {
  account?: AiAccountInfo;
  billing?: AiBillingInfo;
  skills?: string[];
  codeExecution?: boolean;
};

type ProviderAccountSnapshot = {
  providerId: string;
  providerName: string;
  providerKind: string;
  model: string | null;
  isActive: boolean;
  accountName: string | null;
  accountEmail: string | null;
  accountId: string | null;
  dashboardUrl: string | null;
  currency: string;
  currentBalanceUsd: number | null;
  dailyLimitUsd: number | null;
  alertLimitUsd: number | null;
  spend24hUsd: number;
  spend7dUsd: number;
  request24h: number;
  request7d: number;
  remainingDailyUsd: number | null;
  remainingBalanceUsd: number | null;
};

function parseExtraConfig(extraConfig: string | null): AiProviderExtraConfig {
  if (!extraConfig) return {};
  try {
    return JSON.parse(extraConfig) as AiProviderExtraConfig;
  } catch {
    return {};
  }
}

function toUsd(cents: number): number {
  return cents / 100;
}

export class AiAccountObservabilityService {
  async listProviderAccountSnapshots(): Promise<ProviderAccountSnapshot[]> {
    const prisma = getPrisma();
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const providers = await prisma.aiProvider.findMany({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });

    const snapshots = await Promise.all(
      providers.map(async (provider) => {
        const [agg24h, agg7d] = await Promise.all([
          prisma.aiUsage.aggregate({
            where: { providerId: provider.id, createdAt: { gte: since24h } },
            _sum: { costCents: true, requestCount: true },
          }),
          prisma.aiUsage.aggregate({
            where: { providerId: provider.id, createdAt: { gte: since7d } },
            _sum: { costCents: true, requestCount: true },
          }),
        ]);

        const parsed = parseExtraConfig(provider.extraConfig);
        const spend24hUsd = toUsd(agg24h._sum.costCents ?? 0);
        const spend7dUsd = toUsd(agg7d._sum.costCents ?? 0);
        const dailyLimitUsd = parsed.billing?.dailyLimitUsd ?? null;
        const balanceUsd = parsed.billing?.currentBalanceUsd ?? null;

        return {
          providerId: provider.id,
          providerName: provider.name,
          providerKind: provider.provider,
          model: provider.model,
          isActive: provider.isActive,
          accountName: parsed.account?.accountName ?? null,
          accountEmail: parsed.account?.accountEmail ?? null,
          accountId: parsed.account?.accountId ?? null,
          dashboardUrl: parsed.account?.dashboardUrl ?? null,
          currency: parsed.billing?.currency ?? 'USD',
          currentBalanceUsd: balanceUsd,
          dailyLimitUsd,
          alertLimitUsd: parsed.billing?.alertLimitUsd ?? null,
          spend24hUsd,
          spend7dUsd,
          request24h: agg24h._sum.requestCount ?? 0,
          request7d: agg7d._sum.requestCount ?? 0,
          remainingDailyUsd: dailyLimitUsd == null ? null : Math.max(0, dailyLimitUsd - spend24hUsd),
          remainingBalanceUsd: balanceUsd == null ? null : Math.max(0, balanceUsd - spend7dUsd),
        } satisfies ProviderAccountSnapshot;
      }),
    );

    return snapshots;
  }

  async updateProviderAccount(
    providerId: string,
    payload: {
      accountName?: string;
      accountEmail?: string;
      accountId?: string;
      dashboardUrl?: string;
      currentBalanceUsd?: number | null;
      dailyLimitUsd?: number | null;
      alertLimitUsd?: number | null;
      currency?: string;
    },
  ) {
    const prisma = getPrisma();
    const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new Error('Provider not found');

    const current = parseExtraConfig(provider.extraConfig);
    const next: AiProviderExtraConfig = {
      ...current,
      account: {
        ...(current.account ?? {}),
        accountName: payload.accountName?.trim() || undefined,
        accountEmail: payload.accountEmail?.trim() || undefined,
        accountId: payload.accountId?.trim() || undefined,
        dashboardUrl: payload.dashboardUrl?.trim() || undefined,
      },
      billing: {
        ...(current.billing ?? {}),
        currentBalanceUsd: payload.currentBalanceUsd ?? undefined,
        dailyLimitUsd: payload.dailyLimitUsd ?? undefined,
        alertLimitUsd: payload.alertLimitUsd ?? undefined,
        currency: payload.currency?.trim() || current.billing?.currency || 'USD',
      },
    };

    await prisma.aiProvider.update({
      where: { id: providerId },
      data: { extraConfig: JSON.stringify(next) },
    });
  }
}
