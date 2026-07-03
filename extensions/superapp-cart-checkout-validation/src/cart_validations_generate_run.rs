use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::BTreeMap;

/// Validation configuration, published as the `$app:superapp_function_config`
/// metaobject (handle `superapp-fn-cartAndCheckoutValidation`, field
/// `config_json`) by `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.cartAndCheckoutValidation` recipe config. Optional keys are
/// omitted from the stored JSON, so every field defaults when missing.
///
/// # Predicate widening (Build #14b)
/// `RuleWhen` was widened beyond `maxQuantityPerSku` / `blockCountryCodes` to:
/// - `minCartValue` / `maxCartValue` — block checkout below/above a subtotal.
/// - `maxQuantityPerProductType` — a per-product-type quantity ceiling
///   (a runtime-evaluable substitute for "per-collection quantity"; collection
///   membership requires static `inCollection` args in the input query and so
///   cannot be config-driven — see the delivery crate's note).
/// - `blockProvinceCodes` — a province/state address predicate alongside the
///   existing country block.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<ValidationRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct ValidationRule {
    #[shopify_function(default)]
    when: RuleWhen,
    /// Error surfaced at checkout when the rule's conditions are met.
    #[shopify_function(default)]
    error_message: String,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Maximum total quantity allowed per SKU (absent = no SKU limit).
    #[shopify_function(default)]
    max_quantity_per_sku: Option<i32>,
    /// Maximum total quantity allowed per product type (absent = no limit).
    /// Runtime-evaluable stand-in for "per-collection quantity".
    #[shopify_function(default)]
    max_quantity_per_product_type: Option<i32>,
    /// Minimum cart subtotal required (absent = no floor).
    #[shopify_function(default)]
    min_cart_value: Option<f64>,
    /// Maximum cart subtotal allowed (absent = no ceiling).
    #[shopify_function(default)]
    max_cart_value: Option<f64>,
    /// Destination country codes to block (empty = no country restriction).
    #[shopify_function(default)]
    block_country_codes: Vec<String>,
    /// Destination province/state codes to block (empty = no province
    /// restriction).
    #[shopify_function(default)]
    block_province_codes: Vec<String>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────

/// The cart facts a validation rule is evaluated against, gathered once per run.
/// Kept a plain struct so `rule_fires` is unit-testable without the
/// shopify_function harness (native `cargo test` is the contract).
#[derive(Default, Clone)]
pub struct CartFacts {
    pub subtotal: f64,
    /// Total quantity per SKU across all cart lines.
    pub quantity_by_sku: BTreeMap<String, i32>,
    /// Total quantity per product type across all cart lines.
    pub quantity_by_product_type: BTreeMap<String, i32>,
    /// Destination country codes across the cart's delivery groups.
    pub country_codes: Vec<String>,
    /// Destination province codes across the cart's delivery groups.
    pub province_codes: Vec<String>,
}

/// True when the rule's conditions are all satisfied (AND semantics) AND the
/// rule specifies at least one condition. A rule with no condition never fires
/// (it would otherwise block every checkout unconditionally). An unset
/// predicate is not a condition.
pub fn rule_fires(when: &RuleWhen, facts: &CartFacts) -> bool {
    let mut has_condition = false;
    let mut all_met = true;

    if let Some(max) = when.max_quantity_per_sku {
        if max > 0 {
            has_condition = true;
            let exceeded = facts.quantity_by_sku.values().any(|&q| q > max);
            all_met = all_met && exceeded;
        }
    }

    if let Some(max) = when.max_quantity_per_product_type {
        if max > 0 {
            has_condition = true;
            let exceeded = facts.quantity_by_product_type.values().any(|&q| q > max);
            all_met = all_met && exceeded;
        }
    }

    if let Some(min) = when.min_cart_value {
        has_condition = true;
        all_met = all_met && facts.subtotal < min; // below the floor → fire
    }

    if let Some(max) = when.max_cart_value {
        has_condition = true;
        all_met = all_met && facts.subtotal > max; // above the ceiling → fire
    }

    if !when.block_country_codes.is_empty() {
        has_condition = true;
        let blocked = facts.country_codes.iter().any(|c| {
            when.block_country_codes.iter().any(|b| b.eq_ignore_ascii_case(c))
        });
        all_met = all_met && blocked;
    }

    if !when.block_province_codes.is_empty() {
        has_condition = true;
        let blocked = facts.province_codes.iter().any(|p| {
            when.block_province_codes.iter().any(|b| b.eq_ignore_ascii_case(p))
        });
        all_met = all_met && blocked;
    }

    has_condition && all_met
}

#[shopify_function]
fn cart_validations_generate_run(
    input: schema::cart_validations_generate_run::Input,
) -> Result<schema::CartValidationsGenerateRunResult> {
    // No published config → surface zero validation errors (safe no-op).
    let config: &Configuration = match input
        .shop()
        .metaobject()
        .and_then(|mo| mo.field())
        .and_then(|field| field.json_value())
    {
        Some(config) => config,
        None => return Ok(no_op()),
    };
    if config.rules.is_empty() {
        return Ok(no_op());
    }

    let facts = gather_facts(&input);

    let mut errors: Vec<schema::ValidationError> = Vec::new();
    for rule in config.rules.iter() {
        if rule.error_message.is_empty() {
            continue;
        }
        if rule_fires(&rule.when, &facts) {
            let error = schema::ValidationError {
                message: rule.error_message.clone(),
                target: "$.cart".to_owned(),
            };
            let duplicate = errors
                .iter()
                .any(|existing| existing.message == error.message && existing.target == error.target);
            if !duplicate {
                errors.push(error);
            }
        }
    }

    Ok(schema::CartValidationsGenerateRunResult {
        operations: vec![schema::Operation::ValidationAdd(
            schema::ValidationAddOperation { errors },
        )],
    })
}

/// Aggregate cart facts from the Shopify input. `maxQuantityPerSku` /
/// `maxQuantityPerProductType` limit the TOTAL of a SKU / type across all lines,
/// not a single line.
fn gather_facts(input: &schema::cart_validations_generate_run::Input) -> CartFacts {
    use schema::cart_validations_generate_run::input::cart::lines::Merchandise;

    let mut facts = CartFacts {
        subtotal: input.cart().cost().subtotal_amount().amount().as_f64(),
        ..CartFacts::default()
    };

    for line in input.cart().lines().iter() {
        if let Merchandise::ProductVariant(variant) = line.merchandise() {
            let qty = *line.quantity();
            if let Some(sku) = variant.sku() {
                *facts.quantity_by_sku.entry(sku.clone()).or_insert(0) += qty;
            }
            if let Some(pt) = variant.product().product_type() {
                *facts.quantity_by_product_type.entry(pt.clone()).or_insert(0) += qty;
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

/// A single `validationAdd` operation carrying no errors: valid, and a true
/// no-op for the customer's checkout.
fn no_op() -> schema::CartValidationsGenerateRunResult {
    schema::CartValidationsGenerateRunResult {
        operations: vec![schema::Operation::ValidationAdd(
            schema::ValidationAddOperation { errors: vec![] },
        )],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> CartFacts {
        let mut sku = BTreeMap::new();
        sku.insert("SKU-A".to_string(), 3);
        let mut pt = BTreeMap::new();
        pt.insert("Apparel".to_string(), 5);
        CartFacts {
            subtotal: 100.0,
            quantity_by_sku: sku,
            quantity_by_product_type: pt,
            country_codes: vec!["US".into()],
            province_codes: vec!["NY".into()],
        }
    }

    #[test]
    fn no_condition_never_fires() {
        assert!(!rule_fires(&RuleWhen::default(), &facts()));
    }

    #[test]
    fn max_quantity_per_sku() {
        let w = RuleWhen { max_quantity_per_sku: Some(2), ..Default::default() };
        assert!(rule_fires(&w, &facts())); // SKU-A qty 3 > 2
        let w2 = RuleWhen { max_quantity_per_sku: Some(3), ..Default::default() };
        assert!(!rule_fires(&w2, &facts())); // 3 not > 3
    }

    #[test]
    fn max_quantity_per_product_type() {
        let w = RuleWhen { max_quantity_per_product_type: Some(4), ..Default::default() };
        assert!(rule_fires(&w, &facts())); // Apparel qty 5 > 4
        let w2 = RuleWhen { max_quantity_per_product_type: Some(5), ..Default::default() };
        assert!(!rule_fires(&w2, &facts()));
    }

    #[test]
    fn min_and_max_cart_value() {
        let below = RuleWhen { min_cart_value: Some(150.0), ..Default::default() };
        assert!(rule_fires(&below, &facts())); // 100 < 150 → fire
        let ok_floor = RuleWhen { min_cart_value: Some(50.0), ..Default::default() };
        assert!(!rule_fires(&ok_floor, &facts())); // 100 >= 50 → no fire
        let above = RuleWhen { max_cart_value: Some(80.0), ..Default::default() };
        assert!(rule_fires(&above, &facts())); // 100 > 80 → fire
        let ok_ceiling = RuleWhen { max_cart_value: Some(120.0), ..Default::default() };
        assert!(!rule_fires(&ok_ceiling, &facts()));
    }

    #[test]
    fn block_country_and_province() {
        let c = RuleWhen { block_country_codes: vec!["us".into()], ..Default::default() };
        assert!(rule_fires(&c, &facts())); // case-insensitive
        let c2 = RuleWhen { block_country_codes: vec!["CA".into()], ..Default::default() };
        assert!(!rule_fires(&c2, &facts()));
        let p = RuleWhen { block_province_codes: vec!["NY".into()], ..Default::default() };
        assert!(rule_fires(&p, &facts()));
        let p2 = RuleWhen { block_province_codes: vec!["CA".into()], ..Default::default() };
        assert!(!rule_fires(&p2, &facts()));
    }

    #[test]
    fn conditions_are_anded() {
        // Fires only when BOTH the SKU ceiling is exceeded AND the country is blocked.
        let w = RuleWhen {
            max_quantity_per_sku: Some(2),
            block_country_codes: vec!["US".into()],
            ..Default::default()
        };
        assert!(rule_fires(&w, &facts()));
        let mut other_country = facts();
        other_country.country_codes = vec!["CA".into()];
        assert!(!rule_fires(&w, &other_country)); // country condition fails
    }
}
