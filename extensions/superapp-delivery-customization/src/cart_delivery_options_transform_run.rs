use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Delivery-customization configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-deliveryCustomization`, field `config_json`) by
/// `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.deliveryCustomization` recipe config. Optional keys are omitted
/// from the stored JSON, so every field defaults when missing.
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
    /// Minimum cart subtotal required (absent = no minimum).
    #[shopify_function(default)]
    min_subtotal: Option<f64>,
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

    let cart_subtotal = input.cart().cost().subtotal_amount().amount().as_f64();

    let mut operations: Vec<schema::Operation> = Vec::new();
    for group in input.cart().delivery_groups().iter() {
        let group_country = group.delivery_address().and_then(|address| address.country_code());
        let option_count = group.delivery_options().len() as i32;

        for rule in config.rules.iter() {
            if !rule_matches(rule, group_country, cart_subtotal) {
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

/// A rule applies to a delivery group when every condition it specifies holds:
/// the group's destination country is in `countryCodeIn` (if set) and the cart
/// subtotal meets `minSubtotal` (if set).
fn rule_matches(rule: &DeliveryRule, group_country: Option<&String>, cart_subtotal: f64) -> bool {
    if !rule.when.country_code_in.is_empty() {
        let matches_country = match group_country {
            Some(country) => rule
                .when
                .country_code_in
                .iter()
                .any(|code| code.eq_ignore_ascii_case(country)),
            None => false,
        };
        if !matches_country {
            return false;
        }
    }

    if let Some(min_subtotal) = rule.when.min_subtotal {
        if cart_subtotal < min_subtotal {
            return false;
        }
    }

    true
}
