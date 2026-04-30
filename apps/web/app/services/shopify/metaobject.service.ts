import type { AdminApiContext } from '~/types/shopify';
import { ErrorLogService } from '~/services/observability/error-log.service';
import type {
  AdminActionPayload,
  AdminBlockPayload,
  CheckoutUpsellPayload,
  CustomerAccountBlockPayload,
  ProxyWidgetPayload,
  ThemeModulePayload,
} from '~/services/recipes/compiler/types';

const SHOP_ID_QUERY = `#graphql
  query ShopId { shop { id } }
`;

const METAOBJECT_UPSERT = `#graphql
  mutation MetaobjectUpsert($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle }
      userErrors { field message code }
    }
  }
`;

const METAOBJECT_DELETE = `#graphql
  mutation MetaobjectDelete($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors { field message }
    }
  }
`;

const SHOP_MODULE_REFS_QUERY = `#graphql
  query ShopModuleRefs($namespace: String!, $key: String!) {
    shop {
      metafield(namespace: $namespace, key: $key) { value type }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE = `#graphql
  mutation MetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

/** Max items in a list.metaobject_reference per Shopify's documented limit. */
const MAX_LIST_ITEMS = 128;

/**
 * MetaobjectService — manages metaobject entries for published SuperApp modules.
 *
 * Each published module becomes a metaobject entry (one per module per shop),
 * and the shop metafield `superapp.theme/module_refs` holds a
 * `list.metaobject_reference` pointing to all module metaobjects.
 *
 * This replaces the previous pattern of storing all module configs as one large
 * JSON blob in a single metafield, which hits Shopify's 16KB write limit (API 2026-04+)
 * at ~13 average-sized modules.
 *
 * @see docs/debug.md for migration context
 */
export class MetaobjectService {
  private shopGidPromise: Promise<string> | null = null;
  /** Track which definition keys have already been ensured in this request. */
  private ensuredDefs = new Set<string>();
  private readonly onMetafieldAccessFallback?: (event: {
    namespace: string;
    key: string;
    metaobjectType: string;
    isList: boolean;
    attemptedAccess: string;
    errorMessage: string;
  }) => Promise<void> | void;

  constructor(
    private readonly admin: AdminApiContext['admin'],
    opts?: {
      onMetafieldAccessFallback?: (event: {
        namespace: string;
        key: string;
        metaobjectType: string;
        isList: boolean;
        attemptedAccess: string;
        errorMessage: string;
      }) => Promise<void> | void;
    },
  ) {
    this.onMetafieldAccessFallback = opts?.onMetafieldAccessFallback;
  }

  // ─── Upsert helpers ────────────────────────────────────────────────────────

  /** Upsert a `$app:superapp_module` metaobject. Returns its GID. */
  async upsertModuleObject(moduleId: string, payload: ThemeModulePayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_module', handle: `superapp-module-${moduleId}` },
      [
        { key: 'module_id', value: moduleId },
        { key: 'module_type', value: payload.type },
        { key: 'name', value: payload.name },
        { key: 'activation_type', value: payload.activationType },
        { key: 'config_json', value: JSON.stringify(payload.config) },
        { key: 'style_json', value: JSON.stringify(payload.style ?? {}) },
      ],
    );
  }

  /** Upsert a `$app:superapp_admin_block` metaobject. Returns its GID. */
  async upsertAdminBlockObject(moduleId: string, payload: AdminBlockPayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_admin_block', handle: `superapp-block-${moduleId}` },
      [
        { key: 'module_id', value: moduleId },
        { key: 'module_type', value: payload.type },
        { key: 'name', value: payload.name },
        { key: 'target', value: payload.target },
        { key: 'label', value: payload.label },
        { key: 'config_json', value: JSON.stringify(payload.config) },
      ],
    );
  }

  /** Upsert a `$app:superapp_admin_action` metaobject. Returns its GID. */
  async upsertAdminActionObject(moduleId: string, payload: AdminActionPayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_admin_action', handle: `superapp-action-${moduleId}` },
      [
        { key: 'module_id', value: moduleId },
        { key: 'module_type', value: payload.type },
        { key: 'name', value: payload.name },
        { key: 'target', value: payload.target },
        { key: 'label', value: payload.label },
        { key: 'title', value: payload.title },
        { key: 'config_json', value: JSON.stringify(payload.config) },
      ],
    );
  }

  /**
   * Upsert a `$app:superapp_function_config` metaobject for a given function key.
   * Handle convention: `superapp-fn-{functionKey}` (one per function type per shop).
   * Returns its GID.
   */
  async upsertFunctionConfigObject(functionKey: string, config: unknown): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_function_config', handle: `superapp-fn-${functionKey}` },
      [
        { key: 'function_key', value: functionKey },
        { key: 'config_json', value: JSON.stringify(config) },
      ],
    );
  }

  /** Upsert a `$app:superapp_checkout_upsell` metaobject. Returns its GID. */
  async upsertCheckoutUpsellObject(moduleId: string, payload: CheckoutUpsellPayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_checkout_upsell', handle: `superapp-checkout-upsell-${moduleId}` },
      [
        { key: 'module_id', value: moduleId },
        { key: 'module_type', value: payload.type },
        { key: 'name', value: payload.name },
        { key: 'config_json', value: JSON.stringify(payload.config) },
      ],
    );
  }

  /** Upsert a `$app:superapp_customer_account_block` metaobject. Returns its GID. */
  async upsertCustomerAccountBlockObject(moduleId: string, payload: CustomerAccountBlockPayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_customer_account_block', handle: `superapp-ca-block-${moduleId}` },
      [
        { key: 'module_id', value: moduleId },
        { key: 'module_type', value: payload.type },
        { key: 'name', value: payload.name },
        { key: 'target', value: payload.target },
        { key: 'config_json', value: JSON.stringify(payload.config) },
      ],
    );
  }

  /**
   * Upsert a `$app:superapp_proxy_widget` metaobject.
   * Handle convention: `superapp-proxy-{widgetId}` (one per widgetId per shop).
   * Returns its GID.
   */
  async upsertProxyWidgetObject(payload: ProxyWidgetPayload): Promise<string> {
    return this.upsertMetaobject(
      { type: '$app:superapp_proxy_widget', handle: `superapp-proxy-${payload.widgetId}` },
      [
        { key: 'widget_id', value: payload.widgetId },
        { key: 'name', value: payload.name },
        { key: 'config_json', value: JSON.stringify(payload.config) },
        { key: 'style_css', value: payload.styleCss },
      ],
    );
  }

  // ─── List ref metafield ────────────────────────────────────────────────────

  /** Read the current GID array from a list.metaobject_reference shop metafield. */
  async getModuleGidList(namespace: string, key: string): Promise<string[]> {
    const res = await this.admin.graphql(SHOP_MODULE_REFS_QUERY, {
      variables: { namespace, key },
    });
    const json = await res.json();
    const raw: string | null = json?.data?.shop?.metafield?.value ?? null;
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Write the updated GID array back to a list.metaobject_reference shop metafield.
   *
   * PRO PLAN SHARDING NOTE: If gids.length > 128, split across multiple list metafields
   * (`module_refs_2`, `module_refs_3`, etc.) and update Liquid to read all lists.
   * GROWTH cap is 100 modules, so this is safe for all current plan tiers.
   */
  async setModuleGidList(namespace: string, key: string, gids: string[]): Promise<void> {
    if (gids.length > MAX_LIST_ITEMS) {
      throw new Error(
        `Module list (${gids.length} items) exceeds the ${MAX_LIST_ITEMS}-item list.metaobject_reference limit. ` +
        `Sharding across multiple metafields is required for PRO tier.`,
      );
    }
    const shopGid = await this.getShopGid();
    const res = await this.admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [{
          ownerId: shopGid,
          namespace,
          key,
          type: 'list.metaobject_reference',
          value: JSON.stringify(gids),
        }],
      },
    });
    const json = await res.json();
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) throw new Error(`setModuleGidList error: ${errs[0].message}`);
  }

  /** Write a single GID to a metaobject_reference shop metafield (used for function configs). */
  async setModuleRef(namespace: string, key: string, gid: string): Promise<void> {
    const shopGid = await this.getShopGid();
    const res = await this.admin.graphql(METAFIELDS_SET, {
      variables: {
        metafields: [{
          ownerId: shopGid,
          namespace,
          key,
          type: 'metaobject_reference',
          value: gid,
        }],
      },
    });
    const json = await res.json();
    const errs = json?.data?.metafieldsSet?.userErrors ?? [];
    if (errs.length) throw new Error(`setModuleRef error: ${errs[0].message}`);
  }

  // ─── Metafield definition ──────────────────────────────────────────────────

  /**
   * Ensure a list.metaobject_reference (or metaobject_reference) metafield definition
   * exists on the Shop resource. Idempotent — silently swallows "already exists" errors.
   * Results are cached per-request so repeated calls (e.g. per-module publish) are no-ops.
   */
  async ensureMetafieldDefinition(
    namespace: string,
    key: string,
    metaobjectType: string,
    isList: boolean,
  ): Promise<void> {
    const cacheKey = `${namespace}/${key}`;
    if (this.ensuredDefs.has(cacheKey)) return;

    const type = isList ? 'list.metaobject_reference' : 'metaobject_reference';
    const accessCandidates: Array<Record<string, string>> = [
      { admin: 'MERCHANT_READ_WRITE', storefront: 'PUBLIC_READ' },
      { admin: 'MERCHANT_READ_WRITE' },
      { admin: 'PUBLIC_READ_WRITE', storefront: 'PUBLIC_READ' },
      { admin: 'PUBLIC_READ_WRITE' },
    ];
    let lastErr: { message: string } | null = null;

    for (let i = 0; i < accessCandidates.length; i += 1) {
      const access = accessCandidates[i]!;
      const firstErr = await this.tryCreateMetafieldDefinition({
        namespace,
        key,
        name: key,
        type,
        ownerType: 'SHOP',
        access,
        validations: [{ name: 'metaobject_definition_type', value: metaobjectType }],
      });
      if (!firstErr || firstErr.code === 'TAKEN') {
        this.ensuredDefs.add(cacheKey);
        return;
      }

      const isPolicyConstraint = this.isMetafieldAccessCompatibilityError(firstErr.message);
      const hasNextCandidate = i < accessCandidates.length - 1;
      if (isPolicyConstraint && hasNextCandidate) {
        await this.emitMetafieldAccessFallback({
          namespace,
          key,
          metaobjectType,
          isList,
          attemptedAccess: JSON.stringify(access),
          errorMessage: firstErr.message,
        });
        lastErr = firstErr;
        continue;
      }

      throw new Error(`ensureMetafieldDefinition error: ${firstErr.message}`);
    }

    throw new Error(`ensureMetafieldDefinition error: ${lastErr?.message ?? 'Unknown error'}`);
  }

  private async emitMetafieldAccessFallback(event: {
    namespace: string;
    key: string;
    metaobjectType: string;
    isList: boolean;
    attemptedAccess: string;
    errorMessage: string;
  }): Promise<void> {
    if (this.onMetafieldAccessFallback) {
      try {
        await this.onMetafieldAccessFallback(event);
      } catch {
        // Observability hooks must never block publish flow.
      }
      return;
    }

    const logger = new ErrorLogService();
    await logger.warn('SHOPIFY_METAFIELD_ACCESS_FALLBACK', event);
  }

  private isMetafieldAccessCompatibilityError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('setting this access control is not permitted') ||
      normalized.includes('must be one of ["public_read_write"]') ||
      (normalized.includes('access.admin') &&
        normalized.includes('public_read_write') &&
        normalized.includes('merchant_read'))
    );
  }

  private async tryCreateMetafieldDefinition(definition: {
    namespace: string;
    key: string;
    name: string;
    type: string;
    ownerType: string;
    access: Record<string, string>;
    validations: Array<{ name: string; value: string }>;
  }): Promise<{ code?: string; message: string } | null> {
    try {
      const res = await this.admin.graphql(METAFIELD_DEFINITION_CREATE, {
        variables: { definition },
      });
      const json = (await res.json()) as {
        errors?: Array<{ message?: string }>;
        data?: { metafieldDefinitionCreate?: { userErrors?: Array<{ code?: string; message: string }> } };
      };
      const graphqlErr = (json?.errors?.[0]?.message ?? null) as string | null;
      if (graphqlErr) return { message: graphqlErr };

      const errs: Array<{ code?: string; message: string }> = json?.data?.metafieldDefinitionCreate?.userErrors ?? [];
      return errs[0] ?? null;
    } catch (err: unknown) {
      if (err instanceof Error) return { message: err.message };
      return { message: String(err) };
    }
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  /** Delete a metaobject by its GID (used on module unpublish/delete). */
  async deleteMetaobject(gid: string): Promise<void> {
    const res = await this.admin.graphql(METAOBJECT_DELETE, { variables: { id: gid } });
    const json = await res.json();
    const errs = json?.data?.metaobjectDelete?.userErrors ?? [];
    if (errs.length) throw new Error(`metaobjectDelete error: ${errs[0].message}`);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async upsertMetaobject(
    handle: { type: string; handle: string },
    fields: Array<{ key: string; value: string }>,
  ): Promise<string> {
    const res = await this.admin.graphql(METAOBJECT_UPSERT, {
      variables: { handle, metaobject: { fields } },
    });
    const json = await res.json();
    const errs = json?.data?.metaobjectUpsert?.userErrors ?? [];
    if (errs.length) throw new Error(`metaobjectUpsert error: ${errs[0].message}`);
    const id: string | undefined = json?.data?.metaobjectUpsert?.metaobject?.id;
    if (!id) throw new Error('metaobjectUpsert returned no id');
    return id;
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
