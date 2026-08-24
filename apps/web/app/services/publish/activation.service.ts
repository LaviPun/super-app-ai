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
  deliveryCustomization: { kind: 'deliveryCustomization', functionHandle: 'superapp-delivery-customization' },
  paymentCustomization: { kind: 'paymentCustomization', functionHandle: 'superapp-payment-customization' },
  cartAndCheckoutValidation: { kind: 'validation', functionHandle: 'superapp-cart-checkout-validation' },
};

const DISCOUNT_TITLE = 'SuperApp Discounts';
/** Pre-WS-E title written by the removed BundleProductService.ensureAutomaticBundleDiscount. */
const LEGACY_BUNDLE_DISCOUNT_TITLE = 'SuperApp Bundle Pricing';

/**
 * Cap on paginated adoption-lookup pages (50/page ⇒ 1000 nodes). A shop this
 * large is pathological, not the common case — the cap exists so a lookup can
 * never hang forever, not so it silently gives up and creates a duplicate.
 */
export const MAX_DISCOUNT_LOOKUP_PAGES = 20;

/**
 * Cap on paginated deliveryCustomizations adoption-lookup pages, same
 * reasoning as MAX_DISCOUNT_LOOKUP_PAGES: a shop this large is pathological,
 * not the common case.
 */
export const MAX_DELIVERY_LOOKUP_PAGES = 20;

/**
 * Cap on paginated paymentCustomizations adoption-lookup pages, same
 * reasoning as MAX_DISCOUNT_LOOKUP_PAGES / MAX_DELIVERY_LOOKUP_PAGES.
 */
export const MAX_PAYMENT_LOOKUP_PAGES = 20;

/**
 * Cap on paginated `validations` adoption-lookup pages, same reasoning as
 * MAX_DISCOUNT_LOOKUP_PAGES / MAX_DELIVERY_LOOKUP_PAGES / MAX_PAYMENT_LOOKUP_PAGES.
 * `validations` IS a connection (unlike `fulfillmentConstraintRules`, a plain
 * list) — an unpaginated first-page-only lookup would miss a legacy/matching
 * validation past page 1 on a shop with many validations, and silently fall
 * through to CREATE (double-apply: the wasm would run twice per checkout).
 */
export const MAX_VALIDATION_LOOKUP_PAGES = 20;

/**
 * Thrown when a paginated adoption lookup (discount node / delivery
 * customization / …) can't rule out an existing owner object for our function
 * within the resource's page cap (i.e. more pages remained when the cap hit).
 * Creating anyway risks a second owner object bound to this function — the
 * wasm would then run twice (double-applying a discount, double-evaluating a
 * delivery customization, etc.) — so ActivationService refuses to create and
 * surfaces this instead of a silent duplicate. The publish path sees this as
 * any other publish failure (module stays unpublished, retryable).
 */
export class ActivationLookupUnverifiableError extends Error {
  constructor(
    functionKey: string,
    pagesScanned: number,
    opts: { resourceLabel?: string; connectionField?: string; duplicateRiskNote?: string } = {},
  ) {
    const resourceLabel = opts.resourceLabel ?? 'discount node';
    const connectionField = opts.connectionField ?? 'discountNodes';
    const duplicateRiskNote =
      opts.duplicateRiskNote ??
      "a duplicate node that double-applies the discount. Investigate the shop's automatic-discount count.";
    super(
      `ActivationService: could not verify whether a ${resourceLabel} already exists for ` +
        `functions.${functionKey} after scanning ${pagesScanned} pages of ${connectionField} — ` +
        `refusing to create (would risk ${duplicateRiskNote})`,
    );
    this.name = 'ActivationLookupUnverifiableError';
  }
}

// All documents below validated against Admin GraphQL 2026-07 (Shopify Dev MCP).
// Unfiltered (no `query:` arg) deliberately — see ensureDiscount's paginated
// findExistingDiscountNode: the discountNodes connection reflects a write
// immediately, but the search-index-backed filtered form lags for several
// seconds, so a back-to-back republish could miss the just-created node.
// Pagination (not a server-side filter) is what makes the unfiltered scan safe
// on a shop with many discounts.
const DISCOUNT_NODES_LOOKUP = `#graphql
  query SuperAppDiscountActivationLookup($after: String) {
    discountNodes(first: 50, after: $after) {
      nodes { id discount { __typename ... on DiscountAutomaticApp { title } } }
      pageInfo { hasNextPage endCursor }
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

const DELIVERY_TITLE = 'SuperApp Delivery Customization';

/**
 * Resolves the app-scoped ShopifyFunction id for a handle. Delivery- and
 * payment-customization adoption (unlike discount's title match) key off
 * `functionId` — a DeliveryCustomization/PaymentCustomization node's
 * `functionId` field is authoritative for "is this node bound to OUR
 * function" — so we need the function's own id first. Binding for CREATE
 * still goes through `functionHandle` (2026-07: `functionId` input is
 * deprecated), so this lookup is recovery/adoption-matching only. Shared by
 * both kinds.
 */
const FUNCTION_LOOKUP = `#graphql
  query SuperAppFunctionLookup {
    shopifyFunctions(first: 50) { nodes { id apiType title handle } }
  }
`;
// Unfiltered (no `query:` arg), paginated — same discipline as
// DISCOUNT_NODES_LOOKUP: the search-index-backed `query: "function_id:…"` filter
// lags a write by several seconds, so a back-to-back republish could miss the
// just-created node and duplicate-create. Pagination over the full connection is
// what makes the unfiltered scan safe on a shop with many delivery customizations.
const DELIVERY_LIST = `#graphql
  query SuperAppDeliveryCustomizationList($after: String) {
    deliveryCustomizations(first: 50, after: $after) {
      nodes { id title enabled functionId }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
const DELIVERY_CREATE = `#graphql
  mutation SuperAppDeliveryCustomizationCreate($deliveryCustomization: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;
const DELIVERY_DELETE = `#graphql
  mutation SuperAppDeliveryCustomizationDelete($id: ID!) {
    deliveryCustomizationDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

const PAYMENT_TITLE = 'SuperApp Payment Customization';

// Unfiltered (no `query:` arg), paginated — same discipline as DELIVERY_LIST:
// the search-index-backed filter lags a write by several seconds, so a
// back-to-back republish could miss the just-created node and duplicate-create.
// Pagination over the full connection is what makes the unfiltered scan safe
// on a shop with many payment customizations.
const PAYMENT_LIST = `#graphql
  query SuperAppPaymentCustomizationList($after: String) {
    paymentCustomizations(first: 50, after: $after) {
      nodes { id title enabled functionId }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
const PAYMENT_CREATE = `#graphql
  mutation SuperAppPaymentCustomizationCreate($paymentCustomization: PaymentCustomizationInput!) {
    paymentCustomizationCreate(paymentCustomization: $paymentCustomization) {
      paymentCustomization { id }
      userErrors { field message }
    }
  }
`;
const PAYMENT_DELETE = `#graphql
  mutation SuperAppPaymentCustomizationDelete($id: ID!) {
    paymentCustomizationDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

const VALIDATION_TITLE = 'SuperApp Checkout Validation';

// Paginated (unlike DISCOUNT_NODES_LOOKUP/DELIVERY_LIST/PAYMENT_LIST, no
// search-index filter exists for `validations` in the first place — but the
// same discipline applies: the connection is scanned in full via `after` so a
// legacy/matching validation past page 1 is never missed, which would
// otherwise silently fall through to CREATE and double-apply the wasm at
// checkout). Node exposes `shopifyFunction.handle` directly — no separate
// FUNCTION_LOOKUP call needed for adoption matching (unlike delivery/payment).
const VALIDATION_LIST = `#graphql
  query SuperAppValidationList($after: String) {
    validations(first: 25, after: $after) {
      nodes { id enabled shopifyFunction { id handle } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;
const VALIDATION_CREATE = `#graphql
  mutation SuperAppValidationCreate($validation: ValidationCreateInput!) {
    validationCreate(validation: $validation) {
      validation { id }
      userErrors { field message }
    }
  }
`;
const VALIDATION_DELETE = `#graphql
  mutation SuperAppValidationDelete($id: ID!) {
    validationDelete(id: $id) {
      deletedId
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
      case 'deliveryCustomization':
        return this.ensureDeliveryCustomization(functionKey, mapping.functionHandle);
      case 'paymentCustomization':
        return this.ensurePaymentCustomization(functionKey, mapping.functionHandle);
      case 'validation':
        return this.ensureValidation(functionKey, mapping.functionHandle);
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
      case 'deliveryCustomization':
        await this.deleteWith(DELIVERY_DELETE, stored.activationGid, 'deliveryCustomizationDelete');
        break;
      case 'paymentCustomization':
        await this.deleteWith(PAYMENT_DELETE, stored.activationGid, 'paymentCustomizationDelete');
        break;
      case 'validation':
        await this.deleteWith(VALIDATION_DELETE, stored.activationGid, 'validationDelete');
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
    // Paginates the FULL discountNodes connection (see findExistingDiscountNode) —
    // an unpaginated first-page-only lookup would miss the legacy/canonical node on
    // a shop with >50 automatic discounts and silently fall through to CREATE.
    const found = await this.findExistingDiscountNode(functionKey);
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

  /**
   * Page through the FULL `discountNodes` connection looking for an existing
   * "SuperApp Discounts"/"SuperApp Bundle Pricing" DiscountAutomaticApp node.
   * `first: 50` per page; stops as soon as a match is found or the connection
   * is exhausted (`pageInfo.hasNextPage` false). Caps at
   * MAX_DISCOUNT_LOOKUP_PAGES pages — if the cap is hit WITHOUT a verdict
   * (pages remained), it throws rather than letting the caller fall through to
   * CREATE, which is exactly the double-apply risk this method exists to
   * prevent (see ActivationLookupUnverifiableError).
   */
  private async findExistingDiscountNode(
    functionKey: string,
  ): Promise<{ id: string; discount: { __typename: string; title?: string } } | null> {
    let after: string | undefined;
    for (let page = 0; page < MAX_DISCOUNT_LOOKUP_PAGES; page++) {
      const lookup = await this.graphqlJson<{
        discountNodes: {
          nodes: Array<{ id: string; discount: { __typename: string; title?: string } }>;
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(DISCOUNT_NODES_LOOKUP, after ? { after } : undefined);
      const found = (lookup.data?.discountNodes?.nodes ?? []).find(
        (n) =>
          n.discount.__typename === 'DiscountAutomaticApp' &&
          (n.discount.title === DISCOUNT_TITLE || n.discount.title === LEGACY_BUNDLE_DISCOUNT_TITLE),
      );
      if (found) return found;

      const pageInfo = lookup.data?.discountNodes?.pageInfo;
      if (!pageInfo?.hasNextPage) return null; // connection exhausted — genuinely safe to create
      after = pageInfo.endCursor ?? undefined;
    }
    // Cap hit while more pages remained: cannot rule out an existing node.
    console.warn(
      `[ActivationService] discountNodes lookup for functions.${functionKey} hit the ` +
        `${MAX_DISCOUNT_LOOKUP_PAGES}-page cap without a verdict — refusing to create.`,
    );
    throw new ActivationLookupUnverifiableError(functionKey, MAX_DISCOUNT_LOOKUP_PAGES);
  }

  // ── deliveryCustomization ────────────────────────────────────────────────

  private async ensureDeliveryCustomization(functionKey: string, functionHandle: string): Promise<string> {
    const stored = await this.getStored(functionKey);
    if (stored) return stored.activationGid;

    // Recovery/adoption: exactly ONE delivery customization bound to this
    // function — a second one would run the wasm twice on the same delivery
    // options. Paginates the FULL deliveryCustomizations connection (see
    // findExistingDeliveryCustomization) for the same reason the discount
    // lookup does — an unpaginated first-page-only lookup would miss the node
    // on a shop with many delivery customizations and silently fall through
    // to CREATE.
    const functionId = await this.lookupFunctionId(functionHandle);
    const found = await this.findExistingDeliveryCustomization(functionKey, functionId);
    if (found) {
      await this.store(functionKey, 'deliveryCustomization', found.id);
      return found.id;
    }

    const created = await this.graphqlJson<{
      deliveryCustomizationCreate: { deliveryCustomization?: { id: string }; userErrors: Array<{ message: string }> };
    }>(DELIVERY_CREATE, {
      deliveryCustomization: { functionHandle, title: DELIVERY_TITLE, enabled: true },
    });
    const err = created.data?.deliveryCustomizationCreate?.userErrors?.[0];
    if (err) throw new Error(`deliveryCustomizationCreate failed: ${err.message}`);
    const id = created.data?.deliveryCustomizationCreate?.deliveryCustomization?.id;
    if (!id) throw new Error('deliveryCustomizationCreate returned no id');
    await this.store(functionKey, 'deliveryCustomization', id);
    return id;
  }

  /** Resolve the app-scoped ShopifyFunction id for a handle (adoption matching only — CREATE binds by handle). */
  private async lookupFunctionId(functionHandle: string): Promise<string> {
    const json = await this.graphqlJson<{ shopifyFunctions: { nodes: Array<{ id: string; handle: string }> } }>(
      FUNCTION_LOOKUP,
    );
    const found = (json.data?.shopifyFunctions?.nodes ?? []).find((n) => n.handle === functionHandle);
    if (!found) {
      throw new Error(
        `Function "${functionHandle}" is not deployed on this shop (shopifyFunctions lookup) — run \`shopify app deploy\` first.`,
      );
    }
    return found.id;
  }

  /**
   * Page through the FULL `deliveryCustomizations` connection looking for a
   * node whose `functionId` matches ours. `first: 50` per page; stops as soon
   * as a match is found or the connection is exhausted (`pageInfo.hasNextPage`
   * false). Caps at MAX_DELIVERY_LOOKUP_PAGES pages — if the cap is hit
   * WITHOUT a verdict (pages remained), it throws rather than letting the
   * caller fall through to CREATE (see ActivationLookupUnverifiableError).
   */
  private async findExistingDeliveryCustomization(
    functionKey: string,
    functionId: string,
  ): Promise<{ id: string; functionId: string } | null> {
    let after: string | undefined;
    for (let page = 0; page < MAX_DELIVERY_LOOKUP_PAGES; page++) {
      const lookup = await this.graphqlJson<{
        deliveryCustomizations: {
          nodes: Array<{ id: string; functionId: string }>;
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(DELIVERY_LIST, after ? { after } : undefined);
      const found = (lookup.data?.deliveryCustomizations?.nodes ?? []).find((n) => n.functionId === functionId);
      if (found) return found;

      const pageInfo = lookup.data?.deliveryCustomizations?.pageInfo;
      if (!pageInfo?.hasNextPage) return null; // connection exhausted — genuinely safe to create
      after = pageInfo.endCursor ?? undefined;
    }
    // Cap hit while more pages remained: cannot rule out an existing node.
    console.warn(
      `[ActivationService] deliveryCustomizations lookup for functions.${functionKey} hit the ` +
        `${MAX_DELIVERY_LOOKUP_PAGES}-page cap without a verdict — refusing to create.`,
    );
    throw new ActivationLookupUnverifiableError(functionKey, MAX_DELIVERY_LOOKUP_PAGES, {
      resourceLabel: 'delivery customization',
      connectionField: 'deliveryCustomizations',
      duplicateRiskNote:
        "a duplicate delivery customization bound to this function (double-evaluated delivery options). Investigate the shop's delivery-customization count.",
    });
  }

  // ── paymentCustomization ─────────────────────────────────────────────────

  private async ensurePaymentCustomization(functionKey: string, functionHandle: string): Promise<string> {
    const stored = await this.getStored(functionKey);
    if (stored) return stored.activationGid;

    // Recovery/adoption: exactly ONE payment customization bound to this
    // function — a second one would run the wasm twice on the same payment
    // methods. Paginates the FULL paymentCustomizations connection (see
    // findExistingPaymentCustomization) for the same reason the delivery
    // lookup does — an unpaginated first-page-only lookup would miss the node
    // on a shop with many payment customizations and silently fall through
    // to CREATE.
    const functionId = await this.lookupFunctionId(functionHandle);
    const found = await this.findExistingPaymentCustomization(functionKey, functionId);
    if (found) {
      await this.store(functionKey, 'paymentCustomization', found.id);
      return found.id;
    }

    const created = await this.graphqlJson<{
      paymentCustomizationCreate: { paymentCustomization?: { id: string }; userErrors: Array<{ message: string }> };
    }>(PAYMENT_CREATE, {
      paymentCustomization: { functionHandle, title: PAYMENT_TITLE, enabled: true },
    });
    const err = created.data?.paymentCustomizationCreate?.userErrors?.[0];
    if (err) throw new Error(`paymentCustomizationCreate failed: ${err.message}`);
    const id = created.data?.paymentCustomizationCreate?.paymentCustomization?.id;
    if (!id) throw new Error('paymentCustomizationCreate returned no id');
    await this.store(functionKey, 'paymentCustomization', id);
    return id;
  }

  /**
   * Page through the FULL `paymentCustomizations` connection looking for a
   * node whose `functionId` matches ours. `first: 50` per page; stops as soon
   * as a match is found or the connection is exhausted (`pageInfo.hasNextPage`
   * false). Caps at MAX_PAYMENT_LOOKUP_PAGES pages — if the cap is hit
   * WITHOUT a verdict (pages remained), it throws rather than letting the
   * caller fall through to CREATE (see ActivationLookupUnverifiableError).
   */
  private async findExistingPaymentCustomization(
    functionKey: string,
    functionId: string,
  ): Promise<{ id: string; functionId: string } | null> {
    let after: string | undefined;
    for (let page = 0; page < MAX_PAYMENT_LOOKUP_PAGES; page++) {
      const lookup = await this.graphqlJson<{
        paymentCustomizations: {
          nodes: Array<{ id: string; functionId: string }>;
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(PAYMENT_LIST, after ? { after } : undefined);
      const found = (lookup.data?.paymentCustomizations?.nodes ?? []).find((n) => n.functionId === functionId);
      if (found) return found;

      const pageInfo = lookup.data?.paymentCustomizations?.pageInfo;
      if (!pageInfo?.hasNextPage) return null; // connection exhausted — genuinely safe to create
      after = pageInfo.endCursor ?? undefined;
    }
    // Cap hit while more pages remained: cannot rule out an existing node.
    console.warn(
      `[ActivationService] paymentCustomizations lookup for functions.${functionKey} hit the ` +
        `${MAX_PAYMENT_LOOKUP_PAGES}-page cap without a verdict — refusing to create.`,
    );
    throw new ActivationLookupUnverifiableError(functionKey, MAX_PAYMENT_LOOKUP_PAGES, {
      resourceLabel: 'payment customization',
      connectionField: 'paymentCustomizations',
      duplicateRiskNote:
        "a duplicate payment customization bound to this function (double-evaluated payment methods). Investigate the shop's payment-customization count.",
    });
  }

  // ── validation ────────────────────────────────────────────────────────────

  private async ensureValidation(functionKey: string, functionHandle: string): Promise<string> {
    const stored = await this.getStored(functionKey);
    if (stored) return stored.activationGid;

    // Recovery/adoption: exactly ONE validation bound to this function — a
    // second one would run the wasm twice on the same checkout. Paginates the
    // FULL validations connection (see findExistingValidation) for the same
    // reason the delivery/payment lookups do — an unpaginated first-page-only
    // lookup would miss the validation on a shop with many validations and
    // silently fall through to CREATE. Unlike delivery/payment, adoption keys
    // directly off `shopifyFunction.handle` (no separate FUNCTION_LOOKUP call).
    const found = await this.findExistingValidation(functionKey, functionHandle);
    if (found) {
      await this.store(functionKey, 'validation', found.id);
      return found.id;
    }

    const created = await this.graphqlJson<{
      validationCreate: { validation?: { id: string }; userErrors: Array<{ message: string }> };
    }>(VALIDATION_CREATE, {
      validation: {
        functionHandle,
        enable: true,
        // A validation-function timeout must not brick checkout — validation ERRORS
        // still always block (platform behavior); this only governs runtime exceptions.
        blockOnFailure: false,
        title: VALIDATION_TITLE,
      },
    });
    const err = created.data?.validationCreate?.userErrors?.[0];
    if (err) throw new Error(`validationCreate failed: ${err.message}`);
    const id = created.data?.validationCreate?.validation?.id;
    if (!id) throw new Error('validationCreate returned no id');
    await this.store(functionKey, 'validation', id);
    return id;
  }

  /**
   * Page through the FULL `validations` connection looking for a node whose
   * `shopifyFunction.handle` matches ours. `first: 25` per page; stops as soon
   * as a match is found or the connection is exhausted (`pageInfo.hasNextPage`
   * false). Caps at MAX_VALIDATION_LOOKUP_PAGES pages — if the cap is hit
   * WITHOUT a verdict (pages remained), it throws rather than letting the
   * caller fall through to CREATE (see ActivationLookupUnverifiableError).
   */
  private async findExistingValidation(
    functionKey: string,
    functionHandle: string,
  ): Promise<{ id: string } | null> {
    let after: string | undefined;
    for (let page = 0; page < MAX_VALIDATION_LOOKUP_PAGES; page++) {
      const lookup = await this.graphqlJson<{
        validations: {
          nodes: Array<{ id: string; shopifyFunction?: { handle?: string } | null }>;
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      }>(VALIDATION_LIST, after ? { after } : undefined);
      const found = (lookup.data?.validations?.nodes ?? []).find(
        (n) => n.shopifyFunction?.handle === functionHandle,
      );
      if (found) return found;

      const pageInfo = lookup.data?.validations?.pageInfo;
      if (!pageInfo?.hasNextPage) return null; // connection exhausted — genuinely safe to create
      after = pageInfo.endCursor ?? undefined;
    }
    // Cap hit while more pages remained: cannot rule out an existing node.
    console.warn(
      `[ActivationService] validations lookup for functions.${functionKey} hit the ` +
        `${MAX_VALIDATION_LOOKUP_PAGES}-page cap without a verdict — refusing to create.`,
    );
    throw new ActivationLookupUnverifiableError(functionKey, MAX_VALIDATION_LOOKUP_PAGES, {
      resourceLabel: 'validation',
      connectionField: 'validations',
      duplicateRiskNote:
        "a duplicate validation bound to this function (double-evaluated at checkout). Investigate the shop's validation count.",
    });
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
