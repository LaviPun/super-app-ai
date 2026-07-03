# Shopify Editions — Spring '26 (research input)

**Source:** https://www.shopify.com/editions/spring2026 · **Launched:** 2026-06-18 · **Scope:** 216 features/updates (Shopify markets it as "150+"; the dev + merchant posts cite 215+).
**Why this file exists:** Editions is where Shopify ships new *surfaces, extension points, Functions capabilities, and APIs*. Those redefine our **target** vocabulary — what a great generated module should now be able to do. This file (1) extracts the developer/extensibility deltas that matter to phase 028, then (2) enumerates every announced point for completeness, then (3) lists the concrete additions to our gap analysis / roadmap.

Cross-reference posts:
- Dev: https://www.shopify.com/news/spring-26-edition-dev
- Merchant: https://www.shopify.com/news/spring-26-edition-merchant

---

## 1. What changes OUR target vocabulary (high-signal deltas)

Grouped by our internal extension surfaces. These are the items with real developer/extensibility weight.

### 1a. A whole new channel class — Agentic Commerce (NEW target surface)
The single biggest strategic shift. Shopify now has a first-class **agentic commerce** stack our modules could target:
- **Universal Commerce Protocol (UCP)** + **Catalog / Cart / Checkout MCPs** — build discovery→purchase inside AI agents; register an agent profile in the Dev Dashboard, call the public MCP endpoint (no application gate).
- **Catalog API** — image search, product lookup (≤50 products, real-time price/availability), richer attributes (size/color/variants/multi-seller offers), **Shop sign-in** for personalization, **sponsored products** (earn revenue on agentic sales).
- **Checkout on more surfaces** — Shop Pay purchases inside Copilot, Meta ads, ChatGPT.
- **Store management via agents** — run a store from Claude / ChatGPT / Perplexity; **Shop skill** for personal AI agents (OpenClaw, Hermes).
- **Impact:** our `extension-eligibility` model has no "agentic/AI-channel" surface. This is a candidate NEW target surface (product-data syndication + MCP endpoints), distinct from storefront. Worth a decision in phase #4.

### 1b. Checkout & Functions — richer, directly relevant to the bundler
- **Metaobject data in checkout functions** — functions can read metaobject entries for custom discounts/rules. *(This is exactly the "config metaobject a Function reads at runtime" pattern our publish layer already uses — now first-class.)*
- **Billing address + PO number in Shopify Functions** — queryable in cart/checkout **validation** functions → expands `functions.cartAndCheckoutValidation` vocabulary.
- **Prerequisites in product discount functions (BXGY)** — specify required items before a discount applies → expands `functions.discountRules` (maps straight to Fast Bundle / BOGO logic).
- **Accelerated checkout support for add-ons** — Shop Pay / Apple Pay now support **nested cart lines** for product-page add-ons → *directly* enables the bundler's "add-on / BAP" line model through express checkout.
- **Cart metafields carry over to orders** (`cartToOrderCopyable` on metafield definitions) → lets a generated module thread state cart→order (bundle identity, referral code, etc.).
- **Address format validation / order value limits via Checkout Blocks** → these are *app-provided* checkout capabilities, not raw CSS — reinforces the "curated checkout knobs, not freeform" reality.
- **Redesigned higher-converting checkout** + **branding API across checkout/accounts/sign-in** (unified) → our merchant styling story for checkout is *branding tokens*, never CSS (confirms the sandbox constraint from spec.md).

### 1c. Admin — the "no-backend module" unlock
- **App Home without a backend** — build App Home UI directly in admin, no backend server. *(Big: lowers the bar for our generated `admin.block`/`admin.action` modules to have a real admin surface without provisioning a server.)*
- **Discount configuration via admin UI extensions** (with conditional rendering) + **bulk-editing extensions for discounts** (admin actions) → richer `admin.block`/`admin.action` vocabulary tied to discounts.
- **Metafields created in-context** + **analytics filtered/grouped by metafields** + **ShopifyQL supports metafields** → strengthens metafield-as-config and reporting.

### 1d. POS UI extensions — materially expanded
- **Offline** POS UI extensions · **Localized** (currency/number/plural) · **Camera API** (ID scan, product photos) · **activation-status query** · **Cash management extension APIs** (sessions, counts, audit).
- **Impact:** our `pos.extension` type was "deployable but thin" — these APIs give it real capability vocabulary (camera, offline, cash). Update the eligibility notes.

### 1e. Customer Accounts — extension surface grew
- **Customer account UI extension** can natively update **subscription payment methods** · **customer account web component** (Shopify-managed sign-in/menus) · **365-day sessions** · **identity-provider sync** (Auth0/Ping/Azure).
- **Impact:** expands `customerAccount.blocks` vocabulary (subscriptions management, embedded account component).

### 1f. Theme / Storefront — tokens + a real event system
- **Color palettes for themes** — define palettes in theme settings, available across the theme. *(Direct input to our design-vocabulary + token work in phase #2, and to store-aesthetic palette matching.)*
- **Standard storefront events and actions** — themes adopt a reliable event/action system for app + agent interaction. *(Relevant to `proxy.widget`/`theme.section` interactivity and to a future interactive-widget runtime.)*
- **Variant-level publishing**, mobile theme editor, side-by-side editors, localized-theme scheduling/A-B via **Rollouts**.

### 1g. Data / APIs — config + targeting vocabulary
- **Streamlined Metafields & Metaobjects API** + **declarative metaobjects don't require scopes** → cheaper config storage for generated modules (our compiler leans on metaobjects).
- **New Collections API** — composable source groups, variant-level conditions, exclusion rules → richer **targeting/merchandising** vocabulary (feeds the settings-vocabulary control-packs).
- **More control over events** — configure webhooks to fire only on **specific field changes** + custom GraphQL queries; **improved webhook monitoring**. *(Directly relevant to our Track B webhook-dispatcher gap, which was hardcoded to a couple of topics — this is the platform capability to fix it properly.)*

### 1h. Flow — capability + our reality audit
- **Code editor in Flow** (Liquid, autocomplete) · **ShopifyQL + Admin API fields in Flow** · **version history** · **workflow notes** · **automation tests** (Sidekick-generated) · **auto shipping-label purchase action** · **automated vaulted B2B payments action**.
- **Impact:** cross-check against `reality/flow-automation.md` — Shopify's own Flow is gaining exactly the DAG-adjacent ergonomics our "engine" doc claimed. Reframes build-vs-lean-on-Shopify-Flow for phase #3/#4.

### 1i. Dev tooling / AI (affects how WE build)
- **Shopify AI Toolkit GA** (Claude Code, Codex, Cursor, VS Code) · **Shopify Dev MCP**: optimized tokens + **all API versions** · **vibe-coding partners** (Manus/Replit/V0/Lovable) · **Hydrogen rebuilt** (agent-first, any JS framework incl. Next.js) · **App Events API** · **safer deployments / no accidental extension deletion** · **CLI auto-upgrade + semver** · **App automation tokens** · **parallel bulk reads (4×)**.
- **Shopify App Pricing** — configure usage/recurring/hybrid billing; Shopify handles selection/approval/invoicing (relevant if generated modules ever monetize).

---

## 2. Full enumeration (all 216, grouped) — for completeness

> Legend: **[D]** = developer/extensibility capability (new extension point, API, Function, metafield/metaobject, theme capability).

### Agentic (11)
1. Your products optimized for AI · 2. Shopify Catalog **[D]** · 3. Checkout on more surfaces (UCP → Copilot/Meta) **[D]** · 4. Agentic plan · 5. Open protocol for agentic commerce (Catalog/Cart/Checkout MCPs) **[D]** · 6. Sponsored products with Catalog API **[D]** · 7. Catalog API supports Shop sign-in **[D]** · 8. Reference experiences built with Catalog API + UCP **[D]** · 9. Catalog API image search **[D]** · 10. Catalog API product lookup (≤50) **[D]** · 11. Richer product data in agentic experiences **[D]**

### Sidekick (9)
12. Sidekick works with your apps (Judge.me/Klaviyo/Loop/Smile) **[D]** · 13. Actionable guidance from Sidekick · 14. Sidekick on Apple Watch · 15. Follow-up questions · 16. Multi-task (background) · 17. Improved editing for Sidekick-generated apps · 18. Sidekick everywhere in Shopify app · 19. Sidekick creates customers · 20. Automation tests with Sidekick (Flow) **[D]**

### Online — storefront / accounts / B2B (25)
21. AI sales associate (Inbox) · 22. Storefront search handles typos · 23. AI store analysis (SimGym) · 24. A/B tests on store & checkout (Rollouts) · 25. Visualized markets graph · 26. Better mobile theme editing · 27. Variant-level publishing · 28. Scheduling/testing localized themes · 29. Discounts by market · 30. Sales-channel control in markets · 31. Product compliance disclosure · 32. Stacking multiple product discounts · 33. Refreshed customer accounts · 34. Customer data sync from identity providers **[D]** · 35. 365-day customer sessions · 36. Shopify Smart Pricing app · 37. Side-by-side laptop editing · 38. B2B on Basic/Grow/Advanced · 39. Collective sourcing insights · 40. Tax-inclusive pricing (Collective) · 41. Improved product discovery (Collective) · 42. Shipping performance + trust badges · 43. Collective in Australia · 44. Automated vaulted B2B payments (Flow) **[D]** · 45. QuickBooks + Mailchimp B2B support

### Retail / POS (19)
46. Fastest-ever POS (v11) · 47. Rebuilt POS checkout demo · 48. Scannable QR discounts · 49. Verifone Victa Mobile · 50. Faster POS search · 51. Returns + exchanges in one cart · 52. Gift card cashout · 53. In-person pickup orders (Pro) · 54. Smart-grid editor · 55. Manual offline checkout by device · 56. Keyboard shortcuts · 57. In-store-only discounts · 58. Packing slips for transfers · 59. Customer-data permission settings · 60. Receive/fulfill transfers (Pro) · 61. Multi-entity selling across locations (Plus) · 62. Tap to Pay for multi-entity (Plus) · 63. Multi-entity offline payments · 64. Cash visibility/control (Pro)

### Marketing (12)
65. Campaign Autopilot · 66. Shop Campaigns on more channels · 67. Simplified bidding · 68. WhatsApp marketing channel · 69. SMS + marketing automations · 70. Smart email delivery · 71. Standardized ads billing · 72. Marketing data in analytics · 73. Discount links attributed to campaigns · 74. Fixed bundles on Google/Meta · 75. Marketing consent on sign-in · 76. WhatsApp consent management

### Operations — plugins/AI, admin, inventory, shipping, global (52)
77. More vibe-coding partners **[D]** · 78. Store management with agents **[D]** · 79. Shopify AI Toolkit **[D]** · 80. New analytics visualizations · 81. Daily insights · 82. Chart annotations · 83. Metric targets · 84. Multi-metric charts · 85. Analytics filtered by metafields **[D]** · 86. Metafields created in-workflow **[D]** · 87. More pinned metafields (≤50) · 88. Discounts on refund page · 89. Consistent returns/upsell calc · 90. App activity visibility · 91. Staff payments permissions · 92. Custom pricing on draft orders · 93. Filtering + saved views · 94. Category-specific return reasons · 95. Code editor in Flow **[D]** · 96. Auto shipping-label purchasing (Flow) **[D]** · 97. Flow version history · 98. Flow workflow notes · 99. ShopifyQL + Admin API fields in Flow **[D]** · 100. SKU sharing across locations · 101. Faster inventory syncing · 102. Pickup fulfillment from multiple sources · 103. Shipment-level barcode receiving · 104. Inventory tracking separated from active products · 105. Smarter PO workflows (Sidekick) **[D]** · 106. Inventory adjustment audit trail · 107. Order cancellation requests · 108. Batch fulfillment workflow · 109. FedEx One Rate · 110. Advanced shipping options · 111. Fulfillment status for canceled orders · 112. Local pickup emails (API) **[D]** · 113. Manual delivery confirmation · 114. Labels in local currency · 115. FedEx in Managed Markets · 116. DHL Kleinpaket (DE) · 117. Carrier auto-detection · 118. UPS return labels · 119. Managed Markets UK/CA · 120. Managed international pricing · 121. Product restriction reassessment · 122. Faster Managed Markets setup · 123. Duty calculation breakdown · 124. Gift cards in local currencies

### Shop App (9)
125. Shopper-centric search · 126. Online→in-person via Shop · 127. Shop skill for AI agents **[D]** · 128. Blocks in Shop Editor **[D]** · 129. Demand indicators + inventory alerts · 130. Merchandised categories · 131. Posts in Shop app · 132. Seamless Shop sign-in · 133. Shop Minis across the app **[D]**

### Payments (22)
134. Shop Pay for any brand/platform · 135. Managed payment methods · 136. Ship + pickup in one checkout · 137. Deeper dispute insights · 138. Shop Pay local methods · 139. Meses Sin Intereses (MX) · 140. Shopify Payments in UAE (Plus) · 141. Multi-currency payouts · 142. Multi-entity same-country (Plus) · 143. Local methods in more countries · 144. USDC cashback (Base) · 145. Accept more USDC · 146. Enhanced card-testing fraud prevention · 147. Chargeback health monitoring · 148. Higher-converting redesigned checkout · 149. VAT ID validation at checkout · 150. Faster address suggestions · 151. Address format validation (Checkout Blocks) **[D]** · 152. Customized branding checkout/accounts/sign-in · 153. Order value limits (Checkout Blocks) **[D]** · 154. Quick Sale tips/shipping/payment links · 155. Quick Sale in more markets

### Finance (7)
156. Cashback on ad spend (Balance) · 157. Shopify Tax in Canada · 158. Cash in Shopify Balance · 159. Funding paid with Shopify Payments · 160. Capital flex repayment control · 161. Capital in France · 162. Domestic wire transfers

### Developer — platform / APIs / extensions / functions (54)
163. Commerce skills for agents **[D]** · 164. More control over events (field-level webhooks) **[D]** · 165. GraphQL + bulk ops from CLI **[D]** · 166. All partner stores in Dev Dashboard · 167. App Events API **[D]** · 168. Localized Dev Dashboard · 169. Revamped Polaris docs **[D]** · 170. Metafields in ShopifyQL **[D]** · 171. CLI auto-upgrade + semver **[D]** · 172. Safer app deployments (no extension deletion) **[D]** · 173. Streamlined Metafields/Metaobjects API **[D]** · 174. App Home without a backend **[D]** · 175. Discount config via admin UI extensions **[D]** · 176. Accelerated checkout add-ons (nested cart lines) **[D]** · 177. Declarative metaobjects w/o scopes **[D]** · 178. Metaobject data in checkout functions **[D]** · 179. Billing address + PO in Functions **[D]** · 180. AI Toolkit → Polaris web-components upgrade **[D]** · 181. Role-based partner access · 182. Improved webhook monitoring · 183. App automation tokens **[D]** · 184. Admin performance monitoring · 185. Parallel reads for bulk queries **[D]** · 186. Dev MCP optimized tokens **[D]** · 187. Dev MCP all API versions **[D]** · 188. Shopify App Pricing (billing) **[D]** · 189. Shop Minis in more places **[D]** · 190. Refreshed branding API (checkout/accounts) **[D]** · 191. WhatsApp marketing consent API **[D]** · 192. Access to Sign in with Shop **[D]** · 193. AI Toolkit → optimize checkout extensions **[D]** · 194. All-new Hydrogen (any stack) **[D]** · 195. Prerequisites in product discount functions (BXGY) **[D]** · 196. Bulk-editing extensions for discounts **[D]** · 197. Cash management extensions **[D]** · 198. SKU sharing by default (`permitsSkuSharing` removed) **[D]** · 199. Multi-channel support for sales-channel apps **[D]** · 200. Ship + pickup order-logic compatibility testing · 201. Stronger app security (OAuth 2.0 expiring tokens) **[D]** · 202. POS UI extension activation status **[D]** · 203. POS UI extensions offline **[D]** · 204. Localized POS UI extensions **[D]** · 205. Camera API for POS UI extensions **[D]** · 206. Inventory API idempotency **[D]** · 207. Customer account UI extension: subscription payment update **[D]** · 208. Cart metafields carry to orders (`cartToOrderCopyable`) **[D]** · 209. Pre-populate email on sign-in (`login_hint`) **[D]** · 210. Customer account web component **[D]** · 211. Standard storefront events and actions **[D]** · 212. Streamlined app store submission · 213. Built for Shopify: Customer Account API requirement **[D]** · 214. Intents for Shop Minis **[D]** · 215. Color palettes for themes **[D]** · 216. New Collections API **[D]**

---

## 3. Additions to the gap analysis / roadmap (phase 028 → #2–#4)

Concrete items to feed into `synthesis/gap-analysis.md` and the downstream phases:

1. **Add an "agentic commerce" target surface** (UCP + Catalog API syndication + MCP endpoints) to the extension-eligibility model, or explicitly scope it out with a reason. (#4 decision.)
2. **Extend the Functions vocabulary:** metaobject reads in checkout functions, BXGY prerequisites, billing-address/PO in validation — all map to real market needs (bundler, B2B). (#3/#4.)
3. **Bundler unlock:** accelerated-checkout nested cart-line support + cart→order metafield carryover directly de-risk the Fast Bundle "BAP → expanded lines through express checkout" flow. (#4.)
4. **Admin surface upgrade:** "App Home without a backend" + admin UI discount-config extensions raise the ceiling for generated `admin.block`/`admin.action`. (#3.)
5. **POS vocabulary:** camera / offline / localized / cash-management extension APIs — update `pos.extension` notes from "thin" to a real capability set. (#3.)
6. **Theme design tokens:** native **theme color palettes** + **standard storefront events/actions** feed phase #2's token system and any interactive-widget runtime. (#2.)
7. **Webhook gap fix:** field-level webhook config is the platform primitive to properly fix our hardcoded-topic dispatcher (see `reality/flow-automation.md`). (Track B follow-up.)
8. **Flow strategy:** Shopify Flow now has code editor + ShopifyQL/Admin-API access + version history — reassess build-our-own-DAG vs lean-on-Flow before investing in the unbuilt engine. (#3.)
9. **Config storage:** declarative metaobjects without scopes + streamlined Metaobjects API simplify our compiler's metaobject-config pattern. (compiler.)
10. **Checkout styling reality:** branding API (not CSS) across checkout/accounts confirms spec.md's "merchant Custom CSS is storefront-only" constraint — no change needed, evidence added.

> Note: the running workflow's `gap-analysis.md` was scoped to the plugin + audit corpus and does **not** auto-read this file. Fold sections 1 & 3 in during the post-workflow regroup.
