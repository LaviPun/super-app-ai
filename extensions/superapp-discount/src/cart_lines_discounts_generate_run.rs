use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Discount configuration, published as the `$app:superapp_function_config`
/// metaobject (handle `superapp-fn-discountRules`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same path used by every other
/// SuperApp Function. Mirrors the `functions.discountRules` recipe config.
/// Optional keys are omitted from the stored JSON, so every field defaults when
/// missing.
///
/// Scope note: `when.customerTags` cannot be evaluated in a pure function
/// (customer-tag lookups need static `hasTags` arguments in the input query, not
/// runtime config values), so a rule that gates on customer tags is skipped
/// rather than applied to everyone. `combineWithOtherDiscounts` is a property of
/// the automatic-discount node (set when the discount is created), not a value a
/// Function can emit, so it is parsed but inert here. See honestGaps.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<DiscountRule>,
    #[shopify_function(default)]
    combine_with_other_discounts: bool,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct DiscountRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    apply: RuleApply,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Customer tags required. Not evaluable in a pure function (see module note).
    #[shopify_function(default)]
    customer_tags: Vec<String>,
    /// Minimum cart subtotal required (absent = no minimum).
    #[shopify_function(default)]
    min_subtotal: Option<f64>,
    /// SKUs the discount targets (empty = all product lines).
    #[shopify_function(default)]
    sku_in: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// Percentage off (absent/0 = none). Takes precedence over `fixedAmountOff`.
    #[shopify_function(default)]
    percentage_off: Option<f64>,
    /// Fixed amount off in the cart currency (absent/0 = none).
    #[shopify_function(default)]
    fixed_amount_off: Option<f64>,
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let no_ops = schema::CartLinesDiscountsGenerateRunResult { operations: vec![] };

    // Config lives on the shop-level `$app:superapp_function_config` metaobject
    // (handle `superapp-fn-discountRules`) written by publish. No config → no-op.
    let config: &Configuration = match input
        .shop()
        .metaobject()
        .and_then(|mo| mo.field())
        .and_then(|field| field.json_value())
    {
        Some(config) => config,
        None => return Ok(no_ops),
    };
    if config.rules.is_empty() {
        return Ok(no_ops);
    }

    let has_product_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product);
    if !has_product_discount_class {
        return Ok(no_ops);
    }

    let cart_subtotal = input.cart().cost().subtotal_amount().amount().as_f64();

    // First matching rule wins (selection strategy First), keeping behavior
    // predictable and avoiding discount stacking.
    for rule in config.rules.iter() {
        // Customer-tag gates cannot be honored (see module note); skip rather
        // than apply the discount unconditionally.
        if !rule.when.customer_tags.is_empty() {
            continue;
        }

        let percentage_off = rule.apply.percentage_off.unwrap_or(0.0);
        let fixed_amount_off = rule.apply.fixed_amount_off.unwrap_or(0.0);
        if percentage_off <= 0.0 && fixed_amount_off <= 0.0 {
            continue;
        }

        if let Some(min_subtotal) = rule.when.min_subtotal {
            if cart_subtotal < min_subtotal {
                continue;
            }
        }

        let targets: Vec<schema::ProductDiscountCandidateTarget> = input
            .cart()
            .lines()
            .iter()
            .filter(|line| {
                if rule.when.sku_in.is_empty() {
                    return true;
                }
                match line.merchandise() {
                    schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) => {
                        match variant.sku() {
                            Some(sku) => rule.when.sku_in.iter().any(|s| s == sku),
                            None => false,
                        }
                    }
                    _ => false,
                }
            })
            .map(|line| {
                schema::ProductDiscountCandidateTarget::CartLine(schema::CartLineTarget {
                    id: line.id().clone(),
                    quantity: None,
                })
            })
            .collect();

        if targets.is_empty() {
            continue;
        }

        // Percentage takes precedence when both are configured.
        let (value, message) = if percentage_off > 0.0 {
            (
                schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(percentage_off),
                }),
                format!("{}% OFF", percentage_off as i64),
            )
        } else {
            (
                schema::ProductDiscountCandidateValue::FixedAmount(
                    schema::ProductDiscountCandidateFixedAmount {
                        amount: Decimal(fixed_amount_off),
                        applies_to_each_item: None,
                    },
                ),
                format!("{} OFF", fixed_amount_off as i64),
            )
        };

        let operations = vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::First,
                candidates: vec![schema::ProductDiscountCandidate {
                    targets,
                    message: Some(message),
                    value,
                    associated_discount_code: None,
                    prerequisites: None,
                }],
            },
        )];
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations });
    }

    Ok(no_ops)
}
