"""Modal edge deployment for the internal prompt router.

Thin HTTPS proxy: forwards ``POST /route`` to an upstream router service (typically the Node
reference implementation or any compatible ``/route`` implementation), plus the chat
passthrough paths the internal AI assistant uses (``POST /v1/chat/completions``,
``POST /chat/completions``, ``POST /api/chat``, ``GET /api/tags``) so a single Modal URL
can serve both prompt routing and assistant chat.

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
    from fastapi import FastAPI, Header, Request, Response
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

    def _upstream_or_503() -> str | Response:
        upstream = os.environ.get("INTERNAL_ROUTER_UPSTREAM_URL", "").strip().rstrip("/")
        if not upstream:
            return Response(
                content='{"error":"INTERNAL_ROUTER_UPSTREAM_URL not configured"}',
                status_code=503,
                media_type="application/json",
            )
        return upstream

    def _check_auth(authorization: str | None) -> Response | None:
        expected_token = os.environ.get("INTERNAL_AI_ROUTER_TOKEN", "").strip()
        if expected_token and (authorization or "") != f"Bearer {expected_token}":
            return Response(
                content='{"error":"Unauthorized"}',
                status_code=401,
                media_type="application/json",
            )
        return None

    def _upstream_headers(authorization: str | None) -> dict[str, str]:
        expected_token = os.environ.get("INTERNAL_AI_ROUTER_TOKEN", "").strip()
        headers = {"content-type": "application/json"}
        upstream_auth = f"Bearer {expected_token}" if expected_token else (authorization or "")
        if upstream_auth:
            headers["authorization"] = upstream_auth
        return headers

    async def _forward_chat(path: str, request, authorization: str | None):
        from fastapi.responses import StreamingResponse

        upstream = _upstream_or_503()
        if isinstance(upstream, Response):
            return upstream
        denied = _check_auth(authorization)
        if denied:
            return denied
        body = await request.body()
        timeout = float(os.environ.get("ROUTER_PROXY_TIMEOUT_S", "60"))
        client = httpx.AsyncClient(timeout=timeout)
        try:
            req = client.build_request(
                "POST", f"{upstream}{path}", content=body, headers=_upstream_headers(authorization)
            )
            r = await client.send(req, stream=True)
        except Exception:
            await client.aclose()
            return Response(
                content='{"error":"upstream unreachable"}',
                status_code=503,
                media_type="application/json",
            )

        async def body_iter():
            try:
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()

        return StreamingResponse(
            body_iter(),
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "application/json"),
        )

    @api.post("/v1/chat/completions")
    async def chat_completions_v1(request: Request, authorization: str | None = Header(default=None)):
        return await _forward_chat("/v1/chat/completions", request, authorization)

    @api.post("/chat/completions")
    async def chat_completions(request: Request, authorization: str | None = Header(default=None)):
        return await _forward_chat("/chat/completions", request, authorization)

    @api.post("/api/chat")
    async def ollama_chat(request: Request, authorization: str | None = Header(default=None)):
        return await _forward_chat("/api/chat", request, authorization)

    @api.get("/api/tags")
    async def ollama_tags(authorization: str | None = Header(default=None)):
        upstream = _upstream_or_503()
        if isinstance(upstream, Response):
            return upstream
        denied = _check_auth(authorization)
        if denied:
            return denied
        timeout = float(os.environ.get("ROUTER_PROXY_TIMEOUT_S", "60"))
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(f"{upstream}/api/tags", headers=_upstream_headers(authorization))
        except Exception:
            return Response(
                content='{"error":"upstream unreachable"}',
                status_code=503,
                media_type="application/json",
            )
        return Response(
            content=r.content,
            status_code=r.status_code,
            media_type=r.headers.get("content-type", "application/json"),
        )

    return api
