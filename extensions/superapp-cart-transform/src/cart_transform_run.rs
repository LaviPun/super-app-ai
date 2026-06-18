use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::BTreeMap;

/// Bundle configuration, supplied at publish time as the `$app:bundle_config`
/// JSON metafield on the CartTransform owner. Each entry maps a bundle id (the
/// `_superapp_bundle_id` line property the storefront widget stamps on every
/// component line) to the parent variant the components merge into.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    bundles: Vec<BundleConfig>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct BundleConfig {
    bundle_id: String,
    parent_variant_id: String,
    title: String,
    /// Percentage discount applied to the merged bundle line (0 = none).
    discount_percentage: f64,
}

#[shopify_function]
fn cart_transform_run(
    input: schema::cart_transform_run::CartTransformRunInput,
) -> Result<schema::CartTransformRunResult> {
    let no_changes = schema::CartTransformRunResult { operations: vec![] };

    // Config lives on the CartTransform owner metafield ($app:bundle_config).
    let config: &Configuration = match input.cart_transform().metafield() {
        Some(metafield) => metafield.json_value(),
        None => return Ok(no_changes),
    };
    if config.bundles.is_empty() {
        return Ok(no_changes);
    }

    // Group every cart line that carries a `_superapp_bundle_id` line property,
    // keyed by that bundle id, preserving cart order.
    let mut grouped: BTreeMap<String, Vec<schema::CartLineInput>> = BTreeMap::new();
    for line in input.cart().lines().iter() {
        let bundle_id = match line.bundle_id() {
            Some(attr) => match attr.value() {
                Some(value) if !value.is_empty() => value.clone(),
                _ => continue,
            },
            None => continue,
        };
        grouped.entry(bundle_id).or_default().push(schema::CartLineInput {
            cart_line_id: line.id().clone(),
            quantity: *line.quantity(),
        });
    }

    let mut operations: Vec<schema::Operation> = Vec::new();
    for bundle in config.bundles.iter() {
        let cart_lines = match grouped.get(&bundle.bundle_id) {
            // Only merge when at least two component lines are present, so a lone
            // leftover component is never collapsed into a misleading bundle.
            Some(lines) if lines.len() >= 2 => lines.clone(),
            _ => continue,
        };

        let price = if bundle.discount_percentage > 0.0 {
            Some(schema::PriceAdjustment {
                percentage_decrease: Some(schema::PriceAdjustmentValue {
                    value: Decimal::from(bundle.discount_percentage),
                }),
            })
        } else {
            None
        };

        let title = if bundle.title.is_empty() {
            None
        } else {
            Some(bundle.title.clone())
        };

        operations.push(schema::Operation::LinesMerge(schema::LinesMergeOperation {
            cart_lines,
            parent_variant_id: bundle.parent_variant_id.clone(),
            title,
            price,
            attributes: None,
            image: None,
        }));
    }

    if operations.is_empty() {
        return Ok(no_changes);
    }
    Ok(schema::CartTransformRunResult { operations })
}
