"""Modal edge deployment for the internal prompt router.

Thin HTTPS proxy: forwards ``POST /route`` to an upstream router service (typically the Node
reference implementation or any compatible ``/route`` implementation).

Deploy::

    cd deploy/modal-qwen-router
    modal deploy modal_app.py

Create a Modal Secret named ``superapp-internal-ai-router`` with at least:

- ``INTERNAL_ROUTER_UPSTREAM_URL`` — base URL of the upstream router (no trailing slash), e.g.
  ``https://internal-ai-router.example.com`` or an in-cluster URL tunneled over Tailscale.

Optional:

- ``ROUTER_PROXY_TIMEOUT_S`` — upstream HTTP timeout in seconds (default ``60``).
"""

import os

import modal

app = modal.App(name="superapp-internal-ai-router-proxy")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "fastapi~=0.115.6",
    "uvicorn~=0.34.0",
    "httpx~=0.28.1",
)


@app.function(image=image, secrets=[modal.Secret.from_name("superapp-internal-ai-router")])
@modal.asgi_app()
def internal_router_proxy():
    from fastapi import FastAPI, Header, Response
    import httpx

    api = FastAPI(title="internal-ai-router-proxy")

    @api.get("/healthz")
    async def healthz():
        upstream = os.environ.get("INTERNAL_ROUTER_UPSTREAM_URL", "").strip().rstrip("/")
        if not upstream:
            return Response(
                content='{"ok":false,"error":"INTERNAL_ROUTER_UPSTREAM_URL not configured"}',
                status_code=503,
                media_type="application/json",
            )
        timeout = float(os.environ.get("ROUTER_PROXY_TIMEOUT_S", "60"))
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(f"{upstream}/healthz")
            if r.status_code >= 400:
                return Response(
                    content='{"ok":false,"error":"upstream unhealthy"}',
                    status_code=503,
                    media_type="application/json",
                )
            return {
                "ok": True,
                "service": "modal-internal-ai-router-proxy",
                "upstream": "healthy",
            }
        except Exception:
            return Response(
                content='{"ok":false,"error":"upstream unreachable"}',
                status_code=503,
                media_type="application/json",
            )

    @api.post("/route")
    async def route(payload: dict, authorization: str | None = Header(default=None)):
        upstream = os.environ.get("INTERNAL_ROUTER_UPSTREAM_URL", "").strip().rstrip("/")
        if not upstream:
            return Response(
                content='{"error":"INTERNAL_ROUTER_UPSTREAM_URL not configured"}',
                status_code=503,
                media_type="application/json",
            )
        expected_token = os.environ.get("INTERNAL_AI_ROUTER_TOKEN", "").strip()
        if expected_token:
            auth = authorization or ""
            if auth != f"Bearer {expected_token}":
                return Response(
                    content='{"error":"Unauthorized"}',
                    status_code=401,
                    media_type="application/json",
                )
        headers: dict[str, str] = {
            "content-type": "application/json",
        }
        upstream_auth = f"Bearer {expected_token}" if expected_token else (authorization or "")
        if upstream_auth:
            headers["authorization"] = upstream_auth
        timeout = float(os.environ.get("ROUTER_PROXY_TIMEOUT_S", "60"))
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(f"{upstream}/route", json=payload, headers=headers)
        except Exception:
            return Response(
                content='{"error":"upstream unreachable"}',
                status_code=503,
                media_type="application/json",
            )
        ct = r.headers.get("content-type", "application/json")
        return Response(content=r.content, status_code=r.status_code, media_type=ct)

    return api
