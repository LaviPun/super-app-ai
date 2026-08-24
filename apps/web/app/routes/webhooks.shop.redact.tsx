/**
 * GDPR: shop/redact (doc Section 2.4).
 * Shopify sends this when a shop uninstalls the app. Delete or anonymize all data for that shop.
 *
 * Coverage (WS-G, finding Infra-11): every Prisma model scoped to a shop — via a direct FK
 * relation to `Shop`, OR via a field using the same shop-id-field-name convention as a model
 * that does declare one (`shopId`/`tenantId` today; see shop-redact-completeness.test.ts's
 * `shopScopingFieldNames`) — is either deleted/anonymized below, or listed in
 * REDACT_RETENTION_ALLOWLIST with a reason. This is enforced by a schema-introspection test
 * so a future shop-scoped model fails CI until it's triaged into one bucket or the other. The
 * field-name-vocabulary approach (not a hardcoded `shopId` literal) is what catches WorkflowRun
 * below: its `tenantId` column is the shop id, but its own declared relation targets
 * `WorkflowDef` via a composite key, not `Shop` directly, so a naive "has a Shop relation" check
 * would have missed it entirely.
 *
 * The Shop row itself is retained (not deleted) — only its *data* is deleted per GDPR
 * shop/redact. Keeping the row lets a future re-install of the same shop domain resume
 * correctly (session/install bookkeeping is handled separately by the `app/uninstalled`
 * webhook); deleting it would require re-architecting reinstall handling, which is out of
 * this route's scope.
 *
 * Delete order respects foreign-key relationships that are NOT `onDelete: Cascade` from a
 * model already being deleted here (verified against schema.prisma / the baseline migration
 * SQL, not assumed):
 *   - ModuleInstance.revisionId -> ModuleVersion is RESTRICT, so ModuleInstance rows are
 *     deleted before Module (whose deletion cascades ModuleVersion via ModuleVersion.moduleId).
 *   - Module.recipeId -> Recipe is SET NULL, so Module is deleted before Recipe (order is
 *     actually safe either way, kept this way for readability).
 *   - Connector.shopId -> Shop and ConnectorToken.tenantId -> Shop are RESTRICT, but that only
 *     matters if the Shop row itself were deleted (it isn't), so Connector/ConnectorToken can
 *     be deleted independently of order here.
 *   - WorkflowRun.(workflowId,workflowVersion,tenantId) -> WorkflowDef is RESTRICT, so
 *     WorkflowRun rows are deleted before WorkflowDef. WorkflowRunStep.runId -> WorkflowRun is
 *     CASCADE (would clean up automatically), but is deleted explicitly first anyway for
 *     accurate counts and to keep the order self-documenting rather than relying on cascade.
 * Everything else in this route is either standalone (no FK from another shop-scoped model)
 * or a child that cascades automatically once its parent is deleted (ConnectorEndpoint via
 * Connector, ModuleVersion/ModuleAsset/FunctionRuleSet/FlowAsset/ImageIngestionJob via Module,
 * ModuleSettingsValues via ModuleInstance, SupportTicketMessage/Event/FixProposal via
 * SupportTicket) — those child tables have no shop-scoping field of their own so they aren't
 * named individually in the completeness test, but are covered by cascade.
 */

import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

/**
 * Models scoped to a shop that are deliberately NOT deleted/anonymized by this route, with the
 * reason each is retained. Checked by `shop-redact-completeness.test.ts` against every
 * shop-scoped model in schema.prisma (see that file's `modelsScopedToShop`).
 */
export const REDACT_RETENTION_ALLOWLIST = [
  // The audit trail of Hub/ops/webhook actions, INCLUDING the GDPR_SHOP_REDACT row this
  // route itself writes below — must survive the shop's own deletion for compliance/ops
  // history ("we deleted data because you asked, and we're keeping a record that we did").
  // ActivityLog.shopId is nullable and carries no cascade, so leaving rows in place is safe.
  'ActivityLog',
  // Same rationale as ActivityLog: a release/deploy-transition audit trail (internal admin
  // actions, not shop customer data) rendered at /internal/audit. Required (non-nullable)
  // shopId, but the rows describe admin/system actions taken, not the shop's own data.
  'AuditLog',
] as const;

export async function action({ request }: { request: Request }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { payload: webhookPayload } = await shopify.authenticate.webhook(request);

  const payload = webhookPayload as { shop_id?: number; shop_domain?: string };
  const shopDomain = payload.shop_domain ?? payload.shop_id?.toString();
  if (!shopDomain)
    return new Response(JSON.stringify({ error: 'Missing shop identifier' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return new Response(undefined, { status: 200 });

  const counts = {
    dataCaptures: 0,
    dataStoreRecords: 0,
    dataStores: 0,
    moduleEvents: 0,
    moduleMetricsDaily: 0,
    attributionLinks: 0,
    connectorTokens: 0,
    connectors: 0,
    moduleInstances: 0,
    moduleAssets: 0,
    functionRuleSets: 0,
    flowAssets: 0,
    imageIngestionJobs: 0,
    modules: 0,
    recipes: 0,
    flowDeadLetters: 0,
    flowSchedules: 0,
    flowStepLogs: 0,
    themeProfiles: 0,
    shopApiRateLimits: 0,
    appSubscriptions: 0,
    supportTickets: 0,
    jobs: 0,
    apiLogs: 0,
    errorLogs: 0,
    aiUsage: 0,
    retentionPolicies: 0,
    workflowRunSteps: 0,
    workflowRuns: 0,
    workflowDefs: 0,
  };

  // Already-covered models (pre-existing) — DataStoreRecord has no shopId of its own,
  // scoped via its parent DataStore.
  counts.dataStoreRecords = (
    await prisma.dataStoreRecord.deleteMany({
      where: { dataStore: { shopId: shop.id } },
    })
  ).count;
  counts.dataStores = (await prisma.dataStore.deleteMany({ where: { shopId: shop.id } })).count;
  counts.dataCaptures = (await prisma.dataCapture.deleteMany({ where: { shopId: shop.id } })).count;
  counts.moduleEvents = (await prisma.moduleEvent.deleteMany({ where: { shopId: shop.id } })).count;
  counts.moduleMetricsDaily = (await prisma.moduleMetricsDaily.deleteMany({ where: { shopId: shop.id } })).count;
  counts.attributionLinks = (await prisma.attributionLink.deleteMany({ where: { shopId: shop.id } })).count;

  // Connector secrets — ConnectorToken uses `tenantId` (not `shopId`) as its shop-scoping
  // field so it isn't picked up by the schema-introspection completeness test, but it holds
  // real per-shop encrypted credentials and must be purged like any other shop-scoped model.
  counts.connectorTokens = (await prisma.connectorToken.deleteMany({ where: { tenantId: shop.id } })).count;
  // ConnectorEndpoint cascades automatically (onDelete: Cascade on connectorId -> Connector).
  counts.connectors = (await prisma.connector.deleteMany({ where: { shopId: shop.id } })).count;

  // ModuleInstance before Module/ModuleVersion: ModuleInstance.revisionId -> ModuleVersion is
  // RESTRICT, so ModuleInstance rows must be gone before Module's cascade removes
  // ModuleVersion. ModuleSettingsValues cascades automatically (instanceId -> ModuleInstance).
  counts.moduleInstances = (await prisma.moduleInstance.deleteMany({ where: { shopId: shop.id } })).count;
  counts.moduleAssets = (await prisma.moduleAsset.deleteMany({ where: { shopId: shop.id } })).count;
  counts.functionRuleSets = (await prisma.functionRuleSet.deleteMany({ where: { shopId: shop.id } })).count;
  counts.flowAssets = (await prisma.flowAsset.deleteMany({ where: { shopId: shop.id } })).count;
  counts.imageIngestionJobs = (await prisma.imageIngestionJob.deleteMany({ where: { shopId: shop.id } })).count;
  // Module cascades ModuleVersion (moduleId -> Module); Module.activeVersionId -> ModuleVersion
  // is SET NULL so no circular-FK issue.
  counts.modules = (await prisma.module.deleteMany({ where: { shopId: shop.id } })).count;
  counts.recipes = (await prisma.recipe.deleteMany({ where: { shopId: shop.id } })).count;

  // Standalone shop-scoped models (no FK from/to another model deleted in this route).
  counts.flowDeadLetters = (await prisma.flowDeadLetter.deleteMany({ where: { shopId: shop.id } })).count;
  counts.flowSchedules = (await prisma.flowSchedule.deleteMany({ where: { shopId: shop.id } })).count;
  counts.flowStepLogs = (await prisma.flowStepLog.deleteMany({ where: { shopId: shop.id } })).count;
  counts.themeProfiles = (await prisma.themeProfile.deleteMany({ where: { shopId: shop.id } })).count;
  counts.shopApiRateLimits = (await prisma.shopApiRateLimit.deleteMany({ where: { shopId: shop.id } })).count;
  counts.appSubscriptions = (await prisma.appSubscription.deleteMany({ where: { shopId: shop.id } })).count;
  // SupportTicketMessage/Event/FixProposal cascade automatically (ticketId -> SupportTicket).
  counts.supportTickets = (await prisma.supportTicket.deleteMany({ where: { shopId: shop.id } })).count;
  counts.jobs = (await prisma.job.deleteMany({ where: { shopId: shop.id } })).count;
  counts.apiLogs = (await prisma.apiLog.deleteMany({ where: { shopId: shop.id } })).count;
  counts.errorLogs = (await prisma.errorLog.deleteMany({ where: { shopId: shop.id } })).count;
  counts.aiUsage = (await prisma.aiUsage.deleteMany({ where: { shopId: shop.id } })).count;
  counts.retentionPolicies = (await prisma.retentionPolicy.deleteMany({ where: { shopId: shop.id } })).count;

  // Workflow engine (tenantId-scoped, not shopId — caught by the field-name-vocabulary
  // introspection, see header comment). WorkflowRunStep has no shop-scoping field of its own
  // (only runId), so it's scoped via its parent WorkflowRun relation, same pattern as
  // DataStoreRecord above. Order: WorkflowRunStep -> WorkflowRun -> WorkflowDef — WorkflowRun's
  // FK to WorkflowDef is RESTRICT, so WorkflowDef must outlive its WorkflowRun rows until they're
  // gone. WorkflowRun.contextJson/workflowJson can carry raw trigger payloads (webhook/order/
  // customer data), which is exactly the PII this route exists to purge.
  counts.workflowRunSteps = (
    await prisma.workflowRunStep.deleteMany({ where: { run: { tenantId: shop.id } } })
  ).count;
  counts.workflowRuns = (await prisma.workflowRun.deleteMany({ where: { tenantId: shop.id } })).count;
  counts.workflowDefs = (await prisma.workflowDef.deleteMany({ where: { tenantId: shop.id } })).count;

  await prisma.activityLog.create({
    data: {
      actor: 'WEBHOOK',
      action: 'GDPR_SHOP_REDACT',
      resource: `shop:${shop.id}`,
      shopId: shop.id,
      details: JSON.stringify({ shopDomain, counts }),
    },
  });

  return new Response(undefined, { status: 200 });
}
