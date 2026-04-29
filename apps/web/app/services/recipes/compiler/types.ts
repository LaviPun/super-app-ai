export type DeployOperation =
  | { kind: 'THEME_ASSET_UPSERT'; themeId: string; key: string; value: string }
  | { kind: 'THEME_ASSET_DELETE'; themeId: string; key: string }
  | { kind: 'SHOP_METAFIELD_SET'; namespace: string; key: string; type: string; value: string }
  | { kind: 'SHOP_METAFIELD_DELETE'; namespace: string; key: string }
  /**
   * Upsert a `$app:superapp_function_config` metaobject for a Shopify Function.
   * PublishService writes this to the metaobject + sets a metaobject_reference shop metafield.
   * API 2026-04+ compliant — no large JSON blobs.
   */
  | { kind: 'FUNCTION_CONFIG_UPSERT'; functionKey: string; config: unknown }
  /**
   * Ensure a list.metaobject_reference (or metaobject_reference) metafield definition
   * exists on the Shop resource before writing to it.
   */
  | { kind: 'METAOBJECT_ENSURE_DEF'; namespace: string; key: string; metaobjectType: string; isList: boolean }
  | { kind: 'AUDIT'; action: string; details?: string };

/** Payload for a theme module stored as a $app:superapp_module metaobject entry. */
export type ThemeModulePayload = {
  type: string;
  name: string;
  /** How this module is activated on the storefront.
   *  - 'global'  → rendered automatically by the app embed block on every page
   *  - 'section' → merchant places it in any section via the universal-slot block
   *  - 'block'   → merchant places it in a product/collection section via product-slot or collection-slot
   */
  activationType: 'global' | 'section' | 'block';
  config: Record<string, unknown>;
  style?: Record<string, unknown>;
};

/** Payload for an admin block stored as a $app:superapp_admin_block metaobject entry. */
export type AdminBlockPayload = {
  type: string;
  name: string;
  /** Shopify admin surface target, e.g. 'admin.order-details.block.render' */
  target: string;
  label: string;
  config: Record<string, unknown>;
};

/** Payload for an admin action stored as a $app:superapp_admin_action metaobject entry. */
export type AdminActionPayload = {
  type: string;
  name: string;
  /** Shopify admin surface target, e.g. 'admin.order-details.action.render' */
  target: string;
  /** Text shown in the "More actions" menu entry. */
  label: string;
  /** Heading displayed inside the action modal. */
  title: string;
  config: Record<string, unknown>;
};

/** Payload for a checkout upsell stored as a $app:superapp_checkout_upsell metaobject entry. */
export type CheckoutUpsellPayload = {
  type: string;
  name: string;
  config: Record<string, unknown>;
};

/** Payload for a customer account block stored as a $app:superapp_customer_account_block metaobject entry. */
export type CustomerAccountBlockPayload = {
  type: string;
  name: string;
  /** Customer account surface target, e.g. 'customer-account.order-index.block.render' */
  target: string;
  config: Record<string, unknown>;
};

/** Payload for a proxy widget stored as a $app:superapp_proxy_widget metaobject entry. */
export type ProxyWidgetPayload = {
  widgetId: string;
  name: string;
  config: Record<string, unknown>;
  /** Pre-compiled inline CSS (style vars + base rules + custom CSS). */
  styleCss: string;
};

export type CompileResult = {
  ops: DeployOperation[];
  compiledJson?: string;
  /** When set, PublishService upserts a $app:superapp_module metaobject and adds it to superapp.theme/module_refs. */
  themeModulePayload?: ThemeModulePayload;
  /** When set, PublishService upserts a $app:superapp_admin_block metaobject and adds it to superapp.admin/block_refs. */
  adminBlockPayload?: AdminBlockPayload;
  /** When set, PublishService upserts a $app:superapp_admin_action metaobject and adds it to superapp.admin/action_refs. */
  adminActionPayload?: AdminActionPayload;
  /** When set, PublishService upserts a $app:superapp_checkout_upsell metaobject and adds it to superapp.checkout/upsell_refs. */
  checkoutUpsellPayload?: CheckoutUpsellPayload;
  /** When set, PublishService upserts a $app:superapp_customer_account_block metaobject and adds it to superapp.customer_account/block_refs. */
  customerAccountBlockPayload?: CustomerAccountBlockPayload;
  /** When set, PublishService upserts a $app:superapp_proxy_widget metaobject (handle: superapp-proxy-{widgetId}). */
  proxyWidgetPayload?: ProxyWidgetPayload;
};
