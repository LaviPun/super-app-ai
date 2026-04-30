"""
Temporary upstream router for Modal proxy contract testing.

Provides:
- GET /healthz -> JSON healthy payload
- POST /route -> PromptRouterDecisionSchema-like JSON
"""

from __future__ import annotations

import os

import modal
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse

app = modal.App("superapp-internal-ai-router-mock")
image = modal.Image.debian_slim().pip_install("fastapi[standard]==0.116.1")


@app.function(image=image, secrets=[modal.Secret.from_name("superapp-internal-ai-router-mock")])
@modal.asgi_app()
def web():
    api = FastAPI(title="internal-ai-router-mock")

    @api.get("/healthz")
    async def healthz():
        return {
            "ok": True,
            "service": "internal-ai-router-mock",
            "backend": "mock",
        }

    @api.post("/route")
    async def route(
        payload: dict,
        authorization: str | None = Header(default=None),
    ):
        expected_token = os.environ.get("INTERNAL_AI_ROUTER_TOKEN", "").strip()
        if expected_token and authorization != f"Bearer {expected_token}":
            return JSONResponse(status_code=401, content={"error": "Unauthorized"})

        classification = payload.get("classification") if isinstance(payload, dict) else {}
        intent_packet = payload.get("intentPacket") if isinstance(payload, dict) else {}
        packet_classification = (
            intent_packet.get("classification")
            if isinstance(intent_packet, dict)
            else {}
        )
        module_type = (
            classification.get("moduleType")
            if isinstance(classification, dict)
            else None
        ) or "theme.popup"
        intent = (
            packet_classification.get("intent")
            if isinstance(packet_classification, dict)
            else None
        ) or (
            classification.get("intent")
            if isinstance(classification, dict)
            else None
        ) or "promo.popup"
        surface = (
            packet_classification.get("surface")
            if isinstance(packet_classification, dict)
            else None
        ) or (
            classification.get("surface")
            if isinstance(classification, dict)
            else None
        ) or "home"

        return {
            "version": "1.0",
            "moduleType": module_type,
            "confidence": 0.78,
            "intent": intent,
            "surface": surface,
            "settingsRequired": ["title"],
            "includeFlags": {
                "includeSettingsPack": True,
                "includeIntentPacket": True,
                "includeCatalog": False,
                "includeFullSchema": False,
                "includeStyleSchema": False,
            },
            "catalogFilters": {
                "intent": intent,
                "surface": surface,
                "limit": 8,
            },
            "needsClarification": False,
            "reasonCode": "internal_router_ok",
            "reasoning": "internal_router_ok",
        }

    return api
