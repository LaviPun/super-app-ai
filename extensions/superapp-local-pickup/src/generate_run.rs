use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Local-pickup delivery-option configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-localPickupDeliveryOption`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same app-served metaobject pattern every
/// other SuperApp Function uses. Produced by the `functions.localPickupDeliveryOption`
/// compiler (`compiler/functions.localPickupDeliveryOption.ts`).
///
/// This Function GENERATES local-pickup ("buy online, pick up in store" / BOPIS) delivery
/// options at checkout: for each configured location it adds a pickup option with an
/// optional custom cost, title, and pickup instruction. Unknown/absent keys default.
///
/// # API-version note (honest)
/// The Local Pickup Delivery Option Generator API is currently only available on the
/// `unstable` API version (verified via the Shopify dev MCP: the API is NOT present in
/// `2026-04`, the version every other SuperApp crate pins). This crate therefore pins
/// `api_version = "unstable"` and the `functions.localPickupDeliveryOption` module type is
/// classified `needs_runtime` in the eligibility registry — it flips deployable when
/// Shopify promotes this API to a stable version the app adopts AND the handle is added to
/// the deployed-function manifest.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    /// Locations to offer local pickup at. Empty = offer at NO location (safe no-op).
    #[shopify_function(default)]
    locations: Vec<LocationOption>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct LocationOption {
    /// The Shopify location GID this pickup option is for.
    #[shopify_function(default)]
    location_id: String,
    /// Optional pickup cost (major currency units). Absent/None = free (Decimal defaults to 0).
    #[shopify_function(default)]
    cost: Option<f64>,
    /// Optional option title (defaults to the location name at render time).
    #[shopify_function(default)]
    title: Option<String>,
    /// Optional pickup instruction shown to the customer at checkout.
    #[shopify_function(default)]
    pickup_instruction: Option<String>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────
//
// The Shopify input types cannot be constructed in a unit test, so the option-generation
// logic lives in these pure functions over a normalized view. The `#[shopify_function]`
// entry point below only normalizes the input into these plain values and maps the returned
// options onto the Function output operations.

/// A normalized store location (handle + name), the minimum the decision core needs to
/// resolve a configured `locationId` to the opaque Function location handle.
#[derive(Debug, Clone, PartialEq)]
pub struct Location {
    pub handle: String,
    pub name: String,
}

/// A resolved local-pickup option to add for one location.
#[derive(Debug, Clone, PartialEq)]
pub struct PickupOption {
    pub location_handle: String,
    /// Pickup cost; None ⇒ free/default.
    pub cost: Option<f64>,
    pub title: Option<String>,
    pub pickup_instruction: Option<String>,
}

/// Whether a location GID (e.g. `gid://shopify/Location/123`) refers to the same location
/// as an opaque Function location handle (matched by trailing numeric id, or exact equality).
fn gid_matches_handle(gid: &str, handle: &str) -> bool {
    let gid_id = gid.rsplit('/').next().unwrap_or(gid);
    !gid_id.is_empty() && (gid_id == handle || handle.ends_with(gid_id))
}

/// The decision core: given the parsed config and the store's locations, return one
/// `PickupOption` per configured location that resolves to a known store location. A
/// configured `locationId` that matches no store location is skipped (never fabricated).
/// A negative cost is clamped to 0. Returns empty for a no-op (no config, or no matches).
pub fn decide(config: &Configuration, locations: &[Location]) -> Vec<PickupOption> {
    if config.locations.is_empty() {
        return vec![];
    }
    let mut out: Vec<PickupOption> = Vec::new();
    for opt in config.locations.iter() {
        if opt.location_id.is_empty() {
            continue;
        }
        let Some(loc) = locations.iter().find(|l| gid_matches_handle(&opt.location_id, &l.handle)) else {
            continue;
        };
        let cost = opt.cost.map(|c| if c < 0.0 { 0.0 } else { c });
        // A blank/whitespace-only title falls back to the location name.
        let title = match &opt.title {
            Some(t) if !t.trim().is_empty() => Some(t.clone()),
            _ => Some(loc.name.clone()),
        };
        let pickup_instruction = opt
            .pickup_instruction
            .as_ref()
            .filter(|s| !s.trim().is_empty())
            .cloned();
        out.push(PickupOption {
            location_handle: loc.handle.clone(),
            cost,
            title,
            pickup_instruction,
        });
    }
    out
}

#[shopify_function]
fn generate_run(
    input: schema::generate_run::Input,
) -> Result<schema::FunctionRunResult> {
    let no_changes = schema::FunctionRunResult { operations: vec![] };

    // No published config → generate no pickup options (safe no-op).
    let config: &Configuration = match input
        .shop()
        .metaobject()
        .and_then(|mo| mo.field())
        .and_then(|field| field.json_value())
    {
        Some(config) => config,
        None => return Ok(no_changes),
    };
    if config.locations.is_empty() {
        return Ok(no_changes);
    }

    let locations: Vec<Location> = input
        .locations()
        .iter()
        .map(|l| Location { handle: l.handle().clone(), name: l.name().clone() })
        .collect();

    let decisions = decide(config, &locations);
    if decisions.is_empty() {
        return Ok(no_changes);
    }

    let operations: Vec<schema::Operation> = decisions
        .iter()
        .map(|d| schema::Operation {
            add: schema::LocalPickupDeliveryOption {
                cost: d.cost.map(Decimal),
                metafields: None,
                pickup_location: schema::PickupLocation {
                    location_handle: d.location_handle.clone(),
                    pickup_instruction: d.pickup_instruction.clone(),
                },
                title: d.title.clone(),
            },
        })
        .collect();

    Ok(schema::FunctionRunResult { operations })
}

// ─── Native unit tests (the local-pickup decision core) ──────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn loc(handle: &str, name: &str) -> Location {
        Location { handle: handle.to_string(), name: name.to_string() }
    }

    fn opt(location_id: &str, cost: Option<f64>, title: Option<&str>, instr: Option<&str>) -> LocationOption {
        LocationOption {
            location_id: location_id.to_string(),
            cost,
            title: title.map(|s| s.to_string()),
            pickup_instruction: instr.map(|s| s.to_string()),
        }
    }

    #[test]
    fn no_config_is_no_op() {
        let cfg = Configuration { locations: vec![] };
        assert!(decide(&cfg, &[loc("10", "Main St")]).is_empty());
    }

    #[test]
    fn generates_option_for_configured_location() {
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/10", Some(5.0), Some("Store Pickup"), Some("Bring ID"))],
        };
        let out = decide(&cfg, &[loc("10", "Main St"), loc("20", "Warehouse")]);
        assert_eq!(
            out,
            vec![PickupOption {
                location_handle: "10".into(),
                cost: Some(5.0),
                title: Some("Store Pickup".into()),
                pickup_instruction: Some("Bring ID".into()),
            }]
        );
    }

    #[test]
    fn title_defaults_to_location_name_when_blank_or_absent() {
        let cfg = Configuration {
            locations: vec![
                opt("gid://shopify/Location/10", None, None, None),
                opt("gid://shopify/Location/20", None, Some("   "), None),
            ],
        };
        let out = decide(&cfg, &[loc("10", "Main St"), loc("20", "Warehouse")]);
        assert_eq!(out[0].title, Some("Main St".into()));
        assert_eq!(out[1].title, Some("Warehouse".into()));
    }

    #[test]
    fn unknown_location_is_skipped_not_fabricated() {
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/999", Some(0.0), None, None)],
        };
        assert!(decide(&cfg, &[loc("10", "Main St")]).is_empty());
    }

    #[test]
    fn empty_location_id_is_skipped() {
        let cfg = Configuration { locations: vec![opt("", None, None, None)] };
        assert!(decide(&cfg, &[loc("10", "Main St")]).is_empty());
    }

    #[test]
    fn negative_cost_is_clamped_to_zero() {
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/10", Some(-3.0), None, None)],
        };
        let out = decide(&cfg, &[loc("10", "Main St")]);
        assert_eq!(out[0].cost, Some(0.0));
    }

    #[test]
    fn free_pickup_when_cost_absent() {
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/10", None, None, None)],
        };
        let out = decide(&cfg, &[loc("10", "Main St")]);
        assert_eq!(out[0].cost, None);
    }

    #[test]
    fn multiple_locations_each_generate_an_option() {
        let cfg = Configuration {
            locations: vec![
                opt("gid://shopify/Location/10", Some(0.0), None, None),
                opt("gid://shopify/Location/20", Some(2.5), Some("Depot"), None),
            ],
        };
        let out = decide(&cfg, &[loc("10", "Main St"), loc("20", "Warehouse"), loc("30", "Unused")]);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].location_handle, "10");
        assert_eq!(out[1].location_handle, "20");
        assert_eq!(out[1].title, Some("Depot".into()));
    }

    #[test]
    fn gid_matches_by_numeric_suffix() {
        // Location handles are sometimes hashed and end with the numeric id.
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/123", None, None, None)],
        };
        let out = decide(&cfg, &[loc("hash-123", "Hashed")]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].location_handle, "hash-123");
    }

    #[test]
    fn blank_instruction_is_dropped() {
        let cfg = Configuration {
            locations: vec![opt("gid://shopify/Location/10", None, None, Some("   "))],
        };
        let out = decide(&cfg, &[loc("10", "Main St")]);
        assert_eq!(out[0].pickup_instruction, None);
    }
}
