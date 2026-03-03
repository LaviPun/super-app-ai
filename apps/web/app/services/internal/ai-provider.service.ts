import { getPrisma } from '~/db.server';
import { encryptJson, decryptJson } from '~/services/security/crypto.server';

export type ProviderKind = 'OPENAI' | 'ANTHROPIC' | 'AZURE_OPENAI' | 'CUSTOM';

export type AiProviderInput = {
  name: string;
  provider: ProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey: string;
  costInPer1kCents?: number;
  costOutPer1kCents?: number;
  isActive?: boolean;
};

export class AiProviderService {
  async list() {
    const prisma = getPrisma();
    return prisma.aiProvider.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async create(input: AiProviderInput) {
    const prisma = getPrisma();
    const data = {
      name: input.name,
      provider: input.provider,
      baseUrl: input.baseUrl ?? null,
      model: input.model ?? null,
      apiKeyEnc: encryptJson({ apiKey: input.apiKey }),
      costInPer1kCents: input.costInPer1kCents ?? null,
      costOutPer1kCents: input.costOutPer1kCents ?? null,
      isActive: Boolean(input.isActive),
    };

    if (data.isActive) await prisma.aiProvider.updateMany({ data: { isActive: false } });

    return prisma.aiProvider.create({ data });
  }

  async setActive(id: string) {
    const prisma = getPrisma();
    await prisma.aiProvider.updateMany({ data: { isActive: false } });
    return prisma.aiProvider.update({ where: { id }, data: { isActive: true } });
  }

  async getActive() {
    const prisma = getPrisma();
    return prisma.aiProvider.findFirst({ where: { isActive: true } });
  }

  async getApiKey(id: string): Promise<string> {
    const prisma = getPrisma();
    const p = await prisma.aiProvider.findUnique({ where: { id } });
    if (!p) throw new Error('Provider not found');
    const d = decryptJson<{ apiKey: string }>(p.apiKeyEnc);
    return d.apiKey;
  }
}
