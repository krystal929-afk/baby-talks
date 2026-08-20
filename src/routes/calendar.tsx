import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Loader2, MapPin, Bell, Trash2, Clock, Zap } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { PushToggle } from "@/components/push-toggle";
import { BabyAppNav } from "@/components/baby-app-nav";
import logoSmoke from "@/assets/brand/logo-smoke.jpg";
import babyPhoto from "@/assets/brand/baby-firefly.jpg";

const qc = new QueryClient();

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Baby's Calendar — Mr. Satan" }, { name: "description", content: "Daddy's gigs, appointments, and reminders Baby tucked away." }] }),
  component: () => <QueryClientProvider client={qc}><CalendarPage /></QueryClientProvider>,
});

type Event = { id: string; title: string; notes: string | null; starts_at: string; ends_at: string | null; all_day: boolean; location: string | null; remind_at: string | null };

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Baby lost your login. Sign in again.");
  return user.id;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calendar_events").select("*").order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: Event[] = [];
    const pa: Event[] = [];
    events.forEach((event) => {
      if (new Date(event.starts_at).getTime() >= now - 3600_000) up.push(event); else pa.push(event);
    });
    return { upcoming: up, past: pa.reverse() };
  }, [events]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["events"] });

  async function createTestPing() {
    try {
      const ownerId = await getCurrentUserId();
      const now = new Date();
      const remindAt = new Date(now.getTime() + 90_000);
      const startsAt = new Date(now.getTime() + 5 * 60_000);
      const { error } = await supabase.from("calendar_events").insert({ owner_id: ownerId, title: "Baby's test ping", starts_at: startsAt.toISOString(), remind_at: remindAt.toISOString(), notes: "Just makin' sure I can buzz ya, daddy." });
      if (error) throw error;
      toast.success("Test ping armed — Baby'll buzz in ~90 seconds.");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Test ping failed."); }
  }

  const monthLabel = (selectedDate ?? new Date()).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="bf-screen bf-calendar">
      <main className="bf-shell">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[.16em] text-[#8f8880]"><ArrowLeft className="h-3 w-3" />Back</Link>

        <header className="bf-calendar-head">
          <div>
            <img src={logoSmoke} alt="MR. SATAN" className="bf-calendar-logo" draggable={false} />
            <h1 className="bf-calendar-title">BABY&apos;S CALENDAR</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#9c948b]">Gigs, dates, anything Baby tucked into the schedule.</p>
          </div>
          <div className="bf-calendar-photo"><img src={babyPhoto} alt="Baby Firefly" draggable={false} /></div>
        </header>

        <div className="bf-command-row">
          <div className="bf-btn bf-btn-dark flex items-center justify-center"><PushToggle /></div>
          <Button onClick={createTestPing} size="sm" variant="outline" className="bf-btn bf-btn-dark gap-2"><Zap className="h-4 w-4" />Test ping</Button>
          <Button onClick={() => setShowAdd(true)} size="sm" className="bf-btn bf-btn-primary gap-2"><CalendarPlus className="h-4 w-4" />Add event</Button>
        </div>

        <div className="bf-paper-title mb-2 text-sm">{monthLabel}</div>
        <div className="bf-calendar-sheet mb-6">
          <MonthCalendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={{ hasEvent: events.map((event) => new Date(event.starts_at)) }}
            modifiersClassNames={{ hasEvent: "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-[#9d3ee7]" }}
            className="mx-auto"
          />
        </div>

        {selectedDate && (
          <Section title={selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} tagline="On this day">
            {(() => {
              const dayEvents = events.filter((event) => sameDay(new Date(event.starts_at), selectedDate));
              if (!dayEvents.length) return <div className="bf-card p-4 text-sm text-[#8f8880]">Nothin&apos; on this day, daddy.</div>;
              return dayEvents.map((event) => <EventCard key={event.id} event={event} onChanged={refresh} />);
            })()}
          </Section>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[#8f8880]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Diggin&apos; through the date book…</div>
        ) : events.length === 0 ? (
          <div className="bf-card p-8 text-center"><h3 className="text-xl">Nothin&apos; on the books, daddy</h3><p className="mt-2 text-sm text-[#8f8880]">Tell Baby in chat or tap Add event.</p></div>
        ) : (
          <>
            {upcoming.length > 0 && <Section title="Upcoming" tagline="Comin' up, Mr. S">{upcoming.map((event) => <EventCard key={event.id} event={event} onChanged={refresh} />)}</Section>}
            {past.length > 0 && <Section title="Past" tagline="Done and dusted">{past.map((event) => <EventCard key={event.id} event={event} onChanged={refresh} faded />)}</Section>}
          </>
        )}
      </main>

      <AddEventDialog open={showAdd} onClose={() => setShowAdd(false)} onSaved={refresh} />
      <BabyAppNav active="calendar" />
    </div>
  );
}

function Section({ title, tagline, children }: { title: string; tagline: string; children: React.ReactNode }) {
  return <section className="mb-7"><div className="mb-3 flex items-baseline gap-2 border-b border-[#6f20b6]/40 pb-2"><h2 className="bf-calendar-section-title">{title}</h2><span className="text-xs text-[#7d756e]">{tagline}</span></div><div className="space-y-2">{children}</div></section>;
}

function fmt(iso: string, allDay: boolean) {
  const d = new Date(iso);
  if (allDay) return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function EventCard({ event, onChanged, faded }: { event: Event; onChanged: () => void; faded?: boolean }) {
  const del = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("calendar_events").delete().eq("id", event.id); if (error) throw error; },
    onSuccess: () => { toast.success("Burned it, daddy."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={cn("bf-event-card", faded && "opacity-55")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="mb-1 text-[10px] uppercase tracking-[.16em] text-[#9d3ee7]">{new Date(event.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          <h3>{event.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#8f8880]">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-[#9d3ee7]" />{fmt(event.starts_at, event.all_day)}</span>
            {event.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-[#9d3ee7]" />{event.location}</span>}
            {event.remind_at && <span className="inline-flex items-center gap-1"><Bell className="h-3 w-3 text-[#9d3ee7]" />{fmt(event.remind_at, false)}</span>}
          </div>
          {event.notes && <p className="mt-3 text-sm leading-relaxed text-[#b5aca1]">{event.notes}</p>}
        </div>
        <button onClick={() => { if (confirm("Burn this one, daddy?")) del.mutate(); }} className="p-1.5 text-[#756f68] hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
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
      const ownerId = await getCurrentUserId();
      const iso = new Date(startsAt).toISOString();
      const { error } = await supabase.from("calendar_events").insert({ owner_id: ownerId, title: title.trim(), starts_at: iso, location: location.trim() || null, notes: notes.trim() || null, remind_at: iso });
      if (error) throw error;
      toast.success("Tucked it on your calendar, Mr. S.");
      setTitle(""); setLocation(""); setNotes(""); onSaved(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md border border-[#6f20b6]/50 bg-[#09070b] p-5 sm:rounded-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="bf-paper-title !mx-0 mb-5 text-base">New event</h2>
        <div className="space-y-3">
          <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Studio session" /></Field>
          <Field label="When"><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!title.trim() || saving} className="bf-btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button></div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="bf-kicker mb-1 block text-[10px]">{label}</label>{children}</div>;
}
