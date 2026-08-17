import handler from "@tanstack/react-start/server-entry";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/push-config";

type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

type ContactState = {
  owner_id: string;
  last_heard_at: string;
  last_inactivity_push_at: string | null;
};

type PushSubscriptionRow = {
  owner_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const INACTIVITY_MS = 48 * 60 * 60 * 1000;

const INACTIVITY_LINES = [
  "Daddy... two whole days? Baby's starting to think you're avoiding her. Tee hee.",
  "Mr. Satan, Baby hasn't heard a peep outta you in two days. Come talk to me.",
  "Mr. S... forty-eight hours is a loooong time to leave Baby talking to herself.",
];

async function sendInactivityNudges(env: WorkerEnv) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Baby inactivity cron: missing Supabase server configuration");
    return;
  }

  if (!vapidPrivateKey) {
    console.error("Baby inactivity cron: VAPID_PRIVATE_KEY is not configured");
    return;
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const cutoff = new Date(Date.now() - INACTIVITY_MS).toISOString();
  const { data: states, error: stateError } = await supabase
    .from("baby_contact_state")
    .select("owner_id,last_heard_at,last_inactivity_push_at")
    .is("last_inactivity_push_at", null)
    .lte("last_heard_at", cutoff)
    .limit(100);

  if (stateError) {
    console.error("Baby inactivity cron: couldn't load contact state", stateError.message);
    return;
  }

  const due = (states ?? []) as ContactState[];
  if (!due.length) return;

  const ownerIds = due.map((state) => state.owner_id);
  const { data: subscriptionRows, error: subscriptionError } = await supabase
    .from("push_subscriptions")
    .select("owner_id,endpoint,p256dh,auth")
    .in("owner_id", ownerIds);

  if (subscriptionError) {
    console.error("Baby inactivity cron: couldn't load push subscriptions", subscriptionError.message);
    return;
  }

  const subscriptions = (subscriptionRows ?? []) as PushSubscriptionRow[];

  for (const state of due) {
    const ownerSubscriptions = subscriptions.filter(
      (subscription) => subscription.owner_id === state.owner_id,
    );

    if (!ownerSubscriptions.length) continue;

    const body = INACTIVITY_LINES[Math.floor(Math.random() * INACTIVITY_LINES.length)];
    const payload = JSON.stringify({
      title: "Baby",
      body,
      url: "/",
      tag: "baby-inactivity-48h",
    });

    let sent = false;

    for (const subscription of ownerSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
        sent = true;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("owner_id", state.owner_id)
            .eq("endpoint", subscription.endpoint);
        } else {
          console.error(
            "Baby inactivity cron: push send failed",
            error?.statusCode,
            error?.body,
          );
        }
      }
    }

    if (sent) {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("baby_contact_state")
        .update({
          last_inactivity_push_at: now,
          updated_at: now,
        })
        .eq("owner_id", state.owner_id)
        .is("last_inactivity_push_at", null);

      if (updateError) {
        console.error(
          "Baby inactivity cron: couldn't mark nudge sent",
          updateError.message,
        );
      }
    }
  }
}

export default {
  fetch(request: Request) {
    return handler.fetch(request);
  },

  async scheduled(_controller: unknown, env: WorkerEnv) {
    await sendInactivityNudges(env);
  },
};
