/**
 * BlueprintService — persistence + co-deploy for multi-module blueprints.
 *
 * A blueprint reuses the existing `Recipe` row as the group (Recipe.modules),
 * so each member is a normal Module/ModuleVersion and all existing
 * compile/preview/publish paths apply unchanged. See docs/blueprints.md.
 */
import { getPrisma } from '~/db.server';
import type { DeployTarget, RecipeBlueprint } from '@superapp/core';
import { RecipeSpecSchema } from '@superapp/core';
import { ModuleService } from '~/services/modules/module.service';
import { PublishService } from '~/services/publish/publish.service';

type AdminClient = ConstructorParameters<typeof PublishService>[0];

export type BlueprintCreateResult = {
  recipeId: string;
  moduleIds: string[];
  firstModuleId: string;
};

export type BlueprintPublishResult = {
  published: string[];
  failed: Array<{ moduleId: string; error: string }>;
};

export class BlueprintService {
  /**
   * Persist a generated blueprint as a `Recipe` row + N draft `Module`s linked
   * via `recipeId`. Returns the new recipe + member module ids.
   */
  async createDraft(shopDomain: string, blueprint: RecipeBlueprint): Promise<BlueprintCreateResult> {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new Error('Shop not found');

    const primary = blueprint.modules[0];
    if (!primary) throw new Error('Blueprint has no modules');

    const recipe = await prisma.recipe.create({
      data: {
        shopId: shop.id,
        category: primary.recipe.category,
        title: blueprint.name,
        summary: blueprint.summary,
      },
    });

    const moduleService = new ModuleService();
    const moduleIds: string[] = [];
    for (const member of blueprint.modules) {
      const mod = await moduleService.createDraft(shopDomain, member.recipe, {
        recipeId: recipe.id,
        sourceType: 'recipe',
      });
      moduleIds.push(mod.id);
    }

    return { recipeId: recipe.id, moduleIds, firstModuleId: moduleIds[0]! };
  }

  /** Load a blueprint (Recipe) with its member modules + versions for the UI. */
  async getBlueprint(shopDomain: string, recipeId: string) {
    const prisma = getPrisma();
    return prisma.recipe.findFirst({
      where: { id: recipeId, shop: { shopDomain } },
      include: {
        modules: {
          include: { versions: { orderBy: { version: 'desc' } }, activeVersion: true },
        },
      },
    });
  }

  /** List blueprints (grouped recipes) for a shop, newest first. */
  async listBlueprints(shopDomain: string) {
    const prisma = getPrisma();
    return prisma.recipe.findMany({
      where: { shop: { shopDomain }, modules: { some: {} } },
      include: { modules: { select: { id: true, type: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Co-deploy all members of a blueprint, reusing the per-module PublishService.
   * Best-effort and NOT atomic (Shopify metaobject writes can't be transactional
   * across surfaces): each member is published independently; failures are
   * collected and that member stays DRAFT, retryable. Theme members require a
   * `themeId`.
   */
  async publishBlueprint(
    admin: AdminClient,
    shopDomain: string,
    recipeId: string,
    opts?: { themeId?: string },
  ): Promise<BlueprintPublishResult> {
    const prisma = getPrisma();
    const recipe = await this.getBlueprint(shopDomain, recipeId);
    if (!recipe) throw new Error('Blueprint not found');

    const publisher = new PublishService(admin);
    const published: string[] = [];
    const failed: Array<{ moduleId: string; error: string }> = [];

    for (const mod of recipe.modules) {
      const draft = mod.versions.find((v) => v.status === 'DRAFT') ?? mod.versions[0];
      if (!draft) {
        failed.push({ moduleId: mod.id, error: 'No draft version to publish.' });
        continue;
      }
      try {
        const spec = RecipeSpecSchema.parse(JSON.parse(draft.specJson));
        const isThemeModule = mod.type.startsWith('theme.') || mod.type === 'proxy.widget';
        const target: DeployTarget = isThemeModule
          ? { kind: 'THEME', themeId: opts?.themeId ?? '', moduleId: mod.id }
          : { kind: 'PLATFORM', moduleId: mod.id };
        if (target.kind === 'THEME' && !target.themeId) {
          throw new Error('themeId is required to publish a theme member.');
        }
        await publisher.publish(spec, target);
        await prisma.module.update({ where: { id: mod.id }, data: { status: 'PUBLISHED' } });
        await prisma.moduleVersion.update({
          where: { id: draft.id },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            targetThemeId: target.kind === 'THEME' ? target.themeId : null,
          },
        });
        published.push(mod.id);
      } catch (err) {
        failed.push({ moduleId: mod.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return { published, failed };
  }
}
