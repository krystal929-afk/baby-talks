import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/push-config";

const BABY_LINES = [
  "Hey daddy — clock's ticking on:",
  "Mr. S, don't make me come find you. Up next:",
  "Honeybun, this one's right around the corner:",
  "Sugar britches, time to move:",
  "Baby's reminding ya:",
];

async function run() {
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) {
    return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv);

  const nowIso = new Date().toISOString();
  const { data: events, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("reminded", false)
    .not("remind_at", "is", null)
    .lte("remind_at", nowIso)
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!events || events.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("*");
  let pushed = 0;

  for (const ev of events) {
    if (subs && subs.length > 0) {
      const line = BABY_LINES[Math.floor(Math.random() * BABY_LINES.length)];
      const startsTxt = new Date(ev.starts_at).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const payload = JSON.stringify({
        title: ev.title,
        body: `${line} ${startsTxt}${ev.location ? " @ " + ev.location : ""}`,
        url: "/calendar",
        tag: `event-${ev.id}`,
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          pushed++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          } else {
            console.error("push send failed", e?.statusCode, e?.body);
          }
        }
      }
    }

    await supabaseAdmin
      .from("calendar_events")
      .update({ reminded: true })
      .eq("id", ev.id);
  }

  return new Response(JSON.stringify({ ok: true, processed: events.length, pushed }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/send-due-reminders")({
  server: {
    handlers: {
      GET: async () => run(),
      POST: async () => run(),
    },
  },
});
