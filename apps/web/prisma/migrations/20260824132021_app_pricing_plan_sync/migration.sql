-- App Pricing plan-state sync (Conf-4): additive-only.
-- Shop.shopGid: gid://shopify/Shop/... cache for Partner API activeSubscription lookups.
-- AppSubscription.planHandle / lastSyncedAt: App Pricing plan handle + last Partner API reconcile timestamp.
ALTER TABLE "Shop" ADD COLUMN "shopGid" TEXT;

ALTER TABLE "AppSubscription" ADD COLUMN "planHandle" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
