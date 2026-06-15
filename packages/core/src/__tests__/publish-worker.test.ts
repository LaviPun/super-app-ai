import { describe, expect, it, vi } from 'vitest';
import type { PublishWorkerAdapters, PublishWorkerState } from '../publish-worker.js';
import { PublishWorkerError, runPublishJob } from '../publish-worker.js';

const baseSpec = {
  type: 'theme.section',
  name: 'Free Shipping Banner',
  category: 'STOREFRONT_UI',
  config: {
    kind: 'banner',
    fields: { heading: 'Free shipping over $50', enableAnimation: false },
  },
};

const basePayload = {
  jobId: 'job_123',
  shopId: 'shop_123',
  shopDomain: 'example.myshopify.com',
  moduleId: 'mod_123',
  versionId: 'ver_123',
  idempotencyKey: 'publish:example:mod_123:ver_123:theme_1',
  source: 'merchant_api',
  target: { kind: 'THEME', themeId: '1', moduleId: 'mod_123' },
  spec: baseSpec,
};

function buildAdapters(state: PublishWorkerState): PublishWorkerAdapters {
  return {
    compiler: {
      compile: vi.fn().mockResolvedValue({
        operations: [
          {
            kind: 'THEME_MODULE_UPSERT',
            moduleId: 'mod_123',
            payload: { type: 'theme.section', name: 'Free Shipping Banner', config: {} },
          },
        ],
        compiledJson: '{"ok":true}',
      }),
    },
    shopify: {
      apply: vi.fn().mockResolvedValue(undefined),
    },
    state: {
      getCurrent: vi.fn().mockResolvedValue(state),
      markAttempt: vi.fn().mockResolvedValue(undefined),
      markSucceeded: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      markIdempotent: vi.fn().mockResolvedValue(undefined),
    },
    events: {
      emit: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('publish worker boundary', () => {
  it('publishes a valid RecipeSpec/config-driven output and records success', async () => {
    const adapters = buildAdapters({
      moduleStatus: 'DRAFT',
      versionStatus: 'DRAFT',
      activeVersionId: null,
    });

    const result = await runPublishJob(basePayload, adapters);

    expect(result).toEqual({
      status: 'published',
      moduleId: 'mod_123',
      versionId: 'ver_123',
      compiledJson: '{"ok":true}',
    });
    expect(adapters.compiler.compile).toHaveBeenCalledOnce();
    expect(adapters.shopify.apply).toHaveBeenCalledOnce();
    expect(adapters.state.markSucceeded).toHaveBeenCalledOnce();
    expect(adapters.state.markFailed).not.toHaveBeenCalled();
  });

  it('treats an already active published version as idempotent without Shopify calls', async () => {
    const adapters = buildAdapters({
      moduleStatus: 'PUBLISHED',
      versionStatus: 'PUBLISHED',
      activeVersionId: 'ver_123',
    });

    const result = await runPublishJob(basePayload, adapters);

    expect(result).toEqual({ status: 'idempotent', moduleId: 'mod_123', versionId: 'ver_123' });
    expect(adapters.compiler.compile).not.toHaveBeenCalled();
    expect(adapters.shopify.apply).not.toHaveBeenCalled();
    expect(adapters.state.markIdempotent).toHaveBeenCalledOnce();
    expect(adapters.state.markAttempt).not.toHaveBeenCalled();
  });

  it('rejects invalid payloads before reading state or applying Shopify operations', async () => {
    const adapters = buildAdapters({
      moduleStatus: 'DRAFT',
      versionStatus: 'DRAFT',
      activeVersionId: null,
    });

    await expect(runPublishJob({ ...basePayload, spec: { type: 'raw.liquid' } }, adapters)).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
    expect(adapters.state.getCurrent).not.toHaveBeenCalled();
    expect(adapters.shopify.apply).not.toHaveBeenCalled();
  });

  it('marks failed when the Shopify adapter fails', async () => {
    const adapters = buildAdapters({
      moduleStatus: 'DRAFT',
      versionStatus: 'DRAFT',
      activeVersionId: null,
    });
    vi.mocked(adapters.shopify.apply).mockRejectedValueOnce(new Error('Missing write_metaobjects scope'));

    await expect(runPublishJob(basePayload, adapters)).rejects.toMatchObject({
      code: 'SHOPIFY_ADAPTER_FAILED',
      message: 'Missing write_metaobjects scope',
    });
    expect(adapters.state.markFailed).toHaveBeenCalledOnce();
    expect(adapters.state.markSucceeded).not.toHaveBeenCalled();
  });

  it('blocks inline API/theme-file execution operations from the worker contract', async () => {
    const adapters = buildAdapters({
      moduleStatus: 'DRAFT',
      versionStatus: 'DRAFT',
      activeVersionId: null,
    });
    vi.mocked(adapters.compiler.compile).mockResolvedValueOnce({
      operations: [
        {
          kind: 'THEME_ASSET_UPSERT',
          themeId: '1',
          key: 'assets/generated.js',
          value: 'alert("nope")',
        },
      ],
    } as never);

    const result = runPublishJob(basePayload, adapters);

    await expect(result).rejects.toBeInstanceOf(PublishWorkerError);
    await expect(result).rejects.toMatchObject({
      code: 'UNSAFE_DEPLOY_OPERATION',
    });
    expect(adapters.shopify.apply).not.toHaveBeenCalled();
  });
});
