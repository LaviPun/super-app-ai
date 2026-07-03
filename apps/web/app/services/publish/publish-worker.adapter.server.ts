import type {
  DeployTarget,
  PublishCompiledOutput,
  PublishDeployOperation,
  PublishJobPayload,
  PublishWorkerAdapters,
  RecipeSpec,
} from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';
import { compileRecipe } from '~/services/recipes/compiler';
import type { CompileResult } from '~/services/recipes/compiler/types';
import { PublishService } from '~/services/publish/publish.service';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function mapCompileResultToPublishOutput(result: CompileResult, moduleId?: string): PublishCompiledOutput {
  const operations: PublishDeployOperation[] = [];

  if (result.themeModulePayload && moduleId) {
    operations.push({ kind: 'THEME_MODULE_UPSERT', moduleId, payload: payloadRecord(result.themeModulePayload) });
  }
  if (result.adminBlockPayload && moduleId) {
    operations.push({ kind: 'ADMIN_BLOCK_UPSERT', moduleId, payload: payloadRecord(result.adminBlockPayload) });
  }
  if (result.adminActionPayload && moduleId) {
    operations.push({ kind: 'ADMIN_ACTION_UPSERT', moduleId, payload: payloadRecord(result.adminActionPayload) });
  }
  if (result.checkoutUpsellPayload && moduleId) {
    operations.push({ kind: 'CHECKOUT_UPSELL_UPSERT', moduleId, payload: payloadRecord(result.checkoutUpsellPayload) });
  }
  if (result.customerAccountBlockPayload && moduleId) {
    operations.push({ kind: 'CUSTOMER_ACCOUNT_BLOCK_UPSERT', moduleId, payload: payloadRecord(result.customerAccountBlockPayload) });
  }
  if (result.proxyWidgetPayload) {
    operations.push({ kind: 'PROXY_WIDGET_UPSERT', payload: payloadRecord(result.proxyWidgetPayload) });
  }

  for (const op of result.ops) {
    if (op.kind === 'THEME_ASSET_UPSERT' || op.kind === 'THEME_ASSET_DELETE') {
      operations.push({ kind: op.kind } as never);
      continue;
    }
    if (op.kind === 'WEB_PIXEL_UPSERT') {
      // Not yet part of the core PublishDeployOperation contract; pass through
      // with its settings so the worker output stays lossless.
      operations.push({ kind: op.kind, settings: op.settings } as never);
      continue;
    }
    operations.push(op);
  }

  return {
    operations,
    compiledJson: result.compiledJson,
  };
}

export function createLegacyPublishWorkerAdapters(admin: AdminApiContext['admin']): PublishWorkerAdapters {
  const moduleService = new ModuleService();

  return {
    compiler: {
      compile(spec: RecipeSpec, target: DeployTarget) {
        return mapCompileResultToPublishOutput(compileRecipe(spec, target), target.moduleId);
      },
    },
    shopify: {
      async apply({ payload }) {
        await new PublishService(admin).publish(payload.spec, payload.target);
      },
    },
    state: {
      async getCurrent(payload) {
        const prisma = getPrisma();
        const moduleRow = await prisma.module.findUnique({
          where: { id: payload.moduleId },
          include: { versions: true },
        });
        if (!moduleRow) {
          throw new Error('Module not found');
        }
        const versionRow = moduleRow.versions.find((version) => version.id === payload.versionId);
        if (!versionRow) {
          throw new Error('Module version not found');
        }

        return {
          moduleStatus: moduleRow.status as 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED',
          versionStatus: versionRow.status as 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED',
          activeVersionId: moduleRow.activeVersionId,
        };
      },
      async markAttempt() {
        // Legacy transition logging happens in markPublishedWithTransition.
      },
      async markSucceeded({ payload }) {
        await moduleService.markPublishedWithTransition({
          shopId: payload.shopId,
          moduleId: payload.moduleId,
          versionId: payload.versionId,
          targetThemeId: payload.target.kind === 'THEME' ? payload.target.themeId : undefined,
          source: payload.source,
          idempotencyKey: payload.idempotencyKey,
        });
      },
      async markFailed() {
        // Legacy routes own JobService failure persistence until Phase 5/6 queue code lands here.
      },
      async markIdempotent(payload: PublishJobPayload) {
        await moduleService.markPublishedWithTransition({
          shopId: payload.shopId,
          moduleId: payload.moduleId,
          versionId: payload.versionId,
          targetThemeId: payload.target.kind === 'THEME' ? payload.target.themeId : undefined,
          source: payload.source,
          idempotencyKey: payload.idempotencyKey,
        });
      },
    },
  };
}
