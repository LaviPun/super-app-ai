use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Delivery-customization configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-deliveryCustomization`, field `config_json`) by
/// `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.deliveryCustomization` recipe config. Optional keys are omitted
/// from the stored JSON, so every field defaults when missing.
///
/// # Predicate widening (Build #14b)
/// `RuleWhen` was widened beyond `countryCodeIn` / `minSubtotal` to target by
/// cart contents (product / variant ids, product type / vendor) and by
/// customer (id, email, minimum prior-order count). These are evaluated at
/// runtime against the cart/buyer input, which is why the input query now reads
/// `cart.lines.merchandise.product` and `cart.buyerIdentity.customer`.
///
/// # Honest gap — tags & collections are NOT config-drivable here
/// `Product.hasTags` / `Product.inAnyCollection` take **static** tag/collection
/// arguments in the input query, so they cannot be evaluated against runtime
/// config values (the same limitation the fulfillment crate documents). Tag- and
/// collection-based targeting is therefore expressed via `productTypeIn` /
/// `vendorIn` / `productIdIn` (all runtime-evaluable) rather than raw tags.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<DeliveryRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct DeliveryRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    actions: RuleActions,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Destination country codes the rule applies to (empty = any country).
    #[shopify_function(default)]
    country_code_in: Vec<String>,
    /// Destination province/state codes the rule applies to (empty = any).
    #[shopify_function(default)]
    province_code_in: Vec<String>,
    /// Minimum cart subtotal required (absent = no minimum).
    #[shopify_function(default)]
    min_subtotal: Option<f64>,
    /// Cart must contain at least one line whose variant id is in this list
    /// (empty = no variant constraint).
    #[shopify_function(default)]
    product_variant_id_in: Vec<String>,
    /// Cart must contain at least one line whose product id is in this list
    /// (empty = no product constraint).
    #[shopify_function(default)]
    product_id_in: Vec<String>,
    /// Cart must contain at least one line whose product type is in this list
    /// (empty = no product-type constraint). Runtime substitute for a tag/type
    /// predicate (see module note).
    #[shopify_function(default)]
    product_type_in: Vec<String>,
    /// Cart must contain at least one line whose product vendor is in this list
    /// (empty = no vendor constraint).
    #[shopify_function(default)]
    vendor_in: Vec<String>,
    /// Buyer's customer id must be in this list (empty = no customer-id
    /// constraint).
    #[shopify_function(default)]
    customer_id_in: Vec<String>,
    /// Buyer's email must be in this list, case-insensitively (empty = no
    /// email constraint).
    #[shopify_function(default)]
    customer_email_in: Vec<String>,
    /// Buyer must have placed at least this many prior orders (absent = no
    /// order-count constraint). A guest checkout (no customer) never satisfies
    /// a positive minimum.
    #[shopify_function(default)]
    min_customer_orders: Option<i32>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleActions {
    /// Case-insensitive substrings; any delivery option whose title contains one
    /// is hidden.
    #[shopify_function(default)]
    hide_methods_containing: Vec<String>,
    /// Rename the delivery option whose title contains `contains` to `to`.
    #[shopify_function(default)]
    rename_method: Option<RenameMethod>,
    /// Target index for the renamed method within its delivery group. Only
    /// applied together with `rename_method`, which identifies the option to
    /// move (the API's move operation requires a specific option handle).
    #[shopify_function(default)]
    reorder_priority: Option<i32>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RenameMethod {
    #[shopify_function(default)]
    contains: String,
    #[shopify_function(default)]
    to: String,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────

/// A snapshot of the cart/buyer facts a rule is evaluated against, gathered
/// once per run from the Shopify input and then matched against every rule.
/// Keeping this a plain struct lets `rule_matches` be unit-tested natively,
/// without the wasm/shopify_function harness (native `cargo test` is the
/// contract; the wasm build is blocked by the env's broken `wasm32` toolchain).
#[derive(Default, Clone)]
pub struct CartFacts {
    pub subtotal: f64,
    /// Variant ids present in the cart (one entry per distinct line).
    pub variant_ids: Vec<String>,
    /// Product ids present in the cart.
    pub product_ids: Vec<String>,
    /// Product types present in the cart.
    pub product_types: Vec<String>,
    /// Product vendors present in the cart.
    pub vendors: Vec<String>,
    /// Buyer customer id, if authenticated.
    pub customer_id: Option<String>,
    /// Buyer email, if known.
    pub customer_email: Option<String>,
    /// Buyer's prior order count, if a customer is attached.
    pub customer_orders: Option<i32>,
}

/// True when any element of `haystack` matches any element of `needles`,
/// case-insensitively. An empty `needles` list means "no constraint" → true.
fn any_ci(needles: &[String], haystack: &[String]) -> bool {
    if needles.is_empty() {
        return true;
    }
    haystack
        .iter()
        .any(|h| needles.iter().any(|n| n.eq_ignore_ascii_case(h)))
}

/// A rule applies to a delivery group when every condition it specifies holds
/// (AND semantics). Country/province are matched against the group's
/// destination address; all other predicates are matched against the shared
/// cart/buyer snapshot. An unset predicate is not a constraint.
pub fn rule_matches(
    when: &RuleWhen,
    group_country: Option<&str>,
    group_province: Option<&str>,
    facts: &CartFacts,
) -> bool {
    // Destination country.
    if !when.country_code_in.is_empty() {
        match group_country {
            Some(c) if when.country_code_in.iter().any(|x| x.eq_ignore_ascii_case(c)) => {}
            _ => return false,
        }
    }

    // Destination province/state.
    if !when.province_code_in.is_empty() {
        match group_province {
            Some(p) if when.province_code_in.iter().any(|x| x.eq_ignore_ascii_case(p)) => {}
            _ => return false,
        }
    }

    // Cart subtotal minimum.
    if let Some(min) = when.min_subtotal {
        if facts.subtotal < min {
            return false;
        }
    }

    // Cart-contents predicates.
    if !any_ci(&when.product_variant_id_in, &facts.variant_ids) {
        return false;
    }
    if !any_ci(&when.product_id_in, &facts.product_ids) {
        return false;
    }
    if !any_ci(&when.product_type_in, &facts.product_types) {
        return false;
    }
    if !any_ci(&when.vendor_in, &facts.vendors) {
        return false;
    }

    // Customer predicates.
    if !when.customer_id_in.is_empty() {
        match facts.customer_id.as_deref() {
            Some(id) if when.customer_id_in.iter().any(|x| x == id) => {}
            _ => return false,
        }
    }
    if !when.customer_email_in.is_empty() {
        match facts.customer_email.as_deref() {
            Some(email) if when.customer_email_in.iter().any(|x| x.eq_ignore_ascii_case(email)) => {}
            _ => return false,
        }
    }
    if let Some(min_orders) = when.min_customer_orders {
        match facts.customer_orders {
            Some(n) if n >= min_orders => {}
            // A guest (no customer) never meets a positive minimum; a zero
            // minimum is vacuously satisfied even for guests.
            _ => {
                if min_orders > 0 {
                    return false;
                }
            }
        }
    }

    true
}

#[shopify_function]
fn cart_delivery_options_transform_run(
    input: schema::cart_delivery_options_transform_run::CartDeliveryOptionsTransformRunInput,
) -> Result<schema::CartDeliveryOptionsTransformRunResult> {
    let no_changes = schema::CartDeliveryOptionsTransformRunResult { operations: vec![] };

    // No published config → no operations (safe no-op).
    let config: &Configuration = match input
        .shop()
        .metaobject()
        .and_then(|mo| mo.field())
        .and_then(|field| field.json_value())
    {
        Some(config) => config,
        None => return Ok(no_changes),
    };
    if config.rules.is_empty() {
        return Ok(no_changes);
    }

    // Gather the cart/buyer snapshot once.
    let facts = gather_facts(&input);

    let mut operations: Vec<schema::Operation> = Vec::new();
    for group in input.cart().delivery_groups().iter() {
        let group_country = group
            .delivery_address()
            .and_then(|address| address.country_code())
            .map(|c| c.as_str());
        let group_province = group
            .delivery_address()
            .and_then(|address| address.province_code())
            .map(|p| p.as_str());
        let option_count = group.delivery_options().len() as i32;

        for rule in config.rules.iter() {
            if !rule_matches(&rule.when, group_country, group_province, &facts) {
                continue;
            }

            for option in group.delivery_options().iter() {
                let title_lower = option.title().map(|title| title.to_lowercase()).unwrap_or_default();
                let handle = option.handle().clone();

                // Hide takes precedence — a hidden option is not renamed or moved.
                if rule
                    .actions
                    .hide_methods_containing
                    .iter()
                    .any(|needle| !needle.is_empty() && title_lower.contains(&needle.to_lowercase()))
                {
                    operations.push(schema::Operation::DeliveryOptionHide(
                        schema::DeliveryOptionHideOperation {
                            delivery_option_handle: handle,
                        },
                    ));
                    continue;
                }

                if let Some(rename) = rule.actions.rename_method.as_ref() {
                    if !rename.contains.is_empty()
                        && title_lower.contains(&rename.contains.to_lowercase())
                    {
                        operations.push(schema::Operation::DeliveryOptionRename(
                            schema::DeliveryOptionRenameOperation {
                                delivery_option_handle: handle.clone(),
                                title: rename.to.clone(),
                            },
                        ));

                        if let Some(priority) = rule.actions.reorder_priority {
                            // Clamp to a valid index within the group.
                            let index = priority.clamp(0, (option_count - 1).max(0));
                            operations.push(schema::Operation::DeliveryOptionMove(
                                schema::DeliveryOptionMoveOperation {
                                    delivery_option_handle: handle,
                                    index,
                                },
                            ));
                        }
                    }
                }
            }
        }
    }

    if operations.is_empty() {
        return Ok(no_changes);
    }
    Ok(schema::CartDeliveryOptionsTransformRunResult { operations })
}

/// Collect the cart/buyer snapshot from the Shopify input. Isolated so the
/// operation-building stays readable and the pure `rule_matches` core can be
/// tested without constructing Shopify input types.
fn gather_facts(
    input: &schema::cart_delivery_options_transform_run::CartDeliveryOptionsTransformRunInput,
) -> CartFacts {
    use schema::cart_delivery_options_transform_run::cart_delivery_options_transform_run_input::cart::lines::Merchandise;

    let mut facts = CartFacts {
        subtotal: input.cart().cost().subtotal_amount().amount().as_f64(),
        ..CartFacts::default()
    };

    for line in input.cart().lines().iter() {
        if let Merchandise::ProductVariant(variant) = line.merchandise() {
            facts.variant_ids.push(variant.id().clone());
            let product = variant.product();
            facts.product_ids.push(product.id().clone());
            if let Some(pt) = product.product_type() {
                facts.product_types.push(pt.clone());
            }
            if let Some(v) = product.vendor() {
                facts.vendors.push(v.clone());
            }
        }
    }

    if let Some(customer) = input.cart().buyer_identity().and_then(|b| b.customer()) {
        facts.customer_id = Some(customer.id().clone());
        facts.customer_email = customer.email().cloned();
        facts.customer_orders = Some(*customer.number_of_orders() as i32);
    }

    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> CartFacts {
        CartFacts {
            subtotal: 50.0,
            variant_ids: vec!["gid://shopify/ProductVariant/1".into()],
            product_ids: vec!["gid://shopify/Product/10".into()],
            product_types: vec!["Apparel".into()],
            vendors: vec!["Acme".into()],
            customer_id: Some("gid://shopify/Customer/100".into()),
            customer_email: Some("VIP@example.com".into()),
            customer_orders: Some(5),
        }
    }

    #[test]
    fn empty_when_matches_anything() {
        let w = RuleWhen::default();
        assert!(rule_matches(&w, Some("US"), Some("CA"), &facts()));
        assert!(rule_matches(&w, None, None, &CartFacts::default()));
    }

    #[test]
    fn country_predicate() {
        let w = RuleWhen { country_code_in: vec!["US".into()], ..Default::default() };
        assert!(rule_matches(&w, Some("us"), None, &facts())); // case-insensitive
        assert!(!rule_matches(&w, Some("CA"), None, &facts()));
        assert!(!rule_matches(&w, None, None, &facts())); // no address → no match
    }

    #[test]
    fn province_predicate() {
        let w = RuleWhen { province_code_in: vec!["ON".into()], ..Default::default() };
        assert!(rule_matches(&w, Some("CA"), Some("on"), &facts()));
        assert!(!rule_matches(&w, Some("CA"), Some("BC"), &facts()));
        assert!(!rule_matches(&w, Some("CA"), None, &facts()));
    }

    #[test]
    fn min_subtotal_predicate() {
        let w = RuleWhen { min_subtotal: Some(40.0), ..Default::default() };
        assert!(rule_matches(&w, None, None, &facts())); // 50 >= 40
        let w2 = RuleWhen { min_subtotal: Some(60.0), ..Default::default() };
        assert!(!rule_matches(&w2, None, None, &facts())); // 50 < 60
    }

    #[test]
    fn variant_id_predicate() {
        let w = RuleWhen {
            product_variant_id_in: vec!["gid://shopify/ProductVariant/1".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w, None, None, &facts()));
        let w2 = RuleWhen {
            product_variant_id_in: vec!["gid://shopify/ProductVariant/999".into()],
            ..Default::default()
        };
        assert!(!rule_matches(&w2, None, None, &facts()));
    }

    #[test]
    fn product_id_predicate() {
        let w = RuleWhen {
            product_id_in: vec!["gid://shopify/Product/10".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w, None, None, &facts()));
        let w2 = RuleWhen {
            product_id_in: vec!["gid://shopify/Product/11".into()],
            ..Default::default()
        };
        assert!(!rule_matches(&w2, None, None, &facts()));
    }

    #[test]
    fn product_type_and_vendor_predicates() {
        let w = RuleWhen { product_type_in: vec!["apparel".into()], ..Default::default() };
        assert!(rule_matches(&w, None, None, &facts())); // case-insensitive
        let w2 = RuleWhen { vendor_in: vec!["Acme".into()], ..Default::default() };
        assert!(rule_matches(&w2, None, None, &facts()));
        let w3 = RuleWhen { vendor_in: vec!["Other".into()], ..Default::default() };
        assert!(!rule_matches(&w3, None, None, &facts()));
    }

    #[test]
    fn customer_id_and_email_predicates() {
        let w = RuleWhen {
            customer_id_in: vec!["gid://shopify/Customer/100".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w, None, None, &facts()));
        let w2 = RuleWhen {
            customer_email_in: vec!["vip@example.com".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w2, None, None, &facts())); // case-insensitive
        // Guest cart never matches a customer-id predicate.
        assert!(!rule_matches(&w, None, None, &CartFacts::default()));
    }

    #[test]
    fn min_customer_orders_predicate() {
        let w = RuleWhen { min_customer_orders: Some(3), ..Default::default() };
        assert!(rule_matches(&w, None, None, &facts())); // 5 >= 3
        let w2 = RuleWhen { min_customer_orders: Some(10), ..Default::default() };
        assert!(!rule_matches(&w2, None, None, &facts())); // 5 < 10
        // Guest never satisfies a positive minimum...
        assert!(!rule_matches(&w, None, None, &CartFacts::default()));
        // ...but a zero minimum is vacuously satisfied.
        let w3 = RuleWhen { min_customer_orders: Some(0), ..Default::default() };
        assert!(rule_matches(&w3, None, None, &CartFacts::default()));
    }

    #[test]
    fn conditions_are_anded() {
        // Both must hold.
        let w = RuleWhen {
            country_code_in: vec!["US".into()],
            product_type_in: vec!["Apparel".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w, Some("US"), None, &facts()));
        assert!(!rule_matches(&w, Some("CA"), None, &facts())); // country fails
        let mut wrong_type = facts();
        wrong_type.product_types = vec!["Books".into()];
        assert!(!rule_matches(&w, Some("US"), None, &wrong_type)); // type fails
    }
}
