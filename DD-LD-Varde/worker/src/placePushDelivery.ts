import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlaceEvaluation } from "../../src/placeModel/types";
import {
  PLACE_ALERT_CONFIG_V1,
  buildPlaceT3Notification,
  buildPlaceT3NotificationKey,
} from "./placeNotifications";
import { sendWebPush } from "./webPush";

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  expiration_time: number | null;
  p256dh: string;
  auth: string;
  failure_count: number;
};

export type PlaceT3DeliveryResult = {
  claimed: boolean;
  attempted: number;
  sent: number;
  failed: number;
};

const EMPTY_RESULT: PlaceT3DeliveryResult = {
  claimed: false,
  attempted: 0,
  sent: 0,
  failed: 0,
};

const CLAIM_STALE_AFTER_MS = 90_000;

export async function deliverPlaceT3Notification(args: {
  supabase: SupabaseClient;
  vapid: {
    subject: string;
    publicKey: string;
    privateKey: string;
  };
  raceDate: string;
  raceId: string;
  trackId: number;
  trackName: string;
  raceNumber: number;
  plannedStartTime: string;
  candidate: NonNullable<PlaceEvaluation["smoothest"]>;
  nowIso: string;
}): Promise<PlaceT3DeliveryResult> {
  const {
    supabase,
    vapid,
    raceDate,
    raceId,
    trackId,
    trackName,
    raceNumber,
    plannedStartTime,
    candidate,
    nowIso,
  } = args;

  const notificationKey = buildPlaceT3NotificationKey({
    raceDate,
    trackId,
    raceNumber,
  });

  const notification = buildPlaceT3Notification({
    raceDate,
    trackId,
    trackName,
    raceNumber,
    candidate,
  });

  const { data: existingLog, error: existingLogError } = await supabase
    .from("place_push_notification_log")
    .select("status,claimed_at,updated_at")
    .eq("notification_key", notificationKey)
    .maybeSingle();

  if (existingLogError) {
    throw new Error(
      `Could not load notification log: ${existingLogError.message}`,
    );
  }

  if (existingLog) {
    const claimedAtMs =
      typeof existingLog.claimed_at === "string"
        ? Date.parse(existingLog.claimed_at)
        : Number.NaN;
    const nowMs = Date.parse(nowIso);
    const staleClaim =
      existingLog.status === "CLAIMED" &&
      (!Number.isFinite(claimedAtMs) ||
        !Number.isFinite(nowMs) ||
        nowMs - claimedAtMs >= CLAIM_STALE_AFTER_MS);
    const retryable =
      existingLog.status === "FAILED" || staleClaim;

    if (!retryable) {
      return EMPTY_RESULT;
    }
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("place_push_subscriptions")
    .select("id,endpoint,expiration_time,p256dh,auth,failure_count")
    .eq("active", true)
    .limit(1000);

  if (subscriptionsError) {
    throw new Error(
      `Could not load push subscriptions: ${subscriptionsError.message}`,
    );
  }

  const activeSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];

  if (!activeSubscriptions.length) {
    return EMPTY_RESULT;
  }

  const claimPayload = {
    notification_key: notificationKey,
    notification_type: "PLACE_T3",
    rule_version: PLACE_ALERT_CONFIG_V1.ruleVersion,
    race_id: raceId,
    race_date: raceDate,
    track_id: trackId,
    track_name: trackName,
    race_number: raceNumber,
    planned_start_time: plannedStartTime,
    candidate_number: candidate.runnerNumber,
    candidate_name: candidate.runnerName,
    candidate_win_odds: candidate.currentWinOdds,
    candidate_strength: candidate.strength,
    status: "CLAIMED",
    subscriptions_attempted: 0,
    subscriptions_sent: 0,
    subscriptions_failed: 0,
    payload_json: notification,
    claimed_at: nowIso,
    sent_at: null,
    updated_at: nowIso,
  };

  if (existingLog) {
    if (typeof existingLog.updated_at !== "string") {
      return EMPTY_RESULT;
    }

    const { data: claimedLog, error: reclaimError } = await supabase
      .from("place_push_notification_log")
      .update(claimPayload)
      .eq("notification_key", notificationKey)
      .eq("status", existingLog.status)
      .eq("updated_at", existingLog.updated_at)
      .select("notification_key")
      .maybeSingle();

    if (reclaimError) {
      throw new Error(
        `Could not reclaim notification ${notificationKey}: ${reclaimError.message}`,
      );
    }

    if (!claimedLog) {
      return EMPTY_RESULT;
    }
  } else {
    const { error: claimError } = await supabase
      .from("place_push_notification_log")
      .insert(claimPayload);

    if (claimError) {
      if (claimError.code === "23505") {
        return EMPTY_RESULT;
      }

      throw new Error(
        `Could not claim notification ${notificationKey}: ${claimError.message}`,
      );
    }
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of activeSubscriptions) {
    try {
      const result = await sendWebPush({
        subscription: {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expiration_time,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        vapid,
        notification,
      });

      if (result.ok) {
        sent += 1;

        const { error: successUpdateError } = await supabase
          .from("place_push_subscriptions")
          .update({
            active: true,
            failure_count: 0,
            last_success_at: nowIso,
            last_failure_at: null,
            updated_at: nowIso,
          })
          .eq("id", subscription.id);

        if (successUpdateError) {
          console.warn(
            `Could not update successful subscription ${subscription.id}: ${successUpdateError.message}`,
          );
        }
      } else {
        failed += 1;

        const { error: failureUpdateError } = await supabase
          .from("place_push_subscriptions")
          .update({
            active: !result.expired,
            failure_count: subscription.failure_count + 1,
            last_failure_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", subscription.id);

        if (failureUpdateError) {
          console.warn(
            `Could not update failed subscription ${subscription.id}: ${failureUpdateError.message}`,
          );
        }
      }
    } catch (error) {
      failed += 1;

      console.warn(
        `Could not send push to subscription ${subscription.id}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );

      const { error: failureUpdateError } = await supabase
        .from("place_push_subscriptions")
        .update({
          active: true,
          failure_count: subscription.failure_count + 1,
          last_failure_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", subscription.id);

      if (failureUpdateError) {
        console.warn(
          `Could not update failed subscription ${subscription.id}: ${failureUpdateError.message}`,
        );
      }
    }
  }

  const attempted = activeSubscriptions.length;
  const status =
    sent === attempted ? "SENT" : sent > 0 ? "PARTIAL" : "FAILED";

  const { error: logUpdateError } = await supabase
    .from("place_push_notification_log")
    .update({
      status,
      subscriptions_attempted: attempted,
      subscriptions_sent: sent,
      subscriptions_failed: failed,
      sent_at: sent > 0 ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("notification_key", notificationKey);

  if (logUpdateError) {
    throw new Error(
      `Could not update notification log: ${logUpdateError.message}`,
    );
  }

  return {
    claimed: true,
    attempted,
    sent,
    failed,
  };
}
