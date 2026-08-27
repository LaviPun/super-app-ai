/**
 * One-shot, idempotent: seals every plaintext Shop.accessToken in place.
 * Run: DATABASE_URL=... ENCRYPTION_KEY=... pnpm --filter web exec tsx --tsconfig tsconfig.scripts.json scripts/encrypt-shop-tokens.ts
 */
import { PrismaClient } from '@prisma/client';
import { openAccessToken, sealAccessToken } from '../app/services/shops/access-token.server';

async function main() {
  const prisma = new PrismaClient();
  const shops = await prisma.shop.findMany({ select: { id: true, shopDomain: true, accessToken: true } });
  let sealed = 0;
  let skipped = 0;
  for (const shop of shops) {
    if (!shop.accessToken || shop.accessToken.startsWith('enc1:')) {
      skipped += 1;
      continue;
    }
    const next = sealAccessToken(shop.accessToken);
    if (openAccessToken(next) !== shop.accessToken) {
      throw new Error(`round-trip mismatch for ${shop.shopDomain} — aborting before write`);
    }
    await prisma.shop.update({ where: { id: shop.id }, data: { accessToken: next } });
    sealed += 1;
    console.log(`[seal] ${shop.shopDomain}: sealed`);
  }
  console.log(`[seal] done — sealed=${sealed} skipped=${skipped}`);
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
