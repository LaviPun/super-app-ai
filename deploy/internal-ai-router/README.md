# Kubernetes — reference internal AI router

Deploys the Node reference router from [`apps/web/scripts/internal-ai-router.ts`](../../apps/web/scripts/internal-ai-router.ts) via [`Dockerfile.internal-router`](../../apps/web/Dockerfile.internal-router).

## What this is (vs Remix env vars)

| Concern | Where |
|--------|--------|
| **Router** `POST /route`, `GET /healthz`, Ollama passthrough `GET /api/tags`, `POST /api/chat`, OpenAI-compatible passthrough `POST /v1/chat/completions` (and `POST /chat/completions`) | This Deployment listens on **8787**. Peer services: Ollama (`ROUTER_OLLAMA_BASE_URL`) and OpenAI-compatible chat (`ROUTER_OPENAI_BASE_URL`, `ROUTER_OPENAI_API_KEY`) for internal assistant `qwen3` when the base URL is this router. |
| **`INTERNAL_AI_ROUTER_URL` in the Remix app** | Points at **ingress you expose** to this Service — or at the **Modal proxy** [`deploy/modal-qwen-router`](../modal-qwen-router/README.md) whose upstream is this router. Used for **prompt routing**, not merchant storefront code. |
| **Internal AI Assistant “cloud” chat** | Configured in **`/internal/model-setup`** as **`modalRemote.url`** — must be a **chat inference** base URL (see [`docs/internal-admin.md`](../../docs/internal-admin.md)). Not the mock upstream app. |

## Deploy checklist

1. Build and push the image from `apps/web` (replace registry/org/tag):

   ```bash
   docker build -f Dockerfile.internal-router -t ghcr.io/your-org/ai-shopify-superapp-internal-router:latest .
   docker push ghcr.io/your-org/ai-shopify-superapp-internal-router:latest
   ```

2. Edit [`deployment.yaml`](deployment.yaml) `image:` and ensure [`configmap.yaml`](configmap.yaml) matches your cluster Ollama/vLLM service DNS (`ROUTER_OLLAMA_BASE_URL`, `ROUTER_OPENAI_*`).

3. Create real secrets from [`secret.template.yaml`](secret.template.yaml) (do not commit tokens): `INTERNAL_AI_ROUTER_TOKEN`, optional `ROUTER_OPENAI_API_KEY`.

4. Apply:

   ```bash
   kubectl apply -k deploy/internal-ai-router
   ```

5. Verify:

   ```bash
   kubectl -n internal-ai-router port-forward svc/internal-ai-router 8787:8787
   curl -s http://127.0.0.1:8787/healthz
   ```

6. Point **Modal proxy** secret **`INTERNAL_ROUTER_UPSTREAM_URL`** at this router’s stable HTTPS or in-cluster URL so [`modal_app.py`](../modal-qwen-router/modal_app.py) health-checks and forwards `/route` correctly.

## Qwen3 defaults

[`configmap.yaml`](configmap.yaml) uses **`ROUTER_OLLAMA_MODEL=qwen3:4b-instruct`** and OpenAI-compatible **`Qwen/Qwen3-4B-Instruct`** as examples; align with images you actually run in-cluster.
