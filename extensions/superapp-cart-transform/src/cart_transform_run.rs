use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;
use std::collections::BTreeMap;

/// Bundle configuration, supplied at publish time as the `$app:bundle_config`
/// JSON metafield on the CartTransform owner. Each entry maps a bundle id (the
/// `_superapp_bundle_id` line property the storefront widget stamps on every
/// component line) to the parent variant the components merge into.
///
/// Additive R2.2 note: the `functions.cartTransform` compiler lowers a `pricing`
/// block onto each bundle as a `price` directive (`{ kind, value, cheapestFreeCount?,
/// priceEnding? }`) and, for tiered pricing, a `tiers[]` price table keyed by
/// threshold (`compiler/pricing/lower.ts` — `lowerPricingToCartTransform`). This
/// handler parses that lowered shape ADDITIVELY: when a bundle carries `price`
/// (or `tiers`), the merged line's discount is derived from it; when it carries
/// only the legacy `discountPercentage`, behavior is byte-for-byte unchanged.
/// Unknown keys are ignored (serde drops them), so an older config still parses.
///
/// # Honest gap (what a `LinesMergeOperation` can and cannot express)
/// The merged bundle line's price is a `PriceAdjustment`, which in this schema
/// supports ONLY `percentageDecrease` — there is no fixed-amount or fixed-price
/// adjustment on a merge. So of the lowered price kinds:
/// - `percentage` → enforced as a `percentageDecrease` on the merged line.
/// - `fixed-amount` / `fixed-price` / `cheapest-free` → NOT expressible on a
///   `linesMerge` price (they need `lineUpdate.fixedPricePerUnit`, a Shopify
///   Plus-only `update` operation on individual lines, not a merge). These are
///   parsed but do not adjust the merged-line price; they remain a follow-up that
///   requires the `update`-operation path. `priceEnding` (rounding) is likewise
///   not expressible on a merge and is ignored.
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
    /// Legacy percentage discount applied to the merged bundle line (0 = none).
    /// Preserved for back-compat; still the primary field the live
    /// `bundle-product.service.ts` writer emits.
    #[shopify_function(default)]
    discount_percentage: f64,
    /// R2.2 lowered single price directive. When present and percentage-kind,
    /// derives the merged-line discount (additive; see module note).
    #[shopify_function(default)]
    price: Option<LoweredPrice>,
    /// R2.2 lowered tiered price table, highest-threshold-first. When present, the
    /// selected tier (by merged component quantity) governs the merged-line price.
    #[shopify_function(default)]
    tiers: Vec<LoweredTierPrice>,
}

/// One lowered price directive (`compiler/pricing/lower.ts` `LoweredBundlePrice`).
#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct LoweredPrice {
    /// One of `percentage | fixed-amount | fixed-price | cheapest-free |
    /// free-shipping | free-gift | none`. Only `percentage` is expressible on a
    /// merged line (see module note).
    #[shopify_function(default)]
    kind: String,
    #[shopify_function(default)]
    value: f64,
    // `cheapestFreeCount` / `priceEnding` are parsed-tolerant but unused on merge.
}

/// One tiered price entry keyed by threshold (`LoweredTierPrice`).
#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct LoweredTierPrice {
    #[shopify_function(default)]
    threshold: f64,
    #[shopify_function(default)]
    kind: String,
    #[shopify_function(default)]
    value: f64,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────

/// Resolve the percentage decrease to apply to a merged bundle line, given the
/// bundle config and the total merged component quantity. Returns `None` for no
/// price change (0% / no expressible price kind).
///
/// Precedence: an R2.2 lowered `price`/`tiers` takes precedence when it yields an
/// expressible (percentage) discount; otherwise the legacy `discountPercentage`
/// governs. This keeps a config that carries ONLY `discountPercentage` identical
/// to prior behavior, and lets a lowered pricing config drive the discount.
pub fn resolve_merge_percentage(bundle: &BundleConfig, merged_quantity: i64) -> Option<f64> {
    // Tiered lowered pricing: pick the highest threshold at or below the merged
    // quantity (rows are emitted highest-threshold-first by the compiler; we do
    // not rely on order and select the best qualifying tier explicitly).
    if !bundle.tiers.is_empty() {
        let mut best: Option<&LoweredTierPrice> = None;
        for tier in bundle.tiers.iter() {
            if (merged_quantity as f64) >= tier.threshold {
                match best {
                    Some(b) if b.threshold >= tier.threshold => {}
                    _ => best = Some(tier),
                }
            }
        }
        if let Some(tier) = best {
            if let Some(pct) = expressible_percentage(&tier.kind, tier.value) {
                return non_zero(pct);
            }
            // Tier kind not expressible on a merge → no merged-line discount.
            return None;
        }
        // No tier qualifies → no discount (fall through to legacy is intentional
        // only when there is no tier table at all).
        return None;
    }

    // Single lowered price.
    if let Some(price) = &bundle.price {
        if let Some(pct) = expressible_percentage(&price.kind, price.value) {
            return non_zero(pct);
        }
        // Non-percentage lowered price kind → not expressible on a merge.
        return None;
    }

    // Legacy path: discountPercentage governs.
    non_zero(bundle.discount_percentage)
}

/// The percentage decrease a lowered price kind maps to on a merged line, or
/// `None` if the kind is not expressible via `PriceAdjustment.percentageDecrease`.
fn expressible_percentage(kind: &str, value: f64) -> Option<f64> {
    match kind {
        "percentage" => Some(value),
        // fixed-amount / fixed-price / cheapest-free / free-shipping / free-gift /
        // none / priceEnding — not expressible on a linesMerge price (see note).
        _ => None,
    }
}

fn non_zero(pct: f64) -> Option<f64> {
    if pct > 0.0 {
        Some(pct)
    } else {
        None
    }
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

        // Total merged component quantity — used to select a tiered price.
        let merged_quantity: i64 = cart_lines.iter().map(|l| l.quantity as i64).sum();

        let price = resolve_merge_percentage(bundle, merged_quantity).map(|pct| {
            schema::PriceAdjustment {
                percentage_decrease: Some(schema::PriceAdjustmentValue {
                    value: Decimal::from(pct),
                }),
            }
        });

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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_bundle() -> BundleConfig {
        BundleConfig {
            bundle_id: "b1".to_string(),
            parent_variant_id: "gid://shopify/ProductVariant/1".to_string(),
            title: "Bundle".to_string(),
            discount_percentage: 0.0,
            price: None,
            tiers: vec![],
        }
    }

    // ── Back-compat: legacy discountPercentage path is preserved ──

    #[test]
    fn legacy_discount_percentage_governs() {
        let mut b = base_bundle();
        b.discount_percentage = 15.0;
        assert_eq!(resolve_merge_percentage(&b, 2), Some(15.0));
    }

    #[test]
    fn legacy_zero_discount_is_no_price_change() {
        let b = base_bundle(); // discount_percentage = 0.0
        assert_eq!(resolve_merge_percentage(&b, 2), None);
    }

    // ── R2.2 single lowered price ──

    #[test]
    fn lowered_percentage_price_governs() {
        let mut b = base_bundle();
        b.price = Some(LoweredPrice {
            kind: "percentage".to_string(),
            value: 20.0,
        });
        assert_eq!(resolve_merge_percentage(&b, 2), Some(20.0));
    }

    #[test]
    fn lowered_percentage_takes_precedence_over_legacy() {
        let mut b = base_bundle();
        b.discount_percentage = 5.0;
        b.price = Some(LoweredPrice {
            kind: "percentage".to_string(),
            value: 25.0,
        });
        assert_eq!(resolve_merge_percentage(&b, 2), Some(25.0));
    }

    #[test]
    fn lowered_fixed_price_is_not_expressible_on_merge() {
        // fixed-price cannot be expressed as a percentageDecrease → no discount,
        // and it deliberately does NOT fall back to legacy (the lowered price is
        // authoritative for that bundle).
        let mut b = base_bundle();
        b.discount_percentage = 10.0;
        b.price = Some(LoweredPrice {
            kind: "fixed-price".to_string(),
            value: 99.99,
        });
        assert_eq!(resolve_merge_percentage(&b, 2), None);
    }

    #[test]
    fn lowered_cheapest_free_is_not_expressible_on_merge() {
        let mut b = base_bundle();
        b.price = Some(LoweredPrice {
            kind: "cheapest-free".to_string(),
            value: 0.0,
        });
        assert_eq!(resolve_merge_percentage(&b, 2), None);
    }

    // ── R2.2 tiered lowered price table ──

    #[test]
    fn tiered_selects_best_qualifying_tier() {
        let mut b = base_bundle();
        // Highest-threshold-first, as the compiler emits.
        b.tiers = vec![
            LoweredTierPrice { threshold: 6.0, kind: "percentage".to_string(), value: 30.0 },
            LoweredTierPrice { threshold: 3.0, kind: "percentage".to_string(), value: 20.0 },
            LoweredTierPrice { threshold: 2.0, kind: "percentage".to_string(), value: 10.0 },
        ];
        assert_eq!(resolve_merge_percentage(&b, 2), Some(10.0));
        assert_eq!(resolve_merge_percentage(&b, 4), Some(20.0));
        assert_eq!(resolve_merge_percentage(&b, 6), Some(30.0));
        assert_eq!(resolve_merge_percentage(&b, 10), Some(30.0));
    }

    #[test]
    fn tiered_below_lowest_threshold_is_no_discount() {
        let mut b = base_bundle();
        b.discount_percentage = 50.0; // must NOT leak through when a tier table exists
        b.tiers = vec![LoweredTierPrice {
            threshold: 3.0,
            kind: "percentage".to_string(),
            value: 20.0,
        }];
        assert_eq!(resolve_merge_percentage(&b, 2), None);
    }

    #[test]
    fn tiered_mixed_kinds_non_percentage_tier_not_expressible() {
        let mut b = base_bundle();
        // Qualifying tier is a fixed-price kind → not expressible on a merge.
        b.tiers = vec![
            LoweredTierPrice { threshold: 6.0, kind: "fixed-price".to_string(), value: 99.99 },
            LoweredTierPrice { threshold: 2.0, kind: "percentage".to_string(), value: 10.0 },
        ];
        // 6 units → best tier is fixed-price → not expressible → None.
        assert_eq!(resolve_merge_percentage(&b, 6), None);
        // 4 units → best qualifying tier is the percentage one → 10%.
        assert_eq!(resolve_merge_percentage(&b, 4), Some(10.0));
    }
}
