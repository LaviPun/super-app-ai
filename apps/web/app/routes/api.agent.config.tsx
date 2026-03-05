import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { CLEAN_INTENTS, ROUTING_TABLE, MODULE_TYPE_TO_INTENT } from '@superapp/core';
import { CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';

/**
 * Agent API: Prompt-Native config introspection.
 *
 * GET /api/agent/config
 *
 * Returns classification rules, routing table, confidence thresholds, and intent→module type map
 * as structured JSON — so agents can introspect the routing and classification system without
 * reading source code.
 *
 * READ-ONLY — no side effects.
 */
export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);

  return json({
    ok: true,
    description: 'Classification and routing configuration for the Superapp agent system.',
    confidenceThresholds: {
      direct: CONFIDENCE_THRESHOLDS.DIRECT,
      withAlternatives: CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES,
      low: 0,
      bands: {
        direct: `confidence >= ${CONFIDENCE_THRESHOLDS.DIRECT} — route immediately, no alternatives needed`,
        with_alternatives: `confidence ${CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES}–${CONFIDENCE_THRESHOLDS.DIRECT - 0.01} — present alternatives for user to confirm`,
        low: `confidence < ${CONFIDENCE_THRESHOLDS.WITH_ALTERNATIVES} — ask clarifying question before proceeding`,
      },
    },
    cleanIntents: CLEAN_INTENTS,
    routingTable: Object.entries(ROUTING_TABLE).map(([intent, entry]) => ({
      intent,
      promptScaffoldId: entry.prompt_scaffold_id,
      promptProfile: entry.prompt_profile,
      outputSchema: entry.output_schema,
      modelTier: entry.model_tier ?? 'standard',
    })),
    moduleTypeToIntent: Object.entries(MODULE_TYPE_TO_INTENT).map(([moduleType, intent]) => ({
      moduleType,
      intent,
    })),
    outputSchemas: {
      StorefrontModuleSpecV1: 'RecipeSpec — used for theme.*, checkout.*, postPurchase.*, proxy.*, functions.* module types',
      AdminUISpecV1: 'Admin UI spec — used for admin.block, pos.extension, admin.* intents',
      WorkflowSpecV1: 'Workflow definition — used for flow.automation, flow.* intents',
      TroubleshootPlanV1: 'Troubleshoot plan — used for support.troubleshoot, support.how_to',
      CopyPackV1: 'Copy-only pack — used for support.generate_copy_only, support.generate_assets',
    },
    promptProfiles: {
      storefront_ui_v1: 'Storefront theme UI generation — produces RecipeSpec for theme blocks and widgets',
      admin_ui_v1: 'Shopify admin UI generation — produces admin extension specs',
      workflow_v1: 'Workflow/automation generation — produces flow definitions',
      support_v1: 'Support and troubleshooting — produces step-by-step plans',
      copy_v1: 'Copy-only generation — produces text content without code',
    },
    notes: [
      'CONFIDENCE_THRESHOLDS govern whether an agent should proceed directly, offer alternatives, or ask for clarification.',
      'cleanIntents is the canonical list of intent IDs used for classification and routing.',
      'routingTable maps intent IDs to prompt scaffolds, profiles, and output schemas.',
      'moduleTypeToIntent maps Shopify extension module types (e.g. theme.popup) to intent IDs.',
      'Use POST /api/agent/classify to classify a prompt and get the resolved routing entry.',
      'Use POST /api/agent/generate-options to run the full classify→LLM pipeline and get 3 RecipeSpec options.',
    ],
  });
}
