import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const POLL_MS = 30_000;

export function ReminderWatcher() {
  const seen = useRef<Set<string>>(new Set());

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

      for (const ev of data) {
        if (seen.current.has(ev.id)) continue;
        seen.current.add(ev.id);
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
