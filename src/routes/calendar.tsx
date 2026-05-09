import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Loader2, MapPin, Bell, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import logoPrimary from "@/assets/brand/logo-primary.png";

const qc = new QueryClient();

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Baby's Calendar — Mr. Satan" },
      { name: "description", content: "Daddy's gigs, appointments, and reminders Baby tucked away." },
    ],
  }),
  component: () => (
    <QueryClientProvider client={qc}>
      <CalendarPage />
    </QueryClientProvider>
  ),
});

type Event = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  remind_at: string | null;
};

function CalendarPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: Event[] = [];
    const pa: Event[] = [];
    events.forEach((e) => {
      if (new Date(e.starts_at).getTime() >= now - 3600_000) up.push(e);
      else pa.push(e);
    });
    return { upcoming: up, past: pa.reverse() };
  }, [events]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["events"] });

  return (
    <div className="min-h-screen pb-24">
      <header className="relative px-4 pb-4 pt-8 text-center">
        <Link
          to="/"
          className="absolute left-4 top-8 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </Link>
        <img src={logoPrimary} alt="MR. SATAN" className="mx-auto h-20 w-auto select-none" draggable={false} />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-primary flicker">
          Baby&apos;s Calendar
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Gigs, dates, anything Baby tucked into the schedule.
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setShowAdd(true)} size="sm" className="gap-2">
            <CalendarPlus className="h-4 w-4" /> Add event
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Diggin' through the date book…
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
            <h3 className="font-display text-xl text-foreground">Nothin' on the books, daddy</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell Baby in chat — "I have a gig Friday at 8" — or tap Add event.
            </p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Section title="Upcoming" tagline="Comin' up, Mr. S">
                {upcoming.map((e) => (
                  <EventCard key={e.id} event={e} onChanged={refresh} />
                ))}
              </Section>
            )}
            {past.length > 0 && (
              <Section title="Past" tagline="Done and dusted">
                {past.map((e) => (
                  <EventCard key={e.id} event={e} onChanged={refresh} faded />
                ))}
              </Section>
            )}
          </>
        )}
      </main>

      <AddEventDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={refresh} />
    </div>
  );
}

function Section({ title, tagline, children }: { title: string; tagline: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="font-display text-lg text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{tagline}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function fmt(iso: string, allDay: boolean) {
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function EventCard({ event, onChanged, faded }: { event: Event; onChanged: () => void; faded?: boolean }) {
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Burned it, daddy.");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/80 p-4", faded && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <h3 className="font-medium text-foreground">{event.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {fmt(event.starts_at, event.all_day)}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {event.location}
              </span>
            )}
            {event.remind_at && (
              <span className="inline-flex items-center gap-1">
                <Bell className="h-3 w-3" /> {fmt(event.remind_at, false)}
              </span>
            )}
          </div>
          {event.notes && <p className="mt-2 text-sm text-muted-foreground">{event.notes}</p>}
        </div>
        <button
          onClick={() => {
            if (confirm("Burn this one, daddy?")) del.mutate();
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AddEventDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date(Date.now() + 3600_000)));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function save() {
    if (!title.trim() || !startsAt) return;
    setSaving(true);
    try {
      const iso = new Date(startsAt).toISOString();
      const { error } = await supabase.from("calendar_events").insert({
        title: title.trim(),
        starts_at: iso,
        location: location.trim() || null,
        notes: notes.trim() || null,
        remind_at: iso,
      });
      if (error) throw error;
      toast.success("Tucked it on your calendar, Mr. S.");
      setTitle("");
      setLocation("");
      setNotes("");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-border/60 bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-xl text-foreground">New event</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Studio session" />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">When</label>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!title.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
