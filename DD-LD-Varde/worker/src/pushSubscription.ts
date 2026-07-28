import type { PushSubscription } from "@block65/webcrypto-web-push";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePushSubscription(value: unknown): PushSubscription | null {
  if (!isRecord(value) || !isRecord(value.keys)) {
    return null;
  }

  const endpoint = value.endpoint;
  const expirationTime = value.expirationTime;
  const p256dh = value.keys.p256dh;
  const auth = value.keys.auth;

  if (
    typeof endpoint !== "string" ||
    endpoint.length === 0 ||
    endpoint.length > 4096 ||
    !endpoint.startsWith("https://")
  ) {
    return null;
  }

  if (
    expirationTime !== null &&
    expirationTime !== undefined &&
    (typeof expirationTime !== "number" ||
      !Number.isFinite(expirationTime) ||
      expirationTime < 0)
  ) {
    return null;
  }

  if (
    typeof p256dh !== "string" ||
    p256dh.length === 0 ||
    p256dh.length > 2048 ||
    typeof auth !== "string" ||
    auth.length === 0 ||
    auth.length > 2048
  ) {
    return null;
  }

  return {
    endpoint,
    expirationTime:
      typeof expirationTime === "number" ? expirationTime : null,
    keys: {
      p256dh,
      auth,
    },
  };
}
