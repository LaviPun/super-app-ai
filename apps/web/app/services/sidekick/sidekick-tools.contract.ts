import { z } from 'zod';

/**
 * Sidekick app-extension tool contracts (M12).
 *
 * Two surfaces, per the live Sidekick app-extension spec
 * (https://shopify.dev/docs/apps/build/sidekick):
 *
 *  - DATA tools (read-only) run headlessly in Shopify's sandbox
 *    (`admin.app.tools.data`). Their handler in the extension bundle fetches
 *    our app backend (`/api/sidekick/tools`, session-token authenticated) and
 *    returns MCP Resource Links. This file is the server-side source of truth
 *    for their input; `extensions/superapp-sidekick-data/tools.json` is the
 *    static declaration Shopify indexes. The parity test keeps them in sync.
 *
 *  - ACTION tools are declared as `admin.app.intent.link` intents that navigate
 *    the merchant to a real page in our app (create / configure / publish).
 *    They do NOT POST to a runtime endpoint — Sidekick substitutes the intent
 *    values into the extension `url` and opens it. So there is no mutating
 *    dispatcher here; the merchant confirms the action on the app page they
 *    already use. The intent schemas live in the actions extension dir.
 */

/** Read-only data tools exposed to the Sidekick sandbox. */
export const SidekickDataToolName = z.enum([
  'search_modules',
  'get_module_performance',
]);
export type SidekickDataToolName = z.infer<typeof SidekickDataToolName>;

/**
 * Input schemas for the data tools. Mirrors the `inputSchema` blocks in
 * `superapp-sidekick-data/tools.json`. Sidekick renders UI for any missing
 * field, so nothing is strictly required at the transport level — but the
 * backend validates whatever arrives.
 */
export const SidekickDataToolInput = {
  search_modules: z.object({
    query: z.string().trim().optional(),
    status: z.enum(['ANY', 'DRAFT', 'PUBLISHED']).default('ANY'),
  }),
  get_module_performance: z.object({
    moduleId: z.string().min(1),
    days: z.number().int().min(1).max(90).default(30),
  }),
} as const;

export type SearchModulesInput = z.infer<typeof SidekickDataToolInput.search_modules>;
export type GetModulePerformanceInput = z.infer<
  typeof SidekickDataToolInput.get_module_performance
>;

/** Envelope the data-extension bundle POSTs to `/api/sidekick/tools`. */
export const SidekickToolCallSchema = z.object({
  tool: SidekickDataToolName,
  input: z.record(z.unknown()).default({}),
});
export type SidekickToolCall = z.infer<typeof SidekickToolCallSchema>;

/**
 * The action-link intent types our actions extension registers, kept here so a
 * parity test can assert the extension toml/schemas match. These are
 * `application/*` intents (our app owns the payload shape) — the URL each maps
 * to is asserted in the parity test against the extension toml.
 */
export const SidekickIntentType = z.enum([
  'application/superapp-module-create',
  'application/superapp-module-configure',
  'application/superapp-module-publish',
]);
export type SidekickIntentType = z.infer<typeof SidekickIntentType>;

/**
 * MCP Resource Link — the output shape a data tool returns to Sidekick.
 * `mimeType` must match the action-link intent `type` for a result to be
 * actionable; `uri` is a stable `gid://…` identifier.
 */
export type SidekickResourceLink = {
  type: 'resource_link';
  uri: string;
  name: string;
  mimeType: string;
  _meta?: Record<string, unknown>;
};
