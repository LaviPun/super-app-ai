/**
 * Client-safe billing-plan helpers (no server imports — this module is pulled
 * into route COMPONENTS, e.g. the internal store detail's plan modal seed, so
 * it must never reference db.server or other server-only modules).
 */
export type BillingPlan = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

/**
 * The billing plan of record lives on AppSubscription, not Shop.planTier
 * (which is the Shopify SHOP plan and is no longer written by billing code
 * post-App-Pricing-migration). A subscription row with a non-ACTIVE status
 * (e.g. CANCELLED/EXPIRED left over from a prior cycle) must NOT be read as
 * the merchant's plan — treat it as FREE. Use this everywhere a billing plan
 * is displayed/filtered from a `subscription` relation so the rule stays
 * consistent across merchant + internal-admin surfaces.
 */
export function deriveEffectivePlan(
  sub: { planName: string; status: string } | null | undefined,
): BillingPlan {
  return sub?.status === 'ACTIVE' ? ((sub.planName as BillingPlan) ?? 'FREE') : 'FREE';
}
