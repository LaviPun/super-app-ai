import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';

export type ActivationKind =
  | 'discount'
  | 'deliveryCustomization'
  | 'paymentCustomization'
  | 'validation'
  | 'fulfillmentConstraintRule'
  | 'cartTransform';

/**
 * functionKey → activation wiring. GROWN ONE ENTRY PER WS-E TASK, in the same
 * commit that implements the kind + un-gates the module type. Keys match the
 * compiler's FUNCTION_CONFIG_UPSERT functionKey values; handles match
 * extensions/[*]/shopify.extension.toml (pinned by deployed-manifest test).
 */
export const FUNCTION_KEY_ACTIVATION: Record<string, { kind: ActivationKind; functionHandle: string }> = {
  discountRules: { kind: 'discount', functionHandle: 'discount-function' },
};

const DISCOUNT_TITLE = 'SuperApp Discounts';
/** Pre-WS-E title written by the removed BundleProductService.ensureAutomaticBundleDiscount. */
const LEGACY_BUNDLE_DISCOUNT_TITLE = 'SuperApp Bundle Pricing';

// All documents below validated against Admin GraphQL 2026-07 (Shopify Dev MCP).
const DISCOUNT_NODES_LOOKUP = `#graphql
  query SuperAppDiscountActivationLookup {
    discountNodes(first: 50) {
      nodes { id discount { __typename ... on DiscountAutomaticApp { title } } }
    }
  }
`;
const DISCOUNT_CREATE = `#graphql
  mutation SuperAppDiscountActivationCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;
const DISCOUNT_UPDATE = `#graphql
  mutation SuperAppDiscountActivationUpdate($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;
const DISCOUNT_DELETE = `#graphql
  mutation SuperAppDiscountActivationDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;

type StoredActivation = { functionKey: string; kind: string; activationGid: string };

/** userError messages that mean "already gone" — deletes treat them as success. */
function isMissingResourceError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('not found') || m.includes('does not exist') || m.includes("doesn't exist");
}

export class ActivationService {
  constructor(
    private readonly admin: AdminApiContext['admin'],
    private readonly shopId: string,
  ) {}

  async ensureForFunctionKey(functionKey: string): Promise<string | null> {
    const mapping = FUNCTION_KEY_ACTIVATION[functionKey];
    if (!mapping) return null;
    switch (mapping.kind) {
      case 'discount':
        return this.ensureDiscount(functionKey, mapping.functionHandle);
      default: {
        // A mapping was added without its ensure implementation — plan violation.
        throw new Error(`ActivationService: kind "${mapping.kind}" has no ensure implementation`);
      }
    }
  }

  async deleteForFunctionKey(functionKey: string): Promise<void> {
    const mapping = FUNCTION_KEY_ACTIVATION[functionKey];
    if (!mapping) return;
    const stored = await this.getStored(functionKey);
    if (!stored) return; // nothing recorded → nothing to delete (recovery deletes are Task 10's probe concern)
    switch (mapping.kind) {
      case 'discount':
        await this.deleteWith(DISCOUNT_DELETE, stored.activationGid, 'discountAutomaticDelete');
        break;
      default:
        throw new Error(`ActivationService: kind "${mapping.kind}" has no delete implementation`);
    }
    await this.clearStored(functionKey);
  }

  // ── discount ──────────────────────────────────────────────────────────────

  private async ensureDiscount(functionKey: string, functionHandle: string): Promise<string> {
    const stored = await this.getStored(functionKey);
    if (stored) return stored.activationGid;

    // Recovery/adoption: exactly ONE automatic-app-discount node per shop for this
    // function — a second node would run the wasm twice and double-apply discounts.
    const lookup = await this.graphqlJson<{
      discountNodes: { nodes: Array<{ id: string; discount: { __typename: string; title?: string } }> };
    }>(DISCOUNT_NODES_LOOKUP);
    const found = (lookup.data?.discountNodes?.nodes ?? []).find(
      (n) =>
        n.discount.__typename === 'DiscountAutomaticApp' &&
        (n.discount.title === DISCOUNT_TITLE || n.discount.title === LEGACY_BUNDLE_DISCOUNT_TITLE),
    );
    if (found) {
      if ((lookupTitle(found) ?? '') !== DISCOUNT_TITLE) {
        const upd = await this.graphqlJson<{
          discountAutomaticAppUpdate: { automaticAppDiscount?: { discountId: string }; userErrors: Array<{ message: string }> };
        }>(DISCOUNT_UPDATE, { id: found.id, discount: { title: DISCOUNT_TITLE } });
        const err = upd.data?.discountAutomaticAppUpdate?.userErrors?.[0];
        if (err) throw new Error(`discountAutomaticAppUpdate failed: ${err.message}`);
      }
      await this.store(functionKey, 'discount', found.id);
      return found.id;
    }

    const created = await this.graphqlJson<{
      discountAutomaticAppCreate: { automaticAppDiscount?: { discountId: string }; userErrors: Array<{ message: string }> };
    }>(DISCOUNT_CREATE, {
      discount: {
        title: DISCOUNT_TITLE,
        // 2026-07: functionId input is deprecated — bind by handle.
        functionHandle,
        // superapp-discount targets cart.lines.discounts.generate.run → per-line PRODUCT discounts.
        discountClasses: ['PRODUCT'],
        startsAt: new Date().toISOString(),
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    });
    const err = created.data?.discountAutomaticAppCreate?.userErrors?.[0];
    if (err) throw new Error(`discountAutomaticAppCreate failed: ${err.message}`);
    const id = created.data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId;
    if (!id) throw new Error('discountAutomaticAppCreate returned no id');
    await this.store(functionKey, 'discount', id);
    return id;
  }

  // ── shared plumbing ───────────────────────────────────────────────────────

  private async deleteWith(document: string, gid: string, mutationField: string): Promise<void> {
    const json = await this.graphqlJson<Record<string, { userErrors?: Array<{ message: string }> }>>(document, { id: gid });
    const err = json.data?.[mutationField]?.userErrors?.[0];
    if (err && !isMissingResourceError(err.message)) {
      throw new Error(`${mutationField} failed: ${err.message}`);
    }
  }

  private async getStored(functionKey: string): Promise<StoredActivation | null> {
    return getPrisma().functionActivation.findUnique({
      where: { shopId_functionKey: { shopId: this.shopId, functionKey } },
    });
  }

  private async store(functionKey: string, kind: ActivationKind, activationGid: string): Promise<void> {
    await getPrisma().functionActivation.upsert({
      where: { shopId_functionKey: { shopId: this.shopId, functionKey } },
      create: { shopId: this.shopId, functionKey, kind, activationGid },
      update: { kind, activationGid },
    });
  }

  private async clearStored(functionKey: string): Promise<void> {
    await getPrisma().functionActivation
      .delete({ where: { shopId_functionKey: { shopId: this.shopId, functionKey } } })
      .catch(() => {}); // row already gone == fine
  }

  private async graphqlJson<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<{ data?: T; errors?: Array<{ message?: string }> }> {
    const res = await this.admin.graphql(query, variables ? { variables } : undefined);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    // Top-level errors leave data undefined — throwing here prevents "no existing
    // node" misreads that would create duplicates (same discipline as
    // BundleProductService.graphqlJson / MetaobjectService.graphqlJson).
    if (json?.errors?.length) {
      throw new Error(json.errors.map((e) => e?.message ?? 'Unknown GraphQL error').join('; '));
    }
    return json;
  }
}

function lookupTitle(node: { discount: { title?: string } }): string | undefined {
  return node.discount.title;
}
