# AI leverage — how our app exploits Shopify's AI stack (Spring '26)

**Purpose:** filter the Spring '26 AI/MCP/Sidekick surface for things *we* can leverage — split into (A) AI that makes us BUILD better, and (B) AI our PRODUCT + generated modules can plug into. Companion to [`shopify-editions-spring-2026.md`](shopify-editions-spring-2026.md).

**Sources:** [Editions dev post](https://www.shopify.com/news/spring-26-edition-dev) · [Sidekick app extensions](https://shopify.dev/docs/apps/build/sidekick) · [Build app actions](https://shopify.dev/docs/apps/build/sidekick/build-app-actions) · [Build app data](https://shopify.dev/docs/apps/build/sidekick/build-app-data) · [Changelog: Sidekick app extensions](https://shopify.dev/changelog/sidekick-app-extensions-available-today) · UCP/agents: shopify.dev/agents

---

## The AI subset of Spring '26 (filtered)

| # | Item | Bucket |
|---|------|--------|
| 79/163 | **Shopify AI Toolkit** (skills + CLI; Cursor/Claude Code/Codex/VS Code; docs + live store data + admin tools) | Build |
| 186/187 | **Shopify Dev MCP** — token-optimized, all API versions, context + code validation | Build |
| 172/183 | Safer app deployments (no extension deletion) · App automation tokens (CI/CD) | Build |
| 171 | CLI auto-upgrade + semver | Build |
| 194 | All-new Hydrogen (agent-first, any framework) | Build (if we do headless) |
| 12 | **Sidekick works with your apps** — App Extensions (Klaviyo/Loop/Smile/Judge.me/Yotpo…) | Product |
| 2–11 | **Agentic commerce** — UCP + Catalog/Cart/Checkout MCPs, Catalog API | Product |
| 77/78 | Vibe-coding partners · **Store management via Claude/ChatGPT/Perplexity** | Product |
| 127/214 | Shop skill for personal AI agents · Intents for Shop Minis | Product |
| 20/105 | Sidekick: automation tests for Flow · PO generation | Product-adjacent |
| 21/22/23 | AI sales associate (Inbox) · AI storefront search · AI store analysis (SimGym) | Merchant-facing (reference) |

---

## Bucket A — AI that makes US build better

### A1. Shopify Dev MCP as generation grounding + validation ⭐ (highest quality leverage)
This is the single most direct fix for the problem that kicked off phase 028 ("vocabulary limited by my knowledge → shallow/wrong output"). The Dev MCP is a **live, version-correct source of Shopify's real API surface** — and it's already connected in our tooling (`shopify-dev-mcp`: `learn_shopify_api`, `search_docs_chunks`, `validate_graphql_codeblocks`, `validate_theme`, `validate_component_codeblocks`).

Wire it into the pipeline at two points:
1. **Grounding (pre-generation):** before/while compiling the prompt, pull authoritative schemas + doc chunks for the target surface (e.g. cart-transform Function input, checkout UI extension targets, metaobject definitions). The model stops guessing API shapes; the vocabulary is sourced from the domain, not from memory — exactly the "extract vocabulary from the real world" lever.
2. **Validation (post-generation, pre-publish):** run generated GraphQL / Liquid / checkout components through `validate_graphql_codeblocks` / `validate_theme` / `validate_component_codeblocks` as a hard gate in the deterministic compiler, alongside the existing Zod + design-QA gates. Anything that doesn't validate against the live API is repaired or blocked — never published.

> Net: turns "constrained by hand-authored knowledge" into "constrained by the actual, current Shopify API," which is the correct ceiling. Cheap to wire (MCP already available), high payoff.

### A2. Shopify AI Toolkit for our own dev loop
Bundles Shopify skills + CLI into Claude Code / Codex / Cursor / VS Code — docs, live store data, admin tools, structure autocomplete, error detection in-editor. Adopt for the team building this app; complements the Dev MCP (skills teach the agent *how*, CLI *executes*).

### A3. Deploy safety for our extension fleet
"Safer app deployments" (won't delete extensions on deploy) + **app automation tokens** + CLI semver directly harden our publish/deploy path (ties to spec 026 publish reliability). Adopt in CI/CD for the 20-type extension fleet.

---

## Bucket B — AI our product + generated modules plug into

### B1. Ship a Sidekick App Extension for the SuperApp ⭐ (highest distribution/UX leverage)
Our app is itself a Shopify app — so it can expose itself to Sidekick, Shopify's native merchant AI. **Every top plugin we're studying (Klaviyo, Loop, Smile, Judge.me, Yotpo) already shipped one.** Matching them is table stakes; for an *AI module generator* it's a natural fit.

Two extension types (per the docs):
- **Data extension (read-only):** "How are my generated modules performing?" → Sidekick surfaces our module list, publish status, conversion/impressions, paired with store context in one answer.
- **Action extension (staged, merchant-confirmed):** "Add a spin-to-win popup that matches my brand" / "turn my best-seller into a bundle" → Sidekick routes into our app and **stages** the generated module for the merchant to confirm. Merchant never leaves the conversation; our generator becomes an AI-invocable capability.

Mechanism (concrete): declare tools in a JSON file referenced by the `tools` field in `shopify.extension.toml`; each tool = a scoped, intent-specific action (create-module, configure-module, publish-module). Add a consolidated `extensions_summary` to `shopify.app.toml` so Sidekick routes the right merchant questions to us. Keep data read-only; all mutations go through action extensions with confirmation.

> This is the biggest strategic unlock in the set: our differentiator *is* AI generation, and Sidekick is the merchant's AI front door. Being callable from it is worth a dedicated spec.

### B2. Agentic commerce — generate for the AI channel (strategic, phase-later)
UCP + Catalog/Cart/Checkout MCPs make "AI channels" a real storefront target. Two angles for us:
- **Generate modules that optimize the merchant's catalog for AI channels** (structured product data, compliance disclosures, syndication) — a new module *category* our recipe system could produce.
- **Register our own agent profile** (Dev Dashboard → public MCP endpoint, no gate; UCP Skill is open-source) if we build agent-facing shopping experiences. Decision belongs in phase #4 alongside the "add an agentic surface to extension-eligibility?" question.

### B3. Be a good citizen for store-management agents
Merchants can now run their store from Claude / ChatGPT / Perplexity and the AI Toolkit. Ensuring our app's actions are discoverable/automatable (clean Admin API surface, App Events, and — via B1 — Sidekick tools) means our modules are manageable from whatever agent the merchant uses.

### B4. Sidekick-manage generated modules (advanced, later)
Longer term, each generated module could carry its own lightweight Sidekick tools so merchants tune modules conversationally ("make the countdown 24h", "swap the offer product"). Natural extension of B1 once the base Sidekick extension exists.

---

## Prioritized recommendation (leverage × effort)

1. **A1 — Dev MCP grounding + validation in the generation pipeline.** Highest quality payoff, low effort (MCP already connected). Fixes the founding problem. → fold into phase #3 (control-packs) / generation guardrails.
2. **B1 — Sidekick App Extension for the SuperApp.** Highest distribution/UX payoff, medium effort. Competitors already shipped it. → its own spec (029?).
3. **A2/A3 — AI Toolkit + deploy-safety for our dev/CI loop.** Low effort, compounding. → adopt now.
4. **B2 — Agentic-commerce surface** (generate-for-AI-channel + optional agent profile). Strategic, higher effort. → phase #4 decision.
5. **B4 — Per-module Sidekick tools.** After B1.

> These feed the phase 028 gap analysis (section 3 of the editions file) and imply a likely new sibling spec for the Sidekick integration.
