import type { AdminApiContext } from '~/types/shopify';

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
    const res = await this.admin.graphql(THEMES_QUERY);
    const json = await res.json() as any;
    if (json?.errors?.length) {
      throw new Error(json.errors.map((e: { message?: string }) => e.message).join('; '));
    }
    const nodes = json?.data?.themes?.nodes ?? [];
    return nodes.map((t: { id: string; name: string; role: string }) => ({
      id: parseInt(t.id.replace(/\D/g, ''), 10),
      name: t.name,
      role: t.role === 'MAIN' ? 'main' : t.role === 'UNPUBLISHED' ? 'unpublished' : t.role.toLowerCase(),
    }));
  }
}
