import { PrismaSessionStorage } from '@shopify/shopify-app-session-storage-prisma';
import { getPrisma } from '~/db.server';

export function getSessionStorage() {
  return new PrismaSessionStorage(getPrisma());
}
