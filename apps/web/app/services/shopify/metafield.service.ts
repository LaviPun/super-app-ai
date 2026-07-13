import type { AdminApiContext } from '~/types/shopify';

/** Minimal shop query — single field for GID. */
const SHOP_ID_QUERY = `#graphql
  query ShopId { shop { id } }
`;

const SHOP_METAFIELD_QUERY = `#graphql
  query ShopMetafield($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) { value type }
    }
  }
`;

/** Set metafields — only request userErrors in response. */
const METAFIELDS_SET = `#graphql
  mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/** Delete metafields by identifier — only request userErrors. */
const METAFIELDS_DELETE = `#graphql
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

export class MetafieldService {
  /** Cached shop GID for this request to avoid repeated shop query. */
  private shopGidPromise: Promise<string> | null = null;

  constructor(private readonly admin: AdminApiContext['admin']) {}

  async setShopMetafield(namespace: string, key: string, type: string, value: string): Promise<void> {
    const shopGid = await this.getShopGid();
    const json = await this.graphqlJson(METAFIELDS_SET, {
      metafields: [{ ownerId: shopGid, namespace, key, type, value }],
    });
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldsSet error: ${errs[0].message}`);
  }

  async deleteShopMetafield(namespace: string, key: string): Promise<void> {
    const shopGid = await this.getShopGid();
    const json = await this.graphqlJson(METAFIELDS_DELETE, {
      metafields: [{ ownerId: shopGid, namespace, key }],
    });
    const errs = json?.data?.metafieldsDelete?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldsDelete error: ${errs[0].message}`);
  }

  async getShopMetafield(namespace: string, key: string): Promise<string | null> {
    const json = await this.graphqlJson(SHOP_METAFIELD_QUERY, { namespace, key });
    const value = json?.data?.shop?.metafield?.value ?? null;
    return value;
  }

  private getShopGid(): Promise<string> {
    if (!this.shopGidPromise) {
      this.shopGidPromise = (async () => {
        const json = await this.graphqlJson(SHOP_ID_QUERY);
        const id: string | undefined = json?.data?.shop?.id;
        if (!id) throw new Error('Unable to fetch shop id');
        return id;
      })();
    }
    return this.shopGidPromise;
  }

  /**
   * A top-level GraphQL error (as opposed to a mutation's userErrors) leaves `data`
   * undefined. Without this check, a transient error would look like "metafield not
   * set"/"no value" to callers, so writes and deletes could silently no-op while
   * reporting success. Throw so failures are never mistaken for empty state.
   */
  private async graphqlJson(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: any; errors?: Array<{ message?: string }> }> {
    const res = await this.admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as { data?: any; errors?: Array<{ message?: string }> };
    if (json?.errors?.length) {
      throw new Error(json.errors.map((e) => e?.message ?? 'Unknown GraphQL error').join('; '));
    }
    return json;
  }
}
