import {
  PreviewEnvelopeSchema,
  PreviewQuerySchema,
  assertPreviewContentIsRecipeSafe,
  buildPreviewStorageKey,
  defaultPreviewPolicy,
  type PreviewEnvelope,
  type PreviewQuery,
} from '@superapp/platform-contracts';
import { StorageAdapterError, type StorageAdapter } from '@superapp/workers';

export type PreviewSandboxServiceOptions = {
  storage: StorageAdapter;
  version?: string;
};

export class PreviewSandboxService {
  private readonly storage: StorageAdapter;
  private readonly version: string;

  constructor(options: PreviewSandboxServiceOptions) {
    this.storage = options.storage;
    this.version = options.version ?? '1';
  }

  buildEnvelope(query: PreviewQuery, contentType: 'text/html' | 'application/json'): PreviewEnvelope {
    const storageKey = buildPreviewStorageKey({
      shopId: query.shopId,
      moduleId: query.moduleId,
      revisionId: query.revisionId,
      assetId: query.assetId,
      contentType,
    });

    return PreviewEnvelopeSchema.parse({
      shopId: query.shopId,
      moduleId: query.moduleId,
      revisionId: query.revisionId,
      version: this.version,
      recipeSpecRef: query.revisionId,
      renderConfig: { source: 'recipe-spec-compiler' },
      themeContext: {},
      allowedAssets: [],
      policy: defaultPreviewPolicy(),
      storageKey,
      contentType,
      assetId: query.assetId,
    });
  }

  async loadPreviewHtml(query: PreviewQuery): Promise<{ envelope: PreviewEnvelope; html: string } | null> {
    const envelope = this.buildEnvelope(query, 'text/html');

    try {
      const object = await this.storage.getObject(envelope.storageKey);
      const html = new TextDecoder().decode(object.body);
      assertPreviewContentIsRecipeSafe(html);
      return { envelope, html };
    } catch (error) {
      if (error instanceof StorageAdapterError && error.code === 'OBJECT_NOT_FOUND') {
        return null;
      }
      if (error instanceof Error && error.message.includes('RecipeSpec/config-safe')) {
        throw new StorageAdapterError('UNSAFE_PREVIEW_ARTIFACT', error.message);
      }
      throw error;
    }
  }

  parseQuery(input: {
    shopId: string;
    moduleId: string;
    revisionId?: string;
    assetId?: string;
  }) {
    return PreviewQuerySchema.safeParse(input);
  }
}
