import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from "@block65/webcrypto-web-push";

export type PlacePushNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

export type WebPushResult = {
  ok: boolean;
  status: number;
  expired: boolean;
};

type PushPayloadBuilder = typeof buildPushPayload;
type FetchImplementation = typeof fetch;

export async function sendWebPush(args: {
  subscription: PushSubscription;
  vapid: VapidKeys;
  notification: PlacePushNotification;
  fetchImpl?: FetchImplementation;
  buildPayload?: PushPayloadBuilder;
}): Promise<WebPushResult> {
  const {
    subscription,
    vapid,
    notification,
    fetchImpl = fetch,
    buildPayload = buildPushPayload,
  } = args;

  const message: PushMessage = {
    data: JSON.stringify(notification),
    options: {
      ttl: 5 * 60,
      urgency: "high",
    },
  };

  const request = await buildPayload(message, subscription, vapid);
  const response = await fetchImpl(subscription.endpoint, request);

  return {
    ok: response.ok,
    status: response.status,
    expired: response.status === 404 || response.status === 410,
  };
}
