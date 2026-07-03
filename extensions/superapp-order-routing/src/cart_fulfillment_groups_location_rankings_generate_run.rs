use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Order-routing location-rule configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-orderRoutingLocationRule`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same app-served metaobject pattern every
/// other SuperApp Function uses. Produced by the `functions.orderRoutingLocationRule`
/// compiler (`compiler/functions.orderRoutingLocationRule.ts`), which emits
/// `FUNCTION_CONFIG_UPSERT` with exactly this shape (`{ rules: [{ when, apply }] }`).
///
/// This crate is the runtime the compiler's config previously had NO consumer for: the
/// Shopify Order Routing Location Rule API
/// (`cart.fulfillment-groups.location-rankings.generate.run`) ranks the inventory
/// locations for each fulfillment group; Shopify fulfills from the highest-ranked
/// location. Without this crate the emitted `orderRoutingLocationRule` config was
/// honest-but-inert (registry `needs_runtime`). With it, the config is ACTUALLY enforced.
///
/// Optional keys are omitted from the stored JSON, so every field defaults when missing.
/// Unknown keys are ignored (serde drops them), which keeps the config additive.
///
/// # Honest gaps (deliberately NOT enforced at runtime)
/// - `when.inventoryLocationIds` are Shopify **location GIDs** as authored in the app,
///   while the Function input exposes opaque location **handles** (`inventoryLocationHandles`).
///   A rule can also be gated by destination `countryCode`, which IS evaluated. When a
///   rule specifies `preferLocationId`, the preferred location is matched against the
///   group's location handles by suffix (the numeric id inside the GID), so an explicit
///   preference still ranks its target above the rest. A rule that matches no handle in a
///   group is a no-op for that group (never a silent global reorder).
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    #[shopify_function(default)]
    rules: Vec<RoutingRule>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RoutingRule {
    #[shopify_function(default)]
    when: RuleWhen,
    #[shopify_function(default)]
    apply: RuleApply,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleWhen {
    /// Location GIDs the rule is scoped to (advisory; matched by numeric-id suffix).
    #[shopify_function(default)]
    inventory_location_ids: Vec<String>,
    /// Destination country code the rule applies to (absent = any country).
    #[shopify_function(default)]
    country_code: Option<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct RuleApply {
    /// The location GID to prefer (rank it above unpreferred locations in the group).
    #[shopify_function(default)]
    prefer_location_id: Option<String>,
    /// Priority weight added to a preferred location's rank (higher = fulfilled first).
    /// Absent defaults to 1 so a bare `preferLocationId` still lifts its target.
    #[shopify_function(default)]
    priority: Option<i64>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────
//
// The Shopify input types cannot be constructed in a unit test, so the ranking logic
// lives in these pure functions over a normalized view. The `#[shopify_function]` entry
// point below only normalizes the input into these plain values and maps the returned
// rankings onto the Function output operation.

/// A normalized fulfillment group — the minimum the decision core needs.
#[derive(Debug, Clone, PartialEq)]
pub struct Group {
    pub handle: String,
    /// Inventory location handles that can fulfill this group.
    pub location_handles: Vec<String>,
    /// Destination country code (from the group's delivery address), if known.
    pub country_code: Option<String>,
}

/// A resolved ranking for one location within a group.
#[derive(Debug, Clone, PartialEq)]
pub struct Ranking {
    pub location_handle: String,
    pub rank: i64,
}

/// A resolved set of rankings for one fulfillment group.
#[derive(Debug, Clone, PartialEq)]
pub struct GroupRankings {
    pub group_handle: String,
    pub rankings: Vec<Ranking>,
}

/// Whether a location GID (e.g. `gid://shopify/Location/123`) refers to the same location
/// as an opaque Function location handle. The input exposes handles, the config carries
/// GIDs; we match by the trailing numeric id, which is the location's stable identifier in
/// both representations. Exact-equality is also accepted (handles that ARE the numeric id).
fn gid_matches_handle(gid: &str, handle: &str) -> bool {
    let gid_id = gid.rsplit('/').next().unwrap_or(gid);
    !gid_id.is_empty() && (gid_id == handle || handle.ends_with(gid_id))
}

/// Does this rule's `when` gate hold for the group's destination country?
/// A rule with no `countryCode` applies to any destination. A rule gated on a country only
/// applies when the group's destination country matches (case-insensitive).
fn rule_country_matches(rule: &RoutingRule, group_country: Option<&String>) -> bool {
    match &rule.when.country_code {
        None => true,
        Some(code) => match group_country {
            Some(country) => code.eq_ignore_ascii_case(country),
            None => false,
        },
    }
}

/// The priority weight a rule confers on its preferred location (defaults to 1 so a bare
/// `preferLocationId` still lifts its target). Non-positive priorities are treated as 0
/// (no lift), never negative — a rule never actively deprioritizes below the baseline.
fn rule_priority(rule: &RuleApply) -> i64 {
    match rule.priority {
        Some(p) if p > 0 => p,
        Some(_) => 0,
        None => 1,
    }
}

/// The decision core: given the parsed config and the normalized groups, return one
/// `GroupRankings` per group whose locations are lifted by at least one qualifying rule.
/// Every location in the group is emitted (baseline rank 0); a location preferred by a
/// qualifying rule gets the summed priority of the rules preferring it. Groups with no
/// applicable preference are omitted (Shopify keeps its default ranking → safe no-op).
pub fn decide(config: &Configuration, groups: &[Group]) -> Vec<GroupRankings> {
    if config.rules.is_empty() {
        return vec![];
    }
    let mut out: Vec<GroupRankings> = Vec::new();
    for group in groups.iter() {
        let mut ranked = false;
        let rankings: Vec<Ranking> = group
            .location_handles
            .iter()
            .map(|handle| {
                let mut rank: i64 = 0;
                for rule in config.rules.iter() {
                    if !rule_country_matches(rule, group.country_code.as_ref()) {
                        continue;
                    }
                    // Rule scope: if `inventoryLocationIds` is set, the rule only lifts a
                    // handle that is one of those locations. `preferLocationId` names the
                    // specific location to lift.
                    let scoped_ok = rule.when.inventory_location_ids.is_empty()
                        || rule
                            .when
                            .inventory_location_ids
                            .iter()
                            .any(|gid| gid_matches_handle(gid, handle));
                    if !scoped_ok {
                        continue;
                    }
                    let is_preferred = match &rule.apply.prefer_location_id {
                        Some(pref) => gid_matches_handle(pref, handle),
                        // No explicit preference: a scoped rule lifts every in-scope handle.
                        None => !rule.when.inventory_location_ids.is_empty(),
                    };
                    if is_preferred {
                        rank += rule_priority(&rule.apply);
                        ranked = true;
                    }
                }
                Ranking { location_handle: handle.clone(), rank }
            })
            .collect();
        if ranked && !rankings.is_empty() {
            out.push(GroupRankings { group_handle: group.handle.clone(), rankings });
        }
    }
    out
}

#[shopify_function]
fn cart_fulfillment_groups_location_rankings_generate_run(
    input: schema::cart_fulfillment_groups_location_rankings_generate_run::Input,
) -> Result<schema::CartFulfillmentGroupsLocationRankingsGenerateRunResult> {
    let no_changes =
        schema::CartFulfillmentGroupsLocationRankingsGenerateRunResult { operations: vec![] };

    // No published config → no operations (safe no-op; Shopify keeps its default routing).
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

    // The destination country is shared across the cart's delivery groups; use the first
    // known one (order routing is evaluated per cart, and a cart has a single destination).
    let country_code: Option<String> = input
        .cart()
        .delivery_groups()
        .iter()
        .find_map(|group| {
            group
                .delivery_address()
                .and_then(|address| address.country_code())
                .map(|code| format!("{:?}", code))
        });

    let groups: Vec<Group> = input
        .fulfillment_groups()
        .iter()
        .map(|group| Group {
            handle: group.handle().clone(),
            location_handles: group.inventory_location_handles().to_vec(),
            country_code: country_code.clone(),
        })
        .collect();

    let decisions = decide(config, &groups);
    if decisions.is_empty() {
        return Ok(no_changes);
    }

    let operations: Vec<schema::Operation> = decisions
        .iter()
        .map(|group| schema::Operation::FulfillmentGroupLocationRankingAdd(
            schema::FulfillmentGroupLocationRankingAddOperation {
                fulfillment_group_handle: group.group_handle.clone(),
                rankings: group
                    .rankings
                    .iter()
                    .map(|r| schema::RankedLocation {
                        location_handle: r.location_handle.clone(),
                        rank: r.rank as i32,
                    })
                    .collect(),
            },
        ))
        .collect();

    Ok(schema::CartFulfillmentGroupsLocationRankingsGenerateRunResult { operations })
}

// ─── Native unit tests (the order-routing decision core) ─────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn group(handle: &str, locations: &[&str], country: Option<&str>) -> Group {
        Group {
            handle: handle.to_string(),
            location_handles: locations.iter().map(|s| s.to_string()).collect(),
            country_code: country.map(|c| c.to_string()),
        }
    }

    fn prefer_rule(location_gid: &str, priority: Option<i64>) -> RoutingRule {
        RoutingRule {
            when: RuleWhen::default(),
            apply: RuleApply { prefer_location_id: Some(location_gid.to_string()), priority },
        }
    }

    #[test]
    fn no_rules_is_no_op() {
        let cfg = Configuration { rules: vec![] };
        assert!(decide(&cfg, &[group("g1", &["10", "20"], None)]).is_empty());
    }

    #[test]
    fn prefer_location_lifts_its_rank_others_stay_baseline() {
        // Prefer location 20 (given as a GID) → it outranks location 10.
        let cfg = Configuration {
            rules: vec![prefer_rule("gid://shopify/Location/20", None)],
        };
        let out = decide(&cfg, &[group("g1", &["10", "20"], None)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].group_handle, "g1");
        assert_eq!(
            out[0].rankings,
            vec![
                Ranking { location_handle: "10".into(), rank: 0 },
                Ranking { location_handle: "20".into(), rank: 1 },
            ]
        );
    }

    #[test]
    fn priority_weight_is_applied() {
        let cfg = Configuration {
            rules: vec![prefer_rule("gid://shopify/Location/20", Some(5))],
        };
        let out = decide(&cfg, &[group("g1", &["10", "20"], None)]);
        assert_eq!(out[0].rankings[1], Ranking { location_handle: "20".into(), rank: 5 });
    }

    #[test]
    fn gid_matches_by_numeric_suffix_and_exact() {
        assert!(gid_matches_handle("gid://shopify/Location/123", "123"));
        // Handles are sometimes hashed and end with the numeric id.
        assert!(gid_matches_handle("gid://shopify/Location/123", "abc-123"));
        assert!(!gid_matches_handle("gid://shopify/Location/123", "1234"));
        assert!(gid_matches_handle("123", "123"));
    }

    #[test]
    fn country_gate_only_ranks_matching_destination() {
        let cfg = Configuration {
            rules: vec![RoutingRule {
                when: RuleWhen { inventory_location_ids: vec![], country_code: Some("US".into()) },
                apply: RuleApply { prefer_location_id: Some("gid://shopify/Location/20".into()), priority: None },
            }],
        };
        // US destination → ranked.
        let us = decide(&cfg, &[group("g1", &["10", "20"], Some("US"))]);
        assert_eq!(us.len(), 1);
        assert_eq!(us[0].rankings[1].rank, 1);
        // CA destination → the rule does not apply → no operation for the group.
        let ca = decide(&cfg, &[group("g1", &["10", "20"], Some("CA"))]);
        assert!(ca.is_empty());
        // Case-insensitive.
        let us_lower = decide(&cfg, &[group("g1", &["10", "20"], Some("us"))]);
        assert_eq!(us_lower.len(), 1);
    }

    #[test]
    fn country_gated_rule_skips_unknown_destination() {
        let cfg = Configuration {
            rules: vec![RoutingRule {
                when: RuleWhen { inventory_location_ids: vec![], country_code: Some("US".into()) },
                apply: RuleApply { prefer_location_id: Some("gid://shopify/Location/20".into()), priority: None },
            }],
        };
        assert!(decide(&cfg, &[group("g1", &["10", "20"], None)]).is_empty());
    }

    #[test]
    fn inventory_location_scope_lifts_every_in_scope_handle_when_no_explicit_preference() {
        // A rule scoped to a set of locations, with no `preferLocationId`, lifts each
        // in-scope handle.
        let cfg = Configuration {
            rules: vec![RoutingRule {
                when: RuleWhen {
                    inventory_location_ids: vec!["gid://shopify/Location/20".into(), "gid://shopify/Location/30".into()],
                    country_code: None,
                },
                apply: RuleApply { prefer_location_id: None, priority: Some(2) },
            }],
        };
        let out = decide(&cfg, &[group("g1", &["10", "20", "30"], None)]);
        assert_eq!(
            out[0].rankings,
            vec![
                Ranking { location_handle: "10".into(), rank: 0 },
                Ranking { location_handle: "20".into(), rank: 2 },
                Ranking { location_handle: "30".into(), rank: 2 },
            ]
        );
    }

    #[test]
    fn rule_matching_no_handle_in_group_is_no_op_for_that_group() {
        // Prefer a location the group can't fulfill from → no lift → group omitted.
        let cfg = Configuration {
            rules: vec![prefer_rule("gid://shopify/Location/999", None)],
        };
        assert!(decide(&cfg, &[group("g1", &["10", "20"], None)]).is_empty());
    }

    #[test]
    fn multiple_rules_sum_priority_on_the_same_location() {
        let cfg = Configuration {
            rules: vec![
                prefer_rule("gid://shopify/Location/20", Some(2)),
                prefer_rule("gid://shopify/Location/20", Some(3)),
            ],
        };
        let out = decide(&cfg, &[group("g1", &["10", "20"], None)]);
        assert_eq!(out[0].rankings[1], Ranking { location_handle: "20".into(), rank: 5 });
    }

    #[test]
    fn each_group_ranked_independently() {
        let cfg = Configuration {
            rules: vec![prefer_rule("gid://shopify/Location/20", None)],
        };
        let out = decide(
            &cfg,
            &[
                group("g1", &["10", "20"], None),
                group("g2", &["20", "30"], None),
                group("g3", &["40", "50"], None), // no preferred handle → omitted
            ],
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].group_handle, "g1");
        assert_eq!(out[1].group_handle, "g2");
    }

    #[test]
    fn non_positive_priority_confers_no_lift() {
        let cfg = Configuration {
            rules: vec![prefer_rule("gid://shopify/Location/20", Some(0))],
        };
        // priority 0 → rank stays 0 for the preferred handle, but it was still "ranked",
        // so the group is emitted with an explicit (all-zero) ranking. This is intentional:
        // an explicit rule ran; it just conferred no lift.
        let out = decide(&cfg, &[group("g1", &["10", "20"], None)]);
        assert_eq!(out.len(), 1);
        assert!(out[0].rankings.iter().all(|r| r.rank == 0));
    }
}
