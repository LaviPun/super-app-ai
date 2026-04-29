# Module Settings Modernization Guide

This document defines the minimum advanced settings expected for recipes/templates so module flows are production-usable, not basic demos.

## Scope

- Canonical module types are from `packages/core/src/allowed-values.ts` (`RECIPE_SPEC_TYPES`).
- Template defaults are enriched centrally in `packages/core/src/templates.ts`.
- Flow safety and data-access expectations align with `packages/core/src/workflow-templates.ts`.

## Required Advanced Settings by Module Type

### Storefront UI

- `theme.popup`
  - Trigger + pacing: `trigger`, `delaySeconds`, `frequency`, `maxShowsPerDay`.
  - Targeting: `showOnPages`, `customPageUrls`.
  - UX controls: `showCloseButton`, `autoCloseSeconds`.
  - Conversion controls: `ctaText`, `ctaUrl`, `secondaryCtaText`, `secondaryCtaUrl`.
  - Urgency controls: `countdownEnabled`, `countdownSeconds`, `countdownLabel`.
- `theme.banner`
  - Message hierarchy: `heading`, `subheading`.
  - Action path: `ctaText`, `ctaUrl`.
  - Motion control: `enableAnimation` (must remain optional/off by default).
- `theme.notificationBar`
  - Message + action: `message`, `linkText`, `linkUrl`.
  - Dismiss behavior: `dismissible`.
- `theme.floatingWidget`
  - Surface behavior: `variant`, `onClick`, `url`, `message`.
  - Placement: `anchor`, `offsetX`, `offsetY`.
  - Device targeting: `hideOnMobile`, `hideOnDesktop`.
- `proxy.widget`
  - Widget identity: `widgetId`, `mode`.
  - Render payload: `title`, `message`.
  - Must define app-proxy route ownership and response mode contract.

### Checkout / Post-Purchase / Customer Account UI

- `checkout.block`
  - Placement target: `target` (must be valid extension point).
  - Display contract: `title`, `message`.
  - Optional commerce bind: `productVariantGid` when block depends on a concrete variant.
- `checkout.upsell`
  - Offer payload: `offerTitle`, `productVariantGid`, `discountPercent`.
  - Must include an explicit variant GID in production.
- `postPurchase.offer`
  - Offer payload: `offerTitle`, optional `productVariantGid`, `message`.
  - Must specify whether offer is informational only or add-to-order capable.
- `customerAccount.blocks`
  - Placement + audience: `target`, `b2bOnly`.
  - Structured content: `blocks` with `kind` (`TEXT`, `LINK`, `BADGE`, `DIVIDER`) and optional `tone`.
  - Links must point to resolvable internal/external destinations.

### Functions

- `functions.discountRules`
  - Rule stack with explicit conditions (`customerTags`, `minSubtotal`, `skuIn`) and actions (`percentageOff`, `fixedAmountOff`).
  - Stacking behavior: `combineWithOtherDiscounts`.
- `functions.deliveryCustomization`
  - Rule conditions (`countryCodeIn`, `minSubtotal`) + actions (`hideMethodsContaining`, `renameMethod`, `reorderPriority`).
  - Priority ordering should always be explicit where multiple rules exist.
- `functions.paymentCustomization`
  - Rule conditions (`minSubtotal`, `currencyIn`) + actions (`hideMethodsContaining`, `renameMethod`, `reorderPriority`, `requireReview`).
  - Review-gated flows should set `requireReview` intentionally.
- `functions.cartAndCheckoutValidation`
  - Condition controls (`maxQuantityPerSku`, `blockCountryCodes`) and user-safe `errorMessage`.
- `functions.cartTransform`
  - Transform strategy: `mode`, `bundles`.
  - Non-Plus fallback contract: `fallbackTheme.enabled`, `fallbackTheme.notificationMessage`.
- `functions.fulfillmentConstraints`
  - Fulfillment grouping contract via `shipAlone` or `groupWithTag`.
- `functions.orderRoutingLocationRule`
  - Routing conditions (`inventoryLocationIds`, `countryCode`) + actions (`preferLocationId`, `priority`).

### Integrations / Analytics / Flow

- `analytics.pixel`
  - Event coverage: `events`.
  - Mapping quality: `mapping` should include at least module/shop correlation fields.
- `integration.httpSync`
  - Connectivity: `connectorId`, `endpointPath`, `trigger`.
  - Payload contract: `payloadMapping` must include event/shop identifiers.
- `flow.automation`
  - Trigger contract: `trigger`.
  - Step-level contracts:
    - `HTTP_REQUEST`/`SEND_HTTP_REQUEST` need method/body/header/auth defaults.
    - `WRITE_TO_STORE` needs stable `storeKey` and typed payload mapping.
    - Notifications/tags need explicit destination values.
  - Conditional branches (`CONDITION`) should define clear `thenSteps` / `elseSteps` where used.

### Admin / POS / Blueprint

- `admin.block` and `admin.action`
  - Must use valid admin targets and merchant-meaningful labels/titles.
- `pos.extension`
  - Must define valid POS target and `blockKind` where needed.
- `platform.extensionBlueprint`
  - Must declare `surface`, implementation `goal`, and concrete `suggestedFiles`.

## Popup-Specific Accuracy Checklist

Use this checklist for all popup recipes/templates:

- Trigger is intentional (`ON_LOAD`, `ON_EXIT_INTENT`, `ON_SCROLL_*`, `TIMED`, etc.).
- Frequency caps exist (`frequency`, `maxShowsPerDay`) to prevent spam.
- Page targeting is explicit (`showOnPages` + `customPageUrls` when `CUSTOM`).
- Exit path exists (`showCloseButton` or timed close).
- CTA strategy includes primary CTA and an optional secondary dismiss action.
- Countdown is either fully configured or fully disabled.

## Contact Form: Recommended Module Pack (Current System)

There is no dedicated `theme.contactForm` module type yet. Use this production-safe pack:

1. UI capture: `proxy.widget` (`widgetId: contact-form`, mode `HTML`) for the form front-end.
2. Persistence: `flow.automation` with `WRITE_TO_STORE` to save normalized submissions.
3. External sync (optional): `integration.httpSync` to CRM/helpdesk endpoint.
4. Notifications: `flow.automation` step `SEND_EMAIL_NOTIFICATION` or `SEND_SLACK_MESSAGE`.
5. Admin visibility: `admin.block` to surface status/links for support teams.

### Contact Form Data Access & Storage

- Primary store path: SuperApp data store via `WRITE_TO_STORE.storeKey` (for example `contact-submissions`).
- External destination: connector-based endpoint via `integration.httpSync`.
- Recommended persisted fields:
  - `submissionId`, `shopId`, `customerId` (if known), `name`, `email`, `phone`, `topic`, `message`, `sourcePage`, `submittedAt`, `consent`.
- Retrieval path:
  - Merchant/internal UI reads from SuperApp store records.
  - Optional mirrored records in external CRM/helpdesk.

## Modernization Status

- Applied: centralized template modernization layer in `packages/core/src/templates.ts`.
- Outcome: all template entries now inherit advanced defaults per module type without duplicating logic across 4 template source files.
- Verification target: template integrity tests + schema validation must continue passing for all template specs.
