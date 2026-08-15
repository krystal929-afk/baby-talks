import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Brain,
  Check,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { BabyBubble } from "@/components/baby-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { chatWithBaby, type ChatMsg } from "@/server/chat.functions";
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

export function BabyChatDrawer({
  open,
  onOpenChange,
  context,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col bg-card"
      >
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle className="font-display tracking-wide text-primary">
            BABY
          </SheetTitle>
        </SheetHeader>

        <Tabs
          defaultValue="chat"
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="chat" className="gap-2">
              <MessageCircle className="size-4" />
              Chat
            </TabsTrigger>

            <TabsTrigger value="brain" className="gap-2">
              <Brain className="size-4" />
              Baby&apos;s Brain
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="chat"
            className="flex-1 min-h-0 m-0"
          >
            <ChatPane context={context} />
          </TabsContent>

          <TabsContent
            value="brain"
            className="flex-1 min-h-0 m-0"
          >
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
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const next: ChatMsg[] = [
        ...messages,
        {
          role: "user",
          content: text,
        },
      ];

      setMessages(next);

      const res = await chatWithBaby({
        data: {
          messages: next,
          context,
        },
      });

      setMessages([
        ...next,
        {
          role: "assistant",
          content: res.reply,
        },
      ]);

      if (res.saved_memory) {
        toast.success("Baby tucked it in her brain", {
          description: res.saved_memory,
        });
      }
    },

    onError: (e: Error) => {
      toast.error(e.message || "Baby got stuck.");
    },
  });

  const submitChat = () => {
    const text = input.trim();

    if (!text || send.isPending) {
      return;
    }

    setInput("");
    send.mutate(text);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitChat();
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Banter with Baby. She remembers things you tell her —
            check her brain anytime.
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
            <div
              key={i}
              className="mr-auto max-w-[90%]"
            >
              <BabyBubble
                text={m.content}
                animate={isLast && !send.isPending}
              />
            </div>
          );
        })}

        {send.isPending && (
          <div className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Baby&apos;s thinkin&apos;…
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-border p-3 flex gap-2"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Talk to Baby…"
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitChat();
            }
          }}
        />

        <Button
          type="submit"
          size="icon"
          disabled={send.isPending || !input.trim()}
        >
          {send.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}

function BrainPane() {
  const qc = useQueryClient();

  const {
    data: memories = [],
    isLoading,
  } = useQuery({
    queryKey: ["baby_memories"],
    queryFn: () => listMemories(),
  });

  const [draft, setDraft] = useState("");

  const add = useMutation({
    mutationFn: (content: string) =>
      addMemory({
        data: {
          content,
        },
      }),

    onSuccess: () => {
      setDraft("");

      qc.invalidateQueries({
        queryKey: ["baby_memories"],
      });

      toast.success("Added to Baby's brain");
    },

    onError: (e: Error) => {
      toast.error(
        e.message || "Baby couldn't save that memory.",
      );
    },
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      deleteMemory({
        data: {
          id,
        },
      }),

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["baby_memories"],
      });
    },

    onError: (e: Error) => {
      toast.error(
        e.message || "Baby couldn't delete that memory.",
      );
    },
  });

  const update = useMutation({
    mutationFn: (m: {
      id: string;
      content: string;
    }) =>
      updateMemory({
        data: m,
      }),

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["baby_memories"],
      });

      toast.success("Baby updated her brain");
    },

    onError: (e: Error) => {
      toast.error(
        e.message || "Baby couldn't update that memory.",
      );
    },
  });

  const submitMemory = () => {
    if (add.isPending) {
      return;
    }

    const content = draft.trim();

    if (!content) {
      toast.error("Tell Baby what you want her to remember first.");
      return;
    }

    if (content.length < 2) {
      toast.error("Give Baby a little more to work with.");
      return;
    }

    add.mutate(content);
  };

  const onMemorySubmit = (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    submitMemory();
  };

  return (
    <div className="flex flex-col h-full">
      <form
        onSubmit={onMemorySubmit}
        className="p-3 border-b border-border space-y-2"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onInput={(e) =>
            setDraft(
              (e.target as HTMLTextAreaElement).value,
            )
          }
          placeholder="Teach Baby something. e.g. 'Daddy's favorite vendor for foam is Smooth-On.'"
          rows={2}
          className="resize-none text-sm"
          maxLength={400}
        />

        <Button
          type="submit"
          size="sm"
          className="w-full gap-2"
          disabled={add.isPending}
        >
          {add.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Baby&apos;s saving it…
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Add to Baby&apos;s brain
            </>
          )}
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        )}

        {!isLoading && memories.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Baby&apos;s brain is empty. Add facts here or
            just chat — she&apos;ll save things on her own.
          </p>
        )}

        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            onDelete={() =>
              del.mutate(memory.id)
            }
            onUpdate={(content) =>
              update.mutate({
                id: memory.id,
                content,
              })
            }
          />
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

  const saveEdit = () => {
    const content = val.trim();

    if (
      content.length >= 2 &&
      content !== memory.content
    ) {
      onUpdate(content);
    }

    setEditing(false);
  };

  return (
    <div className="rounded-md border border-border bg-background/50 p-2 text-sm flex gap-2 items-start group">
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={val}
            onChange={(e) =>
              setVal(e.target.value)
            }
            autoFocus
            maxLength={400}
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveEdit();
              }

              if (e.key === "Escape") {
                setVal(memory.content);
                setEditing(false);
              }
            }}
          />
        ) : (
          <p className="leading-snug break-words">
            {memory.content}
          </p>
        )}

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
          {memory.source === "auto"
            ? "Baby saved this"
            : "You taught Baby"}{" "}
          ·{" "}
          {new Date(
            memory.created_at,
          ).toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition">
        {editing ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={saveEdit}
          >
            <Check className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() =>
              setEditing(true)
            }
          >
            <Pencil className="size-3.5" />
          </Button>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function BabyChatButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      size="icon"
      className="fixed bottom-5 right-5 z-40 size-14 rounded-full shadow-lg bg-primary text-primary-foreground hover:scale-105 transition"
      aria-label="Chat with Baby"
    >
      <MessageCircle className="size-6" />
    </Button>
  );
}
