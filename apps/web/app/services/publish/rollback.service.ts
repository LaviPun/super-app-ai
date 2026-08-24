import type { AdminApiContext } from '~/types/shopify';
import type { DeployTarget } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService } from '~/services/publish/publish.service';
import { ModuleService } from '~/services/modules/module.service';

/**
 * WS-E: rollback previously flipped `activeVersionId` and touched nothing in
 * Shopify — the store kept serving the version the merchant "rolled back from".
 * Real rollback = recompile the TARGET version's spec and run the normal publish
 * pipeline (idempotent republish converges every surface), then flip the DB.
 */
export class RollbackService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly session: { shop: string; shopId?: string },
  ) {}

  async rollbackToVersion(moduleId: string, version: number): Promise<{ id: string; version: number }> {
    const prisma = getPrisma();
    const mv = await prisma.moduleVersion.findFirst({
      where: { moduleId, version, module: { shop: { shopDomain: this.session.shop } } },
      include: { module: { include: { activeVersion: true } } },
    });
    if (!mv) throw new Error('Version not found');

    const spec = new RecipeService().parse(mv.specJson);
    let target: DeployTarget;
    if (spec.type.startsWith('theme.')) {
      const themeId = mv.targetThemeId ?? mv.module.activeVersion?.targetThemeId ?? null;
      if (!themeId) {
        throw new Error(
          'Cannot roll back this theme module: no target theme recorded on either version. Publish it to a theme instead.',
        );
      }
      target = { kind: 'THEME', themeId, moduleId };
    } else {
      target = { kind: 'PLATFORM', moduleId };
    }

    // Republish FIRST — only a successful deploy may move the active pointer.
    await new PublishService(this.admin, { shop: this.session.shop, shopId: this.session.shopId })
      .publish(spec, target);

    await new ModuleService().rollbackToVersion(this.session.shop, moduleId, version);
    return { id: mv.id, version: mv.version };
  }
}
