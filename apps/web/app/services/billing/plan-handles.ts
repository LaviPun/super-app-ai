import type { BillingPlan } from './billing.service';

/**
 * App Pricing plan handles ⇄ in-app plan names.
 * These handles are pinned when the plans are created in the Partner Dashboard
 * (Task 8 runbook) — if a handle changes there, it MUST change here in the
 * same release. ENTERPRISE is intentionally absent: it is an internal override
 * (BillingService.setPlanForShop), never an App Pricing public plan.
 */
export const PLAN_BY_HANDLE: Record<string, BillingPlan> = {
  free: 'FREE',
  starter: 'STARTER',
  growth: 'GROWTH',
  pro: 'PRO',
};

export function planFromHandle(handle: string | null | undefined): BillingPlan | null {
  if (!handle) return null;
  return PLAN_BY_HANDLE[handle.trim().toLowerCase()] ?? null;
}
