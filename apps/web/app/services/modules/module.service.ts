import { getPrisma } from '~/db.server';
import type { RecipeSpec } from '@superapp/core';

export class ModuleService {
  async createDraft(shopDomain: string, spec: RecipeSpec) {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new Error('Shop not found');

    const module = await prisma.module.create({
      data: {
        shopId: shop.id,
        type: spec.type,
        category: spec.category,
        name: spec.name,
        status: 'DRAFT',
        versions: {
          create: {
            version: 1,
            status: 'DRAFT',
            specJson: JSON.stringify(spec),
          },
        },
      },
      include: { versions: true },
    });

    return module;
  }

  async getModule(shopDomain: string, moduleId: string) {
    const prisma = getPrisma();
    return prisma.module.findFirst({
      where: { id: moduleId, shop: { shopDomain } },
      include: { versions: { orderBy: { version: 'desc' } }, activeVersion: true },
    });
  }

  async getModuleByShopId(shopId: string, moduleId: string) {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return null;
    return this.getModule(shop.shopDomain, moduleId);
  }

  async createNewVersion(shopDomain: string, moduleId: string, spec: RecipeSpec) {
    const prisma = getPrisma();
    const module = await prisma.module.findFirst({ where: { id: moduleId, shop: { shopDomain } }, include: { versions: true }});
    if (!module) throw new Error('Module not found');

    const nextVersion = (module.versions.reduce((m, v) => Math.max(m, v.version), 0) || 0) + 1;
    return prisma.moduleVersion.create({
      data: {
        moduleId: module.id,
        version: nextVersion,
        status: 'DRAFT',
        specJson: JSON.stringify(spec),
      },
    });
  }

  async createNewVersionByShopId(shopId: string, moduleId: string, spec: RecipeSpec) {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new Error('Shop not found');
    return this.createNewVersion(shop.shopDomain, moduleId, spec);
  }

  async markPublished(moduleId: string, versionId: string, targetThemeId?: string) {
    const prisma = getPrisma();
    await prisma.moduleVersion.update({
      where: { id: versionId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), targetThemeId: targetThemeId ?? null },
    });
    await prisma.module.update({
      where: { id: moduleId },
      data: { status: 'PUBLISHED', activeVersionId: versionId },
    });
  }

  async rollbackToVersion(shopDomain: string, moduleId: string, version: int) {
    const prisma = getPrisma();
    const mv = await prisma.moduleVersion.findFirst({
      where: { moduleId, version, module: { shop: { shopDomain } } },
    });
    if (!mv) throw new Error('Version not found');
    await prisma.module.update({ where: { id: moduleId }, data: { activeVersionId: mv.id, status: 'PUBLISHED' } });
    return mv;
  }
}

type int = number;
