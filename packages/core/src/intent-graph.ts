import { z } from 'zod';
import {
  CLEAN_INTENTS,
  INTENT_MODES,
  IntentPacketSchema,
  type IntentPacket,
  resolveRouting,
} from './intent-packet.js';
import {
  MODULE_TYPE_TO_CATEGORY,
  MODULE_TYPE_TO_SURFACE,
  RECIPE_SPEC_TYPES,
  type ModuleType,
} from './allowed-values.js';
import {
  findCatalogEntry,
  findTypeEntry,
  type ModuleCatalogEntry,
} from './catalog.js';

const IntentGraphNodeIdPattern = /^[a-zA-Z0-9_-]{3,64}$/;

export const IntentGraphVersionSchema = z.literal('1.0');

export const IntentGraphNodeIdSchema = z.string().regex(IntentGraphNodeIdPattern);

export const IntentToRecipeTypeSchema = z.enum(RECIPE_SPEC_TYPES);
export type IntentToRecipeType = z.infer<typeof IntentToRecipeTypeSchema>;

export const INTENT_TO_RECIPE_TYPE: Partial<Record<(typeof CLEAN_INTENTS)[number], ModuleType>> = {
  'promo.popup': 'theme.popup',
  'promo.banner': 'theme.banner',
  'promo.free_shipping_bar': 'theme.notificationBar',
  'promo.countdown': 'theme.popup',
  'promo.discount_reveal': 'functions.discountRules',
  'upsell.cart_upsell': 'checkout.upsell',
  'upsell.bundle_builder': 'functions.cartTransform',
  'upsell.post_purchase': 'postPurchase.offer',
  'engage.newsletter_capture': 'theme.contactForm',
  'engage.exit_intent': 'theme.popup',
  'engage.survey': 'theme.contactForm',
  'utility.announcement': 'theme.notificationBar',
  'utility.effect': 'theme.effect',
  'utility.floating_widget': 'theme.floatingWidget',
  'flow.create_workflow': 'flow.automation',
  'flow.edit_workflow': 'flow.automation',
  'flow.import_template': 'flow.automation',
  'admin.dashboard_card': 'admin.block',
  'admin.campaign_builder': 'admin.action',
  'admin.settings_editor': 'admin.block',
  'support.generate_assets': 'platform.extensionBlueprint',
  'support.generate_copy_only': 'platform.extensionBlueprint',
  'support.how_to': 'platform.extensionBlueprint',
  'support.troubleshoot': 'platform.extensionBlueprint',
};

const GoalNodeSchema = z.object({
  id: IntentGraphNodeIdSchema,
  kind: z.literal('goal'),
  intent: z.enum(CLEAN_INTENTS),
  mode: z.enum(INTENT_MODES).default('create'),
  confidence: z.number().min(0).max(1),
  textSummary: z.string().min(1).max(500),
}).strict();

const ConstraintValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])).max(50),
]);

const ConstraintNodeSchema = z.object({
  id: IntentGraphNodeIdSchema,
  kind: z.literal('constraint'),
  constraintType: z.enum(['platform', 'privacy', 'performance', 'accessibility', 'catalog']),
  key: z.string().min(1).max(80),
  value: ConstraintValueSchema,
}).strict();

const CatalogMatchNodeSchema = z.object({
  id: IntentGraphNodeIdSchema,
  kind: z.literal('catalog_match'),
  catalogId: z.string().min(1),
  moduleType: z.enum(RECIPE_SPEC_TYPES).optional(),
  score: z.number().min(0).max(1),
  reason: z.string().min(1).max(240).optional(),
}).strict();

const RecipeCandidateNodeSchema = z.object({
  id: IntentGraphNodeIdSchema,
  kind: z.literal('recipe_candidate'),
  moduleType: z.enum(RECIPE_SPEC_TYPES),
  catalogId: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  category: z.enum(['STOREFRONT_UI', 'ADMIN_UI', 'FUNCTION', 'INTEGRATION', 'FLOW', 'CUSTOMER_ACCOUNT']),
  surface: z.enum(['online_store', 'checkout', 'customer_accounts', 'admin', 'pos', 'flow', 'marketing_analytics', 'payments']),
}).strict();

const ApprovalGateNodeSchema = z.object({
  id: IntentGraphNodeIdSchema,
  kind: z.literal('approval_gate'),
  required: z.boolean().default(true),
  reason: z.string().min(1).max(240),
}).strict();

export const IntentGraphNodeSchema = z.discriminatedUnion('kind', [
  GoalNodeSchema,
  ConstraintNodeSchema,
  CatalogMatchNodeSchema,
  RecipeCandidateNodeSchema,
  ApprovalGateNodeSchema,
]);

export type IntentGraphNode = z.infer<typeof IntentGraphNodeSchema>;

export const IntentGraphEdgeSchema = z.object({
  from: IntentGraphNodeIdSchema,
  to: IntentGraphNodeIdSchema,
  label: z.enum(['refines', 'matches', 'proposes', 'requires_approval']).default('refines'),
}).strict();

export type IntentGraphEdge = z.infer<typeof IntentGraphEdgeSchema>;

export const IntentGraphSchema = z.object({
  schema_version: IntentGraphVersionSchema.default('1.0'),
  id: z.string().regex(/^ig_[a-zA-Z0-9_-]{6,80}$/),
  source: z.enum(['classifier', 'agent', 'operator', 'test']).default('classifier'),
  intentPacket: IntentPacketSchema.optional(),
  nodes: z.array(IntentGraphNodeSchema).min(1).max(50),
  edges: z.array(IntentGraphEdgeSchema).max(100).default([]),
  routing: z.object({
    prompt_scaffold_id: z.string().min(1),
    prompt_profile: z.string().min(1),
    output_schema: z.string().min(1),
    model_tier: z.enum(['cheap', 'standard', 'premium']).optional(),
  }).strict(),
  metadata: z.object({
    featureFlag: z.literal('INTENT_GRAPH_ENABLED').default('INTENT_GRAPH_ENABLED'),
    directRecipeSpecFallbackAllowed: z.boolean().default(true),
  }).strict().default({ featureFlag: 'INTENT_GRAPH_ENABLED', directRecipeSpecFallbackAllowed: true }),
}).strict().superRefine((graph, ctx) => {
  const ids = new Set<string>();
  let goalCount = 0;
  let candidateCount = 0;

  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate node id "${node.id}"`, path: ['nodes'] });
    }
    ids.add(node.id);
    if (node.kind === 'goal') goalCount += 1;
    if (node.kind === 'recipe_candidate') candidateCount += 1;

    if ((node.kind === 'catalog_match' || node.kind === 'recipe_candidate') && node.catalogId) {
      const entry = findCatalogEntry(node.catalogId);
      if (!entry) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown catalogId "${node.catalogId}"`, path: ['nodes'] });
        continue;
      }
      if (node.moduleType && entry.moduleType && entry.moduleType !== node.moduleType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `catalogId "${node.catalogId}" is for ${entry.moduleType}, not ${node.moduleType}`,
          path: ['nodes'],
        });
      }
    }
  }

  if (goalCount === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Intent graph requires at least one goal node', path: ['nodes'] });
  }
  if (candidateCount === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Intent graph requires at least one recipe_candidate node', path: ['nodes'] });
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Edge references unknown from node "${edge.from}"`, path: ['edges'] });
    }
    if (!ids.has(edge.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Edge references unknown to node "${edge.to}"`, path: ['edges'] });
    }
  }
});

export type IntentGraph = z.infer<typeof IntentGraphSchema>;

export type BuildIntentGraphOptions = {
  id?: string;
  source?: IntentGraph['source'];
  catalogId?: string;
  moduleType?: ModuleType;
  textSummary?: string;
};

function makeGraphId(packet: IntentPacket, explicitId?: string): string {
  if (explicitId) return explicitId;
  const stablePart = packet.request_id ?? `${packet.classification.intent}-${packet.classification.surface}`;
  const normalized = stablePart.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 70);
  return `ig_${normalized.padEnd(6, '0')}`;
}

function resolveModuleType(intent: (typeof CLEAN_INTENTS)[number], requested?: ModuleType): ModuleType {
  return requested ?? INTENT_TO_RECIPE_TYPE[intent] ?? 'platform.extensionBlueprint';
}

function resolveCatalogEntry(moduleType: ModuleType, catalogId?: string): ModuleCatalogEntry | undefined {
  if (catalogId) return findCatalogEntry(catalogId);
  return findTypeEntry(moduleType);
}

export function buildIntentGraphFromPacket(input: IntentPacket, options: BuildIntentGraphOptions = {}): IntentGraph {
  const packet = IntentPacketSchema.parse(input);
  const intent = z.enum(CLEAN_INTENTS).parse(packet.classification.intent);
  const moduleType = resolveModuleType(intent, options.moduleType);
  const catalogEntry = resolveCatalogEntry(moduleType, options.catalogId);
  const routing = resolveRouting(intent);

  const goalId = 'goal_primary';
  const catalogId = 'catalog_primary';
  const candidateId = 'candidate_primary';
  const approvalId = 'approval_required';

  return IntentGraphSchema.parse({
    schema_version: '1.0',
    id: makeGraphId(packet, options.id),
    source: options.source ?? 'classifier',
    intentPacket: packet,
    routing,
    nodes: [
      {
        id: goalId,
        kind: 'goal',
        intent,
        mode: packet.classification.mode,
        confidence: packet.classification.confidence,
        textSummary: options.textSummary ?? packet.input.text.slice(0, 500),
      },
      {
        id: catalogId,
        kind: 'catalog_match',
        catalogId: catalogEntry?.catalogId ?? `type.${moduleType}`,
        moduleType,
        score: packet.classification.confidence,
        reason: catalogEntry?.description,
      },
      {
        id: candidateId,
        kind: 'recipe_candidate',
        moduleType,
        catalogId: catalogEntry?.catalogId,
        category: MODULE_TYPE_TO_CATEGORY[moduleType],
        surface: MODULE_TYPE_TO_SURFACE[moduleType],
      },
      {
        id: approvalId,
        kind: 'approval_gate',
        required: true,
        reason: 'RecipeSpec output must be validated, previewed, and merchant-approved before publish.',
      },
    ],
    edges: [
      { from: goalId, to: catalogId, label: 'matches' },
      { from: catalogId, to: candidateId, label: 'proposes' },
      { from: candidateId, to: approvalId, label: 'requires_approval' },
    ],
  });
}

export function validateIntentGraph(input: unknown): IntentGraph {
  return IntentGraphSchema.parse(input);
}
