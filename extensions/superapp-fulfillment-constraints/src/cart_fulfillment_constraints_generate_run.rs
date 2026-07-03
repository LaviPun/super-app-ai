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
/// Scope note: the Fulfillment Constraints API exposes two enforceable
/// operations — "must fulfill from the same location"
/// (`deliverableLinesMustFulfillFromSameLocationAdd`) and "must fulfill from a
/// specific location set" (`deliverableLinesMustFulfillFromAdd`). This function
/// implements both, keyed by SKU-matched lines:
/// - `apply.groupWithTag` → same-location grouping (unchanged).
/// - `apply.mustFulfillFromLocationIds` (Build #14b) → the matched lines must
///   fulfill from one of the given location ids.
///
/// `apply.shipAlone` has no separate-shipment primitive in the API, and
/// `when.productTagIn` is inert because product-tag lookups (`hasTags`) require
/// static tag arguments in the input query, not runtime config values (the same
/// limitation the delivery/payment/validation crates document). Both remain
/// parsed-but-inert.
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
    /// Build #14b: the SKU-matched lines must fulfill from one of these location
    /// ids (`gid://shopify/Location/...`). Empty = no location constraint.
    #[shopify_function(default)]
    must_fulfill_from_location_ids: Vec<String>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────

/// One deliverable line reduced to the facts the rules need: its id and the SKU
/// of its variant (if any). Lets the grouping core be tested natively.
#[derive(Clone, Debug, PartialEq)]
pub struct LineFact {
    pub id: String,
    pub sku: Option<String>,
}

/// A resolved constraint to emit. `Some(location_ids)` → must-fulfill-from a
/// specific location set; `None` → must-fulfill-from the same location (keyed by
/// `group_key`, so rules sharing a key coalesce into one group).
#[derive(Clone, Debug, PartialEq)]
pub struct Constraint {
    pub line_ids: Vec<String>,
    pub location_ids: Option<Vec<String>>,
    /// The `apply.groupWithTag` of the producing rule (only meaningful for a
    /// same-location constraint, i.e. when `location_ids` is `None`).
    pub group_key: String,
}

/// Resolve the fulfillment constraints for a set of rules over the deliverable
/// lines. A rule contributes a constraint when it targets ≥1 SKU and either
/// carries a grouping key or a location set. Same-location constraints require
/// ≥2 lines to be meaningful; a location-set constraint is meaningful for even a
/// single line (it pins where that line ships from). Line ids are de-duplicated
/// and cart order preserved.
pub fn resolve_constraints(rules: &[FulfillmentRule], lines: &[LineFact]) -> Vec<Constraint> {
    let mut out: Vec<Constraint> = Vec::new();

    for rule in rules {
        if rule.when.sku_in.is_empty() {
            continue;
        }
        let has_group = !rule.apply.group_with_tag.is_empty();
        let has_location = !rule.apply.must_fulfill_from_location_ids.is_empty();
        if !has_group && !has_location {
            continue;
        }

        // Matched line ids for this rule, in cart order, de-duplicated.
        let mut matched: Vec<String> = Vec::new();
        for line in lines {
            let Some(sku) = line.sku.as_ref() else { continue };
            if rule.when.sku_in.iter().any(|t| t == sku) && !matched.contains(&line.id) {
                matched.push(line.id.clone());
            }
        }
        if matched.is_empty() {
            continue;
        }

        if has_location {
            // Location-set constraint: meaningful for one or more lines.
            out.push(Constraint {
                line_ids: matched.clone(),
                location_ids: Some(rule.apply.must_fulfill_from_location_ids.clone()),
                group_key: String::new(),
            });
        } else if has_group {
            // Same-location grouping is emitted per rule here; coalescing by
            // group key (and the ≥2-line minimum) happens in the handler so two
            // rules sharing a key land in the ONE same-location group.
            out.push(Constraint {
                line_ids: matched,
                location_ids: None,
                group_key: rule.apply.group_with_tag.clone(),
            });
        }
    }

    out
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

    let lines = gather_lines(&input);
    let constraints = resolve_constraints(&config.rules, &lines);

    // Location-set constraints emit one operation each. Same-location
    // constraints coalesce by group key (so two rules sharing a key land in the
    // ONE same-location group) and require ≥2 lines to be meaningful.
    let mut same_location: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut operations: Vec<schema::Operation> = Vec::new();

    for constraint in constraints.iter() {
        match &constraint.location_ids {
            Some(location_ids) => {
                operations.push(schema::Operation::DeliverableLinesMustFulfillFromAdd(
                    schema::DeliverableLinesMustFulfillFromAddOperation {
                        deliverable_line_ids: Some(constraint.line_ids.clone()),
                        location_ids: location_ids.clone(),
                    },
                ));
            }
            None => {
                let entry = same_location.entry(constraint.group_key.clone()).or_default();
                for id in &constraint.line_ids {
                    if !entry.contains(id) {
                        entry.push(id.clone());
                    }
                }
            }
        }
    }

    for (_key, line_ids) in same_location.into_iter() {
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

/// Reduce the input's deliverable lines to `LineFact`s for the pure core.
fn gather_lines(input: &schema::cart_fulfillment_constraints_generate_run::Input) -> Vec<LineFact> {
    use schema::cart_fulfillment_constraints_generate_run::input::cart::deliverable_lines::Merchandise;

    input
        .cart()
        .deliverable_lines()
        .iter()
        .map(|line| {
            let sku = match line.merchandise() {
                Merchandise::ProductVariant(variant) => variant.sku().cloned(),
                _ => None,
            };
            LineFact { id: line.id().clone(), sku }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(id: &str, sku: &str) -> LineFact {
        LineFact { id: id.into(), sku: Some(sku.into()) }
    }

    fn rule(skus: &[&str], group: &str, locations: &[&str]) -> FulfillmentRule {
        FulfillmentRule {
            when: RuleWhen {
                product_tag_in: vec![],
                sku_in: skus.iter().map(|s| s.to_string()).collect(),
            },
            apply: RuleApply {
                ship_alone: false,
                group_with_tag: group.to_string(),
                must_fulfill_from_location_ids: locations.iter().map(|s| s.to_string()).collect(),
            },
        }
    }

    #[test]
    fn same_location_constraint_carries_group_key() {
        let lines = vec![line("l1", "A"), line("l2", "A")];
        let rules = vec![rule(&["A"], "warehouse", &[])];
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].location_ids, None);
        assert_eq!(out[0].group_key, "warehouse");
        assert_eq!(out[0].line_ids, vec!["l1", "l2"]);
    }

    #[test]
    fn same_location_single_line_still_emitted_by_core() {
        // The ≥2-line minimum for same-location grouping is enforced in the
        // handler (after group-key coalescing), NOT the core. The core emits the
        // matched-line constraint; a lone line is filtered downstream.
        let lines = vec![line("l1", "A"), line("l2", "B")];
        let rules = vec![rule(&["A"], "warehouse", &[])]; // only l1 matches
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].line_ids, vec!["l1"]);
        assert_eq!(out[0].location_ids, None);
    }

    #[test]
    fn must_fulfill_from_location_single_line_ok() {
        let lines = vec![line("l1", "A"), line("l2", "B")];
        let rules = vec![rule(&["A"], "", &["gid://shopify/Location/1"])];
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].line_ids, vec!["l1"]);
        assert_eq!(
            out[0].location_ids,
            Some(vec!["gid://shopify/Location/1".to_string()])
        );
    }

    #[test]
    fn must_fulfill_from_location_multiple_locations() {
        let lines = vec![line("l1", "A"), line("l2", "A")];
        let rules = vec![rule(
            &["A"],
            "",
            &["gid://shopify/Location/1", "gid://shopify/Location/2"],
        )];
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].line_ids, vec!["l1", "l2"]);
        assert_eq!(out[0].location_ids.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn location_takes_precedence_over_group_when_both_set() {
        // A rule that carries BOTH a group key and a location set emits the
        // location-set constraint (the stronger, single-rule constraint).
        let lines = vec![line("l1", "A"), line("l2", "A")];
        let rules = vec![rule(&["A"], "warehouse", &["gid://shopify/Location/1"])];
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out.len(), 1);
        assert!(out[0].location_ids.is_some());
    }

    #[test]
    fn no_sku_or_no_action_contributes_nothing() {
        let lines = vec![line("l1", "A")];
        // No sku_in.
        let r1 = rule(&[], "warehouse", &[]);
        assert!(resolve_constraints(&[r1], &lines).is_empty());
        // No action.
        let r2 = rule(&["A"], "", &[]);
        assert!(resolve_constraints(&[r2], &lines).is_empty());
    }

    #[test]
    fn duplicate_line_ids_are_deduped() {
        let lines = vec![line("l1", "A"), line("l1", "A")]; // same id twice
        let rules = vec![rule(&["A"], "", &["gid://shopify/Location/1"])];
        let out = resolve_constraints(&rules, &lines);
        assert_eq!(out[0].line_ids, vec!["l1"]);
    }
}
