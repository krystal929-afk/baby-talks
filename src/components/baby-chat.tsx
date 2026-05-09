import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Loader2, MessageCircle, Plus, Send, Trash2, X, Pencil, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { chatWithBaby, type ChatMsg } from "@/server/chat.functions";
import { BabyBubble } from "@/components/baby-bubble";
import {
  addMemory,
  deleteMemory,
  listMemories,
  updateMemory,
  type Memory,
} from "@/server/memories.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context?: string;
};

export function BabyChatDrawer({ open, onOpenChange, context }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-card">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="font-display tracking-wide text-primary">BABY</SheetTitle>
        </SheetHeader>
        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="chat" className="gap-2">
              <MessageCircle className="size-4" /> Chat
            </TabsTrigger>
            <TabsTrigger value="brain" className="gap-2">
              <Brain className="size-4" /> Baby's Brain
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 min-h-0 m-0">
            <ChatPane context={context} />
          </TabsContent>
          <TabsContent value="brain" className="flex-1 min-h-0 m-0">
            <BrainPane />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ChatPane({ context }: { context?: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const next: ChatMsg[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      const res = await chatWithBaby({ data: { messages: next, context } });
      setMessages([...next, { role: "assistant", content: res.reply }]);
      if (res.saved_memory) {
        toast.success("Baby tucked it in her brain", { description: res.saved_memory });
      }
    },
    onError: (e: Error) => toast.error(e.message || "Baby got stuck."),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");
    send.mutate(text);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Banter with Baby. She remembers things you tell her — check her brain anytime.
          </p>
        )}
        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div
                key={i}
                className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-3 text-base leading-relaxed whitespace-pre-wrap"
              >
                {m.content}
              </div>
            );
          }
          const isLast = i === messages.length - 1;
          return (
            <BabyBubble
              key={i}
              text={m.content}
              animate={isLast && !send.isPending}
            />
          );
        })}
        {send.isPending && (
          <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Baby's thinkin'…
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="border-t border-border p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Talk to Baby…"
          rows={2}
          className="resize-none"
        />
        <Button type="submit" size="icon" disabled={send.isPending || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function BrainPane() {
  const qc = useQueryClient();
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["baby_memories"],
    queryFn: () => listMemories(),
  });
  const [draft, setDraft] = useState("");

  const add = useMutation({
    mutationFn: (content: string) => addMemory({ data: { content } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["baby_memories"] });
      toast.success("Added to Baby's brain");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteMemory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baby_memories"] }),
  });

  const update = useMutation({
    mutationFn: (m: { id: string; content: string }) => updateMemory({ data: m }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baby_memories"] }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Teach Baby something. e.g. 'Daddy's favorite vendor for foam is Smooth-On.'"
          rows={2}
          className="resize-none text-sm"
          maxLength={400}
        />
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => draft.trim() && add.mutate(draft.trim())}
          disabled={add.isPending || draft.trim().length < 2}
        >
          <Plus className="size-4" /> Add to Baby's brain
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {!isLoading && memories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Baby's brain is empty. Add facts here or just chat — she'll save things on her own.
          </p>
        )}
        {memories.map((m) => (
          <MemoryRow key={m.id} memory={m} onDelete={() => del.mutate(m.id)} onUpdate={(content) => update.mutate({ id: m.id, content })} />
        ))}
      </div>
    </div>
  );
}

function MemoryRow({
  memory,
  onDelete,
  onUpdate,
}: {
  memory: Memory;
  onDelete: () => void;
  onUpdate: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(memory.content);

  return (
    <div className="rounded-md border border-border bg-background/50 p-2 text-sm flex gap-2 items-start group">
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
            maxLength={400}
            className="text-sm"
          />
        ) : (
          <p className="leading-snug break-words">{memory.content}</p>
        )}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
          {memory.source === "auto" ? "Baby saved this" : "You taught Baby"} ·{" "}
          {new Date(memory.created_at).toLocaleDateString()}
        </p>
      </div>
      <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition">
        {editing ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              if (val.trim().length >= 2 && val !== memory.content) onUpdate(val.trim());
              setEditing(false);
            }}
          >
            <Check className="size-3.5" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function BabyChatButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:scale-105 transition"
      aria-label="Chat with Baby"
    >
      <MessageCircle className="size-6" />
    </Button>
  );
}
