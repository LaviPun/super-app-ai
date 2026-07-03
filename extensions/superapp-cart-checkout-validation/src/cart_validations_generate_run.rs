use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::BTreeMap;

/// Validation configuration, published as the `$app:superapp_function_config`
/// metaobject (handle `superapp-fn-cartAndCheckoutValidation`, field
/// `config_json`) by `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.cartAndCheckoutValidation` recipe config. Optional keys are
/// omitted from the stored JSON, so every field defaults when missing.
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
    /// Maximum total quantity allowed per SKU (absent = no quantity limit).
    #[shopify_function(default)]
    max_quantity_per_sku: Option<i32>,
    /// Destination country codes to block (empty = no country restriction).
    #[shopify_function(default)]
    block_country_codes: Vec<String>,
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

    // Aggregate quantity per SKU across all cart lines so `maxQuantityPerSku`
    // limits the total of a SKU, not just a single line.
    let mut quantity_by_sku: BTreeMap<String, i32> = BTreeMap::new();
    for line in input.cart().lines().iter() {
        if let schema::cart_validations_generate_run::input::cart::lines::Merchandise::ProductVariant(
            variant,
        ) = line.merchandise()
        {
            if let Some(sku) = variant.sku() {
                *quantity_by_sku.entry(sku.clone()).or_insert(0) += *line.quantity();
            }
        }
    }

    // Destination countries currently attached to the cart's delivery groups.
    let destination_countries: Vec<&String> = input
        .cart()
        .delivery_groups()
        .iter()
        .filter_map(|group| group.delivery_address().and_then(|address| address.country_code()))
        .collect();

    let mut errors: Vec<schema::ValidationError> = Vec::new();
    for rule in config.rules.iter() {
        if rule.error_message.is_empty() {
            continue;
        }

        // A rule fires when every condition it specifies is satisfied (AND).
        // Rules that specify no condition never fire.
        let mut has_condition = false;
        let mut all_conditions_met = true;

        if let Some(max) = rule.when.max_quantity_per_sku {
            if max > 0 {
                has_condition = true;
                let exceeded = quantity_by_sku.values().any(|&qty| qty > max);
                all_conditions_met = all_conditions_met && exceeded;
            }
        }

        if !rule.when.block_country_codes.is_empty() {
            has_condition = true;
            let blocked = destination_countries.iter().any(|country| {
                rule.when
                    .block_country_codes
                    .iter()
                    .any(|blocked_code| blocked_code.eq_ignore_ascii_case(country))
            });
            all_conditions_met = all_conditions_met && blocked;
        }

        if has_condition && all_conditions_met {
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

/// A single `validationAdd` operation carrying no errors: valid, and a true
/// no-op for the customer's checkout.
fn no_op() -> schema::CartValidationsGenerateRunResult {
    schema::CartValidationsGenerateRunResult {
        operations: vec![schema::Operation::ValidationAdd(
            schema::ValidationAddOperation { errors: vec![] },
        )],
    }
}
