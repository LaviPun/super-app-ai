use shopify_function::prelude::*;
use std::process;

pub mod generate_run;

#[typegen("schema.graphql")]
pub mod schema {
    #[query(
        "src/generate_run.graphql",
        custom_scalar_overrides = {
            "Input.shop.metaobject.field.jsonValue" => super::generate_run::Configuration,
        }
    )]
    pub mod generate_run {}
}

fn main() {
    log!("Please invoke a named export.");
    process::abort();
}
