/**
 * Blueprint plan probe — runs the REAL classifier + blueprint planner on a
 * prompt and prints how many modules (and which) the request resolves to. DB-
 * and API-key-free. Demonstrates the "single vs blueprint" decision.
 *
 * Run: pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/blueprint-plan-probe.ts "your prompt"
 */
import { classifyUserIntent } from '~/services/ai/classify.server';
import { planBlueprint, plannedModuleCount } from '~/services/ai/blueprint-planner';

async function main() {
  const prompt =
    process.argv.slice(2).join(' ').trim() ||
    'create a product bundle module where i can create product bundle with support in cart and checkout for showing product as bundle';

  const classification = await classifyUserIntent(prompt, 'Auto');
  const plan = planBlueprint({ moduleType: classification.moduleType, intent: classification.intent });

  const out = {
    prompt,
    classifiedType: classification.moduleType,
    intent: classification.intent ?? null,
    decision: plan.kind,
    moduleCount: plannedModuleCount(plan),
    modules:
      plan.kind === 'blueprint'
        ? plan.modules.map((m) => ({
            role: m.role,
            moduleType: m.moduleType,
            surface: m.surface,
            required: m.required,
            reason: m.reason,
          }))
        : [{ role: 'single', moduleType: plan.primaryModuleType }],
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
