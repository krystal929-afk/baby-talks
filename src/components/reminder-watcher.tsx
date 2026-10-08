import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 30_000;
// Only nag about reminders from the last day; older ones were missed, not due.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SEEN_KEY = "baby-reminders-seen-v1";

function loadSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    // Keep the list small; old ids fall outside the lookback window anyway.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen).slice(-200)));
  } catch {
    // storage full or blocked — worst case a reminder shows again
  }
}

// In-app reminder toasts. `reminded` is only flipped by the server-side push
// job, so without remembering what we've shown, the same toasts came back on
// every page load. Shown ids are now stored per device.
export function ReminderWatcher() {
  useEffect(() => {
    let cancelled = false;
    const seen = loadSeen();

    async function tick() {
      const now = Date.now();
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id,title,starts_at,location,remind_at,reminded")
        .eq("reminded", false)
        .not("remind_at", "is", null)
        .gte("remind_at", new Date(now - LOOKBACK_MS).toISOString())
        .lte("remind_at", new Date(now).toISOString())
        .limit(10);

      if (error || !data || cancelled) return;

      let changed = false;
      for (const ev of data) {
        if (seen.has(ev.id)) continue;
        seen.add(ev.id);
        changed = true;
        const when = new Date(ev.starts_at).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        toast(`Daddy — ${ev.title}`, {
          description: `${when}${ev.location ? " @ " + ev.location : ""}`,
          duration: 12_000,
          action: {
            label: "Got it",
            onClick: () => {},
          },
        });
      }
      if (changed) saveSeen(seen);
    }

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
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
