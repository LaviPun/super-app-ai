use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Payment-customization configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-paymentCustomization`, field `config_json`) by
/// `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.paymentCustomization` recipe config. Optional keys are omitted
/// from the stored JSON, so every field defaults when missing.
///
/// # Predicate widening (Build #14b)
/// `RuleWhen` was widened beyond `minSubtotal` / `currencyIn` to target by
/// destination address (country / province) and by cart contents (product /
/// type / vendor), so a merchant can e.g. hide "Cash on Delivery" for a
/// province, or hide a payment method whenever a restricted product is in the
/// cart. Address facts come from the cart's delivery groups; contents facts
/// from `cart.lines.merchandise.product` (both added to the input query).
///
/// # Honest gap — tags/collections are NOT config-drivable (see delivery crate).
/// Address facts are only populated once the buyer has entered a shipping
/// address (delivery groups are empty before then), so an address predicate is
/// a safe no-op earlier in checkout — the rule simply does not fire yet.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<PaymentRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct PaymentRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    actions: RuleActions,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Minimum cart subtotal required (absent = no minimum).
    #[shopify_function(default)]
    min_subtotal: Option<f64>,
    /// Presentment currency codes the rule applies to (empty = any currency).
    #[shopify_function(default)]
    currency_in: Vec<String>,
    /// Destination country codes the rule applies to (empty = any country).
    #[shopify_function(default)]
    country_code_in: Vec<String>,
    /// Destination province/state codes the rule applies to (empty = any).
    #[shopify_function(default)]
    province_code_in: Vec<String>,
    /// Cart must contain at least one line whose product id is in this list.
    #[shopify_function(default)]
    product_id_in: Vec<String>,
    /// Cart must contain at least one line whose product type is in this list.
    #[shopify_function(default)]
    product_type_in: Vec<String>,
    /// Cart must contain at least one line whose product vendor is in this list.
    #[shopify_function(default)]
    vendor_in: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleActions {
    /// Case-insensitive substrings; any payment method whose name contains one
    /// is hidden.
    #[shopify_function(default)]
    hide_methods_containing: Vec<String>,
    /// Rename the payment method whose name contains `contains` to `to`.
    #[shopify_function(default)]
    rename_method: Option<RenameMethod>,
    /// Target index for the renamed method. Only applied together with
    /// `rename_method`, which identifies the method to move (the API's move
    /// operation requires a specific payment method id).
    #[shopify_function(default)]
    reorder_priority: Option<i32>,
    /// When true, submit the checkout as a draft for merchant review.
    #[shopify_function(default)]
    require_review: bool,
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

/// A snapshot of the cart facts a payment rule is evaluated against, gathered
/// once per run. Kept a plain struct so `rule_matches` is unit-testable without
/// the shopify_function harness (native `cargo test` is the contract).
#[derive(Default, Clone)]
pub struct CartFacts {
    pub subtotal: f64,
    pub currency: String,
    /// Destination country codes across the cart's delivery groups.
    pub country_codes: Vec<String>,
    /// Destination province codes across the cart's delivery groups.
    pub province_codes: Vec<String>,
    pub product_ids: Vec<String>,
    pub product_types: Vec<String>,
    pub vendors: Vec<String>,
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

/// A rule applies when every condition it specifies holds (AND semantics). An
/// unset predicate is not a constraint. Address predicates match when ANY of
/// the cart's destination groups satisfies them.
pub fn rule_matches(when: &RuleWhen, facts: &CartFacts) -> bool {
    if let Some(min) = when.min_subtotal {
        if facts.subtotal < min {
            return false;
        }
    }
    if !when.currency_in.is_empty()
        && !when.currency_in.iter().any(|c| c.eq_ignore_ascii_case(&facts.currency))
    {
        return false;
    }
    if !any_ci(&when.country_code_in, &facts.country_codes) {
        return false;
    }
    if !any_ci(&when.province_code_in, &facts.province_codes) {
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
    true
}

#[shopify_function]
fn cart_payment_methods_transform_run(
    input: schema::cart_payment_methods_transform_run::Input,
) -> Result<schema::CartPaymentMethodsTransformRunResult> {
    let no_changes = schema::CartPaymentMethodsTransformRunResult { operations: vec![] };

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

    let facts = gather_facts(&input);
    let method_count = input.payment_methods().len() as i32;

    let mut operations: Vec<schema::Operation> = Vec::new();
    for rule in config.rules.iter() {
        if !rule_matches(&rule.when, &facts) {
            continue;
        }

        for method in input.payment_methods().iter() {
            let name_lower = method.name().to_lowercase();
            let method_id = method.id().clone();

            // Hide takes precedence — a hidden method is not renamed or moved.
            if rule
                .actions
                .hide_methods_containing
                .iter()
                .any(|needle| !needle.is_empty() && name_lower.contains(&needle.to_lowercase()))
            {
                operations.push(schema::Operation::PaymentMethodHide(
                    schema::PaymentMethodHideOperation {
                        payment_method_id: method_id,
                        placements: None,
                    },
                ));
                continue;
            }

            if let Some(rename) = rule.actions.rename_method.as_ref() {
                if !rename.contains.is_empty() && name_lower.contains(&rename.contains.to_lowercase()) {
                    operations.push(schema::Operation::PaymentMethodRename(
                        schema::PaymentMethodRenameOperation {
                            payment_method_id: method_id.clone(),
                            name: rename.to.clone(),
                        },
                    ));

                    if let Some(priority) = rule.actions.reorder_priority {
                        let index = priority.clamp(0, (method_count - 1).max(0));
                        operations.push(schema::Operation::PaymentMethodMove(
                            schema::PaymentMethodMoveOperation {
                                payment_method_id: method_id,
                                index,
                            },
                        ));
                    }
                }
            }
        }

        if rule.actions.require_review {
            operations.push(schema::Operation::OrderReviewAdd(
                schema::OrderReviewAddOperation {
                    reason: "Order flagged for manual review by store policy.".to_owned(),
                },
            ));
        }
    }

    if operations.is_empty() {
        return Ok(no_changes);
    }
    Ok(schema::CartPaymentMethodsTransformRunResult { operations })
}

/// Collect the cart snapshot from the Shopify input. Isolated so the pure
/// `rule_matches` core stays testable without Shopify input types.
fn gather_facts(input: &schema::cart_payment_methods_transform_run::Input) -> CartFacts {
    use schema::cart_payment_methods_transform_run::input::cart::lines::Merchandise;

    let mut facts = CartFacts {
        subtotal: input.cart().cost().subtotal_amount().amount().as_f64(),
        currency: input.cart().cost().subtotal_amount().currency_code().to_string(),
        ..CartFacts::default()
    };

    for line in input.cart().lines().iter() {
        if let Merchandise::ProductVariant(variant) = line.merchandise() {
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

    for group in input.cart().delivery_groups().iter() {
        if let Some(address) = group.delivery_address() {
            if let Some(c) = address.country_code() {
                facts.country_codes.push(c.clone());
            }
            if let Some(p) = address.province_code() {
                facts.province_codes.push(p.clone());
            }
        }
    }

    facts
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> CartFacts {
        CartFacts {
            subtotal: 80.0,
            currency: "USD".into(),
            country_codes: vec!["US".into()],
            province_codes: vec!["NY".into()],
            product_ids: vec!["gid://shopify/Product/10".into()],
            product_types: vec!["Alcohol".into()],
            vendors: vec!["Acme".into()],
        }
    }

    #[test]
    fn empty_when_matches_anything() {
        assert!(rule_matches(&RuleWhen::default(), &facts()));
        assert!(rule_matches(&RuleWhen::default(), &CartFacts::default()));
    }

    #[test]
    fn min_subtotal_and_currency() {
        let w = RuleWhen { min_subtotal: Some(50.0), currency_in: vec!["usd".into()], ..Default::default() };
        assert!(rule_matches(&w, &facts()));
        let w2 = RuleWhen { min_subtotal: Some(100.0), ..Default::default() };
        assert!(!rule_matches(&w2, &facts()));
        let w3 = RuleWhen { currency_in: vec!["EUR".into()], ..Default::default() };
        assert!(!rule_matches(&w3, &facts()));
    }

    #[test]
    fn address_predicates() {
        let w = RuleWhen { country_code_in: vec!["us".into()], ..Default::default() };
        assert!(rule_matches(&w, &facts())); // case-insensitive
        let w2 = RuleWhen { country_code_in: vec!["CA".into()], ..Default::default() };
        assert!(!rule_matches(&w2, &facts()));
        let w3 = RuleWhen { province_code_in: vec!["NY".into()], ..Default::default() };
        assert!(rule_matches(&w3, &facts()));
        let w4 = RuleWhen { province_code_in: vec!["CA".into()], ..Default::default() };
        assert!(!rule_matches(&w4, &facts()));
        // No address on the cart → an address predicate cannot match.
        assert!(!rule_matches(&w, &CartFacts::default()));
    }

    #[test]
    fn product_predicates() {
        let w = RuleWhen { product_id_in: vec!["gid://shopify/Product/10".into()], ..Default::default() };
        assert!(rule_matches(&w, &facts()));
        let w2 = RuleWhen { product_type_in: vec!["alcohol".into()], ..Default::default() };
        assert!(rule_matches(&w2, &facts())); // case-insensitive
        let w3 = RuleWhen { vendor_in: vec!["Other".into()], ..Default::default() };
        assert!(!rule_matches(&w3, &facts()));
    }

    #[test]
    fn conditions_are_anded() {
        let w = RuleWhen {
            province_code_in: vec!["NY".into()],
            product_type_in: vec!["Alcohol".into()],
            ..Default::default()
        };
        assert!(rule_matches(&w, &facts()));
        let mut wrong = facts();
        wrong.province_codes = vec!["CA".into()];
        assert!(!rule_matches(&w, &wrong)); // province fails
    }
}
