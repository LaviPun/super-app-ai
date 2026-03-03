# Customer Account UI Extension (generic)

Customer account UI extensions let apps add UI to the new customer account pages (Order index, Order status, Profile).
Constraints:
- No arbitrary HTML or <script> tags; only Shopify-provided UI components.
- Styling is controlled by the customer account UI; you cannot override CSS.

Strategy for SuperApp:
- Store module configs in shop metafields (e.g. `superapp.customer_account.blocks`)
- A single generic extension reads config and renders appropriate UI blocks/actions/pages.

Note:
- Some B2B profile targets render only for B2B customers; B2B is Shopify Plus.
