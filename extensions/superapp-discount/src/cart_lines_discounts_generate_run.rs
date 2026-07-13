use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Discount configuration, published as the `$app:superapp_function_config`
/// metaobject (handle `superapp-fn-discountRules`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same path used by every other
/// SuperApp Function. Mirrors the `functions.discountRules` recipe config after
/// the R2.2 pricing lowering (`compiler/pricing/lower.ts`).
///
/// Optional keys are omitted from the stored JSON, so every field defaults when
/// missing. Unknown keys are ignored (serde drops them), which is what keeps the
/// config additive: an older config that only carries `percentageOff` /
/// `fixedAmountOff` still parses and behaves exactly as before, and a newer config
/// that carries kinds this handler cannot yet express (see `honest gaps` below)
/// simply does not produce those operations rather than failing.
///
/// Scope note: `when.customerTags` cannot be evaluated in a pure function
/// (customer-tag lookups need static `hasTags` arguments in the input query, not
/// runtime config values), so a rule that gates on customer tags is skipped
/// rather than applied to everyone. Collection-scoped prerequisites
/// (`prerequisiteCollectionIds`, BXGY `*CollectionIds`) have the same limitation —
/// `inCollections` needs static collection-id arguments — so they are parsed but
/// only product-id / SKU matching is enforced at runtime. `combineWithOtherDiscounts`
/// / `combinesWith` / `discountApplication` are properties of the automatic-discount
/// node (set when the discount is created), not values a Function can emit, so they
/// are parsed but inert here. See honest gaps.
///
/// # Honest gaps (kinds the compiler emits that a `cart.lines.discounts.generate.run`
/// Function cannot express, so they are deliberately NOT enforced here):
/// - `freeShipping`: this target only exposes product/order discount operations
///   (`CartOperation` has no shipping op). A shipping discount needs a separate
///   `cart.delivery-options.transform.run` (SHIPPING_DISCOUNT) Function crate, which
///   is not shipped. The compiler emits a warning AUDIT so this never silently
///   no-ops (discount-packs.md §9). `apply.freeShipping` is dropped by serde here.
/// - `priceEnding`: post-calc rounding to an `x.99`-style ending is not
///   deterministically expressible as a `ProductDiscountCandidateValue`
///   (percentage / fixed-amount only), so it is ignored rather than approximated.
///   The only Function path is a Plus-only cart-transform `fixedPricePerUnit`
///   (discount-packs.md §9). `apply.priceEnding` is dropped by serde here.
/// - `buyXGetY` with collection-scoped arms: only product-id matching is enforced
///   (see collection note above).
///
/// # `freeGift` — the CHECKOUT half IS enforced (R2.2 close-out)
/// A discount Function can only reduce the price of lines ALREADY in the cart; it
/// cannot ADD a gift product (auto-add is a storefront theme/JS concern driven by
/// `apply.freeGift.autoAdd`; see discount-packs.md §9). But making the gift line
/// FREE at checkout IS expressible: the R2.2 lowering co-emits `apply.buyXGetY` with
/// an empty buy arm and a 100%-off reward on the gift product(s), so `decide_bxgy`
/// (which runs before the plain per-line kinds) frees the gift line. `apply.freeGift`
/// itself is still dropped by serde — it is the presentation/auto-add half only.
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
    /// Minimum total item quantity required (absent = no minimum). New in R2.2 —
    /// tiered pricing lowers a quantity-basis threshold to `minQty`.
    #[shopify_function(default)]
    min_qty: Option<f64>,
    /// SKUs the discount targets (empty = all product lines).
    #[shopify_function(default)]
    sku_in: Vec<String>,
    /// Prerequisite product ids (any one present in the cart qualifies the rule).
    /// Collection prerequisites cannot be evaluated at runtime (see module note).
    #[shopify_function(default)]
    prerequisite_product_ids: Vec<String>,
}

/// The `apply` fragment the R2.2 lowering emits. Legacy keys (`percentageOff`,
/// `fixedAmountOff`) plus the additive kinds. Every field is optional; a rule
/// carries exactly one price-changing key in practice.
#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// Percentage off (absent/0 = none). Takes precedence over `fixedAmountOff`.
    #[shopify_function(default)]
    percentage_off: Option<f64>,
    /// Fixed amount off in the cart currency (absent/0 = none).
    #[shopify_function(default)]
    fixed_amount_off: Option<f64>,
    /// Final price the applicable set is sold for. Enforced as a computed
    /// fixed-amount reduction across the targeted set (new R2.2 kind).
    #[shopify_function(default)]
    fixed_price: Option<f64>,
    /// The N cheapest applicable units become free (100% off). New R2.2 kind.
    #[shopify_function(default)]
    cheapest_free: Option<i64>,
    /// Per-unit set price for the targeted lines (Basic-plan bundle-pricing
    /// fallback): each targeted line is reduced to `value × quantity`. Emitted by
    /// the publish-time plan splitter as the non-Plus expression of a cart-transform
    /// `fixed-price` bundle (targets the merged parent line by SKU).
    #[shopify_function(default)]
    fixed_price_per_unit: Option<f64>,
    /// Buy-X-Get-Y reward on the "get" arm. New R2.2 kind (product-id matching).
    #[shopify_function(default)]
    buy_x_get_y: Option<BuyXGetY>,
    // Deliberately-unparsed additive keys (honest gaps, see module note):
    // `freeShipping`, `freeGift`, `priceEnding` — serde drops them.
}

/// Buy-X-Get-Y arms + reward. Only product-id matching is enforced (collections
/// need static query args). The reward reuses the same apply vocabulary.
#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct BuyXGetY {
    #[shopify_function(default)]
    buy_qty: Option<f64>,
    #[shopify_function(default)]
    buy_product_ids: Vec<String>,
    #[shopify_function(default)]
    get_qty: Option<f64>,
    #[shopify_function(default)]
    get_product_ids: Vec<String>,
    /// The reward applied to the "get" arm. `showAsFree` lowers to
    /// `{ percentageOff: 100 }`.
    #[shopify_function(default)]
    reward: Option<RuleReward>,
}

/// The BXGY reward — a subset of `RuleApply` (only percentage / fixed-amount are
/// expressible as a candidate value on the get arm).
#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleReward {
    #[shopify_function(default)]
    percentage_off: Option<f64>,
    #[shopify_function(default)]
    fixed_amount_off: Option<f64>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────
//
// The Shopify input types cannot be constructed in a unit test, so all pricing
// math lives in these pure functions over a normalized `Line` view. The
// `#[shopify_function]` entry point below only normalizes the input into `Line`s
// and maps the returned `Decision` back onto the Function output types.

/// A normalized cart line — the minimum the decision core needs.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub id: String,
    pub sku: Option<String>,
    pub product_id: Option<String>,
    pub quantity: i64,
    /// Price of a single unit (`cost.amountPerQuantity`).
    pub unit_amount: f64,
    /// Line subtotal (`cost.subtotalAmount`) = unit_amount * quantity, pre-discount.
    pub subtotal: f64,
}

/// One discount to apply to a set of target lines, produced by the decision core.
#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub target_line_ids: Vec<String>,
    pub value: CandidateValue,
    pub message: String,
    /// Product-id prerequisites to attach (BXGY buy arm), empty otherwise.
    pub prerequisite_line_ids: Vec<(String, i64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CandidateValue {
    Percentage(f64),
    /// Fixed amount off applied ONCE across the target set (appliesToEachItem=false).
    FixedAmount(f64),
}

/// The decision core: given the parsed config, the cart subtotal, and the
/// normalized lines, return the single winning candidate (first-match, mirroring
/// the compiler's highest-threshold-first ordering) or `None` for a no-op.
pub fn decide(config: &Configuration, cart_subtotal: f64, lines: &[Line]) -> Option<Candidate> {
    let total_qty: i64 = lines.iter().map(|l| l.quantity).sum();

    for rule in config.rules.iter() {
        // Customer-tag gates cannot be honored (see module note); skip.
        if !rule.when.customer_tags.is_empty() {
            continue;
        }
        if let Some(min_subtotal) = rule.when.min_subtotal {
            if cart_subtotal < min_subtotal {
                continue;
            }
        }
        if let Some(min_qty) = rule.when.min_qty {
            if (total_qty as f64) < min_qty {
                continue;
            }
        }
        // Product-id prerequisites: at least one prerequisite product must be in
        // the cart. (Collection prerequisites are not runtime-evaluable.)
        if !rule.when.prerequisite_product_ids.is_empty() {
            let present = lines.iter().any(|l| {
                l.product_id
                    .as_ref()
                    .map(|pid| rule.when.prerequisite_product_ids.iter().any(|p| p == pid))
                    .unwrap_or(false)
            });
            if !present {
                continue;
            }
        }

        // BXGY is evaluated before the plain per-line kinds because it targets a
        // distinct (get-arm) set with its own reward.
        if let Some(bxgy) = &rule.apply.buy_x_get_y {
            if let Some(candidate) = decide_bxgy(bxgy, lines) {
                return Some(candidate);
            }
            continue;
        }

        // Lines the rule targets (sku_in filter; empty = all product lines).
        let targeted: Vec<&Line> = lines
            .iter()
            .filter(|l| line_matches_sku(l, &rule.when.sku_in))
            .collect();
        if targeted.is_empty() {
            continue;
        }

        // cheapest-free: the N cheapest *units* across the targeted set become
        // free. We target whole lines whose unit price is among the N lowest; a
        // 100%-off percentage on those lines is the expressible approximation.
        if let Some(n) = rule.apply.cheapest_free {
            if n > 0 {
                if let Some(candidate) = decide_cheapest_free(n, &targeted) {
                    return Some(candidate);
                }
            }
            continue;
        }

        // fixed-price-per-unit: reduce each targeted line to fp × qty. Emitted as
        // one fixed-amount reduction across the set (per-line deltas summed).
        if let Some(fp) = rule.apply.fixed_price_per_unit {
            let reduction: f64 = targeted
                .iter()
                .map(|l| (l.subtotal - fp * l.quantity as f64).max(0.0))
                .sum();
            if reduction > 0.0 {
                return Some(Candidate {
                    target_line_ids: targeted.iter().map(|l| l.id.clone()).collect(),
                    value: CandidateValue::FixedAmount(reduction),
                    message: format!("Bundle price {}", format_money(fp)),
                    prerequisite_line_ids: vec![],
                });
            }
            continue;
        }

        // fixed-price: sell the whole targeted set for `fixed_price`. Emit a
        // single fixed-amount reduction = max(0, setSubtotal - fixedPrice) applied
        // once across the set.
        if let Some(fp) = rule.apply.fixed_price {
            let set_subtotal: f64 = targeted.iter().map(|l| l.subtotal).sum();
            let reduction = set_subtotal - fp;
            if reduction > 0.0 {
                return Some(Candidate {
                    target_line_ids: targeted.iter().map(|l| l.id.clone()).collect(),
                    value: CandidateValue::FixedAmount(reduction),
                    message: format!("Set price {}", format_money(fp)),
                    prerequisite_line_ids: vec![],
                });
            }
            continue;
        }

        // Legacy percentage / fixed-amount (unchanged behavior).
        let percentage_off = rule.apply.percentage_off.unwrap_or(0.0);
        let fixed_amount_off = rule.apply.fixed_amount_off.unwrap_or(0.0);
        if percentage_off > 0.0 {
            return Some(Candidate {
                target_line_ids: targeted.iter().map(|l| l.id.clone()).collect(),
                value: CandidateValue::Percentage(percentage_off),
                message: format!("{}% OFF", percentage_off as i64),
                prerequisite_line_ids: vec![],
            });
        }
        if fixed_amount_off > 0.0 {
            return Some(Candidate {
                target_line_ids: targeted.iter().map(|l| l.id.clone()).collect(),
                value: CandidateValue::FixedAmount(fixed_amount_off),
                message: format!("{} OFF", fixed_amount_off as i64),
                prerequisite_line_ids: vec![],
            });
        }
        // No expressible price-changing key on this rule → try the next rule.
    }
    None
}

/// cheapest-free over the targeted set: rank lines by unit price ascending and
/// take enough whole lines to cover `n` free units, giving those lines 100% off.
///
/// Approximation note: the discount candidate value is per-line, so we free whole
/// lines (not partial quantities). We select the cheapest lines until the freed
/// quantity reaches `n`; the last selected line may over-cover if its quantity
/// exceeds the remaining count. This is the closest expressible behavior and is
/// deterministic (stable sort by unit price, then original order).
fn decide_cheapest_free(n: i64, targeted: &[&Line]) -> Option<Candidate> {
    let mut ranked: Vec<&&Line> = targeted.iter().collect();
    // Stable sort by unit price ascending; ties keep cart order (input order).
    ranked.sort_by(|a, b| {
        a.unit_amount
            .partial_cmp(&b.unit_amount)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut freed = 0i64;
    let mut ids: Vec<String> = Vec::new();
    for line in ranked {
        if freed >= n {
            break;
        }
        ids.push(line.id.clone());
        freed += line.quantity;
    }
    if ids.is_empty() {
        return None;
    }
    Some(Candidate {
        target_line_ids: ids,
        value: CandidateValue::Percentage(100.0),
        message: if n > 1 {
            format!("{} cheapest free", n)
        } else {
            "Cheapest free".to_string()
        },
        prerequisite_line_ids: vec![],
    })
}

/// BXGY: if the cart holds >= buyQty units of a buy-arm product, reward the
/// get-arm lines. Product-id matching only. The reward is a percentage / fixed
/// amount on the get lines, with the buy lines attached as prerequisites so the
/// discount only holds while the buy arm is present.
///
/// Gift-with-purchase special case (empty buy arm): the R2.2 `free-gift` lowering
/// (`compiler/pricing/lower.ts` `giftToBuyXGetY`) emits a BXGY fragment with an
/// EMPTY `buy_product_ids` and a 100%-off reward on the gift product(s). For a
/// gift-with-purchase the cart is qualified by the rule's threshold GATE
/// (`when.min_qty`/`when.min_subtotal`, already checked before we get here), not by
/// a specific buy product — so an empty buy arm means "gate already qualified":
/// reward the get arm with no buy-quantity requirement and NO prerequisites (there
/// is no buy line to tie the reward to). This is what makes `free-gift` real at
/// checkout: whichever gift line is in the cart becomes free.
fn decide_bxgy(bxgy: &BuyXGetY, lines: &[Line]) -> Option<Candidate> {
    // Empty buy arm ⇒ gift-with-purchase (gate-qualified, no buy requirement).
    let gate_qualified_gift = bxgy.buy_product_ids.is_empty();

    let buy_lines: Vec<&Line> = if gate_qualified_gift {
        Vec::new()
    } else {
        let buy_qty = bxgy.buy_qty.unwrap_or(1.0).max(1.0);
        let matched: Vec<&Line> = lines
            .iter()
            .filter(|l| line_matches_product(l, &bxgy.buy_product_ids))
            .collect();
        let buy_units: i64 = matched.iter().map(|l| l.quantity).sum();
        if (buy_units as f64) < buy_qty {
            return None;
        }
        matched
    };

    let get_lines: Vec<&Line> = lines
        .iter()
        .filter(|l| line_matches_product(l, &bxgy.get_product_ids))
        .collect();
    if get_lines.is_empty() {
        return None;
    }

    // Reward: showAsFree lowers to percentageOff:100; otherwise percentage/fixed.
    let reward = bxgy.reward.as_ref();
    let percentage_off = reward.and_then(|r| r.percentage_off).unwrap_or(0.0);
    let fixed_amount_off = reward.and_then(|r| r.fixed_amount_off).unwrap_or(0.0);
    let value = if percentage_off > 0.0 {
        CandidateValue::Percentage(percentage_off)
    } else if fixed_amount_off > 0.0 {
        CandidateValue::FixedAmount(fixed_amount_off)
    } else {
        // Default BXGY reward is free (showAsFree default true).
        CandidateValue::Percentage(100.0)
    };

    let prerequisite_line_ids: Vec<(String, i64)> = buy_lines
        .iter()
        .map(|l| (l.id.clone(), l.quantity))
        .collect();

    Some(Candidate {
        target_line_ids: get_lines.iter().map(|l| l.id.clone()).collect(),
        value,
        message: "Buy X Get Y".to_string(),
        prerequisite_line_ids,
    })
}

fn line_matches_sku(line: &Line, sku_in: &[String]) -> bool {
    if sku_in.is_empty() {
        return true;
    }
    match &line.sku {
        Some(sku) => sku_in.iter().any(|s| s == sku),
        None => false,
    }
}

fn line_matches_product(line: &Line, product_ids: &[String]) -> bool {
    if product_ids.is_empty() {
        return false;
    }
    match &line.product_id {
        Some(pid) => product_ids.iter().any(|p| p == pid),
        None => false,
    }
}

/// Deterministic money formatting for messages (e.g. `99.99`, `100`).
fn format_money(amount: f64) -> String {
    if (amount.fract()).abs() < 1e-9 {
        format!("{}", amount as i64)
    } else {
        format!("{:.2}", amount)
    }
}

// ─── Shopify-input glue ──────────────────────────────────────────────────────

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

    // Normalize cart lines into the decision core's `Line` view, keeping a map
    // from line id back to the Shopify line id for building targets.
    let lines: Vec<Line> = input
        .cart()
        .lines()
        .iter()
        .map(|line| {
            let (sku, product_id) = match line.merchandise() {
                schema::cart_lines_discounts_generate_run::input::cart::lines::Merchandise::ProductVariant(variant) => {
                    (
                        variant.sku().cloned(),
                        Some(variant.product().id().clone()),
                    )
                }
                _ => (None, None),
            };
            Line {
                id: line.id().clone(),
                sku,
                product_id,
                quantity: *line.quantity() as i64,
                unit_amount: line.cost().amount_per_quantity().amount().as_f64(),
                subtotal: line.cost().subtotal_amount().amount().as_f64(),
            }
        })
        .collect();

    let candidate = match decide(config, cart_subtotal, &lines) {
        Some(c) => c,
        None => return Ok(no_ops),
    };

    // Build targets from the winning candidate's line ids.
    let targets: Vec<schema::ProductDiscountCandidateTarget> = candidate
        .target_line_ids
        .iter()
        .map(|id| {
            schema::ProductDiscountCandidateTarget::CartLine(schema::CartLineTarget {
                id: id.clone(),
                quantity: None,
            })
        })
        .collect();
    if targets.is_empty() {
        return Ok(no_ops);
    }

    let value = match candidate.value {
        CandidateValue::Percentage(pct) => {
            schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                value: Decimal(pct),
            })
        }
        CandidateValue::FixedAmount(amt) => schema::ProductDiscountCandidateValue::FixedAmount(
            schema::ProductDiscountCandidateFixedAmount {
                amount: Decimal(amt),
                // Applied once across the entitled set (matches fixed-price /
                // fixed-amount-off "across the set" semantics).
                applies_to_each_item: Some(false),
            },
        ),
    };

    let prerequisites = if candidate.prerequisite_line_ids.is_empty() {
        None
    } else {
        Some(
            candidate
                .prerequisite_line_ids
                .iter()
                .map(|(id, qty)| {
                    schema::ProductDiscountCandidatePrerequisite::CartLine(
                        schema::CartLinePrerequisite {
                            id: id.clone(),
                            quantity: *qty as i32,
                        },
                    )
                })
                .collect(),
        )
    };

    let operations = vec![schema::CartOperation::ProductDiscountsAdd(
        schema::ProductDiscountsAddOperation {
            selection_strategy: schema::ProductDiscountSelectionStrategy::First,
            candidates: vec![schema::ProductDiscountCandidate {
                targets,
                message: Some(candidate.message),
                value,
                associated_discount_code: None,
                prerequisites,
            }],
        },
    )];
    Ok(schema::CartLinesDiscountsGenerateRunResult { operations })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(id: &str, sku: &str, product_id: &str, qty: i64, unit: f64) -> Line {
        Line {
            id: id.to_string(),
            sku: Some(sku.to_string()),
            product_id: Some(product_id.to_string()),
            quantity: qty,
            unit_amount: unit,
            subtotal: unit * qty as f64,
        }
    }

    fn rule(when: RuleWhen, apply: RuleApply) -> DiscountRule {
        DiscountRule { when, apply }
    }

    // ── Back-compat: legacy percentage / fixed-amount behavior is preserved ──

    #[test]
    fn legacy_percentage_off_unchanged() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    percentage_off: Some(20.0),
                    ..Default::default()
                },
            )],
            combine_with_other_discounts: false,
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        let d = decide(&cfg, 50.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(20.0));
        assert_eq!(d.target_line_ids, vec!["l1"]);
        assert!(d.prerequisite_line_ids.is_empty());
    }

    #[test]
    fn legacy_fixed_amount_off_unchanged() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    fixed_amount_off: Some(15.0),
                    ..Default::default()
                },
            )],
            combine_with_other_discounts: false,
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        let d = decide(&cfg, 50.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::FixedAmount(15.0));
    }

    #[test]
    fn percentage_takes_precedence_over_fixed_amount() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    percentage_off: Some(10.0),
                    fixed_amount_off: Some(5.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        let d = decide(&cfg, 50.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(10.0));
    }

    #[test]
    fn customer_tag_gate_is_skipped_not_applied() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    customer_tags: vec!["vip".to_string()],
                    ..Default::default()
                },
                RuleApply {
                    percentage_off: Some(20.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        assert_eq!(decide(&cfg, 50.0, &lines), None);
    }

    #[test]
    fn min_subtotal_gate_enforced() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    min_subtotal: Some(100.0),
                    ..Default::default()
                },
                RuleApply {
                    percentage_off: Some(20.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        assert_eq!(decide(&cfg, 50.0, &lines), None);
        assert!(decide(&cfg, 150.0, &lines).is_some());
    }

    #[test]
    fn sku_filter_restricts_targets() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    sku_in: vec!["A".to_string()],
                    ..Default::default()
                },
                RuleApply {
                    percentage_off: Some(20.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "B", "p2", 1, 50.0),
        ];
        let d = decide(&cfg, 100.0, &lines).unwrap();
        assert_eq!(d.target_line_ids, vec!["l1"]);
    }

    // ── New R2.2 kinds ──────────────────────────────────────────────────────

    #[test]
    fn fixed_price_reduces_set_to_target() {
        // Set subtotal = 120, fixed price 99.99 → reduction 20.01 once across set.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    fixed_price: Some(99.99),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 60.0),
            line("l2", "B", "p2", 1, 60.0),
        ];
        let d = decide(&cfg, 120.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 20.01).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
        assert_eq!(d.target_line_ids, vec!["l1", "l2"]);
    }

    #[test]
    fn fixed_price_no_op_when_already_below_target() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    fixed_price: Some(99.99),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        assert_eq!(decide(&cfg, 50.0, &lines), None);
    }

    #[test]
    fn cheapest_free_targets_the_cheapest_line() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    cheapest_free: Some(1),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "B", "p2", 1, 20.0), // cheapest
            line("l3", "C", "p3", 1, 30.0),
        ];
        let d = decide(&cfg, 100.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(100.0));
        assert_eq!(d.target_line_ids, vec!["l2"]);
    }

    #[test]
    fn cheapest_free_covers_n_units_across_lines() {
        // n = 2, cheapest lines are qty-1 each → two cheapest lines selected.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    cheapest_free: Some(2),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "B", "p2", 1, 20.0),
            line("l3", "C", "p3", 1, 30.0),
        ];
        let d = decide(&cfg, 100.0, &lines).unwrap();
        // Cheapest two: l2 (20) then l3 (30).
        assert_eq!(d.target_line_ids, vec!["l2", "l3"]);
    }

    // ── Tiered mixed kinds: first-match wins over highest-threshold-first ────

    #[test]
    fn tiered_mixed_kinds_first_match_wins() {
        // Mirrors the compiler's highest-threshold-first ordering for a
        // quantity-basis tiered set that mixes kinds (§2.5 of the design):
        //   threshold 6 → fixed-price 99.99
        //   threshold 5 → cheapest-free 1
        //   threshold 3 → percentage 20
        //   threshold 2 → percentage 10
        let cfg = Configuration {
            rules: vec![
                rule(
                    RuleWhen { min_qty: Some(6.0), ..Default::default() },
                    RuleApply { fixed_price: Some(99.99), ..Default::default() },
                ),
                rule(
                    RuleWhen { min_qty: Some(5.0), ..Default::default() },
                    RuleApply { cheapest_free: Some(1), ..Default::default() },
                ),
                rule(
                    RuleWhen { min_qty: Some(3.0), ..Default::default() },
                    RuleApply { percentage_off: Some(20.0), ..Default::default() },
                ),
                rule(
                    RuleWhen { min_qty: Some(2.0), ..Default::default() },
                    RuleApply { percentage_off: Some(10.0), ..Default::default() },
                ),
            ],
            ..Default::default()
        };
        // 4 units total → only the threshold-3 and threshold-2 tiers qualify;
        // first-match picks the threshold-3 (percentage 20) tier.
        let lines = vec![line("l1", "A", "p1", 4, 25.0)];
        let d = decide(&cfg, 100.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(20.0));

        // 6 units total → the highest tier (fixed-price) qualifies first.
        let lines6 = vec![line("l1", "A", "p1", 6, 25.0)];
        let d6 = decide(&cfg, 150.0, &lines6).unwrap();
        match d6.value {
            CandidateValue::FixedAmount(_) => {}
            other => panic!("expected fixed-price reduction, got {:?}", other),
        }
    }

    // ── BXGY ─────────────────────────────────────────────────────────────────

    #[test]
    fn bxgy_show_as_free_defaults_to_100_percent() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(1.0),
                        buy_product_ids: vec!["p1".to_string()],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["p2".to_string()],
                        reward: Some(RuleReward {
                            percentage_off: Some(100.0),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0), // buy arm
            line("l2", "B", "p2", 1, 40.0), // get arm
        ];
        let d = decide(&cfg, 90.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(100.0));
        assert_eq!(d.target_line_ids, vec!["l2"]);
        // Buy arm attached as prerequisite so the reward only holds with the buy.
        assert_eq!(d.prerequisite_line_ids, vec![("l1".to_string(), 1)]);
    }

    #[test]
    fn bxgy_no_op_without_buy_arm() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(2.0),
                        buy_product_ids: vec!["p1".to_string()],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["p2".to_string()],
                        reward: None,
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        // Only one buy-arm unit present, buyQty is 2 → no discount.
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "B", "p2", 1, 40.0),
        ];
        assert_eq!(decide(&cfg, 90.0, &lines), None);
    }

    #[test]
    fn bxgy_default_reward_is_free() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen::default(),
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(1.0),
                        buy_product_ids: vec!["p1".to_string()],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["p2".to_string()],
                        reward: None, // no reward → free (showAsFree default)
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "B", "p2", 1, 40.0),
        ];
        let d = decide(&cfg, 90.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(100.0));
    }

    // ── free-gift → BXGY 100%-off with an empty buy arm (gate-qualified) ──────

    #[test]
    fn free_gift_empty_buy_arm_frees_gift_line_when_gate_met() {
        // gift model lowers to: when.min_subtotal (threshold) + buyXGetY with an
        // empty buy arm and a 100%-off reward on the gift product.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    min_subtotal: Some(75.0),
                    ..Default::default()
                },
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(0.0),
                        buy_product_ids: vec![], // empty buy arm = gate-qualified gift
                        get_qty: Some(1.0),
                        get_product_ids: vec!["pGift".to_string()],
                        reward: Some(RuleReward {
                            percentage_off: Some(100.0),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        // Cart holds the gift line and meets the subtotal threshold.
        let lines = vec![
            line("l1", "A", "p1", 1, 50.0),
            line("l2", "G", "pGift", 1, 30.0),
        ];
        let d = decide(&cfg, 80.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(100.0));
        // Only the gift line is targeted.
        assert_eq!(d.target_line_ids, vec!["l2"]);
        // No buy arm ⇒ no prerequisites attached.
        assert!(d.prerequisite_line_ids.is_empty());
    }

    #[test]
    fn free_gift_no_op_when_threshold_not_met() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    min_subtotal: Some(75.0),
                    ..Default::default()
                },
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(0.0),
                        buy_product_ids: vec![],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["pGift".to_string()],
                        reward: Some(RuleReward {
                            percentage_off: Some(100.0),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        // Subtotal below threshold → rule gate skips before BXGY runs.
        let lines = vec![line("l2", "G", "pGift", 1, 30.0)];
        assert_eq!(decide(&cfg, 30.0, &lines), None);
    }

    #[test]
    fn free_gift_no_op_when_gift_line_absent() {
        // Gate met but the gift line is not in the cart → nothing to free (auto-add
        // is a storefront concern, not this Function's job).
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    min_subtotal: Some(75.0),
                    ..Default::default()
                },
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(0.0),
                        buy_product_ids: vec![],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["pGift".to_string()],
                        reward: Some(RuleReward {
                            percentage_off: Some(100.0),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "A", "p1", 1, 100.0)];
        assert_eq!(decide(&cfg, 100.0, &lines), None);
    }

    #[test]
    fn free_gift_selectable_frees_whichever_candidate_is_present() {
        // selectable gift lowers all candidate ids into the get arm; whichever the
        // shopper adds is freed.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    min_qty: Some(2.0),
                    ..Default::default()
                },
                RuleApply {
                    buy_x_get_y: Some(BuyXGetY {
                        buy_qty: Some(0.0),
                        buy_product_ids: vec![],
                        get_qty: Some(1.0),
                        get_product_ids: vec!["pG1".to_string(), "pG2".to_string()],
                        reward: Some(RuleReward {
                            percentage_off: Some(100.0),
                            ..Default::default()
                        }),
                    }),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "A", "p1", 2, 25.0),
            line("l2", "G2", "pG2", 1, 40.0), // shopper chose the 2nd gift
        ];
        let d = decide(&cfg, 90.0, &lines).unwrap();
        assert_eq!(d.value, CandidateValue::Percentage(100.0));
        assert_eq!(d.target_line_ids, vec!["l2"]);
    }

    // ── Honest gaps: kinds we do NOT enforce fall through to no-op ────────────

    #[test]
    fn prerequisite_product_gate_enforced() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen {
                    prerequisite_product_ids: vec!["pX".to_string()],
                    ..Default::default()
                },
                RuleApply {
                    percentage_off: Some(20.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        // Prerequisite product not in cart → skip.
        let without = vec![line("l1", "A", "p1", 1, 50.0)];
        assert_eq!(decide(&cfg, 50.0, &without), None);
        // Prerequisite product present → applies.
        let with = vec![line("l1", "A", "pX", 1, 50.0)];
        assert!(decide(&cfg, 50.0, &with).is_some());
    }

    #[test]
    fn empty_rules_is_no_op() {
        let cfg = Configuration::default();
        let lines = vec![line("l1", "A", "p1", 1, 50.0)];
        assert_eq!(decide(&cfg, 50.0, &lines), None);
    }

    // ── fixedPricePerUnit (Basic-plan bundle pricing fallback) ───────────────

    #[test]
    fn fixed_price_per_unit_reduces_line_to_target() {
        // Merged bundle line: qty 1, subtotal 30.00, target 27.00 → 3.00 off.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(27.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![
            line("l1", "BUNDLE-CANDLE", "pB", 1, 30.0),
            line("l2", "OTHER", "pO", 1, 10.0),
        ];
        let d = decide(&cfg, 40.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 3.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
        assert_eq!(d.target_line_ids, vec!["l1"]);
    }

    #[test]
    fn fixed_price_per_unit_scales_with_quantity() {
        // qty 2 of the bundle parent: subtotal 60, target 27×2=54 → 6.00 off.
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(27.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "BUNDLE-CANDLE", "pB", 2, 30.0)];
        let d = decide(&cfg, 60.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 6.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
    }

    #[test]
    fn fixed_price_per_unit_no_op_when_already_at_or_below_target() {
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["BUNDLE-CANDLE".to_string()], ..Default::default() },
                RuleApply { fixed_price_per_unit: Some(35.0), ..Default::default() },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "BUNDLE-CANDLE", "pB", 1, 30.0)];
        assert_eq!(decide(&cfg, 30.0, &lines), None);
    }

    #[test]
    fn fixed_price_per_unit_takes_precedence_within_rule() {
        // A rule carrying both keys uses fixedPricePerUnit (splitter emits one key,
        // but precedence must be deterministic).
        let cfg = Configuration {
            rules: vec![rule(
                RuleWhen { sku_in: vec!["B".to_string()], ..Default::default() },
                RuleApply {
                    fixed_price_per_unit: Some(27.0),
                    percentage_off: Some(50.0),
                    ..Default::default()
                },
            )],
            ..Default::default()
        };
        let lines = vec![line("l1", "B", "pB", 1, 30.0)];
        let d = decide(&cfg, 30.0, &lines).unwrap();
        match d.value {
            CandidateValue::FixedAmount(amt) => assert!((amt - 3.0).abs() < 1e-9),
            other => panic!("expected fixed amount, got {:?}", other),
        }
    }
}
