/**
 * Customer Account UI extension config endpoint.
 *
 * Reads all $app:superapp_customer_account_block metaobject entries for a shop via
 * the superapp.customer_account/block_refs list.metaobject_reference metafield.
 *
 * The extension reads config from the metaobject references (config-driven, no arbitrary HTML/scripts).
 */
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';

const CA_BLOCK_REFS_QUERY = `#graphql
  query GetCustomerAccountBlockRefs {
    shop {
      blockRefs: metafield(namespace: "superapp.customer_account", key: "block_refs") {
        references(first: 128) {
          nodes {
            ... on Metaobject {
              moduleId:   field(key: "module_id")   { value }
              moduleType: field(key: "module_type")  { value }
              name:       field(key: "name")          { value }
              target:     field(key: "target")        { value }
              configJson: field(key: "config_json")   { value }
            }
          }
        }
      }
    }
  }
`;

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'GET', path: '/api/customer-account/config' },
    async () => {
      const res = await admin.graphql(CA_BLOCK_REFS_QUERY);
      const data = await res.json();
      const nodes = data?.data?.shop?.blockRefs?.references?.nodes ?? [];

      const blocks = nodes
        .filter((n: { moduleId?: { value?: string } }) => n?.moduleId?.value)
        .map((n: {
          moduleId: { value: string };
          moduleType: { value: string };
          name: { value: string };
          target: { value: string };
          configJson: { value: string };
        }) => {
          let config: unknown = null;
          try { config = JSON.parse(n.configJson?.value ?? 'null'); } catch { /* empty */ }
          return {
            moduleId: n.moduleId.value,
            moduleType: n.moduleType?.value,
            name: n.name?.value,
            target: n.target?.value,
            config,
          };
        });

      return json({ configured: blocks.length > 0, blocks, shop: session.shop });
    }
  );
}
