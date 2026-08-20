import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Brain,
  CalendarDays,
  Loader2,
  LogOut,
  MessageCircle,
  Mic,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useDictation } from "@/hooks/use-dictation";
import { growIdea, type DevPack } from "@/server/baby.functions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BabyChatDrawer } from "@/components/baby-chat";
import { BabyAppNav } from "@/components/baby-app-nav";
import { signOut } from "@/components/auth-gate";
import babyPhoto from "@/assets/brand/baby-firefly.jpg";

const qc = new QueryClient();

export const Route = createFileRoute("/")({
  component: () => (
    <QueryClientProvider client={qc}>
      <BabyApp />
    </QueryClientProvider>
  ),
});

type Status = "grow" | "rethink" | "trash" | "parking_lot";
type PanelTab = "chat" | "skills";

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
  grow: { label: "Grow", cls: "border-grow/50 bg-grow/10", chipCls: "bg-grow text-grow-foreground", tagline: "Feed it, daddy" },
  rethink: { label: "Rethink", cls: "border-rethink/50 bg-rethink/10", chipCls: "bg-rethink text-rethink-foreground", tagline: "Still squirmin'" },
  parking_lot: { label: "Parking Lot", cls: "border-parking/50 bg-parking/10", chipCls: "bg-parking text-parking-foreground", tagline: "Tucked away" },
  trash: { label: "Trash", cls: "border-trash/50 bg-trash/10", chipCls: "bg-trash text-trash-foreground", tagline: "Burn it, boy" },
};

const STATUS_ORDER: Status[] = ["grow", "rethink", "parking_lot", "trash"];

function BabyApp() {
  const queryClient = useQueryClient();
  const [openIdea, setOpenIdea] = useState<Idea | null>(null);
  const [topicFilter, setTopicFilter] = useState("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<PanelTab>("chat");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get("panel");
    if (panel === "chat" || panel === "skills") {
      setChatTab(panel);
      setChatOpen(true);
      params.delete("panel");
      const search = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
    }
  }, []);

  const { data: ideas = [], isLoading } = useQuery({
    queryKey: ["ideas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Idea[];
    },
  });

  const topics = useMemo(() => {
    const set = new Set<string>();
    ideas.forEach((idea) => set.add(idea.topic));
    return Array.from(set).sort();
  }, [ideas]);

  const visible = useMemo(
    () => topicFilter === "all" ? ideas : ideas.filter((idea) => idea.topic === topicFilter),
    [ideas, topicFilter],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ideas"] });
  const openPanel = (tab: PanelTab) => {
    setChatTab(tab);
    setChatOpen(true);
  };

  return (
    <div className="bf-screen">
      <main className="bf-shell">
        <header className="bf-home-head">
          <div className="bf-home-brand">
            <div className="bf-paper-title !mx-0">NOTEBOOK</div>
            <div className="bf-greeting">Hey, Daddy.</div>
            <p className="bf-muted text-sm">What&apos;s on your mind today?</p>
          </div>

          <div className="relative">
            <div className="bf-mini-baby">
              <img src={babyPhoto} alt="Baby Firefly" draggable={false} />
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              aria-label="Sign out"
              className="absolute -bottom-8 -right-1 border border-[#4d4540] bg-black/70 p-2 text-[#847d75]"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <CaptureModule />

        <div className="bf-section-label">Idea buckets</div>
        <QuickTiles onChat={() => openPanel("chat")} onSkills={() => openPanel("skills")} />

        {ideas.length > 0 && (
          <RecentActivity ideas={ideas.slice(0, 3)} onOpen={setOpenIdea} />
        )}

        <div className="bf-section-label flex items-center justify-between">
          <span>Your notebook</span>
          <span className="text-[9px] text-[#756f68]">{ideas.length} filed</span>
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={topicFilter === "all"} onClick={() => setTopicFilter("all")}>All</FilterChip>
          {topics.map((topic) => (
            <FilterChip key={topic} active={topicFilter === topic} onClick={() => setTopicFilter(topic)}>{topic}</FilterChip>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[#8f8880]"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Diggin&apos; through Baby&apos;s box…</div>
        ) : ideas.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-5">
            {STATUS_ORDER.map((status) => {
              const items = visible.filter((idea) => idea.status === status);
              if (!items.length) return null;
              return <Column key={status} status={status} ideas={items} onOpen={setOpenIdea} />;
            })}
          </div>
        )}
      </main>

      <IdeaDetail idea={openIdea} onClose={() => setOpenIdea(null)} onChanged={refresh} />

      <BabyChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        initialTab={chatTab}
        context={openIdea ? `Daddy is looking at this idea (status: ${openIdea.status}, topic: ${openIdea.topic}):\n${openIdea.transcript}` : undefined}
      />

      <BabyAppNav active="notebook" onChat={() => openPanel("chat")} onSkills={() => openPanel("skills")} />
    </div>
  );
}

function QuickTiles({ onChat, onSkills }: { onChat: () => void; onSkills: () => void }) {
  return (
    <div className="bf-buckets">
      <Link to="/calendar" className="bf-bucket"><CalendarDays /><strong>Calendar</strong><span>Gigs &amp; reminders</span></Link>
      <Link to="/brain" className="bf-bucket"><Brain /><strong>Memories</strong><span>What Baby remembers</span></Link>
      <button type="button" onClick={onSkills} className="bf-bucket"><Wrench /><strong>Skills</strong><span>Things Baby can do</span></button>
      <button type="button" onClick={onChat} className="bf-bucket"><MessageCircle /><strong>Chat</strong><span>Talk to Baby</span></button>
    </div>
  );
}

function RecentActivity({ ideas, onOpen }: { ideas: Idea[]; onOpen: (idea: Idea) => void }) {
  return (
    <section className="mt-5">
      <div className="bf-section-label flex items-center justify-between">
        <span>Recent activity</span>
        <span className="text-[8px] text-[#756f68]">latest files</span>
      </div>
      <div className="border border-[#3b323d] bg-[#070609]">
        {ideas.map((idea, index) => (
          <button
            key={idea.id}
            type="button"
            onClick={() => onOpen(idea)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left ${index ? "border-t border-[#302932]" : ""}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#6f20b6]/45 bg-[#6f20b6]/10 text-[#baff21]">
              {idea.dev_pack ? <Sparkles className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] text-[#d8cfc1]">{idea.transcript}</p>
              <p className="mt-0.5 text-[8px] uppercase tracking-wider text-[#756f68]">{idea.topic} · {STATUS_META[idea.status].label}</p>
            </div>
            <span className="shrink-0 text-[8px] text-[#756f68]">
              {new Date(idea.updated_at || idea.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("bf-btn shrink-0 border px-3 py-2 text-[9px]", active ? "bf-btn-primary" : "bf-btn-dark")}>
      {children}
    </button>
  );
}

function Column({ status, ideas, onOpen }: { status: Status; ideas: Idea[]; onOpen: (idea: Idea) => void }) {
  const meta = STATUS_META[status];
  return (
    <section className="bf-idea-section">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("inline-block h-2 w-2 rounded-full", meta.chipCls)} />
          <h2>{meta.label}</h2>
          <span className="text-[10px] text-[#7f7972]">{meta.tagline}</span>
        </div>
        <span className="text-[10px] text-[#7f7972]">{ideas.length}</span>
      </div>
      <div className="space-y-2">
        {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onClick={() => onOpen(idea)} />)}
      </div>
    </section>
  );
}

function IdeaCard({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  const meta = STATUS_META[idea.status];
  return (
    <button onClick={onClick} className="bf-idea-card w-full border p-3 text-left transition active:scale-[0.99]">
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider", meta.chipCls)}>{meta.label}</span>
        <span className="border border-[#514951] px-2 py-0.5 text-[9px] uppercase tracking-wider text-[#8f8880]">{idea.topic}</span>
        {idea.dev_pack && <Sparkles className="h-3 w-3 text-[#9d3ee7]" />}
      </div>
      <p className="line-clamp-3 text-xs leading-relaxed text-[#ded5c8]">{idea.transcript}</p>
      <p className="mt-2 text-[8px] uppercase tracking-wider text-[#756f68]">{new Date(idea.created_at).toLocaleString()}</p>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="bf-card p-7 text-center">
      <Mic className="mx-auto mb-4 h-7 w-7 text-[#baff21]" />
      <h3 className="text-lg text-[#ded5c8]">Nothin&apos; filed yet, daddy.</h3>
      <p className="mt-2 text-xs leading-relaxed text-[#8f8880]">Hold the mic above and spill it. Baby&apos;ll put it where it belongs.</p>
    </div>
  );
}

function CaptureModule() {
  const dictation = useDictation();
  const [text, setText] = useState("");
  const [showText, setShowText] = useState(false);
  const holdActiveRef = useRef(false);
  const pressStartTsRef = useRef(0);
  const draftIdRef = useRef(0);
  const liveText = (text || dictation.interim).trim();

  function handToBaby(transcript: string, source: "voice" | "text" = "voice") {
    const clean = transcript.trim();
    if (!clean) return;
    draftIdRef.current += 1;
    window.dispatchEvent(new CustomEvent("baby:voice-draft", {
      detail: { id: Date.now() * 1000 + draftIdRef.current, text: clean, source },
    }));
    setText("");
    setShowText(false);
  }

  function handlePressStart(e: React.PointerEvent<HTMLButtonElement>) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    holdActiveRef.current = true;
    pressStartTsRef.current = Date.now();
    if (dictation.supported) dictation.start(); else setShowText(true);
  }

  function handlePressEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (!holdActiveRef.current) return;
    holdActiveRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const heldMs = Date.now() - pressStartTsRef.current;
    if (heldMs < 250) {
      dictation.stop();
      toast("Hold the button longer, daddy — keep it pressed while you talk.");
      return;
    }
    if (dictation.supported) {
      const result = dictation.stop();
      if (result) handToBaby(result, "voice");
      else toast("Didn't catch that one, daddy. Try again.");
    }
  }

  return (
    <section>
      <div className="bf-talk-card">
        <button
          type="button"
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onContextMenu={(e) => e.preventDefault()}
          className={cn("bf-talk-icon touch-none", dictation.listening && "recording-pulse")}
          aria-label="Hold to talk to Baby"
        >
          {dictation.listening ? <Square className="h-5 w-5" fill="currentColor" /> : <Mic className="h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="bf-kicker text-[#9d3ee7]">{dictation.listening ? "LISTENING…" : "HOLD TO TALK"}</div>
          <div className="mt-1 truncate text-xs text-[#cfc5b8]">{liveText || "I’m listening, Daddy."}</div>
        </div>
        <button type="button" onClick={() => setShowText((value) => !value)} className="border border-[#4e4650] p-2 text-[#9a938b]" aria-label="Type instead"><Plus className="h-4 w-4" /></button>
      </div>

      {showText && (
        <div className="mb-4 flex gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type to Baby..." rows={2} className="resize-none rounded-sm bg-[#09070b]" />
          <Button type="button" size="icon" disabled={!text.trim()} onClick={() => handToBaby(text, "text")} className="bf-btn-primary h-auto"><Send className="h-4 w-4" /></Button>
        </div>
      )}
    </section>
  );
}

function IdeaDetail({ idea, onClose, onChanged }: { idea: Idea | null; onClose: () => void; onChanged: () => void }) {
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [growing, setGrowing] = useState(false);

  useEffect(() => { if (idea) setEditText(idea.transcript); }, [idea]);
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
    if (newStatus === "grow" && !idea!.dev_pack) await handleGrow();
    else onClose();
  }

  async function handleGrow() {
    setGrowing(true);
    try {
      const pack = await growIdea({ data: { transcript: idea!.transcript, topic: idea!.topic } });
      const { error } = await supabase.from("ideas").update({ status: "grow", dev_pack: pack as never }).eq("id", idea!.id);
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
    if (error) return toast.error(error.message);
    onChanged();
    onClose();
  }

  async function handleSaveText() {
    if (editText.trim() && editText !== idea!.transcript) await update({ transcript: editText.trim() });
  }

  const meta = STATUS_META[idea.status];
  return (
    <Dialog open={!!idea} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[#4b3a58] bg-[#0a0810] sm:max-w-lg">
        <DialogHeader><DialogTitle className="bf-paper-title !mx-0 text-lg">Idea file</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.chipCls)}>{meta.label}</span>
          <span className="border border-[#514951] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#8f8880]">{idea.topic}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-[#756f68]">{new Date(idea.created_at).toLocaleString()}</span>
        </div>
        <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={handleSaveText} rows={5} className="rounded-sm bg-[#050407]" />
        <div className="grid grid-cols-2 gap-2">
          {STATUS_ORDER.map((status) => {
            const itemMeta = STATUS_META[status];
            const active = status === idea.status;
            return (
              <button key={status} disabled={saving || active} onClick={() => changeStatus(status)} className={cn("bf-btn border px-3 py-2", active ? cn(itemMeta.cls, "border-primary text-foreground") : "bf-btn-dark")}>{itemMeta.label}</button>
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
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={handleDelete}><Trash2 className="mr-1 h-3 w-3" />Delete</Button>
        </div>
        {idea.dev_pack && <DevPackView pack={idea.dev_pack} />}
      </DialogContent>
    </Dialog>
  );
}

function DevPackView({ pack }: { pack: DevPack }) {
  return (
    <div className="space-y-4 border border-[#6f20b6]/50 bg-[#6f20b6]/10 p-4">
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#baff21]" /><h3 className="text-lg">Baby&apos;s plan</h3></div>
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
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#8f8880]">{title}</p>
      <ul className="space-y-1 text-sm text-[#ded5c8]">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2"><span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-[#9d3ee7]" /><span>{item}</span></li>
        ))}
      </ul>
    </div>
  );
}
