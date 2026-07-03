# Messaging Surface (email / SMS / web-push) — R3.4 / M5

**Phase 031 · Composites & new surfaces · design piece.** A first-class
`messaging.campaign` module type for **fan-out messaging** — the single most
common *action* in the corpus (Klaviyo, Omnisend, Privy, PushOwl, Appikon
back-in-stock, subscription dunning) — which today has **no extension-type slot**
and is proxied through `flow.automation`, a poor fit that is itself only reachable
via the linear `FlowRunnerService`.

**Honesty discipline up front.** We have exactly one *real* delivery path today:
the `email` connector (`EmailConnector`, SendGrid/generic) and the `slack`
connector (incoming webhook), reachable via the live linear `FlowRunnerService`
step kinds `SEND_EMAIL_NOTIFICATION` / `SEND_SLACK_MESSAGE`
(`flow-runner.service.ts:301-345`). **SMS and web-push have no connector and no
runtime.** This spec therefore ships **email fan-out for real** on the existing
runner, models SMS/push in the vocabulary as **`needs_runtime` channels** (schema
accepts them, compiler gates them, runner refuses them loudly — never fakes a
send), and lists the SMS/push connectors as an explicit follow-up. We build on
what is real; we do not fake a delivery engine.

---

## 1. Current state (file:line)

### What exists and is live
- **Real email send** — `EmailConnector.invoke(..., operation:'send', inputs:{to,subject,body})`
  (`apps/web/app/services/workflows/connectors/email.connector.ts:14-60`),
  registered as `'email'` in `connectors/index.ts:12`. Fails loudly without
  `EMAIL_API_KEY`.
- **Real slack send** — `SlackConnector` incoming-webhook, `'slack'` in
  `connectors/index.ts:11`.
- **The only wiring that reaches them** — linear `FlowRunnerService`
  (`apps/web/app/services/flows/flow-runner.service.ts`): step kind
  `SEND_EMAIL_NOTIFICATION` (`:301-319`) sends to **one** `step.to`; step kind
  `SEND_SLACK_MESSAGE` (`:321-345`). Fired from three live sites:
  - webhook route `webhooks.tsx:19-33` (`orders/create`, `products/update` only),
  - cron `api.cron.tsx:70-90` via `ScheduleService.claimDue()` (trigger `SCHEDULED`),
  - admin "Run now" `FlowRunnerService.runFlowById` (`:144`, PUBLISHED-guarded `:154`).
- **Subscriber capture already works** — `WRITE_TO_STORE` step
  (`flow-runner.service.ts:359-390`) + `DataStoreService`
  (`apps/web/app/services/data/data-store.service.ts:49`) with
  `getStoreByKey` (`:145`), `createRecord` (`:177`), `listRecords`/
  `listRecordsByDataStoreId` (`:150,:248`). This is the exact "capture → persist →
  fan-out" spine Appikon/Klaviyo/Omnisend describe (`appikon-notify-me.md`
  surfaces; `klaviyo.md` "form capture → profile/event store → … → send").

### What is missing / the poor fit
- **No messaging type.** `RECIPE_SPEC_TYPES` (`packages/core/src/allowed-values.ts:714-743`)
  has no `messaging.*`. No category slot beyond overloading `FLOW`.
- **No fan-out.** `SEND_EMAIL_NOTIFICATION` sends to a single literal
  `step.to`; there is no "send to every subscriber in list X" primitive. Every
  studied app's core action (batched fan-out over a contact list) is
  inexpressible.
- **No channel/consent/template model.** No `channel ∈ {email,sms,push}`, no
  `consent`, no reusable `template` with merge vars — all first-class in
  Klaviyo/Omnisend/Privy/Appikon functional models.
- **Proxied through `flow.automation`** — which (a) is the wrong mental model
  (a merchant thinks "a back-in-stock campaign", not "a workflow with a send
  step"), (b) is marked `needs_runtime` in eligibility despite having a live
  runtime (`extension-eligibility.ts:209-217`), and (c) inherits the linear
  runner's lack of a durable scheduler (M6, out of scope here — see §8).

### The pack/flat-pin substrate this is built on
- Control-pack **composer + `moduleSystemVersion` were pruned** (a17a748). The
  authoring path is **flat-pin `RecipeSpec.config`** + the live
  `generate._index.tsx` builder + `SchemaForm`. Phase #3 landed the
  `rule-engine`, `pricing`, `recommendation` packs as **`.optional()` flat pins**
  on `config` (`recipe.ts:158,166,223,296,309,364`). **This spec follows that
  exact pattern** — a `messaging.campaign` discriminated-union variant whose
  `config` carries plain fields plus optional reuse of the existing
  `audience`/`schedule`/`rule-engine` packs. No composer is resurrected.

---

## 2. Target shape (exact types + example)

### 2a. New enums — `packages/core/src/allowed-values.ts`

Add near the flow enums (`allowed-values.ts:443-460`):

```ts
// ─── Messaging surface (R3.4 / M5) ───────────────────────────────────────────
/**
 * Delivery channels. Only 'email' has a shipped runtime today (EmailConnector).
 * 'sms' and 'push' are modeled but gated needs_runtime at compile+runtime until
 * their connectors ship (see design/messaging-surface.md §5, §8). 'slack' reuses
 * the live SlackConnector for internal/ops fan-out.
 */
export const MESSAGING_CHANNELS = ['email', 'sms', 'push', 'slack'] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/** Channels whose runtime is actually shipped today. Single source for the compiler + runner gate. */
export const MESSAGING_CHANNELS_SHIPPED = ['email', 'slack'] as const;

/**
 * What causes the campaign to fan out.
 *  - 'broadcast'     one-shot blast to the resolved audience (admin "Send now" / scheduled).
 *  - 'event'         reacts to a live FlowRunnerService trigger (order/create, product/update, …).
 *  - 'back_in_stock' event convenience preset: inventory 0→positive (product/update) → notify waitlist.
 * Durable multi-step drip sequences are OUT OF SCOPE (M6 scheduler) — see §8.
 */
export const MESSAGING_TRIGGER_KINDS = ['broadcast', 'event', 'back_in_stock'] as const;
export type MessagingTriggerKind = (typeof MESSAGING_TRIGGER_KINDS)[number];

/** How the recipient set is resolved. */
export const MESSAGING_AUDIENCE_SOURCES = [
  'data_store',      // a DataStore subscriber list (the capture→persist→fan-out spine)
  'event_recipient', // the person on the triggering event (order email, back-in-stock subscriber)
  'literal',         // an explicit address list (ops alerts; small)
] as const;
export type MessagingAudienceSource = (typeof MESSAGING_AUDIENCE_SOURCES)[number];

export const MESSAGING_LIMITS = {
  subjectMax: 200,
  bodyMax: 20_000,
  literalRecipientsMax: 50,
  templatesMax: 4,       // one per channel
  batchSizeMax: 500,     // per-run fan-out cap (matches engine safety posture)
  mergeVarKeyMax: 40,
} as const;
```

Register the type (`allowed-values.ts:714-743`, add after `customerAccount.blocks`
or grouped with integrations):

```ts
  'messaging.campaign',
```

Add the three parallel maps:
- `MODULE_TYPE_TO_CATEGORY` (`:804-826`): `'messaging.campaign': 'INTEGRATION'`
  (reuses an existing category — no new category enum needed; messaging is a
  server-side integration effect, like `integration.httpSync`).
- `MODULE_TYPE_DEFAULT_REQUIRES` (`:829-851`): `'messaging.campaign': []`.
- `MODULE_TYPE_TO_SURFACE` (`:854+`): `'messaging.campaign': 'marketing_analytics'`
  (the closest existing `SHOPIFY_SURFACES` value; no new surface enum).

> **DECISION D1 (see §8):** category = reuse `INTEGRATION` vs. add a new
> `MESSAGING` category. Recommended: **reuse `INTEGRATION`** to stay additive and
> avoid touching every `Record<ModuleCategory,…>` exhaustiveness site. Flagged
> for the human.

### 2b. New pack — `packages/core/src/control-packs/packs/messaging.pack.ts`

Follows the `pricing.pack.ts` template exactly (Zod schema + `ControlPack`
descriptor + `uiSchema`). The schema is the *body* of the module config; it is
flat-pinned into the recipe variant.

```ts
import { z } from 'zod';
import {
  MESSAGING_CHANNELS, MESSAGING_TRIGGER_KINDS, MESSAGING_AUDIENCE_SOURCES,
  MESSAGING_LIMITS, FLOW_AUTOMATION_TRIGGERS,
} from '../../allowed-values.js';
import { AudiencePackSchema } from './audience.pack.js';   // reuse (coarse segment gate)
import { RuleEnginePackSchema } from './rule-engine.pack.js'; // reuse (fine recipient filter, R2.1)
import type { ControlPack } from '../types.js';

/** One channel's message. Merge vars are {{dot.paths}} resolved against the recipient + event. */
export const MessageTemplateSchema = z.object({
  channel: z.enum(MESSAGING_CHANNELS),
  /** Email only; ignored for sms/push/slack. */
  subject: z.string().max(MESSAGING_LIMITS.subjectMax).optional(),
  /** HTML (email) / text (sms/slack) / notification body (push). {{merge}} tokens allowed. */
  body: z.string().min(1).max(MESSAGING_LIMITS.bodyMax),
  /** push only. */
  title: z.string().max(120).optional(),
  url: z.string().url().optional(),
}).superRefine((t, ctx) => {
  if (t.channel === 'email' && !t.subject) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subject'], message: 'email template requires a subject' });
  }
});
export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;

/** Who receives the message. */
export const MessagingAudienceSchema = z.object({
  source: z.enum(MESSAGING_AUDIENCE_SOURCES).default('data_store'),
  /** source:'data_store' — the DataStore key holding subscriber records. */
  storeKey: z.string().min(1).max(40).optional(),
  /** Which record field holds the address, per channel. Defaults: email→'email', sms/push→'phone'. */
  addressField: z.string().max(60).optional(),
  /** Which record field holds the per-recipient consent flag (must be truthy to send). */
  consentField: z.string().max(60).optional(),
  /** source:'literal' — explicit recipients (ops alerts). */
  recipients: z.array(z.string().max(200)).max(MESSAGING_LIMITS.literalRecipientsMax).default([]),
  /** Coarse segment gate (reuse). Fine per-recipient filtering via ruleEngine below. */
  segment: AudiencePackSchema.optional(),
  /** R2.1 rule-engine: per-recipient {object,attribute,operator,value} filter over record fields. */
  ruleEngine: RuleEnginePackSchema.optional(),
}).superRefine((a, ctx) => {
  if (a.source === 'data_store' && !a.storeKey)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['storeKey'], message: "source:'data_store' requires storeKey" });
  if (a.source === 'literal' && a.recipients.length === 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipients'], message: "source:'literal' requires ≥1 recipient" });
});
export type MessagingAudience = z.infer<typeof MessagingAudienceSchema>;

export const MessagingTriggerSchema = z.object({
  kind: z.enum(MESSAGING_TRIGGER_KINDS).default('broadcast'),
  /** kind:'event' — which live FlowRunnerService trigger fires this campaign. */
  event: z.enum(FLOW_AUTOMATION_TRIGGERS).optional(),
  /** kind:'back_in_stock' preset resolves to event=SHOPIFY_WEBHOOK_PRODUCT_UPDATED + inventory-cross guard. */
}).superRefine((t, ctx) => {
  if (t.kind === 'event' && !t.event)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['event'], message: "kind:'event' requires event" });
});

export const MessagingPackSchema = z.object({
  /** Primary channel of this campaign (drives the shipped-runtime gate). */
  channel: z.enum(MESSAGING_CHANNELS).default('email'),
  trigger: MessagingTriggerSchema.default({ kind: 'broadcast' }),
  audience: MessagingAudienceSchema,
  /** One template per channel (usually one). */
  templates: z.array(MessageTemplateSchema).min(1).max(MESSAGING_LIMITS.templatesMax),
  /** Per-run fan-out cap (safety; matches the engine's bounded posture). */
  batchSize: z.number().int().positive().max(MESSAGING_LIMITS.batchSizeMax).default(200),
  /** Global send guard — every send path checks this too (belt & suspenders). */
  respectConsent: z.boolean().default(true),
}).superRefine((m, ctx) => {
  // The chosen primary channel must have a template.
  if (!m.templates.some(t => t.channel === m.channel))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templates'], message: `no template for primary channel '${m.channel}'` });
});
export type MessagingPack = z.infer<typeof MessagingPackSchema>;

export const messagingPack: ControlPack<typeof MessagingPackSchema> = {
  id: 'messaging',
  namespace: 'messaging',
  label: 'Messaging Campaign',
  tier: 'basic',
  schema: MessagingPackSchema,
  uiSchema: {
    groupLabel: 'Messaging',
    order: ['channel', 'trigger', 'audience', 'templates', 'batchSize', 'respectConsent'],
    fields: {
      batchSize: { tier: 'advanced' },
      respectConsent: { tier: 'advanced', help: 'Skip recipients whose consent field is falsy.' },
    },
  },
};
```

### 2c. New recipe variant — `packages/core/src/recipe.ts`

Add to the `RecipeSpecSchema` discriminated union (after `customerAccount.blocks`,
`recipe.ts:583`). **Flat-pin the pack schema onto `config`** — same pattern the
`pricing`/`recommendation` packs use:

```ts
  Base.extend({
    type: z.literal('messaging.campaign'),
    category: z.literal('INTEGRATION').default('INTEGRATION'),
    requires: z.array(z.custom<Capability>()).default([]),
    // The messaging pack IS the config body (flat-pin, post-R2.4 substrate).
    config: MessagingPackSchema,
  }),
```

Import at top (`recipe.ts:8-14` block): `import { MessagingPackSchema } from './control-packs/packs/messaging.pack.js';`

### 2d. Example spec (a real back-in-stock campaign)

```json
{
  "name": "Back in Stock — Email Waitlist",
  "type": "messaging.campaign",
  "category": "INTEGRATION",
  "requires": [],
  "config": {
    "channel": "email",
    "trigger": { "kind": "back_in_stock" },
    "audience": {
      "source": "data_store",
      "storeKey": "backinstock_waitlist",
      "addressField": "email",
      "consentField": "emailConsent",
      "ruleEngine": {
        "enabled": true, "logic": "AND",
        "conditions": [{ "object": "record", "attribute": "product_ref", "operator": "equal_to", "value": "{{event.admin_graphql_api_id}}" }]
      }
    },
    "templates": [
      { "channel": "email", "subject": "{{record.product_title}} is back!",
        "body": "<p>Hi — {{record.product_title}} is available again. <a href=\"{{record.product_url}}\">Shop now</a>.</p>" }
    ],
    "batchSize": 200,
    "respectConsent": true
  }
}
```

A one-shot broadcast differs only in `trigger:{kind:'broadcast'}` and is fired by
the admin "Send now" action (§5) or a `SCHEDULED` cron entry.

---

## 3. Files to change

| # | File | Change |
|---|---|---|
| 1 | `packages/core/src/allowed-values.ts` | Add `MESSAGING_*` enums + limits (§2a); add `'messaging.campaign'` to `RECIPE_SPEC_TYPES` (`:714`); add rows to `MODULE_TYPE_TO_CATEGORY` (`:804`), `MODULE_TYPE_DEFAULT_REQUIRES` (`:829`), `MODULE_TYPE_TO_SURFACE` (`:854`), and `MODULE_TYPE_ORDER` (`:748`). |
| 2 | `packages/core/src/control-packs/packs/messaging.pack.ts` | **New.** `MessagingPackSchema` + `messagingPack` descriptor (§2b). |
| 3 | `packages/core/src/recipe.ts` | Import `MessagingPackSchema`; add the `messaging.campaign` union variant (§2c). |
| 4 | `packages/core/src/extension-eligibility.ts` | Add `REGISTRY['messaging.campaign']` entry (§5, `runtime:'app-proxy'`, `runtimeShipped:true` — the email runner IS shipped). Optionally add a `MESSAGING_CHANNELS_SHIPPED` re-export. |
| 5 | `packages/core/src/capability-graph.ts` | Ensure `getCapabilityNode('messaging.campaign')` resolves a surface (it derives from `MODULE_TYPE_TO_SURFACE`; confirm no hard-coded switch needs the new key — `capability-graph.ts:51`). |
| 6 | `apps/web/app/services/recipes/compiler/messaging.campaign.ts` | **New.** `compileMessagingCampaign(spec)` → `METAOBJECT_UPSERT` of the campaign config (§5). |
| 7 | `apps/web/app/services/recipes/compiler/index.ts` | Import + `case 'messaging.campaign': return compileMessagingCampaign(spec);` (`compiler/index.ts:20`). **Removes** the type from any bare-AUDIT fallthrough. |
| 8 | `apps/web/app/services/messaging/messaging-runner.service.ts` | **New.** `MessagingRunnerService` — resolves audience, iterates, calls `EmailConnector`/`SlackConnector`, records sends. The make-or-break runtime (§5). |
| 9 | `apps/web/app/services/flows/flow-runner.service.ts` | **No change to `flow.automation`.** New optional `SEND_CAMPAIGN` step kind is *not* added here — instead the messaging runner is a sibling invoked from the same three trigger sites (§5). (Alternative wiring in D2.) |
| 10 | `apps/web/app/routes/webhooks.tsx` | After the existing `runForTrigger` call (`webhooks.tsx:33`), also fan out published `messaging.campaign` modules for the same trigger via `MessagingRunnerService.runForTrigger` (§5). |
| 11 | `apps/web/app/routes/api.cron.tsx` | After the flow drain (`api.cron.tsx:86`), invoke `MessagingRunnerService.runForTrigger(..., 'SCHEDULED', …)` for scheduled broadcasts. |
| 12 | `apps/web/app/routes/api.messaging.send.tsx` | **New.** Admin "Send now" / "Send test" action → `MessagingRunnerService.runCampaignById` (mirrors `runFlowById`, PUBLISHED-guarded). |
| 13 | `apps/web/app/services/previews/preview.service.ts` | Add a deterministic `messagingCampaignPreview(spec)` (channel + audience summary + rendered template with sample merge vars) so the /generate canvas shows a real preview (§4). |
| 14 | `apps/web/app/routes/generate._index.tsx` | Ensure the builder lists `messaging.campaign` (it iterates `MODULE_TYPES_DISPLAY_ORDER`, so it appears automatically once registered) and that `SchemaForm`/`NonStorefrontSettingsForm` renders `config.messaging` scalars. |
| 15 | Tests (see §7) | New unit + integration specs. |

---

## 4. Generation wiring

The authoring path is the flat-pin builder, so most wiring is **automatic once
the type is registered**:

- **Type appears in the builder.** `generate._index.tsx` renders the type picker
  from `MODULE_TYPES_DISPLAY_ORDER`; adding the entry (change #1) surfaces
  `messaging.campaign` with no route change. The `NonStorefrontSettingsForm` /
  `GenConfigControls` path (the 027 always-on config form,
  `generate._index.tsx:1086-1130`) renders `config` scalars off `recipe.config`
  directly — messaging is a non-storefront type, so it uses exactly this path.
- **LLM generation.** The AI generates a `RecipeSpec`; the discriminated-union
  variant (change #3) constrains it. Because `config` **is** `MessagingPackSchema`,
  the existing Zod validation gate (`RecipeService.parse`,
  `recipe.service.ts:4-6`) enforces channel/template/audience integrity — no new
  validation code. Add 1-2 messaging exemplars to the intent examples / prompt so
  the classifier maps "email my back-in-stock list", "SMS abandoned-cart blast",
  "notify subscribers when X restocks" → `messaging.campaign` (grep
  `intent-examples.ts` for the pattern the pricing/recommendation packs used).
- **Preview (change #13).** `PreviewService` is deterministic (no AI preview HTML
  — do not resurrect `previewHtmlJson`). Add `messagingCampaignPreview`: renders
  a card showing channel badge, audience summary ("→ 3 recipients in
  `backinstock_waitlist` matching …"), the trigger, and the primary template with
  sample merge-var substitution. This posts through `/api/preview` and renders in
  the builder iframe like every other type (the 027 preview wiring).
- **Dev-MCP validation gate (R1.4), if landed:** messaging bodies are HTML/text,
  not GraphQL/Liquid, so the `validate_*` gate is a no-op here — Zod + design-QA
  remain the gate. No extra work.

---

## 5. Runtime / compile / render / publish wiring — **the make-or-break section**

This is where "build on what is real" is load-bearing. **There is no new delivery
engine.** We reuse the shipped `EmailConnector`/`SlackConnector` and the shipped
`DataStore` + the three live trigger sites.

### 5a. Compile (change #6, #7) — persist campaign config
`compileMessagingCampaign(spec)` returns a real op (not AUDIT):

```ts
export function compileMessagingCampaign(spec: MessagingCampaignSpec): CompileResult {
  return { ops: [{
    kind: 'METAOBJECT_UPSERT',
    type: 'superapp_messaging_campaign',
    handle: `messaging-${slug(spec.name)}`,
    fields: { config: JSON.stringify(spec.config) },  // the runner reads this back
  }] };
}
```

The runner does **not** actually need the metaobject (it reads the module's active
version `specJson`, exactly like `FlowRunnerService`). We still emit a real op so
`messaging.campaign` is **`deployable`, not false-published** — it satisfies the
"deployable ⇒ compiler emits a non-AUDIT op" invariant (R0.1). Register in
`extension-eligibility.ts`:

```ts
'messaging.campaign': {
  moduleType: 'messaging.campaign',
  runtime: 'app-proxy',        // runs server-side on the app, like integration.httpSync
  runtimeShipped: true,        // the EMAIL runner is shipped; SMS/push channels gate per-channel (below)
  requiredScopes: ['write_metaobjects'],
  note: 'Fans out email/slack to a subscriber list via the app server (EmailConnector/SlackConnector). SMS/push channels require their connectors before they can send.',
},
```

Per-channel shipped-ness (email/slack = shipped; sms/push = needs_runtime) is
**not** an eligibility-registry axis (registry is per-type). It is enforced at
**compile-time preflight and at runtime** via `MESSAGING_CHANNELS_SHIPPED`:
- Preflight: if `config.channel` ∉ `MESSAGING_CHANNELS_SHIPPED`, surface a
  `needs_runtime` note ("SMS delivery is not shipped yet") and block PUBLISH for
  that channel — same honest gate `admin.discountUi` uses, but scoped to the
  channel field, not the whole type.

### 5b. The runner (change #8) — `MessagingRunnerService`
Mirrors `FlowRunnerService` structure (job row, per-item retry, step logs). Core
loop:

```ts
async runForTrigger(shopDomain, admin, trigger, event) {
  const campaigns = await prisma.module.findMany({
    where: { shop: { shopDomain }, type: 'messaging.campaign', status: 'PUBLISHED', activeVersionId: { not: null } },
    include: { activeVersion: true },
  });
  for (const mod of campaigns) {
    const spec = new RecipeService().parse(mod.activeVersion.specJson);
    if (spec.type !== 'messaging.campaign') continue;
    const cfg = spec.config;
    // 1. Trigger match
    if (!triggerMatches(cfg.trigger, trigger, event)) continue;      // broadcast↔SCHEDULED/MANUAL; event↔cfg.trigger.event; back_in_stock↔inventory-cross guard
    // 2. Channel gate — refuse loudly, never fake
    if (!MESSAGING_CHANNELS_SHIPPED.includes(cfg.channel))
      throw new Error(`Messaging channel '${cfg.channel}' has no shipped runtime`);
    // 3. Resolve recipients
    const recipients = await resolveAudience(shopDomain, cfg.audience, cfg.channel, event); // §5c
    // 4. Fan out, bounded by batchSize, with consent + rule-engine filter
    const job = await jobs.create({ shopId, type: 'MESSAGING_RUN', payload: { moduleId: mod.id, trigger } });
    await jobs.start(job.id);
    let sent = 0, failed = 0;
    for (const r of recipients.slice(0, cfg.batchSize)) {
      if (cfg.respectConsent && cfg.audience.consentField && !truthy(r[cfg.audience.consentField])) continue;
      if (cfg.audience.ruleEngine && !evalRuleEngine(cfg.audience.ruleEngine, { record: r, event })) continue;
      try { await sendOne(shopDomain, cfg, r, event); sent++; }        // §5d
      catch (e) { failed++; await writeMessagingLog(job.id, r, 'FAILED', e); }
    }
    await jobs.succeed(job.id, { sent, failed, total: recipients.length });
  }
}
```

Fan-out is **bounded per run** (`batchSize`, cap 500) — this is the honest scope
line: a 50k-contact blast needs the durable scheduler (M6) to page across runs;
here one run sends up to `batchSize` and a `SCHEDULED` re-fire sends the next page
(offset persisted on the job). Cross-run paging is a **follow-up** (§8), not
faked — the first cut sends the first batch and records `total` so the gap is
visible, never silently truncated-as-success.

### 5c. Audience resolution (`resolveAudience`)
- `source:'data_store'` → `DataStoreService.listRecords(shopId, storeKey, {limit:batchSize, offset})`
  (`data-store.service.ts:248`). Each record's payload provides `addressField`
  (default `email`→'email', sms/push→'phone') and `consentField`. **This is the
  live capture→persist→fan-out spine** (Appikon/Klaviyo) — `WRITE_TO_STORE`
  already populates these lists (`flow-runner.service.ts:359-390`).
- `source:'event_recipient'` → pull the address off the triggering event
  (`event.customer.email`, `event.email`, or the back-in-stock subscriber record)
  via `readPath` (reuse the existing helper, `flow-runner.service.ts:457`).
- `source:'literal'` → `cfg.audience.recipients` (ops alerts; ≤50).

### 5d. `sendOne` — the ONLY delivery path (real connectors)
```ts
if (channel === 'email' || channel === 'slack') {
  const connector = getConnector(channel);                 // connectors/index.ts:12/11
  if (!connector) throw new Error(`${channel} connector not registered`);
  const tmpl = cfg.templates.find(t => t.channel === channel)!;
  const body = renderMergeVars(tmpl.body, { record: r, event });   // reuse {{dot.path}} substitution from WRITE_TO_STORE titleExpr (flow-runner.service.ts:374)
  const result = channel === 'email'
    ? await connector.invoke({ type:'api_key', apiKey: process.env.EMAIL_API_KEY ?? '' },
        { operation:'send', inputs:{ to:r[addressField], subject:renderMergeVars(tmpl.subject, ctx), body }, /* runId,stepId,tenantId,timeoutMs */ })
    : await connector.invoke({ type:'none' },
        { operation:'webhook.send', inputs:{ webhookUrl: cfg.audience.recipients[0] ?? process.env.SLACK_WEBHOOK_URL, text: body }, /* … */ });
  if (!result.ok) throw new Error(`${channel} send failed: ${result.message}`);
}
// sms / push: unreachable — the §5b channel gate already threw. No stub, no fake.
```
This is **byte-for-byte the same connector call** the live
`SEND_EMAIL_NOTIFICATION` step makes (`flow-runner.service.ts:301-319`) — we are
adding fan-out + audience resolution around a proven send, not a new engine.

### 5e. Trigger wiring (changes #10, #11, #12) — sibling to the flow runner
The messaging runner rides the **same three live sites**, invoked right after the
flow runner so both react to one event:
- **webhook** (`webhooks.tsx:33`): `await new MessagingRunnerService().runForTrigger(shop, admin, trigger, payload)`.
- **cron** (`api.cron.tsx:86`): after the flow drain, one pass for `SCHEDULED`
  broadcasts (paged by `batchSize`).
- **admin "Send now" / "Send test"** (`api.messaging.send.tsx`, new):
  `runCampaignById(shopDomain, admin, moduleId, event)` — PUBLISHED-guarded like
  `runFlowById` (`:154`); "Send test" forces `source:'literal'` with the caller's
  address and `batchSize:1`.

**No change to `flow.automation`** — it keeps its exact behavior. Messaging is a
*peer* effect on the same triggers, not a new flow step. (D2 weighs the
alternative.)

### 5f. Render / publish
`PublishService` already walks `compileRecipe` → ops → deploy. The
`METAOBJECT_UPSERT` op (5a) deploys through the existing metaobject path with no
new publish code. Storefront render: **none** — messaging has no storefront
surface (it is server-side fan-out). The subscriber-capture UI (the "Notify me"
form) is a **separate `theme.section`** module a merchant composes alongside; the
composite that binds capture-form + waitlist-store + messaging.campaign is a
**Phase-4 composite manifest (R3.1)**, out of scope here but the shared record is
the DataStore `storeKey` both sides name.

---

## 6. Back-compat

- **Additive type.** New discriminated-union variant + new enum values +
  new-file pack + new-file runner. No existing recipe, compiler case, or runner
  changes shape. Every `Record<ModuleType,…>` map gets one new key (compiler will
  flag any missed one via `never` exhaustiveness — a feature, not a break).
- **`flow.automation` untouched.** Its schema, steps, runner, and the
  `SEND_EMAIL_NOTIFICATION`/`SEND_SLACK_MESSAGE` step kinds are unchanged.
  Merchants with existing "send email" flows keep working byte-identically.
- **Optional everywhere it plugs into shared packs.** `audience`/`ruleEngine`
  reuse the existing `.optional()` packs — omitting them validates.
- **Eligibility audit.** Adding the registry row keeps
  `listExtensionEligibility()` total-over-`RECIPE_SPEC_TYPES` (the audit test that
  encodes "N types" must bump N — expected, and the test is the contract).
- **Channel gate is forward-compatible.** When the SMS/push connectors ship, flip
  them into `MESSAGING_CHANNELS_SHIPPED` — no schema or runner change; the gate
  simply stops throwing.

---

## 7. Test plan

**Core / packages (`packages/core`):**
1. `messaging.pack.test.ts` — schema: valid broadcast/email; valid back-in-stock;
   rejects `channel:'email'` template with no subject; rejects `source:'data_store'`
   without `storeKey`; rejects primary channel with no matching template;
   `literal` requires ≥1 recipient.
2. `recipe.messaging.test.ts` — `RecipeSpecSchema.parse` round-trips the §2d
   example; rejects a bad channel enum; other 21 types still parse (regression).
3. `extension-eligibility.messaging.test.ts` — `getExtensionEligibility('messaging.campaign')`
   returns `runtime:'app-proxy'`, `runtimeShipped:true`; `listExtensionEligibility()`
   length == new total; **assert compiler emits a non-AUDIT op** (the R0.1
   deployable⇒non-AUDIT invariant).

**Compiler (`apps/web`):**
4. `compiler.messaging.campaign.test.ts` — emits one `METAOBJECT_UPSERT` with the
   serialized config; **no AUDIT op**; `compiler/index.ts` has an explicit case
   (no bare-AUDIT fallthrough).

**Runner (the make-or-break — `apps/web`):**
5. `messaging-runner.trigger.test.ts` — `triggerMatches`: broadcast↔SCHEDULED/MANUAL;
   event↔configured event; back_in_stock↔inventory-cross on product/update;
   non-matching trigger → campaign skipped.
6. `messaging-runner.fanout.test.ts` (mock `EmailConnector`) — resolves N
   DataStore records → N `connector.invoke` calls with correct `to`/`subject`/`body`
   (merge vars substituted); `respectConsent` skips falsy-consent records;
   `ruleEngine` filters; `batchSize` caps the run and records `total` (paging gap
   visible, not truncated-as-success).
7. `messaging-runner.channel-gate.test.ts` — `channel:'sms'` **throws** ("no
   shipped runtime"); asserts **no connector.invoke call** (never fakes a send).
8. `messaging-runner.errors.test.ts` — connector `{ok:false}` → per-recipient
   FAILED log, run continues, `failed` count correct; missing `EMAIL_API_KEY`
   fails loudly (matches `SEND_EMAIL_NOTIFICATION` behavior).
9. `api.messaging.send.test.ts` — "Send now" PUBLISHED-guard (throws on DRAFT,
   like `runFlowById`); "Send test" forces literal single-recipient.

**Preview:** `preview.messaging.test.ts` — `messagingCampaignPreview` renders
channel + audience summary + template with sample merge vars deterministically.

---

## 8. Risks + DECISIONS the human must make

### Decisions
- **D1 — Category: reuse `INTEGRATION` vs. new `MESSAGING` category.**
  Recommend **reuse `INTEGRATION`** (additive; avoids touching every
  `Record<ModuleCategory,…>` exhaustiveness site and the `MODULE_CATEGORIES` enum
  consumers). Downside: messaging shows under "Integration" in category filters. A
  new category is cleaner taxonomically but a wider blast radius. *Human picks.*
- **D2 — Runner wiring: sibling `MessagingRunnerService` (recommended) vs. a new
  `SEND_CAMPAIGN` step kind inside `flow.automation`.** Sibling keeps messaging a
  first-class type (the whole point of R3.4) and keeps `flow.automation`
  untouched, at the cost of a second `runForTrigger` pass at each trigger site (3
  edits). A `SEND_CAMPAIGN` step would reuse the flow runner's loop but re-buries
  messaging inside flow (the exact anti-pattern we're removing) and mutates the
  live flow schema. **Recommend sibling.** *Human confirms.*
- **D3 — SMS/push scope.** Ship the **vocabulary** for `sms`/`push` now
  (schema accepts them, gated `needs_runtime`) so recipes are forward-compatible,
  OR omit them from the enum until connectors exist. Recommend **model-now,
  gate-now** — it lets the AI generate correct SMS specs today that light up the
  moment a Twilio/web-push connector lands, with zero schema migration. The risk
  is a merchant authoring an SMS campaign that won't send until the connector
  ships; the channel gate + `needs_runtime` note makes that honest, not silent.

### Risks
- **BIGGEST RISK — unbounded/duplicate fan-out and cross-run paging.** The honest
  runtime sends **one bounded batch per run** (`batchSize` ≤ 500). A large list
  needs cross-run paging, which depends on a durable offset + re-fire — i.e. the
  **M6 durable scheduler that does not exist** (`resumeDueWorkflowRuns` is a
  comment, `workflow-engine.service.ts:426`; `api.cron.tsx` has no resume sweep).
  First cut: send the first batch, persist `total` + `offset` on the job so the
  shortfall is **visible, not truncated-as-success**, and re-fire via `SCHEDULED`.
  Full paging + idempotency (don't re-send to already-notified recipients — track
  a `sent` marker on the subscriber record, mirroring Appikon's `status:notified`)
  is an **explicit follow-up**, wired to M6. **Do not claim "sends to your whole
  list" until paging + dedupe land.** This is the make-or-break honesty line.
- **Deliverability / auth is out of our hands.** Real sends require
  `EMAIL_API_KEY` (SendGrid) configured per-deploy; without it the runner throws
  (correct — never fakes). SPF/DKIM/from-domain verification is the merchant's;
  document it, don't hide failures.
- **Consent is enforced by our filter, but compliance is broader.** We skip
  falsy-consent recipients (`respectConsent`), but marketing-consent law
  (double-opt-in, unsubscribe links, GDPR/TCPA) is not modeled. Add an
  unsubscribe merge-var + a consent-source field as a fast-follow; flag that the
  first cut is transactional/ops-safe but not a compliant marketing blaster.
- **PII in step logs.** `writeMessagingLog` must **not** dump full recipient
  addresses/bodies into `FlowStepLog`-style rows at scale (the flow logger caps
  output at 10k chars, `flow-runner.service.ts:417`). Log counts + hashed/masked
  addresses, not raw PII.

---

## Appendix — why this is "build on what is real"
The entire delivery path already runs in production: `EmailConnector.invoke`
(`email.connector.ts`), reachable today via `SEND_EMAIL_NOTIFICATION`
(`flow-runner.service.ts:301`). The capture→persist spine already runs:
`WRITE_TO_STORE` → `DataStoreService.createRecord` → `listRecords`. The three
trigger sites already fire: webhook, cron, run-now. This spec adds **exactly one
new idea — bounded fan-out over a resolved audience — and one new type to name
it**, reusing every real part and gating (never faking) the parts that aren't
shipped (SMS/push, cross-run paging).
