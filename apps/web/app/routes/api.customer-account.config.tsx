/**
 * Customer Account UI extension config endpoint.
 *
 * Reads the customerAccount.blocks metafield config for a shop, used by the
 * customer account UI extension (sandboxed, config-driven — no arbitrary HTML/scripts).
 *
 * The extension reads: superapp.customer_account / blocks
 */
import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';

export async function loader({ request }: { request: Request }) {
  const { admin, session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: 'GET', path: '/api/customer-account/config' },
    async () => {
      const query = `#graphql
        query GetCustomerAccountConfig {
          shop {
            metafield(namespace: "superapp.customer_account", key: "blocks") {
              value
            }
          }
        }
      `;
      const res = await admin.graphql(query);
      const data = await res.json();
      const value = data?.data?.shop?.metafield?.value;

      if (!value) {
        return json({ configured: false, config: null });
      }

      let config: unknown;
      try {
        config = JSON.parse(value);
      } catch {
        config = null;
      }

      return json({ configured: true, config, shop: session.shop });
    }
  );
}
