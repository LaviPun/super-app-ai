import { getPrisma } from '../app/db.server';
import { encryptJson } from '../app/services/security/crypto.server';

async function main() {
  const prisma = getPrisma();

  const openai = await prisma.aiProvider.upsert({
    where: { name: 'OpenAI (default)' },
    create: {
      name: 'OpenAI (default)',
      provider: 'OPENAI',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-5.2',
      apiKeyEnc: encryptJson({ apiKey: 'SET_ME' }),
      isActive: false,
    },
    update: {},
  });

  // cents per 1M tokens:
  // GPT-5.2: $1.75 input, $14 output; cached input $0.175
  await prisma.aiModelPrice.create({ data: { providerId: openai.id, model: 'gpt-5.2', inputPer1MTokensCents: 175, outputPer1MTokensCents: 1400, cachedInputPer1MTokensCents: 17, isActive: true }});
  // GPT-5.2 pro: $21 input, $168 output
  await prisma.aiModelPrice.create({ data: { providerId: openai.id, model: 'gpt-5.2-pro', inputPer1MTokensCents: 2100, outputPer1MTokensCents: 16800, cachedInputPer1MTokensCents: null, isActive: true }});
  // GPT-5 mini: $0.25 input, $2 output; cached input $0.025
  await prisma.aiModelPrice.create({ data: { providerId: openai.id, model: 'gpt-5-mini', inputPer1MTokensCents: 25, outputPer1MTokensCents: 200, cachedInputPer1MTokensCents: 2, isActive: true }});

  const anthropic = await prisma.aiProvider.upsert({
    where: { name: 'Anthropic (default)' },
    create: {
      name: 'Anthropic (default)',
      provider: 'ANTHROPIC',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-6',
      apiKeyEnc: encryptJson({ apiKey: 'SET_ME' }),
      isActive: false,
    },
    update: {},
  });

  // Opus 4.6: $5 input, $25 output
  await prisma.aiModelPrice.create({ data: { providerId: anthropic.id, model: 'claude-opus-4-6', inputPer1MTokensCents: 500, outputPer1MTokensCents: 2500, cachedInputPer1MTokensCents: null, isActive: true }});
  // Sonnet 4.6: $3 input, $15 output
  await prisma.aiModelPrice.create({ data: { providerId: anthropic.id, model: 'claude-sonnet-4-6', inputPer1MTokensCents: 300, outputPer1MTokensCents: 1500, cachedInputPer1MTokensCents: null, isActive: true }});

  // eslint-disable-next-line no-console
  console.log('Seeded providers + model pricing. Set real API keys and activate a provider in /internal/ai-providers.');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
