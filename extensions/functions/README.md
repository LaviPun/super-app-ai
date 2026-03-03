# Shopify Functions (generic rule engines)

You generally cannot deploy brand-new WASM per merchant safely.
Instead ship a *small set of powerful generic functions* that read rule config from metafields.

Example included: `discount-rules` (Rust skeleton).


## Planned generic functions
- delivery-customization (shipping)
- payment-customization
- cart-and-checkout-validation
- cart-transform (Plus-only update ops)
