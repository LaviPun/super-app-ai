import type { AdminApiContext } from '@shopify/shopify-app-remix/server';

export class ThemeService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async upsertAsset(themeId: string, key: string, value: string): Promise<void> {
    // REST Asset API is the simplest for theme assets.
    // @shopify/shopify-api provides resource helpers, but we keep a minimal call here.
    const path = `themes/${themeId}/assets.json`;
    await this.admin.rest.post({
      path,
      data: { asset: { key, value } },
    });
  }

  async deleteAsset(themeId: string, key: string): Promise<void> {
    const path = `themes/${themeId}/assets.json`;
    await this.admin.rest.delete({
      path,
      query: { 'asset[key]': key },
    });
  }
}
