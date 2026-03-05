import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import type { DeployTarget, RecipeSpec } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import type { ThemeModulePayload } from '~/services/recipes/compiler/types';
import { MetafieldService } from '~/services/shopify/metafield.service';

const THEME_MODULES_NAMESPACE = 'superapp.theme';
const THEME_MODULES_KEY = 'modules';

export class PublishService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async publish(spec: RecipeSpec, target: DeployTarget): Promise<{ compiledJson?: string }> {
    const result = compileRecipe(spec, target);
    const { ops, compiledJson, themeModulePayload } = result;
    const mf = new MetafieldService(this.admin);

    if (themeModulePayload && target.kind === 'THEME' && target.moduleId) {
      const raw = await mf.getShopMetafield(THEME_MODULES_NAMESPACE, THEME_MODULES_KEY);
      const modules: Record<string, ThemeModulePayload> = raw ? (JSON.parse(raw) as Record<string, ThemeModulePayload>) : {};
      modules[target.moduleId] = themeModulePayload;
      await mf.setShopMetafield(THEME_MODULES_NAMESPACE, THEME_MODULES_KEY, 'json', JSON.stringify(modules));
    }

    for (const op of ops) {
      switch (op.kind) {
        case 'THEME_ASSET_UPSERT':
        case 'THEME_ASSET_DELETE':
          throw new Error('Theme file writes are not used. Theme modules deploy via app extension (metafield).');
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
