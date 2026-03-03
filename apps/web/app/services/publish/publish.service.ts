import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import { ThemeService } from '~/services/shopify/theme.service';
import { MetafieldService } from '~/services/shopify/metafield.service';

export class PublishService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async publish(spec: RecipeSpec, target: DeployTarget): Promise<{ compiledJson?: string }> {
    const { ops, compiledJson } = compileRecipe(spec, target);
    const theme = new ThemeService(this.admin);
    const mf = new MetafieldService(this.admin);

    for (const op of ops) {
      switch (op.kind) {
        case 'THEME_ASSET_UPSERT':
          await theme.upsertAsset(op.themeId, op.key, op.value);
          break;
        case 'THEME_ASSET_DELETE':
          await theme.deleteAsset(op.themeId, op.key);
          break;
        case 'SHOP_METAFIELD_SET':
          await mf.setShopMetafield(op.namespace, op.key, op.type, op.value);
          break;
        case 'SHOP_METAFIELD_DELETE':
          await mf.deleteShopMetafield(op.namespace, op.key);
          break;
        case 'AUDIT':
          // audit logs are written by route handlers to include actor + request context
          break;
        default: {
          const _exhaustive: never = op;
          return _exhaustive;
        }
      }
    }

    return { compiledJson };
  }
}
