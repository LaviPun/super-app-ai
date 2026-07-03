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
  /**
   * Upsert the app's Web Pixel via webPixelCreate/webPixelUpdate.
   * `settings` must match the `[settings]` schema declared in
   * `extensions/superapp-web-pixel/shopify.extension.toml` exactly
   * (currently a single `accountID` single_line_text_field) or Shopify rejects it.
   */
  | { kind: 'WEB_PIXEL_UPSERT'; settings: Record<string, string> }
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
  /**
   * Pre-compiled inline CSS (vars + base rules + scoped custom CSS), scoped to the
   * module's `[data-module-id]` root. Folded into the metaobject's `style_json.css`
   * at publish and emitted inline by the storefront renderer so the module's style
   * actually applies (theme sections previously stored style but never rendered it).
   */
  styleCss?: string;
  /**
   * R2.1 — true when the module's display rules (`config.ruleEngine`) are entirely
   * server-resolvable (no `behavioral` rows), so the Liquid gate can emit a hard
   * pass/fail verdict rather than deferring to the client. `true` when rules are
   * absent/disabled. Convenience only; the Liquid gate also computes this inline.
   */
  ruleServerResolvable?: boolean;
  /**
   * Surface-targeted placement (theme.section `spec.placement`). When present, the
   * storefront render-gate shows this module only on the declared templates
   * (`enabled_on`) / everywhere except the declared templates (`disabled_on`),
   * matched against Liquid's `template.name`. Threaded through publish into the
   * `placement_json` metaobject field. OMITTED when the spec declares no placement,
   * so a no-placement module's payload is byte-identical to before this field existed
   * (the back-compat contract) and no gate is applied at render time.
   */
  placement?: {
    enabled_on?: { templates?: string[]; groups?: string[] };
    disabled_on?: { templates?: string[]; groups?: string[] };
  };
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
