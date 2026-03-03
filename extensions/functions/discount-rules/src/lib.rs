use serde::Deserialize;

#[derive(Deserialize)]
struct RulesConfig {
  rules: Vec<Rule>,
  #[serde(default)]
  combineWithOtherDiscounts: bool,
}

#[derive(Deserialize)]
struct Rule {
  when: When,
  apply: Apply,
}

#[derive(Deserialize)]
struct When {
  #[serde(default)]
  customerTags: Option<Vec<String>>,
  #[serde(default)]
  minSubtotal: Option<f64>,
  #[serde(default)]
  skuIn: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct Apply {
  #[serde(default)]
  percentageOff: Option<f64>,
  #[serde(default)]
  fixedAmountOff: Option<f64>,
}

// NOTE: This is a conceptual skeleton.
// Shopify Functions require specific input/output types (GraphQL schema + generated bindings).
// Here we only show how you'd parse config JSON safely.
#[no_mangle]
pub extern "C" fn run() {
  // In real function, you would read config JSON (metafield) passed by Shopify,
  // deserialize it, evaluate conditions, and output operations.
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_config() {
    let raw = r#"{ "rules": [{"when": {"minSubtotal": 100}, "apply": {"percentageOff": 10}}] }"#;
    let cfg: RulesConfig = serde_json::from_str(raw).unwrap();
    assert_eq!(cfg.rules.len(), 1);
  }
}
