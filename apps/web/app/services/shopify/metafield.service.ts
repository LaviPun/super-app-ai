import type { AdminApiContext } from '@shopify/shopify-app-remix/server';

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
    const res = await this.admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [{ ownerId: shopGid, namespace, key, type, value }],
      },
    });
    const json = await res.json();
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldsSet error: ${errs[0].message}`);
  }

  async deleteShopMetafield(namespace: string, key: string): Promise<void> {
    const shopGid = await this.getShopGid();
    const res = await this.admin.graphql(METAFIELDS_DELETE, {
      variables: {
        metafields: [{ ownerId: shopGid, namespace, key }],
      },
    });
    const json = await res.json();
    const errs = json?.data?.metafieldsDelete?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldsDelete error: ${errs[0].message}`);
  }

  async getShopMetafield(namespace: string, key: string): Promise<string | null> {
    const res = await this.admin.graphql(SHOP_METAFIELD_QUERY, {
      variables: { namespace, key },
    });
    const json = await res.json();
    const value = json?.data?.shop?.metafield?.value ?? null;
    return value;
  }

  private getShopGid(): Promise<string> {
    if (!this.shopGidPromise) {
      this.shopGidPromise = (async () => {
        const res = await this.admin.graphql(SHOP_ID_QUERY);
        const json = await res.json();
        const id: string | undefined = json?.data?.shop?.id;
        if (!id) throw new Error('Unable to fetch shop id');
        return id;
      })();
    }
    return this.shopGidPromise;
  }
}
