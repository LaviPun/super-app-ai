use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::BTreeMap;

/// Fulfillment-constraints configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-fulfillmentConstraints`, field `config_json`) by
/// `PublishService.writeFunctionConfig`. Mirrors the
/// `functions.fulfillmentConstraints` recipe config. Optional keys are omitted
/// from the stored JSON, so every field defaults when missing.
///
/// Scope note: the Fulfillment Constraints API only exposes "must fulfill from
/// the same location" and "must fulfill from a specific location" operations.
/// This function implements same-location grouping keyed by `apply.groupWithTag`
/// over SKU-matched lines. `apply.shipAlone` has no separate-shipment primitive
/// in the API, and `when.productTagIn` cannot be evaluated because product-tag
/// lookups (`hasTags`) require static tag arguments in the input query, not
/// runtime config values — both are inert here (see honestGaps).
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<FulfillmentRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct FulfillmentRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    apply: RuleApply,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Product tags to match. Not evaluable in a pure function (see module note).
    #[shopify_function(default)]
    product_tag_in: Vec<String>,
    /// SKUs the rule targets. This is the supported matcher.
    #[shopify_function(default)]
    sku_in: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// No separate-shipment primitive exists in the API (see module note).
    #[shopify_function(default)]
    ship_alone: bool,
    /// Grouping key: SKU-matched lines sharing this key are forced to fulfill
    /// from the same location.
    #[shopify_function(default)]
    group_with_tag: String,
}

#[shopify_function]
fn cart_fulfillment_constraints_generate_run(
    input: schema::cart_fulfillment_constraints_generate_run::Input,
) -> Result<schema::CartFulfillmentConstraintsGenerateRunResult> {
    let no_ops = schema::CartFulfillmentConstraintsGenerateRunResult { operations: vec![] };

    // No published config → no operations (safe no-op).
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

    // Collect deliverable line ids per grouping key, preserving cart order and
    // de-duplicating so a line matched by several rules is only listed once.
    let mut grouped_line_ids: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for rule in config.rules.iter() {
        if rule.apply.group_with_tag.is_empty() {
            // Only same-location grouping is expressible; rules without a group
            // key (e.g. shipAlone / productTagIn-only) produce no constraint.
            continue;
        }
        if rule.when.sku_in.is_empty() {
            continue;
        }

        for line in input.cart().deliverable_lines().iter() {
            let sku = match line.merchandise() {
                schema::cart_fulfillment_constraints_generate_run::input::cart::deliverable_lines::Merchandise::ProductVariant(variant) => variant.sku(),
                _ => None,
            };
            let Some(sku) = sku else { continue };
            if rule.when.sku_in.iter().any(|target| target == sku) {
                let line_id = line.id().clone();
                let entry = grouped_line_ids.entry(rule.apply.group_with_tag.clone()).or_default();
                if !entry.contains(&line_id) {
                    entry.push(line_id);
                }
            }
        }
    }

    let mut operations: Vec<schema::Operation> = Vec::new();
    for (_group_key, line_ids) in grouped_line_ids.into_iter() {
        // A same-location constraint is only meaningful across two or more lines.
        if line_ids.len() < 2 {
            continue;
        }
        operations.push(schema::Operation::DeliverableLinesMustFulfillFromSameLocationAdd(
            schema::DeliverableLinesMustFulfillFromSameLocationAddOperation {
                deliverable_line_ids: Some(line_ids),
            },
        ));
    }

    if operations.is_empty() {
        return Ok(no_ops);
    }
    Ok(schema::CartFulfillmentConstraintsGenerateRunResult { operations })
}
