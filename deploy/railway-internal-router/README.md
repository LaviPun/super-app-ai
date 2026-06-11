# Railway — reference internal AI router

Deploys the Node reference router from [`apps/web/scripts/internal-ai-router.ts`](../../apps/web/scripts/internal-ai-router.ts) via [`apps/web/Dockerfile.internal-router`](../../apps/web/Dockerfile.internal-router) and [`apps/web/railway.internal-router.toml`](../../apps/web/railway.internal-router.toml).

This is the **sole self-hosted production path** for the internal AI router in this repo (no Kubernetes manifests).

## What this is (vs Remix env vars)

| Concern | Where |
|--------|--------|
| **Router** `POST /route`, `GET /healthz`, Ollama passthrough `GET /api/tags`, `POST /api/chat`, OpenAI-compatible passthrough `POST /v1/chat/completions` (and `POST /chat/completions`) | This service listens on **8787** (Railway injects `PORT`; set `ROUTER_PORT` to match). Peers: Ollama (`ROUTER_OLLAMA_BASE_URL`) and OpenAI-compatible chat (`ROUTER_OPENAI_BASE_URL`, `ROUTER_OPENAI_API_KEY`). |
| **`INTERNAL_AI_ROUTER_URL` in the Remix app** | HTTPS origin of this Railway service — or the **Modal proxy** [`deploy/modal-qwen-router`](../modal-qwen-router/README.md) whose upstream is this router. Used for **prompt routing**, not merchant storefront code. |
| **Internal AI Assistant “cloud” chat** | Configured in **`/internal/model-setup`** as **`modalRemote.url`** — must be a **chat inference** base URL (see [`docs/internal-admin.md`](../../docs/internal-admin.md)). Not the mock upstream app. |

## One-time migration from Kubernetes

If you previously ran `kubectl apply -k deploy/internal-ai-router`, that directory has been removed. Before deleting the cluster resources:

1. Note values from your live `ConfigMap` / `Secret` (`INTERNAL_AI_ROUTER_TOKEN`, `ROUTER_OLLAMA_*`, `ROUTER_OPENAI_*`).
2. Create the Railway service below and set the same env vars in the Railway dashboard.
3. Update Remix `INTERNAL_AI_ROUTER_URL` and Modal `INTERNAL_ROUTER_UPSTREAM_URL` to the new Railway HTTPS URL.
4. Verify `GET /healthz` and a sample `POST /route` before tearing down the old Deployment.

## Railway service setup

1. In the **same Railway project** as API/workers, add a **new service**.
2. Set **Root Directory** to the **repository root** (monorepo).
3. In service settings, point the builder at [`apps/web/railway.internal-router.toml`](../../apps/web/railway.internal-router.toml) (Dockerfile builder → `apps/web/Dockerfile.internal-router`).
4. Expose port **8787** if Railway asks for a target port; the Dockerfile `EXPOSE 8787` and `ROUTER_PORT` should align with Railway’s injected `PORT` when applicable.
5. Enable health check: **`GET /healthz`** (configured in `railway.internal-router.toml`).

### Required environment variables

| Variable | Purpose |
| -------- | ------- |
| `INTERNAL_AI_ROUTER_TOKEN` | Bearer auth for `/route` and passthrough paths (**secret**) |
| `ROUTER_BACKEND` | `ollama` or `openai` |
| `ROUTER_OLLAMA_BASE_URL` | Ollama/vLLM origin for `/route` + Ollama passthrough |
| `ROUTER_OLLAMA_MODEL` | e.g. `qwen3:4b-instruct` |
| `ROUTER_OPENAI_BASE_URL` | OpenAI-compatible backend (optional) |
| `ROUTER_OPENAI_MODEL` | Model id on that backend (optional) |
| `ROUTER_OPENAI_API_KEY` | Bearer key for OpenAI-compatible backend (**secret**, optional) |
| `ROUTER_HOST` | `0.0.0.0` |
| `ROUTER_PORT` | Optional. Defaults to Railway-injected `PORT` when unset, else `8787` |

See [`env.example`](env.example) for optional tunables (timeouts, rate limits, body size).

### Remix app wiring

In `apps/web/.env` (or your Remix host’s secret store):

```bash
INTERNAL_AI_ROUTER_URL=https://<your-railway-router-service>.up.railway.app
INTERNAL_AI_ROUTER_TOKEN=<same token as Railway service>
```

Use Railway’s generated HTTPS domain or a custom domain. Production Remix and Modal upstreams should use **HTTPS**.

### Modal upstream wiring

Deploy the optional proxy per [`deploy/modal-qwen-router/README.md`](../modal-qwen-router/README.md), then set Modal secret **`INTERNAL_ROUTER_UPSTREAM_URL`** to this Railway service’s **HTTPS** URL (not the mock app). The proxy forwards `POST /route` and `GET /healthz` only.

## Verify

```bash
curl -s https://<your-railway-router>/healthz
# expect: {"ok":true,"service":"internal-ai-router",...}

curl -s -X POST https://<your-railway-router>/route \
  -H "Authorization: Bearer $INTERNAL_AI_ROUTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"shopDomain":"test.myshopify.com","userPrompt":"hello","moduleType":"banner"}'
```

In Internal Admin: **Setup the Model** → validate targets; **AI Assistant** → send a message with local/cloud targets as configured.

## Local development

```bash
pnpm --filter web router:internal
# or
pnpm --filter web dev:internal   # Remix :4000 + router :8787
```

## Qwen3 defaults

Example defaults match [`env.example`](env.example): **`ROUTER_OLLAMA_MODEL=qwen3:4b-instruct`** and OpenAI-compatible **`Qwen/Qwen3-4B-Instruct`**; align with the inference images you actually run (RunPod, Fly, external Ollama, etc.). Railway hosts the **router container only**, not GPU inference.
