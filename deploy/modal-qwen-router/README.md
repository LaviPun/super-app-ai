# Modal — internal AI router edge

This folder hosts an optional **Modal** deployment that fronts your internal prompt router with a managed HTTPS endpoint and autoscaling workers.

The shipped [`modal_app.py`](modal_app.py) is intentionally minimal: it proxies `POST /route` and `GET /healthz` to an upstream service that implements the same API as [`apps/web/scripts/internal-ai-router.ts`](../../apps/web/scripts/internal-ai-router.ts).

## Why proxy instead of GPU inference here?

Running **Qwen3-class** models efficiently usually means **vLLM**, **llama.cpp**, or **Ollama** on GPU elsewhere (Fly Machines, Kubernetes, Modal GPU containers, RunPod). The reference router stays a small HTTP service that calls an OpenAI-compatible inference URL (`ROUTER_OPENAI_BASE_URL`, `ROUTER_BACKEND=openai`). This Modal app scales **HTTP ingress** while inference stays pinned to whatever backend you operate.

To colocate inference on Modal, deploy vLLM (or similar) separately and point `ROUTER_OPENAI_BASE_URL` at that endpoint from your upstream Node router container.

## Prerequisites

- [Modal](https://modal.com) account
- Local Python 3.10+ environment

Install and authenticate exactly once:

```bash
./setup_modal.sh
source .venv/bin/activate
python3 -m modal setup
```

`modal setup` opens your browser and creates your API token locally.
If you prefer token flow directly, use `modal token new`.

## First app sanity check

Before deploying the router proxy, verify your Modal account works:

```bash
cd deploy/modal-qwen-router
source .venv/bin/activate
modal run get_started.py
```

Expected output includes `the square is 1764`.

## Secrets

Create a Modal Secret **`superapp-internal-ai-router`**:

| Key | Description |
|-----|-------------|
| `INTERNAL_ROUTER_UPSTREAM_URL` | Base URL of the upstream router (no trailing slash). |
| `INTERNAL_AI_ROUTER_TOKEN` | Bearer token required by `/route` on the Modal proxy and forwarded upstream. |

Optional:

| Key | Description |
|-----|-------------|
| `ROUTER_PROXY_TIMEOUT_S` | Seconds before upstream timeout (default `60`). |

Create/update the secret from the example file:

```bash
cd deploy/modal-qwen-router
# edit modal-secret.env.example with real values first
modal secret create superapp-internal-ai-router \
  INTERNAL_ROUTER_UPSTREAM_URL="$(awk -F= '/^INTERNAL_ROUTER_UPSTREAM_URL=/{print $2}' modal-secret.env.example)" \
  INTERNAL_AI_ROUTER_TOKEN="$(awk -F= '/^INTERNAL_AI_ROUTER_TOKEN=/{print $2}' modal-secret.env.example)" \
  ROUTER_PROXY_TIMEOUT_S="$(awk -F= '/^ROUTER_PROXY_TIMEOUT_S=/{print $2}' modal-secret.env.example)"
```

Health behavior:
- `GET /healthz` now checks upstream `GET /healthz` and returns `503` when upstream is missing, unhealthy, or unreachable.
- Use this endpoint for platform probes so edge health reflects real routing readiness.

## Deploy

```bash
cd deploy/modal-qwen-router
modal deploy modal_app.py
```

Note the HTTPS URL Modal prints for the ASGI app. Set **`INTERNAL_AI_ROUTER_URL`** in the Remix app to that origin (same token scheme as documented in the root [`README.md`](../../README.md)).

## Resource envelopes (Qwen3 first-layer)

For **Qwen3-4B-class** routing workloads (classification-sized JSON outputs):

| Surface | Rough envelope |
|---------|----------------|
| VRAM | ~4–8 GB FP16-capable GPU class for comfortable headroom at small batch |
| CPU router proxy | Minimal (this Modal proxy or Node reference service) |

Tune model throughput with your inference server’s `--max-num-seqs` / batch settings rather than enlarging the proxy layer.
