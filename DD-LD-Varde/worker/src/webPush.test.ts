import { describe, expect, it, vi } from "vitest";
import type {
  PushMessage,
  PushSubscription,
  VapidKeys,
} from "@block65/webcrypto-web-push";
import { sendWebPush } from "./webPush";

const subscription: PushSubscription = {
  endpoint: "https://push.example.test/subscription",
  expirationTime: null,
  keys: {
    p256dh: "test-p256dh",
    auth: "test-auth",
  },
};

const vapid: VapidKeys = {
  subject: "mailto:test@example.com",
  publicKey: "test-public-key",
  privateKey: "test-private-key",
};

const notification = {
  title: "Möjligt platsspel – Mantorp lopp 3",
  body: "Öppna appen för slutlig kontroll. Start om cirka 3 minuter.",
  url: "/?date=2026-07-27&trackId=33&raceNumber=3",
  tag: "place-t3-2026-07-27-33-3",
};

describe("sendWebPush", () => {
  it("skickar krypterad push och rapporterar lyckad leverans", async () => {
    let capturedMessage: PushMessage | null = null;

    const buildPayload = vi.fn(async (message: PushMessage) => {
      capturedMessage = message;
      return {
        method: "POST",
        headers: {
          "content-encoding": "aes128gcm",
          "content-length": "1",
          "content-type": "application/octet-stream",
          "crypto-key": "test",
          encryption: "test",
          ttl: "300",
          authorization: "test",
        },
        body: new Uint8Array([1]),
      };
    });

    const fetchImpl = vi.fn(async () =>
      new Response(null, { status: 201 }),
    );

    const result = await sendWebPush({
      subscription,
      vapid,
      notification,
      buildPayload,
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      expired: false,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      subscription.endpoint,
      expect.objectContaining({ method: "POST" }),
    );
    expect(capturedMessage).toEqual({
      data: JSON.stringify(notification),
      options: {
        ttl: 300,
        urgency: "high",
      },
    });
  });

  it("markerar HTTP 410 som utgången prenumeration", async () => {
    const result = await sendWebPush({
      subscription,
      vapid,
      notification,
      buildPayload: async () => ({
        method: "POST",
        headers: {
          "content-encoding": "aes128gcm",
          "content-length": "1",
          "content-type": "application/octet-stream",
          "crypto-key": "test",
          encryption: "test",
          ttl: "300",
          authorization: "test",
        },
        body: new Uint8Array([1]),
      }),
      fetchImpl: async () => new Response(null, { status: 410 }),
    });

    expect(result).toEqual({
      ok: false,
      status: 410,
      expired: true,
    });
  });
});
