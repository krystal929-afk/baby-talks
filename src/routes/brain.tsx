import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, Brain, Lightbulb, Loader2, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BabyAppNav } from "@/components/baby-app-nav";
import babyPhoto from "@/assets/brand/baby-firefly.jpg";
import mascot from "@/assets/brand/mr-satan-mascot.png";

const qc = new QueryClient();

export const Route = createFileRoute("/brain")({
  head: () => ({ meta: [{ title: "Baby's Brain — Mr. Satan" }, { name: "description", content: "Search, edit, and prune Baby's saved ideas and memories." }] }),
  component: () => <QueryClientProvider client={qc}><BrainPage /></QueryClientProvider>,
});

type Tab = "memories" | "ideas";
type Memory = { id: string; content: string; source: string; created_at: string };
type IdeaRow = { id: string; transcript: string; status: "grow" | "rethink" | "trash" | "parking_lot"; topic: string; created_at: string };

function BrainPage() {
  const [tab, setTab] = useState<Tab>("memories");
  const [q, setQ] = useState("");

  return (
    <div className="bf-screen">
      <main className="bf-shell">
        <Link to="/" className="mb-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-[.16em] text-[#8f8880]"><ArrowLeft className="h-3 w-3" />Back</Link>

        <header className="relative mb-5">
          <div className="bf-paper-title">THE BRAIN</div>
          <p className="mt-3 text-center text-xs text-[#8f8880]">Nothing gets forgotten.</p>
          <img src={mascot} alt="" aria-hidden className="absolute right-0 top-0 h-14 w-14 object-contain opacity-35" />
        </header>

        <div className="bf-section-label">Pinned</div>
        <div className="bf-memory-pinboard">
          <div className="bf-memory-polaroid"><img src={babyPhoto} alt="Baby Firefly" /><span>Baby keeps the receipts.</span></div>
          <div className="bf-memory-polaroid flex min-h-28 items-center justify-center text-center"><span>MEMORIES<br />facts worth keeping</span></div>
          <div className="bf-memory-polaroid flex min-h-28 items-center justify-center text-center"><span>IDEAS<br />every loose thread</span></div>
        </div>

        <div className="bf-brain-tabs">
          <TabButton active={tab === "memories"} onClick={() => setTab("memories")} icon={<Brain className="h-4 w-4" />}>Memories</TabButton>
          <TabButton active={tab === "ideas"} onClick={() => setTab("ideas")} icon={<Lightbulb className="h-4 w-4" />}>Ideas</TabButton>
        </div>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#756f68]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "memories" ? "Search memories..." : "Search ideas..."} className="rounded-sm border-[#4a4148] bg-[#09070b] pl-9 pr-9 font-mono" />
          {q && <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#756f68]" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
        </div>

        {tab === "memories" ? <MemoriesList q={q} /> : <IdeasList q={q} />}
      </main>
      <BabyAppNav active="brain" />
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("bf-btn flex items-center justify-center gap-2 border px-3 py-2.5", active ? "bf-btn-primary" : "bf-btn-dark")}>{icon}{children}</button>;
}

function MemoriesList({ q }: { q: string }) {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["baby_memories"],
    queryFn: async () => { const { data, error } = await supabase.from("baby_memories").select("*").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as Memory[]; },
  });
  const filtered = useMemo(() => { const needle = q.trim().toLowerCase(); return needle ? data.filter((m) => m.content.toLowerCase().includes(needle)) : data; }, [data, q]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["baby_memories"] });

  if (isLoading) return <Loading label="Riflin' through Baby's brain…" />;
  if (!data.length) return <Empty title="Brain's empty, daddy" body="Tell Baby a fact in chat. She'll save it here automatically." />;
  if (!filtered.length) return <Empty title="No matches" body={`Nothin' in here for “${q}”.`} />;

  return <div className="space-y-2"><div className="bf-section-label flex justify-between"><span>All memories</span><span>{filtered.length} of {data.length}</span></div>{filtered.map((m) => <MemoryCard key={m.id} memory={m} onChanged={refresh} />)}</div>;
}

function MemoryCard({ memory, onChanged }: { memory: Memory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.content);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = text.trim();
    if (!next || next === memory.content) { setEditing(false); setText(memory.content); return; }
    setBusy(true);
    const { error } = await supabase.from("baby_memories").update({ content: next }).eq("id", memory.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(false); onChanged();
  }

  async function del() {
    if (!confirm("Forget this fact?")) return;
    const { error } = await supabase.from("baby_memories").delete().eq("id", memory.id);
    if (error) toast.error(error.message); else onChanged();
  }

  return (
    <div className="bf-memory-card border p-3">
      {editing ? <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-sm bg-[#050407] text-sm" autoFocus /> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#ded5c8]">{memory.content}</p>}
      <div className="mt-2 flex items-center gap-2">
        <span className="border border-[#4e4650] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#8f8880]">{memory.source}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#756f68]">{new Date(memory.created_at).toLocaleDateString()}</span>
        <div className="ml-auto flex gap-1">
          {editing ? <><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(memory.content); }} disabled={busy}><X className="h-3 w-3" /></Button><Button size="sm" variant="ghost" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}</Button></> : <><Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={del}><Trash2 className="h-3 w-3" /></Button></>}
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<IdeaRow["status"], string> = { grow: "Grow", rethink: "Rethink", parking_lot: "Parking", trash: "Trash" };

function IdeasList({ q }: { q: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<IdeaRow["status"] | "all">("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const { data = [], isLoading } = useQuery({
    queryKey: ["ideas-brain"],
    queryFn: async () => { const { data, error } = await supabase.from("ideas").select("id, transcript, status, topic, created_at").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as IdeaRow[]; },
  });

  const topics = useMemo(() => Array.from(new Set(data.map((i) => i.topic))).sort(), [data]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (topicFilter !== "all" && i.topic !== topicFilter) return false;
      if (needle && !i.transcript.toLowerCase().includes(needle) && !i.topic.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, q, statusFilter, topicFilter]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ideas-brain"] });

  if (isLoading) return <Loading label="Diggin' through the box…" />;
  if (!data.length) return <Empty title="No ideas saved yet" body="Hold the mic on the notebook and spill somethin'." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5"><Pill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All status</Pill>{(Object.keys(STATUS_LABEL) as IdeaRow["status"][]).map((s) => <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{STATUS_LABEL[s]}</Pill>)}</div>
      {topics.length > 1 && <div className="flex flex-wrap gap-1.5"><Pill active={topicFilter === "all"} onClick={() => setTopicFilter("all")}>All topics</Pill>{topics.map((t) => <Pill key={t} active={topicFilter === t} onClick={() => setTopicFilter(t)}>{t}</Pill>)}</div>}
      <div className="bf-section-label flex justify-between"><span>All ideas</span><span>{filtered.length} of {data.length}</span></div>
      {!filtered.length ? <Empty title="No matches" body="Try a different filter or search." /> : filtered.map((i) => <IdeaRowCard key={i.id} idea={i} onChanged={refresh} />)}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={cn("bf-btn shrink-0 border px-2.5 py-1 text-[9px]", active ? "bf-btn-primary" : "bf-btn-dark")}>{children}</button>;
}

function IdeaRowCard({ idea, onChanged }: { idea: IdeaRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.transcript);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = text.trim();
    if (!next || next === idea.transcript) { setEditing(false); setText(idea.transcript); return; }
    setBusy(true);
    const { error } = await supabase.from("ideas").update({ transcript: next }).eq("id", idea.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(false); onChanged();
  }

  async function del() {
    if (!confirm("Trash this idea?")) return;
    const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
    if (error) toast.error(error.message); else onChanged();
  }

  return (
    <div className="bf-memory-card border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2"><span className="border border-[#baff21]/35 bg-[#baff21]/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#baff21]">{STATUS_LABEL[idea.status]}</span><span className="border border-[#4e4650] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#8f8880]">{idea.topic}</span><span className="ml-auto text-[10px] text-[#756f68]">{new Date(idea.created_at).toLocaleDateString()}</span></div>
      {editing ? <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-sm bg-[#050407] text-sm" autoFocus /> : <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#ded5c8]">{idea.transcript}</p>}
      <div className="mt-2 flex justify-end gap-1">{editing ? <><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(idea.transcript); }} disabled={busy}><X className="h-3 w-3" /></Button><Button size="sm" variant="ghost" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}</Button></> : <><Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={del}><Trash2 className="h-3 w-3" /></Button></>}</div>
    </div>
  );
}

function Loading({ label }: { label: string }) { return <div className="flex items-center justify-center py-16 text-sm text-[#8f8880]"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{label}</div>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className="bf-card p-7 text-center"><h3 className="text-lg text-[#ded5c8]">{title}</h3><p className="mt-2 text-sm text-[#8f8880]">{body}</p></div>; }
