import { describe, expect, it, vi } from "vitest";

import {
  markWebhookEventFailed,
  recordWebhookEvent,
} from "./webhookLedger";

describe("webhookLedger", () => {
  it("returns duplicate result when eventId already exists", async () => {
    const api = {
      shopifyWebhookEvent: {
        findFirst: vi.fn().mockResolvedValue({ id: "evt-existing" }),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const result = await recordWebhookEvent(api as never, {
      shopDomain: "demo.myshopify.com",
      topic: "orders/create",
      webhookId: "wh_123",
      eventId: "wh_123",
    });

    expect(result).toEqual({
      webhookEventId: "evt-existing",
      isDuplicate: true,
      isNew: false,
    });
    expect(api.shopifyWebhookEvent.create).not.toHaveBeenCalled();
  });

  it("creates a new ledger record when eventId is unseen", async () => {
    const api = {
      shopifyWebhookEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "evt-new" }),
        update: vi.fn(),
      },
    };

    const result = await recordWebhookEvent(api as never, {
      shopDomain: "demo.myshopify.com",
      topic: "orders/create",
      webhookId: "wh_456",
      eventId: "wh_456",
    });

    expect(result).toEqual({
      webhookEventId: "evt-new",
      isDuplicate: false,
      isNew: true,
    });
    expect(api.shopifyWebhookEvent.create).toHaveBeenCalledWith({
      shopDomain: "demo.myshopify.com",
      topic: "orders/create",
      webhookId: "wh_456",
      eventId: "wh_456",
      status: "received",
    });
  });

  it("marks webhook events as failed", async () => {
    const api = {
      shopifyWebhookEvent: {
        update: vi.fn().mockResolvedValue({ id: "evt-new" }),
      },
    };

    await markWebhookEventFailed(api as never, "evt-new");

    expect(api.shopifyWebhookEvent.update).toHaveBeenCalledWith("evt-new", {
      status: "failed",
    });
  });
});
