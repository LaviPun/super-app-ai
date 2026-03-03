import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = global.__prisma__ ?? new PrismaClient();
    if (process.env.NODE_ENV !== 'production') global.__prisma__ = prisma;
  }
  return prisma;
}
