import { getPrisma } from '~/db.server';
import { encryptJson, decryptJson } from '~/services/security/crypto.server';

export type ProviderKind = 'OPENAI' | 'ANTHROPIC' | 'AZURE_OPENAI' | 'CUSTOM';

/** JSON stored in AiProvider.extraConfig for ANTHROPIC: skills list and code execution flag. */
export type AnthropicExtraConfig = {
  skills?: string[];
  codeExecution?: boolean;
};

export type AiProviderInput = {
  name: string;
  provider: ProviderKind;
  baseUrl?: string;
  model?: string;
  apiKey: string;
  costInPer1kCents?: number;
  costOutPer1kCents?: number;
  isActive?: boolean;
  /** ANTHROPIC-only: { skills?, codeExecution? } stored as JSON */
  extraConfig?: AnthropicExtraConfig | null;
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
      extraConfig: input.extraConfig ? JSON.stringify(input.extraConfig) : null,
    };

    if (data.isActive) await prisma.aiProvider.updateMany({ data: { isActive: false } });

    return prisma.aiProvider.create({ data });
  }

  async updateExtraConfig(id: string, extraConfig: AnthropicExtraConfig | null) {
    const prisma = getPrisma();
    return prisma.aiProvider.update({
      where: { id },
      data: { extraConfig: extraConfig ? JSON.stringify(extraConfig) : null },
    });
  }

  /** Find or create the default OPENAI provider; update apiKey (if provided) and/or model. */
  async upsertDefaultOpenAI(data: { apiKey?: string; model?: string }) {
    const prisma = getPrisma();
    const existing = await prisma.aiProvider.findFirst({ where: { provider: 'OPENAI' } });
    const model = data.model?.trim() || null;
    if (existing) {
      const update: Record<string, unknown> = { model, baseUrl: 'https://api.openai.com', updatedAt: new Date() };
      if (data.apiKey != null && data.apiKey.trim() !== '') {
        update.apiKeyEnc = encryptJson({ apiKey: data.apiKey.trim() });
      }
      return prisma.aiProvider.update({ where: { id: existing.id }, data: update });
    }
    const apiKey = (data.apiKey ?? '').trim();
    if (!apiKey) throw new Error('OpenAI API key is required when creating the default provider.');
    return prisma.aiProvider.create({
      data: {
        name: 'OpenAI (default)',
        provider: 'OPENAI',
        baseUrl: 'https://api.openai.com',
        model: model ?? 'gpt-4o-mini',
        apiKeyEnc: encryptJson({ apiKey }),
        isActive: false,
      },
    });
  }

  /** Find or create the default ANTHROPIC provider; update apiKey (if provided), model, and/or extraConfig. */
  async upsertDefaultClaude(data: {
    apiKey?: string;
    model?: string;
    extraConfig?: AnthropicExtraConfig | null;
  }) {
    const prisma = getPrisma();
    const existing = await prisma.aiProvider.findFirst({ where: { provider: 'ANTHROPIC' } });
    const model = data.model?.trim() || null;
    const extraConfig = data.extraConfig ? JSON.stringify(data.extraConfig) : null;
    if (existing) {
      const update: Record<string, unknown> = {
        model,
        baseUrl: 'https://api.anthropic.com',
        extraConfig,
        updatedAt: new Date(),
      };
      if (data.apiKey != null && data.apiKey.trim() !== '') {
        update.apiKeyEnc = encryptJson({ apiKey: data.apiKey.trim() });
      }
      return prisma.aiProvider.update({ where: { id: existing.id }, data: update });
    }
    const apiKey = (data.apiKey ?? '').trim();
    if (!apiKey) throw new Error('Claude API key is required when creating the default provider.');
    return prisma.aiProvider.create({
      data: {
        name: 'Claude (Anthropic) (default)',
        provider: 'ANTHROPIC',
        baseUrl: 'https://api.anthropic.com',
        model: model ?? 'claude-sonnet-4-20250514',
        apiKeyEnc: encryptJson({ apiKey }),
        extraConfig,
        isActive: false,
      },
    });
  }

  /** Get the first OPENAI and first ANTHROPIC provider for settings forms (with masked key). */
  async getDefaultProvidersForSettings(): Promise<{
    openai: { id: string; model: string | null; apiKeyMasked: string } | null;
    claude: { id: string; model: string | null; extraConfig: string | null; apiKeyMasked: string } | null;
  }> {
    const prisma = getPrisma();
    const [openai, claude] = await Promise.all([
      prisma.aiProvider.findFirst({ where: { provider: 'OPENAI' } }),
      prisma.aiProvider.findFirst({ where: { provider: 'ANTHROPIC' } }),
    ]);
    return {
      openai: openai
        ? {
            id: openai.id,
            model: openai.model,
            apiKeyMasked: await this.getApiKeyMasked(openai.id),
          }
        : null,
      claude: claude
        ? {
            id: claude.id,
            model: claude.model,
            extraConfig: claude.extraConfig,
            apiKeyMasked: await this.getApiKeyMasked(claude.id),
          }
        : null,
    };
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

  /** Returns masked API key for display (e.g. "••••••••xyz1"). */
  async getApiKeyMasked(id: string): Promise<string> {
    try {
      const key = await this.getApiKey(id);
      if (!key || key.length < 4) return '••••';
      return '••••••••' + key.slice(-4);
    } catch {
      return '—';
    }
  }
}
