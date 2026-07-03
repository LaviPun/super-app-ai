use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Payment-customization configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-paymentCustomization`, field `config_json`) by
/// `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.paymentCustomization` recipe config. Optional keys are omitted
/// from the stored JSON, so every field defaults when missing.
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

    let cart_subtotal = input.cart().cost().subtotal_amount().amount().as_f64();
    let currency = input.cart().cost().subtotal_amount().currency_code();
    let method_count = input.payment_methods().len() as i32;

    let mut operations: Vec<schema::Operation> = Vec::new();
    for rule in config.rules.iter() {
        if !rule_matches(rule, cart_subtotal, currency) {
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

/// A rule applies when every condition it specifies holds: the cart subtotal
/// meets `minSubtotal` (if set) and the presentment currency is in `currencyIn`
/// (if set).
fn rule_matches(rule: &PaymentRule, cart_subtotal: f64, currency: &str) -> bool {
    if let Some(min_subtotal) = rule.when.min_subtotal {
        if cart_subtotal < min_subtotal {
            return false;
        }
    }

    if !rule.when.currency_in.is_empty()
        && !rule
            .when
            .currency_in
            .iter()
            .any(|code| code.eq_ignore_ascii_case(currency))
    {
        return false;
    }

    true
}
