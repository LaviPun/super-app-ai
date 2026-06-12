# Research: Phase 18 — Deployment Infrastructure

**Template:** Phase 12 [`research.md`](../012-storage-image-worker/research.md)
**Hosting policy:** [ADR-002](../../docs/gitbook/02-architecture/v2-migration/ADR-002-cloudflare-v2-hosting.md)

## Decision: Cloudflare-primary, scoped Railway exceptions (reconciles SC-M5/SC-004)

**Rationale:** V2 platform targets Cloudflare Workers (API + queue consumers), Pages (frontend), R2 (assets), and Queues (async). Railway/Docker is **retained, by policy** for (a) the optional Fastify alternate backend (`PLATFORM_BACKEND=fastify`) and (b) the internal AI router — neither is V2-platform residue. This retracts the earlier "zero Railway artifacts" claim that made SC-M5/SC-004 false; the criterion is now "scoped exceptions only", which the repo satisfies.

**Alternatives considered:**

- Delete all Railway/Docker configs — rejected (removes a working fallback + the internal router; destructive, needs operator approval).
- Keep ADR-001 Railway-primary — rejected (CF parity shipped; ADR-001 hosting table superseded by ADR-002).

## Decision: Guarded CI deploy, secrets-gated

**Rationale:** `.github/workflows/v2-cloudflare-deploy.yml` is manual-dispatch only and no-ops unless `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets are set, so it can never deploy unexpectedly. Resource creation is scripted (`scripts/cloudflare-setup.sh`); only one-time `wrangler login` + secrets are operator steps.

## Open items

- [ ] Operator: provision R2 bucket + 7 Queues + KV, set secrets.
- [ ] Signed-URL proxy for R2 reads (next iteration).
