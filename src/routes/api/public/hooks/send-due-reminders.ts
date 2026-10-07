import { createFileRoute } from "@tanstack/react-router";
// The cron job has no user session, so this route is the ONLY place that uses the
// service-role client. It still only pushes each event to its owner's devices.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { configurePush, sendPush } from "@/server/push-send";
import { formatEventTime } from "@/lib/timezone";

const BABY_LINES = [
  "Hey daddy — clock's ticking on:",
  "Mr. S, don't make me come find you. Up next:",
  "Honeybun, this one's right around the corner:",
  "Sugar britches, time to move:",
  "Baby's reminding ya:",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function run(request: Request) {
  // Shared secret header so randos can't trigger pushes / mark events reminded.
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) return json({ error: "unauthorized" }, 401);

  if (!configurePush()) return json({ error: "VAPID_PRIVATE_KEY not configured" }, 500);

  const { data: events, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("reminded", false)
    .not("remind_at", "is", null)
    .lte("remind_at", new Date().toISOString())
    .limit(50);

  if (error) return json({ error: error.message }, 500);
  if (!events || events.length === 0) return json({ ok: true, processed: 0 });

  const { data: subs, error: subsError } = await supabaseAdmin.from("push_subscriptions").select("*");
  if (subsError) return json({ error: subsError.message }, 500);

  let pushed = 0;
  for (const ev of events) {
    const owned = (subs ?? []).filter((s) => ev.user_id && s.user_id === ev.user_id);
    const line = BABY_LINES[Math.floor(Math.random() * BABY_LINES.length)];
    for (const s of owned) {
      const payload = JSON.stringify({
        title: ev.title,
        body: `${line} ${formatEventTime(ev.starts_at, s.time_zone ?? undefined)}${ev.location ? " @ " + ev.location : ""}`,
        url: "/calendar",
        tag: `event-${ev.id}`,
      });
      if (await sendPush(supabaseAdmin, s, payload)) pushed++;
    }

    const { error: updError } = await supabaseAdmin.from("calendar_events").update({ reminded: true }).eq("id", ev.id);
    if (updError) console.error("mark reminded failed", ev.id, updError.message);
  }

  return json({ ok: true, processed: events.length, pushed });
}

export const Route = createFileRoute("/api/public/hooks/send-due-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
    },
  },
});
