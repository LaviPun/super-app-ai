use super::schema;
use shopify_function::prelude::*;
use shopify_function::Result;

/// Pickup-point delivery-option configuration, published as the
/// `$app:superapp_function_config` metaobject (handle
/// `superapp-fn-pickupPointDeliveryOption`, field `config_json`) by
/// `PublishService.writeFunctionConfig` — the same app-served metaobject pattern every
/// other SuperApp Function uses. Produced by the `functions.pickupPointDeliveryOption`
/// compiler (`compiler/functions.pickupPointDeliveryOption.ts`).
///
/// This Function GENERATES third-party pickup-point delivery options at checkout (parcel
/// lockers, post offices, convenience stores). Each configured point carries its full
/// third-party identity — external id, provider, name, and address — because the option
/// represents a real physical drop-off the carrier operates. Points can be gated by the
/// destination country so only in-country points are offered.
///
/// # API-version note (honest)
/// The Pickup Point Delivery Option Generator API is currently only available on the
/// `unstable` API version (verified via the Shopify dev MCP: the API is NOT present in
/// `2026-04`, the version every other SuperApp crate pins). This crate therefore pins
/// `api_version = "unstable"` and the `functions.pickupPointDeliveryOption` module type is
/// classified `needs_runtime` in the eligibility registry — it flips deployable when
/// Shopify promotes this API to a stable version the app adopts AND the handle is added to
/// the deployed-function manifest.
#[derive(Deserialize, Default, PartialEq)]
pub struct Configuration {
    /// Third-party pickup points to offer. Empty = offer none (safe no-op).
    #[shopify_function(default)]
    points: Vec<PointConfig>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct PointConfig {
    /// The third-party service's unique id for the point (required by the output type).
    #[shopify_function(default)]
    external_id: String,
    /// Display name of the point.
    #[shopify_function(default)]
    name: String,
    /// Optional cost (major currency units). Absent = use the location's default price.
    #[shopify_function(default)]
    cost: Option<f64>,
    /// Provider (carrier) that operates the point.
    #[shopify_function(default)]
    provider: ProviderConfig,
    /// The point's physical address.
    #[shopify_function(default)]
    address: AddressConfig,
    /// Destination country codes this point is offered to (empty = any country).
    #[shopify_function(default)]
    country_code_in: Vec<String>,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct ProviderConfig {
    #[shopify_function(default)]
    name: String,
    /// Provider logo URL (required by the output type).
    #[shopify_function(default)]
    logo_url: String,
}

#[derive(Deserialize, Default, PartialEq, Clone)]
#[shopify_function(rename_all = "camelCase")]
pub struct AddressConfig {
    #[shopify_function(default)]
    address1: String,
    #[shopify_function(default)]
    address2: Option<String>,
    #[shopify_function(default)]
    city: String,
    #[shopify_function(default)]
    country_code: String,
    #[shopify_function(default)]
    province: Option<String>,
    #[shopify_function(default)]
    province_code: Option<String>,
    #[shopify_function(default)]
    zip: Option<String>,
    #[shopify_function(default)]
    phone: Option<String>,
    #[shopify_function(default)]
    latitude: Option<f64>,
    #[shopify_function(default)]
    longitude: Option<f64>,
}

// ─── Pure decision core (unit-tested; no Shopify input types) ────────────────
//
// The Shopify input types cannot be constructed in a unit test, so the point-selection
// logic lives in this pure function over a normalized view. The `#[shopify_function]` entry
// point below only normalizes the input into these plain values and maps the returned
// points onto the Function output operations.

/// Does a configured point apply to the cart's destination country?
/// A point with no `countryCodeIn` applies anywhere; otherwise the destination must be in
/// the list (case-insensitive). A country-gated point with an unknown destination is skipped.
fn point_applies(point: &PointConfig, destination_country: Option<&String>) -> bool {
    if point.country_code_in.is_empty() {
        return true;
    }
    match destination_country {
        Some(country) => point
            .country_code_in
            .iter()
            .any(|code| code.eq_ignore_ascii_case(country)),
        None => false,
    }
}

/// A configured point is emittable only if it carries the identity the output type REQUIRES
/// (non-null in the schema): `externalId`, `name`, `provider.name`, `provider.logoUrl`, and
/// the address `address1`/`city`/`countryCode`/`latitude`/`longitude`. A point missing any
/// required field is skipped rather than emitted with placeholder values.
fn point_is_complete(point: &PointConfig) -> bool {
    !point.external_id.trim().is_empty()
        && !point.name.trim().is_empty()
        && !point.provider.name.trim().is_empty()
        && !point.provider.logo_url.trim().is_empty()
        && !point.address.address1.trim().is_empty()
        && !point.address.city.trim().is_empty()
        && !point.address.country_code.trim().is_empty()
        && point.address.latitude.is_some()
        && point.address.longitude.is_some()
}

/// The decision core: given the parsed config and the cart's destination country, return the
/// configured points that (a) apply to the destination and (b) carry every required output
/// field. Returns the filtered points in config order; empty for a no-op.
pub fn decide<'a>(config: &'a Configuration, destination_country: Option<&String>) -> Vec<&'a PointConfig> {
    if config.points.is_empty() {
        return vec![];
    }
    config
        .points
        .iter()
        .filter(|p| point_is_complete(p) && point_applies(p, destination_country))
        .collect()
}

#[shopify_function]
fn generate_run(
    input: schema::generate_run::Input,
) -> Result<schema::FunctionRunResult> {
    let no_changes = schema::FunctionRunResult { operations: vec![] };

    // No published config → generate no pickup points (safe no-op).
    let config: &Configuration = match input
        .shop()
        .metaobject()
        .and_then(|mo| mo.field())
        .and_then(|field| field.json_value())
    {
        Some(config) => config,
        None => return Ok(no_changes),
    };
    if config.points.is_empty() {
        return Ok(no_changes);
    }

    let destination_country: Option<String> = input
        .cart()
        .delivery_groups()
        .iter()
        .find_map(|group| {
            group
                .delivery_address()
                .and_then(|address| address.country_code())
                .map(|code| format!("{:?}", code))
        });

    let selected = decide(config, destination_country.as_ref());
    if selected.is_empty() {
        return Ok(no_changes);
    }

    let operations: Vec<schema::Operation> = selected
        .iter()
        .map(|p| schema::Operation {
            add: schema::PickupPointDeliveryOption {
                cost: p.cost.map(Decimal),
                metafields: None,
                pickup_point: schema::PickupPoint {
                    address: schema::PickupAddress {
                        address_1: p.address.address1.clone(),
                        address_2: p.address.address2.clone(),
                        city: p.address.city.clone(),
                        country: None,
                        country_code: p.address.country_code.to_uppercase(),
                        latitude: p.address.latitude.unwrap_or(0.0),
                        longitude: p.address.longitude.unwrap_or(0.0),
                        phone: p.address.phone.clone(),
                        province: p.address.province.clone(),
                        province_code: p.address.province_code.clone(),
                        zip: p.address.zip.clone(),
                    },
                    business_hours: None,
                    external_id: p.external_id.clone(),
                    name: p.name.clone(),
                    provider: schema::Provider {
                        logo_url: p.provider.logo_url.clone(),
                        name: p.provider.name.clone(),
                    },
                },
            },
        })
        .collect();

    Ok(schema::FunctionRunResult { operations })
}

// ─── Native unit tests (the pickup-point decision core) ──────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn complete_point(external_id: &str, countries: &[&str]) -> PointConfig {
        PointConfig {
            external_id: external_id.to_string(),
            name: "Locker A".to_string(),
            cost: Some(3.5),
            provider: ProviderConfig { name: "InPost".to_string(), logo_url: "https://cdn/logo.png".to_string() },
            address: AddressConfig {
                address1: "1 Main St".to_string(),
                address2: None,
                city: "Warsaw".to_string(),
                country_code: "PL".to_string(),
                province: None,
                province_code: None,
                zip: Some("00-001".to_string()),
                phone: None,
                latitude: Some(52.2),
                longitude: Some(21.0),
            },
            country_code_in: countries.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn no_config_is_no_op() {
        let cfg = Configuration { points: vec![] };
        assert!(decide(&cfg, None).is_empty());
    }

    #[test]
    fn complete_ungated_point_is_emitted() {
        let cfg = Configuration { points: vec![complete_point("ext-1", &[])] };
        let out = decide(&cfg, Some(&"PL".to_string()));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].external_id, "ext-1");
    }

    #[test]
    fn country_gate_selects_matching_destination() {
        let cfg = Configuration { points: vec![complete_point("ext-1", &["PL", "DE"])] };
        assert_eq!(decide(&cfg, Some(&"PL".to_string())).len(), 1);
        assert_eq!(decide(&cfg, Some(&"de".to_string())).len(), 1); // case-insensitive
        assert!(decide(&cfg, Some(&"FR".to_string())).is_empty());
    }

    #[test]
    fn country_gated_point_skipped_for_unknown_destination() {
        let cfg = Configuration { points: vec![complete_point("ext-1", &["PL"])] };
        assert!(decide(&cfg, None).is_empty());
    }

    #[test]
    fn ungated_point_offered_even_without_known_destination() {
        let cfg = Configuration { points: vec![complete_point("ext-1", &[])] };
        assert_eq!(decide(&cfg, None).len(), 1);
    }

    #[test]
    fn incomplete_point_missing_external_id_is_skipped() {
        let mut p = complete_point("", &[]);
        p.name = "Locker".into();
        let cfg = Configuration { points: vec![p] };
        assert!(decide(&cfg, None).is_empty());
    }

    #[test]
    fn incomplete_point_missing_provider_logo_is_skipped() {
        let mut p = complete_point("ext-1", &[]);
        p.provider.logo_url = "  ".into();
        let cfg = Configuration { points: vec![p] };
        assert!(decide(&cfg, None).is_empty());
    }

    #[test]
    fn incomplete_point_missing_coordinates_is_skipped() {
        let mut p = complete_point("ext-1", &[]);
        p.address.latitude = None;
        let cfg = Configuration { points: vec![p] };
        assert!(decide(&cfg, None).is_empty());
    }

    #[test]
    fn multiple_points_filtered_by_destination() {
        let cfg = Configuration {
            points: vec![
                complete_point("pl-1", &["PL"]),
                complete_point("de-1", &["DE"]),
                complete_point("any-1", &[]),
            ],
        };
        let out = decide(&cfg, Some(&"PL".to_string()));
        let ids: Vec<&str> = out.iter().map(|p| p.external_id.as_str()).collect();
        assert_eq!(ids, vec!["pl-1", "any-1"]);
    }
}
