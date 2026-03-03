import { getPrisma } from '~/db.server';

export async function resolveProviderIdForShop(shopId?: string | null): Promise<string | null> {
  const prisma = getPrisma();
  if (shopId) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (shop?.aiProviderOverrideId) return shop.aiProviderOverrideId;
  }
  const global = await prisma.aiProvider.findFirst({ where: { isActive: true } });
  return global?.id ?? null;
}
