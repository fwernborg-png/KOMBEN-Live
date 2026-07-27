import { describe, expect, it } from "vitest";
import { parsePushSubscription } from "./pushSubscription";

describe("parsePushSubscription", () => {
  it("godkänner en giltig push-prenumeration", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/123",
        expirationTime: null,
        keys: {
          p256dh: "public-key",
          auth: "auth-secret",
        },
      }),
    ).toEqual({
      endpoint: "https://push.example.com/subscription/123",
      expirationTime: null,
      keys: {
        p256dh: "public-key",
        auth: "auth-secret",
      },
    });
  });

  it("normaliserar saknad expirationTime till null", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/123",
        keys: {
          p256dh: "public-key",
          auth: "auth-secret",
        },
      })?.expirationTime,
    ).toBeNull();
  });

  it("avvisar en endpoint som inte använder https", () => {
    expect(
      parsePushSubscription({
        endpoint: "http://push.example.com/subscription/123",
        expirationTime: null,
        keys: {
          p256dh: "public-key",
          auth: "auth-secret",
        },
      }),
    ).toBeNull();
  });

  it("avvisar saknade eller tomma nycklar", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/123",
        expirationTime: null,
        keys: {
          p256dh: "",
          auth: "auth-secret",
        },
      }),
    ).toBeNull();
  });

  it("avvisar ogiltig expirationTime", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/subscription/123",
        expirationTime: -1,
        keys: {
          p256dh: "public-key",
          auth: "auth-secret",
        },
      }),
    ).toBeNull();
  });
});
