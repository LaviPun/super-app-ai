# Context Injection Audit

**Scope:** System prompts and dynamic context about app state injected into AI/agent prompts.  
**Sources:** `api.ai.create-module`, `api.agent.generate-options`, `api.ai.modify-module`, `api.agent.modules.$moduleId.modify`, `llm.server.ts`, `prompt-expectations.server.ts`, `intent-packet.server.ts`.

---

## Context Injection Audit

### Context Types Analysis

| Context Type | Injected? | Location | Notes |
|--------------|------------|----------|--------|
| **Available resources (files, drafts, documents)** | Partial | `api.ai.create-module.tsx` (64–69), `api.agent.generate-options.tsx` (59–64), `llm.server.ts` (compileCreateModulePrompt) | Workspace **counts** only: total modules, published, drafts. Constraint: "Avoid names that are likely already in use." No list of module names, IDs, or document titles is injected. Catalog inspiration (catalog-details.server.ts) is injected on retry/low confidence as generic catalog entries, not merchant-specific resources. |
| **User preferences / settings** | Partial | `api.ai.create-module.tsx`, `api.agent.generate-options.tsx`, `api.ai.modify-module.tsx`, `api.agent.modules.$moduleId.modify.tsx`; IntentPacket `store_context` in `intent-packet.server.ts` | **Plan tier** injected (FREE/PAID/…) so AI only suggests publishable types. **Store context** in IntentPacket: `shop_domain`, `theme_os2: true` (injected via `buildIntentPacket` → `intentPacketJson` in prompt). No merchant UI preferences, locale, or currency in prompt. |
| **Recent activity** | No | — | Not injected. ActivityLog exists for auditing but is not passed into create/modify or generate-options prompts. Docs (agent-native-audit-report) list "Recent activity" as "Remaining optional." |
| **Available capabilities listed** | Partial | `api.ai.create-module.tsx` (59–60), `api.agent.generate-options.tsx` (54–57), modify routes (plan tier in workspaceContext) | **Plan tier** + prose: "Only suggest module types the merchant can publish on this plan. For FREE tier, avoid types that require premium capabilities (e.g. checkout.upsell, …)." No explicit list of allowed capability IDs or module types; constraint is text-only. |
| **Session history** | No | — | No conversation or session history included in any AI prompt. Each create/generate-options/modify call is stateless; only `previousError` (validation repair) is carried within a single request. |
| **Workspace state** | Yes | `api.ai.create-module.tsx` (64–71), `api.agent.generate-options.tsx` (59–64), `api.ai.modify-module.tsx` (41–47), `api.agent.modules.$moduleId.modify.tsx` (56–64) | Injected: total module count, published count, draft count, and constraint to avoid duplicate names / keep module type unchanged (modify). IntentPacket (in prompt) also carries `store_context` (shop_domain, theme_os2). |

### Score: 4/6 (67%)

Four of six context types receive some injection (available resources: counts + constraint; user preferences/settings: plan tier + store context; available capabilities: plan-tier prose; workspace state: full). Two receive none: recent activity, session history.

### Missing Context

- **Recent activity** — No last N actions or "recently created/edited modules" in the prompt. Agents and AI cannot tailor suggestions from recent merchant behavior.
- **Session history** — No multi-turn conversation or session context. No "previous message" or "user just published X" in the same session.
- **Explicit capability list** — No machine-readable list of allowed module types or capability IDs for the current plan; only natural-language constraint.
- **Resource names/list** — No list of existing module names or IDs; only counts and "avoid names already in use," so the model cannot see exact names to avoid or reference.

### Recommendations

1. **Optional: inject recent activity** — For create/generate-options, optionally append a short summary (e.g. "Last 5 actions: MODULE_CREATED X, MODULE_PUBLISHED Y") from ActivityLog for the shop, so the AI can avoid duplicating recent work or align with recent intent.
2. **Optional: inject existing module names** — For create/generate-options, add a truncated list of existing module names (e.g. first 20–30) so the model can avoid naming clashes and stay consistent with naming style.
3. **Optional: explicit capability list** — Use `CapabilityService` / `isCapabilityAllowed(plan, cap)` to build an explicit list of allowed module types or capability IDs and inject that list (e.g. "Allowed types: theme.banner, theme.popup, …") so behavior is consistent and audit-friendly.
4. **Session history (deferred)** — Multi-turn session context would require session storage and prompt framing; document as future improvement unless product requires conversational flows.
5. **Store context enrichment** — Consider adding `currency` and `primary_language` to IntentPacket `store_context` where available (docs mention these as optional) for locale-aware copy and pricing.
