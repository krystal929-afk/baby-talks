import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Mic, Square, Loader2, Trash2, Sparkles, X, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useDictation } from "@/hooks/use-dictation";
import { classifyIdea, growIdea, type DevPack } from "@/server/baby.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { playSting } from "@/lib/stings";
import { BabyMood, pingBaby } from "@/components/baby-mood";
import { BabyChatButton, BabyChatDrawer } from "@/components/baby-chat";
import logoPrimary from "@/assets/brand/logo-primary.png";

// Local QueryClient — index page is the whole app, no other routes use it yet.
const qc = new QueryClient();

export const Route = createFileRoute("/")({
  component: () => (
    <QueryClientProvider client={qc}>
      <BabyApp />
    </QueryClientProvider>
  ),
});

type Status = "grow" | "rethink" | "trash" | "parking_lot";

type Idea = {
  id: string;
  transcript: string;
  status: Status;
  topic: string;
  dev_pack: DevPack | null;
  created_at: string;
  updated_at: string;
};

const STATUS_META: Record<Status, { label: string; cls: string; chipCls: string; tagline: string }> = {
  grow: {
    label: "Grow",
    cls: "border-grow/50 bg-grow/10",
    chipCls: "bg-grow text-grow-foreground",
    tagline: "Feed it, daddy",
  },
  rethink: {
    label: "Rethink",
    cls: "border-rethink/50 bg-rethink/10",
    chipCls: "bg-rethink text-rethink-foreground",
    tagline: "Still squirmin'",
  },
  parking_lot: {
    label: "Parking Lot",
    cls: "border-parking/50 bg-parking/10",
    chipCls: "bg-parking text-parking-foreground",
    tagline: "Tucked away",
  },
  trash: {
    label: "Trash",
    cls: "border-trash/50 bg-trash/10",
    chipCls: "bg-trash text-trash-foreground",
    tagline: "Burn it, boy",
  },
};

const STATUS_ORDER: Status[] = ["grow", "rethink", "parking_lot", "trash"];

function BabyApp() {
  const queryClient = useQueryClient();
  const [openIdea, setOpenIdea] = useState<Idea | null>(null);
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [chatOpen, setChatOpen] = useState(false);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["ideas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ideas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Idea[];
    },
  });

  const topics = useMemo(() => {
    const s = new Set<string>();
    ideas.forEach((i) => s.add(i.topic));
    return Array.from(s).sort();
  }, [ideas]);

  const visible = useMemo(
    () => (topicFilter === "all" ? ideas : ideas.filter((i) => i.topic === topicFilter)),
    [ideas, topicFilter]
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ideas"] });

  return (
    <div className="min-h-screen pb-44">
      <BabyMood />
      <Header />

      {/* Topic filters */}
      <div className="sticky top-0 z-10 -mt-px border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto">
          <FilterChip active={topicFilter === "all"} onClick={() => setTopicFilter("all")}>
            All
          </FilterChip>
          {topics.map((t) => (
            <FilterChip key={t} active={topicFilter === t} onClick={() => setTopicFilter(t)}>
              {t}
            </FilterChip>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pt-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Diggin' through Baby&apos;s box…
          </div>
        ) : ideas.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {STATUS_ORDER.map((s) => {
              const items = visible.filter((i) => i.status === s);
              if (items.length === 0) return null;
              return (
                <Column key={s} status={s} ideas={items} onOpen={setOpenIdea} />
              );
            })}
          </div>
        )}
      </main>

      <CaptureBar onSaved={refresh} />

      <IdeaDetail
        idea={openIdea}
        onClose={() => setOpenIdea(null)}
        onChanged={() => {
          refresh();
        }}
      />

      <BabyChatButton onClick={() => setChatOpen(true)} />
      <BabyChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        context={
          openIdea
            ? `Daddy is looking at this idea (status: ${openIdea.status}, topic: ${openIdea.topic}):\n${openIdea.transcript}`
            : undefined
        }
      />
    </div>
  );
}

function Header() {
  return (
    <header className="px-4 pb-4 pt-8 text-center">
      <img
        src={logoPrimary}
        alt="MR. SATAN"
        className="mx-auto h-32 w-auto select-none drop-shadow-[0_0_24px_oklch(0.92_0.23_124/25%)]"
        draggable={false}
      />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-primary flicker">
        Baby&apos;s Killer Notepad
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Hold the mic. Spill it, daddy. Baby&apos;ll tuck it away for ya.
      </p>
    </header>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.92_0.23_124/40%)]"
          : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Column({
  status,
  ideas,
  onOpen,
}: {
  status: Status;
  ideas: Idea[];
  onOpen: (i: Idea) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block h-2 w-2 rounded-full", meta.chipCls)} />
          <h2 className="font-display text-lg text-foreground">{meta.label}</h2>
          <span className="text-xs text-muted-foreground">{meta.tagline}</span>
        </div>
        <span className="text-xs text-muted-foreground">{ideas.length}</span>
      </div>
      <div className="space-y-2">
        {ideas.map((i) => (
          <IdeaCard key={i.id} idea={i} onClick={() => onOpen(i)} />
        ))}
      </div>
    </section>
  );
}

function IdeaCard({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  const meta = STATUS_META[idea.status];
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border p-4 text-left transition active:scale-[0.99]",
        "border-border/60 bg-card/80 hover:border-primary/50 hover:bg-card"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.chipCls)}>
          {meta.label}
        </span>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {idea.topic}
        </span>
        {idea.dev_pack && (
          <Sparkles className="h-3 w-3 text-accent" />
        )}
      </div>
      <p className="line-clamp-3 text-sm text-foreground">{idea.transcript}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {new Date(idea.created_at).toLocaleString()}
      </p>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
        <Mic className="h-7 w-7 text-primary" />
      </div>
      <h3 className="font-display text-xl text-foreground">Nothin' in here yet, daddy</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Press and hold the big green button. Whisper somethin' wicked. Baby&apos;ll handle the rest.
      </p>
    </div>
  );
}

/* ───────────────────────────── Capture ───────────────────────────── */

function CaptureBar({ onSaved }: { onSaved: () => void }) {
  const dictation = useDictation();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [showText, setShowText] = useState(false);
  const holdActiveRef = useRef(false);
  const pressStartTsRef = useRef(0);

  const liveText = (text || dictation.interim).trim();

  async function saveIdea(transcript: string) {
    if (!transcript.trim()) return;
    setPending(true);
    pingBaby("thinking", "");
    try {
      const cls = await classifyIdea({ data: { transcript } });
      const { error } = await supabase.from("ideas").insert({
        transcript,
        status: cls.status,
        topic: cls.topic,
      });
      if (error) throw error;

      const reply = cls.bernice_reply || "Tucked it away, daddy.";
      onSaved();
      playSting(cls.status);
      pingBaby(cls.status, reply);

      setText("");
      setShowText(false);
    } catch (e) {
      console.error(e);
      pingBaby("idle", "");
      toast.error(e instanceof Error ? e.message : "Baby chipped a nail. Try again, sugar britches.");
    } finally {
      setPending(false);
    }
  }

  function handlePressStart(e: React.PointerEvent<HTMLButtonElement>) {
    if (pending) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    holdActiveRef.current = true;
    pressStartTsRef.current = Date.now();
    if (dictation.supported) {
      dictation.start();
    } else {
      setShowText(true);
    }
  }
  function handlePressEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }

    const heldMs = Date.now() - pressStartTsRef.current;
    if (heldMs < 250) {
      // Tap was too short — engine may not have started. Cancel cleanly.
      dictation.stop();
      toast("Hold the button longer, daddy — keep it pressed while you talk.");
      return;
    }

    if (dictation.supported) {
      const result = dictation.stop();
      if (result) saveIdea(result);
      else toast("Didn't catch that one, daddy. Try again.");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {(dictation.listening || liveText) && (
          <div className="mb-3 rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-sm text-foreground">
            <span className="text-muted-foreground">{dictation.listening ? "Listening… " : ""}</span>
            {liveText || <span className="italic text-muted-foreground">whisper somethin'…</span>}
          </div>
        )}

        {showText && (
          <div className="mb-3 flex gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your idea..."
              rows={2}
              className="flex-1 resize-none bg-card"
            />
            <Button
              type="button"
              size="icon"
              disabled={!text.trim() || pending}
              onClick={() => saveIdea(text)}
              className="h-auto"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setShowText((v) => !v)}
            className="rounded-full border border-border/60 p-3 text-muted-foreground transition hover:text-foreground"
            aria-label="Type instead"
          >
            <Plus className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={pending}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              "relative flex h-20 w-20 select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition",
              dictation.listening && "recording-pulse",
              pending && "opacity-60"
            )}
            style={{
              touchAction: "none",
              backgroundImage: "var(--gradient-toxic)",
            }}
            aria-label="Hold to dictate"
          >
            {pending ? (
              <Loader2 className="h-8 w-8 animate-spin" strokeWidth={2.5} />
            ) : dictation.listening ? (
              <Square className="h-8 w-8" strokeWidth={2.5} fill="currentColor" />
            ) : (
              <Mic className="h-9 w-9" strokeWidth={2.5} />
            )}
          </button>

          <div className="w-10" aria-hidden />
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {dictation.supported
            ? "Hold the button — speak — let go to save"
            : "Voice not supported on this browser — tap + to type"}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────── Detail ───────────────────────────── */

function IdeaDetail({
  idea,
  onClose,
  onChanged,
}: {
  idea: Idea | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [growing, setGrowing] = useState(false);

  useEffect(() => {
    if (idea) setEditText(idea.transcript);
  }, [idea]);

  if (!idea) return null;

  async function update(patch: Partial<Idea>) {
    setSaving(true);
    try {
      const { error } = await supabase.from("ideas").update(patch).eq("id", idea!.id);
      if (error) throw error;
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(newStatus: Status) {
    await update({ status: newStatus });
    if (newStatus === "grow" && !idea!.dev_pack) {
      await handleGrow();
    } else {
      onClose();
    }
  }

  async function handleGrow() {
    setGrowing(true);
    try {
      const pack = await growIdea({ data: { transcript: idea!.transcript, topic: idea!.topic } });
      const { error } = await supabase
        .from("ideas")
        .update({ status: "grow", dev_pack: pack as never })
        .eq("id", idea!.id);
      if (error) throw error;
      toast.success("Baby cooked up a plan, daddy.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't grow that one.");
    } finally {
      setGrowing(false);
    }
  }

  async function handleDelete() {
    const { error } = await supabase.from("ideas").delete().eq("id", idea!.id);
    if (error) toast.error(error.message);
    else {
      onChanged();
      onClose();
    }
  }

  async function handleSaveText() {
    if (editText.trim() && editText !== idea!.transcript) {
      await update({ transcript: editText.trim() });
    }
  }

  const meta = STATUS_META[idea.status];

  return (
    <Dialog open={!!idea} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Idea</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.chipCls)}>
            {meta.label}
          </span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {idea.topic}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
            {new Date(idea.created_at).toLocaleString()}
          </span>
        </div>

        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSaveText}
          rows={5}
          className="bg-background"
        />

        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((s) => {
            const m = STATUS_META[s];
            const active = s === idea.status;
            return (
              <button
                key={s}
                disabled={saving || active}
                onClick={() => changeStatus(s)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition",
                  active
                    ? cn(m.cls, "border-primary text-foreground")
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {idea.status === "grow" && (
            <Button variant="outline" size="sm" onClick={handleGrow} disabled={growing}>
              {growing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
              {idea.dev_pack ? "Re-grow" : "Grow this"}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={handleDelete}>
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        </div>

        {idea.dev_pack && <DevPackView pack={idea.dev_pack} />}
      </DialogContent>
    </Dialog>
  );
}

function DevPackView({ pack }: { pack: DevPack }) {
  return (
    <div className="space-y-4 rounded-xl border border-grow/40 bg-grow/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-grow" />
        <h3 className="font-display text-lg">Baby&apos;s plan</h3>
      </div>
      <PackList title="Next steps" items={pack.next_steps} />
      <PackList title="Key questions" items={pack.key_questions} />
      <PackList title="Risks" items={pack.risks} />
    </div>
  );
}

function PackList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-sm text-foreground">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
