# Phase 17 — Security And Compliance (local)

## Scope shipped in this branch

| Area | Implementation | Local verification |
| --- | --- | --- |
| SSRF | `@superapp/network-security` `assertSafeTargetUrl` + connector allowlists | `packages/network-security` vitest |
| Signing | `verifyShopifyWebhookHmac` / `signShopifyWebhookBody` | `signing.test.ts` |
| Redaction | `redactString`, `redactValue`, `redactHeaders` | `redact.test.ts` |
| GDPR boundaries | `SHOPIFY_GDPR_COMPLIANCE_TOPICS`, `assertGdprWebhookIngress` | `gdpr.test.ts` + API plugin |
| API security plugin | HMAC on `/v1/webhooks/shopify`, SSRF on connector enqueue, rate-limit stub, baseline response headers (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) | `security.plugin.test.ts` |
| Package alias | `packages/security` → re-exports `@superapp/network-security` | build |

## Compliance checklist (addressable locally)

- [x] SSRF blocks metadata, link-local, private IPs, non-http(s), credentials-in-URL
- [x] Connector path overrides validated at API enqueue boundary
- [x] Webhook HMAC verified when `SHOPIFY_API_SECRET` is set (header or legacy body field)
- [x] GDPR compliance topics require `shopDomain` + `eventId` at ingress
- [x] Log/event redaction helpers for tokens, emails, sensitive keys
- [x] In-memory rate limit stub (`API_RATE_LIMIT_MAX`, `API_RATE_LIMIT_WINDOW_MS`)
- [ ] Secrets encryption at rest (env-only in this phase; no KMS)
- [ ] Offline tokens server-side only (Remix `apps/web` — not migrated here)
- [ ] AI deployable raw code gate (Phase 14 Recipe DSL — separate)
- [ ] Preview sandbox script blocking (Phase 13 — separate)
- [ ] App Store review automation (manual checklist update only)

## Environment variables (API)

| Variable | Purpose |
| --- | --- |
| `SHOPIFY_API_SECRET` | When set, webhook ingress requires valid HMAC |
| `API_RATE_LIMIT_MAX` | `0` = disabled; otherwise max requests per client per window |
| `API_RATE_LIMIT_WINDOW_MS` | Sliding window for rate limit stub (default 60000) |

## Commands

```bash
pnpm --filter @superapp/network-security test
pnpm --filter @superapp/api test
```

## Merge risks

- Shared `packages/network-security` exports may conflict with Phase 10 connector work.
- `apps/api/src/plugins/security.ts` overlaps with any parallel API hardening branches.
- Rate limiter is process-local; production needs Redis-backed limits (Phase 18+).
