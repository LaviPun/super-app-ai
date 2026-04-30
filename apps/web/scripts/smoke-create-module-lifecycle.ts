import { getPrisma } from '~/db.server';
import { classifyUserIntent } from '~/services/ai/classify.server';
import { augmentWithCheapClassifier } from '~/services/ai/cheap-classifier.server';
import { buildIntentPacket } from '~/services/ai/intent-packet.server';
import { serializeIntentPacketForPrompt } from '~/services/ai/token-budget.server';
import { buildPromptRouterDecision } from '~/services/ai/prompt-router.server';
import { generateValidatedRecipeOptions } from '~/services/ai/llm.server';

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim() || 'Create a newsletter popup with a 10% discount and clear CTA';
  const prisma = getPrisma();

  const shop = await prisma.shop.upsert({
    where: { shopDomain: 'smoke-local.myshopify.com' },
    create: { shopDomain: 'smoke-local.myshopify.com', accessToken: '', planTier: 'PRO' },
    update: {},
  });

  let classification = await classifyUserIntent(prompt);
  classification = await augmentWithCheapClassifier(classification, prompt, shop.id);

  const intentPacket = buildIntentPacket(prompt, classification, {
    storeContext: { shop_domain: shop.shopDomain, theme_os2: true },
  });

  const routerDecision = await buildPromptRouterDecision({
    prompt,
    classification,
    intentPacket,
    shopDomain: shop.shopDomain,
    operationClass: 'P0_CREATE',
  });

  const options = await generateValidatedRecipeOptions(prompt, classification, {
    shopId: shop.id,
    maxAttempts: 2,
    intentPacketJson: serializeIntentPacketForPrompt(intentPacket),
    confidenceScore: intentPacket.classification.confidence,
    promptProfile: intentPacket.routing.prompt_profile,
    routerDecision,
  });
  const lastUsage = await prisma.aiUsage.findFirst({
    where: { shopId: shop.id, action: 'RECIPE_GENERATION_OPTION' },
    orderBy: { createdAt: 'desc' },
  });
  let promptHasDesignReference = false;
  if (lastUsage?.meta) {
    try {
      const parsed = JSON.parse(lastUsage.meta) as {
        promptAudit?: { preview?: string };
      };
      promptHasDesignReference = (parsed.promptAudit?.preview ?? '').includes('DesignReferenceV1');
    } catch {
      promptHasDesignReference = false;
    }
  }

  const first = options[0];
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        prompt,
        moduleType: classification.moduleType,
        router: {
          reasonCode: routerDecision.reasonCode,
          moduleType: routerDecision.moduleType,
          confidence: routerDecision.confidence,
        },
        optionsCount: options.length,
        firstExplanation: first?.explanation?.slice(0, 140) ?? '',
        promptHasDesignReference,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
