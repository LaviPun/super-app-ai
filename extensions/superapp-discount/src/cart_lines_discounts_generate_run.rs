use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Discount configuration, supplied at publish time as the `$app:discount_config`
/// JSON metafield on the discount node. Mirrors the `functions.discountRules`
/// recipe config. The publish path normalizes every field (no missing keys) so
/// the function can treat them as required.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    rules: Vec<DiscountRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct DiscountRule {
    when: RuleWhen,
    apply: RuleApply,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Minimum cart subtotal required (0 = no minimum).
    min_subtotal: f64,
    /// SKUs the discount targets (empty = all product lines).
    sku_in: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// Percentage off (0 = none).
    percentage_off: f64,
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    let no_ops = schema::CartLinesDiscountsGenerateRunResult { operations: vec![] };

    let config: &Configuration = match input.discount().metafield() {
        Some(metafield) => metafield.json_value(),
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

    let cart_subtotal = *input.cart().cost().subtotal_amount().amount();

    // First matching rule wins (selection strategy First), keeping behavior
    // predictable and avoiding discount stacking.
    for rule in config.rules.iter() {
        if rule.apply.percentage_off <= 0.0 {
            continue;
        }
        if rule.when.min_subtotal > 0.0 && cart_subtotal.as_f64() < rule.when.min_subtotal {
            continue;
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

        let operations = vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                selection_strategy: schema::ProductDiscountSelectionStrategy::First,
                candidates: vec![schema::ProductDiscountCandidate {
                    targets,
                    message: Some(format!("{}% OFF", rule.apply.percentage_off as i64)),
                    value: schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                        value: Decimal(rule.apply.percentage_off),
                    }),
                    associated_discount_code: None,
                    prerequisites: None,
                }],
            },
        )];
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations });
    }

    Ok(no_ops)
}
