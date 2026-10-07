import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { formatEventTime } from "@/lib/timezone";

const POLL_MS = 30_000;
const SEEN_KEY = "baby:reminders-seen";
const SEEN_MAX = 200;

// Persist shown reminder ids so a reload doesn't re-toast them. The cron job
// (send-due-reminders) is what marks events as reminded in the database.
function loadSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-SEEN_MAX)));
  } catch {
    /* storage full or blocked — fine, worst case we re-toast */
  }
}

export function ReminderWatcher() {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id,title,starts_at,location,remind_at,reminded")
        .eq("reminded", false)
        .not("remind_at", "is", null)
        .lte("remind_at", nowIso)
        .limit(10);

      if (error || !data || cancelled) return;
      seen.current ??= loadSeen();

      for (const ev of data) {
        if (seen.current.has(ev.id)) continue;
        seen.current.add(ev.id);
        saveSeen(seen.current);
        const when = formatEventTime(ev.starts_at);
        toast(`Daddy — ${ev.title}`, {
          description: `${when}${ev.location ? " @ " + ev.location : ""}`,
          duration: 12_000,
          action: {
            label: "Got it",
            onClick: () => {},
          },
        });
      }
    }

    tick();
    const id = setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return null;
}
