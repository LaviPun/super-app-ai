import type { AdminApiContext } from '@shopify/shopify-app-remix/server';

export class MetafieldService {
  constructor(private readonly admin: AdminApiContext['admin']) {}

  async setShopMetafield(namespace: string, key: string, type: string, value: string): Promise<void> {
    // Using GraphQL to avoid REST version mismatches.
    const mutation = `#graphql
      mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }
    `;
    const shopGid = await this.getShopGid();
    const res = await this.admin.graphql(mutation, {
      variables: {
        metafields: [{
          ownerId: shopGid,
          namespace,
          key,
          type,
          value,
        }],
      },
    });
    const json = await res.json();
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldsSet error: ${errs[0].message}`);
  }

  async deleteShopMetafield(namespace: string, key: string): Promise<void> {
    const query = `#graphql
      query FindMetafield($namespace: String!, $key: String!) {
        shop {
          metafield(namespace: $namespace, key: $key) { id }
        }
      }
    `;
    const res = await this.admin.graphql(query, { variables: { namespace, key }});
    const json = await res.json();
    const id = json?.data?.shop?.metafield?.id;
    if (!id) return;

    const mutation = `#graphql
      mutation DeleteMetafield($input: MetafieldDeleteInput!) {
        metafieldDelete(input: $input) {
          deletedId
          userErrors { field message }
        }
      }
    `;
    const del = await this.admin.graphql(mutation, { variables: { input: { id } }});
    const delJson = await del.json();
    const errs = delJson?.data?.metafieldDelete?.userErrors ?? [];
    if (errs.length) throw new Error(`metafieldDelete error: ${errs[0].message}`);
  }

  private async getShopGid(): Promise<string> {
    const query = `#graphql
      query ShopId { shop { id } }
    `;
    const res = await this.admin.graphql(query);
    const json = await res.json();
    const id: string | undefined = json?.data?.shop?.id;
    if (!id) throw new Error('Unable to fetch shop id');
    return id;
  }
}
