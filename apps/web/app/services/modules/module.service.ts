import { getPrisma } from '~/db.server';
import type { RecipeSpec } from '@superapp/core';
import { ReleaseTransitionService } from '~/services/releases/release-transition.service';

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

    // Carry hydration data forward from the current DRAFT so settings aren't lost on save.
    const existingDraft = module.versions.find(v => v.status === 'DRAFT') as {
      adminConfigSchemaJson?: string | null;
      adminDefaultsJson?: string | null;
      themeEditorSettingsJson?: string | null;
      uiTokensJson?: string | null;
      validationReportJson?: string | null;
      hydratedAt?: Date | null;
    } | undefined;

    const nextVersion = (module.versions.reduce((m, v) => Math.max(m, v.version), 0) || 0) + 1;
    return prisma.moduleVersion.create({
      data: {
        moduleId: module.id,
        version: nextVersion,
        status: 'DRAFT',
        specJson: JSON.stringify(spec),
        // Preserve hydration so "Generate full settings" output isn't lost on every save.
        adminConfigSchemaJson: existingDraft?.adminConfigSchemaJson ?? null,
        adminDefaultsJson: existingDraft?.adminDefaultsJson ?? null,
        themeEditorSettingsJson: existingDraft?.themeEditorSettingsJson ?? null,
        uiTokensJson: existingDraft?.uiTokensJson ?? null,
        validationReportJson: existingDraft?.validationReportJson ?? null,
        hydratedAt: existingDraft?.hydratedAt ?? null,
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

    // Get the version being published so we can copy its data to the new draft.
    const publishedVersion = await prisma.moduleVersion.findUnique({ where: { id: versionId } });

    await prisma.moduleVersion.update({
      where: { id: versionId },
      data: { status: 'PUBLISHED', publishedAt: new Date(), targetThemeId: targetThemeId ?? null },
    });
    await prisma.module.update({
      where: { id: moduleId },
      data: { status: 'PUBLISHED', activeVersionId: versionId },
    });

    // Create a new DRAFT automatically so the user can keep editing after publishing.
    if (publishedVersion) {
      const allVersions = await prisma.moduleVersion.findMany({ where: { moduleId }, select: { version: true } });
      const nextVersion = (allVersions.reduce((m, v) => Math.max(m, v.version), 0) || 0) + 1;
      await prisma.moduleVersion.create({
        data: {
          moduleId,
          version: nextVersion,
          status: 'DRAFT',
          specJson: publishedVersion.specJson,
          adminConfigSchemaJson: publishedVersion.adminConfigSchemaJson,
          adminDefaultsJson: publishedVersion.adminDefaultsJson,
          themeEditorSettingsJson: publishedVersion.themeEditorSettingsJson,
          uiTokensJson: publishedVersion.uiTokensJson,
          validationReportJson: publishedVersion.validationReportJson,
          hydratedAt: publishedVersion.hydratedAt,
          implementationPlanJson: publishedVersion.implementationPlanJson,
          previewHtmlJson: publishedVersion.previewHtmlJson,
          compiledRuntimePlanJson: publishedVersion.compiledRuntimePlanJson,
        },
      });
    }
  }

  async markPublishedWithTransition(params: {
    shopId?: string;
    moduleId: string;
    versionId: string;
    targetThemeId?: string;
    source: 'merchant_api' | 'agent_api' | 'system';
    idempotencyKey: string;
  }) {
    const prisma = getPrisma();
    const transitions = new ReleaseTransitionService(prisma);

    const moduleRow = await prisma.module.findUnique({
      where: { id: params.moduleId },
      include: { versions: true },
    });
    if (!moduleRow) throw new Error('Module not found');

    const versionRow = moduleRow.versions.find((v) => v.id === params.versionId);
    if (!versionRow) throw new Error('Module version not found');

    transitions.assertPublishTransition(moduleRow.status, versionRow.status);
    await transitions.logTransition({
      shopId: params.shopId,
      moduleId: params.moduleId,
      moduleVersionId: params.versionId,
      fromModuleStatus: moduleRow.status,
      toModuleStatus: 'PUBLISHED',
      fromVersionStatus: versionRow.status,
      toVersionStatus: 'PUBLISHED',
      source: params.source,
      idempotencyKey: params.idempotencyKey,
      outcome: 'ATTEMPT',
      metadata: { targetThemeId: params.targetThemeId ?? null },
    });

    // Idempotent success path: if this version is already active and published, do not mutate.
    if (moduleRow.activeVersionId === params.versionId && versionRow.status === 'PUBLISHED') {
      await transitions.logTransition({
        shopId: params.shopId,
        moduleId: params.moduleId,
        moduleVersionId: params.versionId,
        fromModuleStatus: moduleRow.status,
        toModuleStatus: moduleRow.status,
        fromVersionStatus: versionRow.status,
        toVersionStatus: versionRow.status,
        source: params.source,
        idempotencyKey: params.idempotencyKey,
        outcome: 'IDEMPOTENT',
        metadata: { targetThemeId: params.targetThemeId ?? null },
      });
      return;
    }

    try {
      await this.markPublished(params.moduleId, params.versionId, params.targetThemeId);
      await transitions.logTransition({
        shopId: params.shopId,
        moduleId: params.moduleId,
        moduleVersionId: params.versionId,
        fromModuleStatus: moduleRow.status,
        toModuleStatus: 'PUBLISHED',
        fromVersionStatus: versionRow.status,
        toVersionStatus: 'PUBLISHED',
        source: params.source,
        idempotencyKey: params.idempotencyKey,
        outcome: 'SUCCEEDED',
        metadata: { targetThemeId: params.targetThemeId ?? null },
      });
    } catch (error) {
      await transitions.logTransition({
        shopId: params.shopId,
        moduleId: params.moduleId,
        moduleVersionId: params.versionId,
        fromModuleStatus: moduleRow.status,
        toModuleStatus: 'PUBLISHED',
        fromVersionStatus: versionRow.status,
        toVersionStatus: 'PUBLISHED',
        source: params.source,
        idempotencyKey: params.idempotencyKey,
        outcome: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        metadata: { targetThemeId: params.targetThemeId ?? null },
      });
      throw error;
    }
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

  async deleteModule(shopDomain: string, moduleId: string) {
    const prisma = getPrisma();
    const module = await prisma.module.findFirst({
      where: { id: moduleId, shop: { shopDomain } },
    });
    if (!module) throw new Error('Module not found');
    await prisma.module.delete({ where: { id: moduleId } });
  }
}

type int = number;
