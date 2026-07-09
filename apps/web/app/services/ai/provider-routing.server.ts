import { getPrisma } from '~/db.server';

/**
 * A shop-level `Shop.aiProviderOverrideId` is an explicit merchant/operator pin —
 * it must win outright and is never re-ranked by cost-based routing.
 */
export async function resolveShopProviderOverrideId(shopId?: string | null): Promise<string | null> {
  if (!shopId) return null;
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  return shop?.aiProviderOverrideId ?? null;
}

export async function resolveProviderIdForShop(shopId?: string | null): Promise<string | null> {
  const override = await resolveShopProviderOverrideId(shopId);
  if (override) return override;
  const prisma = getPrisma();
  const global = await prisma.aiProvider.findFirst({ where: { isActive: true } });
  return global?.id ?? null;
}
