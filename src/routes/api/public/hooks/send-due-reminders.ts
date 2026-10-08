import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from "@/lib/push-config";
import { formatInTimeZone, resolveTimeZone } from "@/lib/time";

const BABY_LINES = [
  "Hey daddy — clock's ticking on:",
  "Mr. S, don't make me come find you. Up next:",
  "Honeybun, this one's right around the corner:",
  "Sugar britches, time to move:",
  "Baby's reminding ya:",
];

function secretsMatch(provided: string | null, expected: string | undefined) {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  // Constant-time compare so the secret can't be guessed byte-by-byte.
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function run(request: Request) {
  // Auth: require shared secret header so randos can't trigger pushes / mark events reminded
  if (!secretsMatch(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!priv) {
    return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, priv);

  const supabaseAdmin = getSupabaseAdmin();
  const timeZone = resolveTimeZone();
  const nowIso = new Date().toISOString();
  const { data: events, error } = await supabaseAdmin
    .from("calendar_events")
    .select("id,owner_id,title,starts_at,location")
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

  // Only load subscriptions for the people who actually have something due.
  const ownerIds = Array.from(new Set(events.map((ev) => ev.owner_id)));
  const { data: subs, error: subsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("owner_id,endpoint,p256dh,auth")
    .in("owner_id", ownerIds);
  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  let pushed = 0;

  for (const ev of events) {
    const ownerSubs = (subs ?? []).filter((s) => s.owner_id === ev.owner_id);
    if (ownerSubs.length > 0) {
      const line = BABY_LINES[Math.floor(Math.random() * BABY_LINES.length)];
      // Workers run in UTC; format in the owner's zone (APP_TIME_ZONE or New York).
      const startsTxt = formatInTimeZone(ev.starts_at, timeZone);
      const payload = JSON.stringify({
        title: ev.title,
        body: `${line} ${startsTxt}${ev.location ? " @ " + ev.location : ""}`,
        url: "/calendar",
        tag: `event-${ev.id}`,
      });

      for (const s of ownerSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          );
          pushed++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await supabaseAdmin.from("push_subscriptions").delete().eq("owner_id", ev.owner_id).eq("endpoint", s.endpoint);
          } else {
            console.error("push send failed", e?.statusCode, e?.body);
          }
        }
      }
    }

    await supabaseAdmin
      .from("calendar_events")
      .update({ reminded: true })
      .eq("id", ev.id)
      .eq("owner_id", ev.owner_id);
  }

  return new Response(JSON.stringify({ ok: true, processed: events.length, pushed }), {
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/send-due-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});
