import { getPrisma } from '~/db.server';
import {
  type BillingPlan,
  type PlanConfig,
  PLAN_CONFIGS,
} from './billing.service';

const QUOTA_KEYS = [
  'aiRequestsPerMonth',
  'publishOpsPerMonth',
  'workflowRunsPerMonth',
  'connectorCallsPerMonth',
  'modulesTotal',
] as const;

function parseQuotasJson(json: string): PlanConfig['quotas'] {
  const raw = JSON.parse(json) as Record<string, unknown>;
  const quotas: PlanConfig['quotas'] = {
    aiRequestsPerMonth: 0,
    publishOpsPerMonth: 0,
    workflowRunsPerMonth: 0,
    connectorCallsPerMonth: 0,
    modulesTotal: 0,
  };
  for (const key of QUOTA_KEYS) {
    const v = raw[key];
    if (typeof v === 'number' && (v >= -1 || key === 'modulesTotal')) {
      quotas[key] = v;
    } else if (typeof v === 'number') {
      quotas[key] = Math.max(0, v);
    }
  }
  return quotas;
}

/**
 * Returns plan config from DB if present, otherwise fallback to PLAN_CONFIGS.
 */
export async function getPlanConfig(planName: string): Promise<PlanConfig> {
  const prisma = getPrisma();
  const row = await prisma.planTierConfig.findUnique({
    where: { name: planName },
  });
  if (row) {
    return {
      name: row.name as BillingPlan,
      displayName: row.displayName,
      price: row.price,
      trialDays: row.trialDays,
      quotas: parseQuotasJson(row.quotasJson),
    };
  }
  return PLAN_CONFIGS[planName as BillingPlan] ?? PLAN_CONFIGS.FREE;
}

/**
 * Returns all plan configs: DB rows merged with code defaults (so e.g. ENTERPRISE always appears).
 */
export async function getAllPlanConfigs(): Promise<PlanConfig[]> {
  const prisma = getPrisma();
  const rows = await prisma.planTierConfig.findMany({
    orderBy: { price: 'asc' },
  });
  const fromDb = new Map(
    rows.map(r => [
      r.name,
      {
        name: r.name as BillingPlan,
        displayName: r.displayName,
        price: r.price,
        trialDays: r.trialDays,
        quotas: parseQuotasJson(r.quotasJson),
      },
    ])
  );
  const merged: PlanConfig[] = [];
  for (const config of Object.values(PLAN_CONFIGS)) {
    merged.push(fromDb.get(config.name) ?? config);
  }
  return merged.sort((a, b) => (a.price === -1 ? Infinity : a.price) - (b.price === -1 ? Infinity : b.price));
}

/**
 * Update a plan tier by name. Validates quotas (numbers, -1 allowed for unlimited).
 */
export async function updatePlanTier(
  name: string,
  data: {
    displayName: string;
    price: number;
    trialDays: number;
    quotas: PlanConfig['quotas'];
  }
): Promise<PlanConfig> {
  const quotasJson = JSON.stringify(data.quotas);
  const prisma = getPrisma();
  const price = data.price === -1 ? -1 : Math.max(0, Math.round(data.price));
  await prisma.planTierConfig.upsert({
    where: { name },
    create: {
      name,
      displayName: data.displayName,
      price,
      trialDays: Math.max(0, Math.round(data.trialDays)),
      quotasJson,
    },
    update: {
      displayName: data.displayName,
      price,
      trialDays: Math.max(0, Math.round(data.trialDays)),
      quotasJson,
    },
  });
  return getPlanConfig(name);
}

/**
 * Seed default plan tiers from PLAN_CONFIGS if DB has none.
 */
export async function seedPlanTiersIfEmpty(): Promise<void> {
  const prisma = getPrisma();
  const count = await prisma.planTierConfig.count();
  if (count > 0) return;
  for (const config of Object.values(PLAN_CONFIGS)) {
    await prisma.planTierConfig.create({
      data: {
        name: config.name,
        displayName: config.displayName,
        price: config.price,
        trialDays: config.trialDays,
        quotasJson: JSON.stringify(config.quotas),
      },
    });
  }
}
