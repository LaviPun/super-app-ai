use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Shipping-discount configuration, published as the `$app:superapp_function_config`
/// metaobject (handle `superapp-fn-shippingDiscount`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same app-served metaobject pattern every
/// other SuperApp Function uses. Produced by the R2.2 pricing lowering
/// (`compiler/pricing/lower.ts` `lowerPricingToShippingDiscount`) from a `free-shipping`
/// (or discounted-delivery) pricing rule.
///
/// This is the runtime the product-discount Function cannot provide: the
/// `cart.lines.discounts.generate.run` target has no shipping operation, so `free-shipping`
/// is only ever real on THIS target (`cart.delivery-options.discounts.generate.run`, the
/// SHIPPING discount class). See `specs/030-control-packs/design/discount-packs.md` §9.2.
///
/// Optional keys are omitted from the stored JSON, so every field defaults when missing.
/// Unknown keys are ignored (serde drops them), which keeps the config additive: a config
/// carrying keys this handler does not read still parses and behaves the same.
///
/// # Honest gaps (deliberately NOT enforced at runtime, see the lowering doc)
/// - `when.customerTags`: customer-tag lookups need static `hasTags` arguments in the input
///   query, not runtime config values, so a rule gated on customer tags cannot be evaluated
///   in a pure Function. Such a rule is SKIPPED (never applied to everyone). The compiler
///   surfaces this so it is not a silent no-op.
/// - Product/collection prerequisites and SKU scope: a shipping discount targets the delivery
///   group, not individual product lines, so line-level scoping is not meaningful here and is
///   parsed-but-inert. The subtotal / quantity / destination-country gates ARE enforced.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<ShippingRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct ShippingRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    apply: RuleApply,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Minimum cart subtotal required (absent = no minimum).
    #[shopify_function(default)]
    min_subtotal: Option<f64>,
    /// Minimum total item quantity required (absent = no minimum).
    #[shopify_function(default)]
    min_qty: Option<f64>,
    /// Destination country codes the rule applies to (empty = any country).
    #[shopify_function(default)]
    country_code_in: Vec<String>,
    /// Customer tags required. Not evaluable in a pure Function (see module note) — a rule
    /// carrying tags is skipped rather than applied to everyone.
    #[shopify_function(default)]
    customer_tags: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// Percentage off the shipping/delivery cost. `free-shipping` lowers to 100.0;
    /// a discounted-delivery rule lowers to a partial percentage (0..100). Absent/0 = no-op.
    #[shopify_function(default)]
    shipping_percentage: Option<f64>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────
//
// The Shopify input types cannot be constructed in a unit test, so the gate logic lives in
// these pure functions over a normalized view. The `#[shopify_function]` entry point below
// only normalizes the input into these plain values and maps the returned percentage onto the
// Function output operation.

/// A normalized delivery group — the minimum the decision core needs.
#[derive(Debug, Clone, PartialEq)]
pub struct Group {
    pub id: String,
    /// Destination country code (`deliveryAddress.countryCode`), if known.
    pub country_code: Option<String>,
}

/// A resolved shipping discount for one delivery group.
#[derive(Debug, Clone, PartialEq)]
pub struct GroupDiscount {
    pub group_id: String,
    /// Percentage off shipping (1..=100). Clamped to (0, 100].
    pub percentage: f64,
}

/// Does this rule's gate hold, given the cart totals and a group's destination country?
///
/// A rule applies when every condition it specifies holds: subtotal ≥ `minSubtotal`,
/// total quantity ≥ `minQty`, and the destination country is in `countryCodeIn` (if set).
/// A rule that gates on customer tags cannot be honored in a pure Function, so it never
/// matches (skipped, not applied to everyone).
fn rule_matches(rule: &ShippingRule, cart_subtotal: f64, total_qty: i64, group_country: Option<&String>) -> bool {
    if !rule.when.customer_tags.is_empty() {
        return false;
    }
    if let Some(min_subtotal) = rule.when.min_subtotal {
        if cart_subtotal < min_subtotal {
            return false;
        }
    }
    if let Some(min_qty) = rule.when.min_qty {
        if (total_qty as f64) < min_qty {
            return false;
        }
    }
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
    true
}

/// The percentage a rule waives, if it is a real reduction. `free-shipping` lowers to 100;
/// a discounted-delivery rule to a partial percentage. Values ≤ 0 are treated as no-op;
/// values > 100 are clamped to 100.
fn rule_percentage(rule: &ShippingRule) -> Option<f64> {
    let pct = rule.apply.shipping_percentage.unwrap_or(0.0);
    if pct <= 0.0 {
        return None;
    }
    Some(pct.min(100.0))
}

/// The decision core: given the parsed config, the cart totals, and the normalized delivery
/// groups, return one `GroupDiscount` per group that has a qualifying rule (the BEST — highest
/// percentage — qualifying rule wins for that group). Returns an empty vec for a no-op (no
/// config, no qualifying rule, or no groups).
pub fn decide(config: &Configuration, cart_subtotal: f64, total_qty: i64, groups: &[Group]) -> Vec<GroupDiscount> {
    if config.rules.is_empty() {
        return vec![];
    }
    let mut out: Vec<GroupDiscount> = Vec::new();
    for group in groups.iter() {
        let mut best: Option<f64> = None;
        for rule in config.rules.iter() {
            if !rule_matches(rule, cart_subtotal, total_qty, group.country_code.as_ref()) {
                continue;
            }
            if let Some(pct) = rule_percentage(rule) {
                best = Some(best.map_or(pct, |b: f64| b.max(pct)));
            }
        }
        if let Some(percentage) = best {
            out.push(GroupDiscount { group_id: group.id.clone(), percentage });
        }
    }
    out
}

/// Human message for the discount notification. 100% ⇒ "FREE DELIVERY".
fn discount_message(percentage: f64) -> String {
    if percentage >= 100.0 {
        "FREE DELIVERY".to_string()
    } else {
        format!("{}% OFF DELIVERY", trim_pct(percentage))
    }
}

/// Format a percentage without a trailing `.0` for whole numbers (20.0 → "20", 12.5 → "12.5").
fn trim_pct(pct: f64) -> String {
    if (pct.fract()).abs() < f64::EPSILON {
        format!("{}", pct as i64)
    } else {
        format!("{}", pct)
    }
}

#[shopify_function]
fn cart_delivery_options_discounts_generate_run(
    input: schema::cart_delivery_options_discounts_generate_run::Input,
) -> Result<schema::CartDeliveryOptionsDiscountsGenerateRunResult> {
    let no_changes = schema::CartDeliveryOptionsDiscountsGenerateRunResult { operations: vec![] };

    // Only act when the SHIPPING discount class is enabled on the owning discount node.
    // Otherwise Shopify rejects the delivery operations, so we no-op safely.
    let has_shipping_discount_class = input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Shipping);
    if !has_shipping_discount_class {
        return Ok(no_changes);
    }

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
    let total_qty: i64 = input
        .cart()
        .lines()
        .iter()
        .map(|line| *line.quantity() as i64)
        .sum();

    let groups: Vec<Group> = input
        .cart()
        .delivery_groups()
        .iter()
        .map(|group| Group {
            id: group.id().clone(),
            country_code: group
                .delivery_address()
                .and_then(|address| address.country_code())
                .map(|code| format!("{:?}", code)),
        })
        .collect();

    let decisions = decide(config, cart_subtotal, total_qty, &groups);
    if decisions.is_empty() {
        return Ok(no_changes);
    }

    let candidates: Vec<schema::DeliveryDiscountCandidate> = decisions
        .iter()
        .map(|d| schema::DeliveryDiscountCandidate {
            targets: vec![schema::DeliveryDiscountCandidateTarget::DeliveryGroup(
                schema::DeliveryGroupTarget { id: d.group_id.clone() },
            )],
            value: schema::DeliveryDiscountCandidateValue::Percentage(schema::Percentage {
                value: Decimal(d.percentage),
            }),
            message: Some(discount_message(d.percentage)),
            associated_discount_code: None,
        })
        .collect();

    Ok(schema::CartDeliveryOptionsDiscountsGenerateRunResult {
        operations: vec![schema::DeliveryOperation::DeliveryDiscountsAdd(
            schema::DeliveryDiscountsAddOperation {
                selection_strategy: schema::DeliveryDiscountSelectionStrategy::All,
                candidates,
            },
        )],
    })
}

// ─── Native unit tests (the free-shipping decision core) ─────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn group(id: &str, country: Option<&str>) -> Group {
        Group { id: id.to_string(), country_code: country.map(|c| c.to_string()) }
    }

    fn free_shipping_rule(when: RuleWhen) -> ShippingRule {
        ShippingRule { when, apply: RuleApply { shipping_percentage: Some(100.0) } }
    }

    #[test]
    fn no_rules_is_no_op() {
        let cfg = Configuration { rules: vec![] };
        let d = decide(&cfg, 100.0, 3, &[group("g1", None)]);
        assert!(d.is_empty());
    }

    #[test]
    fn free_shipping_no_gate_waives_every_group() {
        let cfg = Configuration { rules: vec![free_shipping_rule(RuleWhen::default())] };
        let groups = vec![group("g1", Some("US")), group("g2", Some("CA"))];
        let d = decide(&cfg, 10.0, 1, &groups);
        assert_eq!(d.len(), 2);
        assert_eq!(d[0], GroupDiscount { group_id: "g1".into(), percentage: 100.0 });
        assert_eq!(d[1], GroupDiscount { group_id: "g2".into(), percentage: 100.0 });
    }

    #[test]
    fn min_subtotal_gate_enforced() {
        let cfg = Configuration {
            rules: vec![free_shipping_rule(RuleWhen {
                min_subtotal: Some(50.0),
                ..Default::default()
            })],
        };
        // Below threshold → no discount.
        assert!(decide(&cfg, 49.99, 1, &[group("g1", None)]).is_empty());
        // At/above threshold → free shipping.
        let d = decide(&cfg, 50.0, 1, &[group("g1", None)]);
        assert_eq!(d, vec![GroupDiscount { group_id: "g1".into(), percentage: 100.0 }]);
    }

    #[test]
    fn min_qty_gate_enforced() {
        let cfg = Configuration {
            rules: vec![free_shipping_rule(RuleWhen {
                min_qty: Some(3.0),
                ..Default::default()
            })],
        };
        assert!(decide(&cfg, 100.0, 2, &[group("g1", None)]).is_empty());
        let d = decide(&cfg, 100.0, 3, &[group("g1", None)]);
        assert_eq!(d, vec![GroupDiscount { group_id: "g1".into(), percentage: 100.0 }]);
    }

    #[test]
    fn country_gate_matches_only_listed_destinations() {
        let cfg = Configuration {
            rules: vec![free_shipping_rule(RuleWhen {
                country_code_in: vec!["US".into(), "CA".into()],
                ..Default::default()
            })],
        };
        let groups = vec![group("g_us", Some("US")), group("g_de", Some("DE")), group("g_ca", Some("ca"))];
        let d = decide(&cfg, 100.0, 1, &groups);
        // US and CA (case-insensitive) qualify; DE does not.
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].group_id, "g_us");
        assert_eq!(d[1].group_id, "g_ca");
    }

    #[test]
    fn country_gate_skips_group_with_unknown_destination() {
        let cfg = Configuration {
            rules: vec![free_shipping_rule(RuleWhen {
                country_code_in: vec!["US".into()],
                ..Default::default()
            })],
        };
        // A country-gated rule cannot match a group with no known destination country.
        assert!(decide(&cfg, 100.0, 1, &[group("g1", None)]).is_empty());
    }

    #[test]
    fn discounted_delivery_partial_percentage() {
        let cfg = Configuration {
            rules: vec![ShippingRule {
                when: RuleWhen::default(),
                apply: RuleApply { shipping_percentage: Some(50.0) },
            }],
        };
        let d = decide(&cfg, 100.0, 1, &[group("g1", None)]);
        assert_eq!(d, vec![GroupDiscount { group_id: "g1".into(), percentage: 50.0 }]);
    }

    #[test]
    fn best_qualifying_rule_wins_per_group() {
        // A partial-percentage rule with no gate + a free-shipping rule gated on subtotal.
        let cfg = Configuration {
            rules: vec![
                ShippingRule {
                    when: RuleWhen::default(),
                    apply: RuleApply { shipping_percentage: Some(25.0) },
                },
                free_shipping_rule(RuleWhen { min_subtotal: Some(75.0), ..Default::default() }),
            ],
        };
        // Below the free-shipping threshold → only the 25% rule applies.
        let low = decide(&cfg, 50.0, 1, &[group("g1", None)]);
        assert_eq!(low, vec![GroupDiscount { group_id: "g1".into(), percentage: 25.0 }]);
        // At/above the threshold → the better (100%) rule wins.
        let high = decide(&cfg, 80.0, 1, &[group("g1", None)]);
        assert_eq!(high, vec![GroupDiscount { group_id: "g1".into(), percentage: 100.0 }]);
    }

    #[test]
    fn zero_or_negative_percentage_is_no_op() {
        let cfg = Configuration {
            rules: vec![ShippingRule {
                when: RuleWhen::default(),
                apply: RuleApply { shipping_percentage: Some(0.0) },
            }],
        };
        assert!(decide(&cfg, 100.0, 1, &[group("g1", None)]).is_empty());
    }

    #[test]
    fn over_100_percentage_is_clamped() {
        let cfg = Configuration {
            rules: vec![ShippingRule {
                when: RuleWhen::default(),
                apply: RuleApply { shipping_percentage: Some(150.0) },
            }],
        };
        let d = decide(&cfg, 100.0, 1, &[group("g1", None)]);
        assert_eq!(d, vec![GroupDiscount { group_id: "g1".into(), percentage: 100.0 }]);
    }

    #[test]
    fn customer_tag_gate_is_skipped_not_applied() {
        let cfg = Configuration {
            rules: vec![free_shipping_rule(RuleWhen {
                customer_tags: vec!["vip".into()],
                ..Default::default()
            })],
        };
        // A rule gated on customer tags cannot be evaluated in a pure Function → skipped.
        assert!(decide(&cfg, 100.0, 1, &[group("g1", None)]).is_empty());
    }

    #[test]
    fn message_is_free_delivery_at_100_and_partial_otherwise() {
        assert_eq!(discount_message(100.0), "FREE DELIVERY");
        assert_eq!(discount_message(20.0), "20% OFF DELIVERY");
        assert_eq!(discount_message(12.5), "12.5% OFF DELIVERY");
    }
}
