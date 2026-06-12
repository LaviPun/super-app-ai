import { getPrisma } from '~/db.server';

type EstimateCostOptions = {
  providerId?: string | null;
  providerKinds?: string[];
  model: string;
  tokensIn: number;
  tokensOut: number;
};

export async function estimateCostCentsFromDbRates(options: EstimateCostOptions): Promise<number> {
  const model = options.model?.trim();
  if (!model) return 0;

  const prisma = getPrisma();
  const where =
    options.providerId && options.providerId.trim()
      ? {
          providerId: options.providerId.trim(),
          model,
          isActive: true,
        }
      : {
          model,
          isActive: true,
          provider:
            options.providerKinds && options.providerKinds.length > 0
              ? { provider: { in: options.providerKinds }, isActive: true }
              : undefined,
        };

  const price = await prisma.aiModelPrice.findFirst({
    where,
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!price) return 0;

  const inCents = (options.tokensIn / 1_000_000) * price.inputPer1MTokensCents;
  const outCents = (options.tokensOut / 1_000_000) * price.outputPer1MTokensCents;
  return Math.round(inCents + outCents);
}

export function providerKindsForAssistantBackend(backend: string): string[] {
  switch (backend) {
    case 'openai':
      return ['OPENAI'];
    case 'anthropic':
      return ['ANTHROPIC'];
    case 'qwen3':
      return ['CUSTOM', 'OPENAI'];
    case 'ollama':
      return ['CUSTOM'];
    case 'custom':
      return ['CUSTOM', 'OPENAI', 'ANTHROPIC', 'AZURE_OPENAI'];
    default:
      return ['CUSTOM', 'OPENAI', 'ANTHROPIC', 'AZURE_OPENAI'];
  }
}
