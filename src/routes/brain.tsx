import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ArrowLeft, Brain, Lightbulb, Loader2, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import logoPrimary from "@/assets/brand/logo-primary.png";

const qc = new QueryClient();

export const Route = createFileRoute("/brain")({
  head: () => ({
    meta: [
      { title: "Baby's Brain — Mr. Satan" },
      { name: "description", content: "Search, edit, and prune Baby's saved ideas and memories." },
    ],
  }),
  component: () => (
    <QueryClientProvider client={qc}>
      <BrainPage />
    </QueryClientProvider>
  ),
});

type Tab = "memories" | "ideas";

type Memory = {
  id: string;
  content: string;
  source: string;
  created_at: string;
};

type IdeaRow = {
  id: string;
  transcript: string;
  status: "grow" | "rethink" | "trash" | "parking_lot";
  topic: string;
  created_at: string;
};

function BrainPage() {
  const [tab, setTab] = useState<Tab>("memories");
  const [q, setQ] = useState("");

  return (
    <div className="min-h-screen pb-16">
      <header className="px-4 pb-4 pt-8 text-center">
        <Link to="/" className="absolute left-4 top-8 inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Notepad
        </Link>
        <img
          src={logoPrimary}
          alt="MR. SATAN"
          className="mx-auto h-24 w-auto select-none drop-shadow-[0_0_24px_oklch(0.92_0.23_124/25%)]"
          draggable={false}
        />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-primary flicker">
          Baby's Brain
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything she's tucked away. Poke around, daddy.
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <TabButton active={tab === "memories"} onClick={() => setTab("memories")} icon={<Brain className="h-4 w-4" />}>
            Memories
          </TabButton>
          <TabButton active={tab === "ideas"} onClick={() => setTab("ideas")} icon={<Lightbulb className="h-4 w-4" />}>
            Ideas
          </TabButton>
        </div>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "memories" ? "Search memories..." : "Search ideas..."}
            className="bg-card pl-9 pr-9"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {tab === "memories" ? <MemoriesList q={q} /> : <IdeasList q={q} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium uppercase tracking-wider transition",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.92_0.23_124/40%)]"
          : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ───────────────────────────── Memories ───────────────────────────── */

function MemoriesList({ q }: { q: string }) {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["baby_memories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("baby_memories")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Memory[];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((m) => m.content.toLowerCase().includes(needle));
  }, [data, q]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["baby_memories"] });

  if (isLoading) return <Loading label="Riflin' through Baby's brain…" />;
  if (data.length === 0) {
    return (
      <Empty
        title="Brain's empty, daddy"
        body="Tell Baby a fact in chat — birthdays, vendors, sizes, schedules. She'll save it here automatically."
      />
    );
  }
  if (filtered.length === 0) return <Empty title="No matches" body={`Nothin' in here for "${q}".`} />;

  return (
    <div className="space-y-2">
      <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {filtered.length} of {data.length}
      </p>
      {filtered.map((m) => (
        <MemoryCard key={m.id} memory={m} onChanged={refresh} />
      ))}
    </div>
  );
}

function MemoryCard({ memory, onChanged }: { memory: Memory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memory.content);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = text.trim();
    if (!next || next === memory.content) {
      setEditing(false);
      setText(memory.content);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("baby_memories").update({ content: next }).eq("id", memory.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function del() {
    if (!confirm("Forget this fact?")) return;
    const { error } = await supabase.from("baby_memories").delete().eq("id", memory.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-3">
      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="bg-background text-sm"
          autoFocus
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-foreground">{memory.content}</p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {memory.source}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {new Date(memory.created_at).toLocaleDateString()}
        </span>
        <div className="ml-auto flex gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(memory.content); }} disabled={busy}>
                <X className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={del}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Ideas ───────────────────────────── */

const STATUS_LABEL: Record<IdeaRow["status"], string> = {
  grow: "Grow",
  rethink: "Rethink",
  parking_lot: "Parking",
  trash: "Trash",
};

function IdeasList({ q }: { q: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<IdeaRow["status"] | "all">("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["ideas-brain"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ideas")
        .select("id, transcript, status, topic, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IdeaRow[];
    },
  });

  const topics = useMemo(() => {
    const s = new Set<string>();
    data.forEach((i) => s.add(i.topic));
    return Array.from(s).sort();
  }, [data]);

  const [topicFilter, setTopicFilter] = useState<string>("all");

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
  if (data.length === 0) {
    return <Empty title="No ideas saved yet" body="Hold the mic on the notepad and spill somethin'." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Pill active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All status</Pill>
        {(Object.keys(STATUS_LABEL) as IdeaRow["status"][]).map((s) => (
          <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_LABEL[s]}
          </Pill>
        ))}
      </div>
      {topics.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Pill active={topicFilter === "all"} onClick={() => setTopicFilter("all")}>All topics</Pill>
          {topics.map((t) => (
            <Pill key={t} active={topicFilter === t} onClick={() => setTopicFilter(t)}>
              {t}
            </Pill>
          ))}
        </div>
      )}
      <p className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {filtered.length} of {data.length}
      </p>
      {filtered.length === 0 ? (
        <Empty title="No matches" body="Try a different filter or search." />
      ) : (
        filtered.map((i) => <IdeaRowCard key={i.id} idea={i} onChanged={refresh} />)
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function IdeaRowCard({ idea, onChanged }: { idea: IdeaRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(idea.transcript);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = text.trim();
    if (!next || next === idea.transcript) {
      setEditing(false);
      setText(idea.transcript);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("ideas").update({ transcript: next }).eq("id", idea.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function del() {
    if (!confirm("Trash this idea?")) return;
    const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {STATUS_LABEL[idea.status]}
        </span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {idea.topic}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {new Date(idea.created_at).toLocaleDateString()}
        </span>
      </div>
      {editing ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="bg-background text-sm"
          autoFocus
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-foreground">{idea.transcript}</p>
      )}
      <div className="mt-2 flex justify-end gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(idea.transcript); }} disabled={busy}>
              <X className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={del}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Shared ───────────────────────────── */

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
      <h3 className="font-display text-xl text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
