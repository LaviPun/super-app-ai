import { getPrisma } from '../app/db.server';

type Kind = 'AI_USAGE'|'API_LOG'|'ERROR_LOG'|'JOBS';

async function main() {
  const prisma = getPrisma();
  const globalDefault = Number(process.env.DEFAULT_RETENTION_DAYS ?? '30');

  const shops = await prisma.shop.findMany();
  for (const shop of shops) {
    const daysAi = shop.retentionDaysAi ?? shop.retentionDaysDefault ?? globalDefault;
    const daysApi = shop.retentionDaysApi ?? shop.retentionDaysDefault ?? globalDefault;
    const daysErr = shop.retentionDaysErrors ?? shop.retentionDaysDefault ?? globalDefault;

    await purge(prisma, shop.id, 'AI_USAGE', daysAi);
    await purge(prisma, shop.id, 'API_LOG', daysApi);
    await purge(prisma, shop.id, 'ERROR_LOG', daysErr);
    await purge(prisma, shop.id, 'JOBS', Math.max(daysAi, daysApi));
  }

  await purge(prisma, null, 'AI_USAGE', globalDefault);
  await purge(prisma, null, 'API_LOG', globalDefault);
  await purge(prisma, null, 'ERROR_LOG', globalDefault);
  await purge(prisma, null, 'JOBS', globalDefault);

  // eslint-disable-next-line no-console
  console.log('Retention purge complete');
}

async function purge(prisma: any, shopId: string | null, kind: Kind, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  if (kind === 'AI_USAGE') {
    await prisma.aiUsage.deleteMany({ where: { shopId, createdAt: { lt: cutoff } } });
  } else if (kind === 'API_LOG') {
    await prisma.apiLog.deleteMany({ where: { shopId, createdAt: { lt: cutoff } } });
  } else if (kind === 'ERROR_LOG') {
    await prisma.errorLog.deleteMany({ where: { shopId, createdAt: { lt: cutoff } } });
  } else if (kind === 'JOBS') {
    await prisma.job.deleteMany({ where: { shopId, createdAt: { lt: cutoff } } });
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
