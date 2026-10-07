import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/push-config";

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/** Configures VAPID. Returns false when VAPID_PRIVATE_KEY is not set. */
export function configurePush(): boolean {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv);
  return true;
}

/** Sends one payload to a subscription; prunes it when the push service says it's gone. */
export async function sendPush(
  client: SupabaseClient<Database>,
  sub: PushSub,
  payload: string,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    );
    return true;
  } catch (e: unknown) {
    const err = e as { statusCode?: number; body?: unknown };
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await client.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    } else {
      console.error("push send failed", err?.statusCode, err?.body);
    }
    return false;
  }
}
