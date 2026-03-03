import type { AdminApiContext } from '@shopify/shopify-app-remix/server';

export type ShopifyTheme = {
  id: number;
  name: string;
  role: string;
};

const THEMES_QUERY = `#graphql
  query getThemes {
    themes(first: 25) {
      nodes {
        id
        name
        role
      }
    }
  }
`;

export class ThemeService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async listThemes(): Promise<ShopifyTheme[]> {
    try {
      const res = await this.admin.graphql(THEMES_QUERY);
      const json = await res.json();
      const nodes = json?.data?.themes?.nodes ?? [];
      return nodes.map((t: { id: string; name: string; role: string }) => ({
        id: parseInt(t.id.replace(/\D/g, ''), 10),
        name: t.name,
        role: t.role === 'MAIN' ? 'main' : t.role === 'UNPUBLISHED' ? 'unpublished' : t.role.toLowerCase(),
      }));
    } catch {
      const res = await this.admin.rest.get({ path: 'themes.json' });
      const body = res.body as { themes?: ShopifyTheme[] } | undefined;
      const themes = body?.themes ?? [];
      return themes.map(t => ({ id: t.id, name: t.name, role: t.role }));
    }
  }

  async upsertAsset(themeId: string, key: string, value: string): Promise<void> {
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
