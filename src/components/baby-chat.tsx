import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Brain,
  Check,
  History,
  Loader2,
  MessageCircle,
  Mic,
  Pencil,
  Plus,
  Send,
  Square,
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
import { useDictation } from "@/hooks/use-dictation";
import {
  createSpeechHandle,
  speak,
  type SpeechHandle,
} from "@/lib/speak";

import {
  chatWithBaby,
  type ChatMsg,
} from "@/server/chat.functions";

import {
  addMemory,
  deleteMemory,
  listMemories,
  updateMemory,
  type Memory,
} from "@/server/memories.functions";

import {
  appendConversationMessage,
  createConversation,
  deleteConversation,
  listConversations,
  loadConversation,
  renameConversation,
  type BabyConversation,
} from "@/server/conversations.functions";

const ACTIVE_CONVERSATION_KEY = "baby-active-conversation-id";
const VOICE_DRAFT_EVENT = "baby:voice-draft";

export type BabyChatDraft = {
  id: number;
  text: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context?: string;
  dictatedDraft?: BabyChatDraft | null;
  onDictatedDraftConsumed?: (id: number) => void;
};

type DraftRoute =
  | { kind: "current" }
  | { kind: "new" }
  | { kind: "existing"; conversation: BabyConversation }
  | { kind: "ambiguous"; matches: BabyConversation[] };

type SendRequest = {
  text: string;
  spoken: boolean;
  speechHandle?: SpeechHandle;
};

const ROUTING_STOP_WORDS = new Set([
  "chat",
  "conversation",
  "about",
  "with",
  "this",
  "that",
  "from",
  "into",
  "the",
  "and",
  "for",
]);

function normalizeRoutingText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchScore(text: string, title: string) {
  const normalizedText = normalizeRoutingText(text);
  const normalizedTitle = normalizeRoutingText(title);

  if (!normalizedTitle) return 0;
  if (normalizedText.includes(normalizedTitle)) return 1;

  const tokens = normalizedTitle
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        !ROUTING_STOP_WORDS.has(token),
    );

  if (!tokens.length) return 0;

  const hits = tokens.filter((token) =>
    normalizedText.includes(token),
  );

  if (!hits.length) return 0;

  const ratio = hits.length / tokens.length;
  const distinctiveHit = hits.some((token) => token.length >= 5);

  return Math.min(0.95, ratio + (distinctiveHit ? 0.15 : 0));
}

function resolveDraftRoute(
  text: string,
  conversations: BabyConversation[],
): DraftRoute {
  const normalized = normalizeRoutingText(text);

  if (
    /\b(new|fresh) (chat|conversation)\b/.test(normalized) ||
    /\b(start|open) (a )?(new|fresh) (chat|conversation)\b/.test(normalized)
  ) {
    return { kind: "new" };
  }

  const scored = conversations
    .map((conversation) => ({
      conversation,
      score: titleMatchScore(text, conversation.title),
    }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { kind: "current" };

  const best = scored[0];
  const second = scored[1];

  if (second && best.score - second.score < 0.25) {
    return {
      kind: "ambiguous",
      matches: scored.slice(0, 3).map((item) => item.conversation),
    };
  }

  return {
    kind: "existing",
    conversation: best.conversation,
  };
}

export function BabyChatDrawer({
  open,
  onOpenChange,
  context,
  dictatedDraft,
  onDictatedDraftConsumed,
}: Props) {
  const [voiceDraft, setVoiceDraft] = useState<BabyChatDraft | null>(null);

  useEffect(() => {
    const handleVoiceDraft = (event: Event) => {
      const detail = (event as CustomEvent<BabyChatDraft>).detail;
      const text = detail?.text?.trim();

      if (!text) return;

      setVoiceDraft({
        id: Number(detail.id) || Date.now(),
        text,
      });
      onOpenChange(true);
    };

    window.addEventListener(VOICE_DRAFT_EVENT, handleVoiceDraft);
    return () => window.removeEventListener(VOICE_DRAFT_EVENT, handleVoiceDraft);
  }, [onOpenChange]);

  const activeDraft = dictatedDraft ?? voiceDraft;

  const handleDraftConsumed = useCallback(
    (id: number) => {
      setVoiceDraft((current) =>
        current?.id === id ? null : current,
      );
      onDictatedDraftConsumed?.(id);
    },
    [onDictatedDraftConsumed],
  );

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

        <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
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

          <TabsContent value="chat" className="flex-1 min-h-0 m-0">
            <ChatPane
              context={context}
              dictatedDraft={activeDraft}
              onDictatedDraftConsumed={handleDraftConsumed}
            />
          </TabsContent>

          <TabsContent value="brain" className="flex-1 min-h-0 m-0">
            <BrainPane />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ChatPane({
  context,
  dictatedDraft,
  onDictatedDraftConsumed,
}: {
  context?: string;
  dictatedDraft?: BabyChatDraft | null;
  onDictatedDraftConsumed?: (id: number) => void;
}) {
  const qc = useQueryClient();
  const chatDictation = useDictation();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [inputOrigin, setInputOrigin] = useState<"text" | "voice">("text");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictationHoldRef = useRef(false);
  const dictationStartRef = useRef(0);
  const dictationBaseRef = useRef("");
  const handledDraftRef = useRef<number | null>(null);

  const setActiveConversation = useCallback((id: string | null) => {
    setConversationId(id);

    if (typeof window === "undefined") return;

    if (id) {
      window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
    if (saved) setConversationId(saved);
  }, []);

  const {
    data: conversations = [],
    isFetched: conversationsFetched,
  } = useQuery({
    queryKey: ["baby_conversations"],
    queryFn: () => listConversations(),
  });

  useEffect(() => {
    if (!conversationsFetched || !conversationId) return;

    const stillExists = conversations.some(
      (conversation) => conversation.id === conversationId,
    );

    if (!stillExists) {
      setActiveConversation(null);
      setMessages([]);
    }
  }, [
    conversations,
    conversationsFetched,
    conversationId,
    setActiveConversation,
  ]);

  useEffect(() => {
    const text = dictatedDraft?.text.trim();

    if (
      !text ||
      !dictatedDraft ||
      !conversationsFetched ||
      handledDraftRef.current === dictatedDraft.id
    ) {
      return;
    }

    handledDraftRef.current = dictatedDraft.id;
    const route = resolveDraftRoute(text, conversations);

    if (route.kind === "new") {
      setActiveConversation(null);
      setMessages([]);
    } else if (route.kind === "existing") {
      setActiveConversation(route.conversation.id);
      setMessages([]);
      toast(`Opening “${route.conversation.title}”.`);
    } else if (route.kind === "ambiguous") {
      toast(
        `I found more than one matching conversation: ${route.matches
          .map((conversation) => conversation.title)
          .join(", ")}. Pick one before you send.`,
      );
    }

    setInput(text);
    setInputOrigin("voice");
    onDictatedDraftConsumed?.(dictatedDraft.id);

    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(text.length, text.length);
    });
  }, [
    dictatedDraft,
    conversationsFetched,
    conversations,
    onDictatedDraftConsumed,
    setActiveConversation,
  ]);

  const {
    data: loadedConversation,
    isFetching: loadingConversation,
  } = useQuery({
    queryKey: ["baby_conversation", conversationId],
    queryFn: () =>
      loadConversation({
        data: { conversation_id: conversationId! },
      }),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!loadedConversation) return;

    setMessages(
      loadedConversation.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    );
  }, [loadedConversation]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const removeConversation = useMutation({
    mutationFn: (id: string) =>
      deleteConversation({ data: { conversation_id: id } }),
    onSuccess: () => {
      setActiveConversation(null);
      setMessages([]);
      qc.invalidateQueries({ queryKey: ["baby_conversations"] });
      toast.success("Baby burned that conversation.");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Couldn't delete that conversation.");
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation({
        data: {
          conversation_id: id,
          title,
        },
      }),
    onSuccess: (conversation) => {
      qc.invalidateQueries({ queryKey: ["baby_conversations"] });
      qc.invalidateQueries({
        queryKey: ["baby_conversation", conversation.id],
      });
      toast.success("Conversation renamed.");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Couldn't rename that conversation.");
    },
  });

  const send = useMutation({
    mutationFn: async ({ text, spoken, speechHandle }: SendRequest) => {
      const next: ChatMsg[] = [
        ...messages,
        { role: "user", content: text },
      ];

      setMessages(next);

      let activeConversationId = conversationId;

      if (!activeConversationId) {
        const conversation = await createConversation({
          data: { first_message: text },
        });

        activeConversationId = conversation.id;
        setActiveConversation(conversation.id);
      } else {
        await appendConversationMessage({
          data: {
            conversation_id: activeConversationId,
            role: "user",
            content: text,
          },
        });
      }

      const res = await chatWithBaby({
        data: {
          messages: next,
          context,
        },
      });

      const finalMessages: ChatMsg[] = [
        ...next,
        { role: "assistant", content: res.reply },
      ];

      setMessages(finalMessages);

      if (spoken) {
        void speak(res.reply, speechHandle).then((voiceResult) => {
          if (voiceResult.error) {
            console.warn("Baby voice reply issue:", voiceResult.error);
          }
        });
      }

      try {
        await appendConversationMessage({
          data: {
            conversation_id: activeConversationId,
            role: "assistant",
            content: res.reply,
          },
        });
      } catch (e) {
        console.error("Conversation save failed:", e);
        toast.error("Baby answered, but couldn't save that reply.");
      }

      qc.invalidateQueries({ queryKey: ["baby_conversations"] });
      qc.invalidateQueries({
        queryKey: ["baby_conversation", activeConversationId],
      });
      qc.invalidateQueries({ queryKey: ["ideas"] });

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
    if (!text || send.isPending) return;

    const spoken = inputOrigin === "voice";
    const speechHandle = spoken ? createSpeechHandle() : undefined;

    setInput("");
    setInputOrigin("text");
    send.mutate({ text, spoken, speechHandle });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitChat();
  };

  const startNewChat = () => {
    if (send.isPending) return;

    setActiveConversation(null);
    setMessages([]);
    setInput("");
    setInputOrigin("text");
  };

  const selectConversation = (id: string) => {
    if (send.isPending) return;

    if (!id) {
      startNewChat();
      return;
    }

    setActiveConversation(id);
    setMessages([]);
  };

  const currentConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  );

  const handleRename = () => {
    if (!conversationId || rename.isPending) return;

    const currentTitle = currentConversation?.title ?? "";
    const nextTitle = window.prompt("Rename conversation", currentTitle)?.trim();

    if (!nextTitle || nextTitle === currentTitle) return;

    rename.mutate({ id: conversationId, title: nextTitle });
  };

  const handleDictationStart = (e: PointerEvent<HTMLButtonElement>) => {
    if (send.isPending || !chatDictation.supported) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // noop
    }

    dictationHoldRef.current = true;
    dictationStartRef.current = Date.now();
    dictationBaseRef.current = input.trim();
    chatDictation.start();
  };

  const handleDictationEnd = (e: PointerEvent<HTMLButtonElement>) => {
    if (!dictationHoldRef.current) return;

    dictationHoldRef.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }

    const result = chatDictation.stop();
    const heldMs = Date.now() - dictationStartRef.current;

    if (heldMs < 250) {
      toast("Hold the mic while you talk.");
      return;
    }

    if (!result) {
      toast("Didn't catch that one, daddy. Try again.");
      return;
    }

    const combined = [dictationBaseRef.current, result]
      .filter(Boolean)
      .join(" ")
      .trim();

    setInput(combined);
    setInputOrigin("voice");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-2 flex items-center gap-2">
        <History className="size-4 shrink-0 text-muted-foreground" />

        <select
          value={conversationId ?? ""}
          onChange={(e) => selectConversation(e.target.value)}
          disabled={send.isPending}
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          aria-label="Saved conversations"
        >
          <option value="">New conversation</option>

          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title}
            </option>
          ))}
        </select>

        <Button
          type="button"
          size="icon"
          variant="outline"
          className="shrink-0"
          onClick={startNewChat}
          disabled={send.isPending}
          aria-label="New conversation"
        >
          <Plus className="size-4" />
        </Button>

        {conversationId && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0"
              disabled={rename.isPending || send.isPending}
              onClick={handleRename}
              aria-label="Rename conversation"
            >
              {rename.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-destructive"
              disabled={removeConversation.isPending || send.isPending}
              onClick={() => {
                const ok = confirm(
                  `Burn "${currentConversation?.title ?? "this conversation"}"?`,
                );

                if (ok) removeConversation.mutate(conversationId);
              }}
              aria-label="Delete conversation"
            >
              {removeConversation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </Button>
          </>
        )}
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {loadingConversation && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Baby&apos;s diggin&apos; through the old tapes…
          </div>
        )}

        {!loadingConversation && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Banter with Baby. She remembers things you tell her — and now she keeps your conversations too.
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
            <div key={i} className="mr-auto max-w-[90%]">
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
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (!e.target.value.trim()) setInputOrigin("text");
          }}
          placeholder={
            chatDictation.listening
              ? chatDictation.interim || "Listening…"
              : "Talk to Baby…"
          }
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitChat();
            }
          }}
        />

        {chatDictation.supported && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={send.isPending}
            onPointerDown={handleDictationStart}
            onPointerUp={handleDictationEnd}
            onPointerCancel={handleDictationEnd}
            onContextMenu={(e) => e.preventDefault()}
            className="shrink-0 self-stretch h-auto touch-none"
            aria-label="Hold to dictate into chat"
          >
            {chatDictation.listening ? (
              <Square className="size-4" fill="currentColor" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>
        )}

        <Button
          type="submit"
          size="icon"
          className="shrink-0 self-stretch h-auto"
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

  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["baby_memories"],
    queryFn: () => listMemories(),
  });

  const [draft, setDraft] = useState("");

  const add = useMutation({
    mutationFn: (content: string) =>
      addMemory({ data: { content } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["baby_memories"] });
      toast.success("Added to Baby's brain");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't save that memory.");
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteMemory({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baby_memories"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't delete that memory.");
    },
  });

  const update = useMutation({
    mutationFn: (m: { id: string; content: string }) =>
      updateMemory({ data: m }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["baby_memories"] });
      toast.success("Baby updated her brain");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Baby couldn't update that memory.");
    },
  });

  const submitMemory = () => {
    if (add.isPending) return;

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

  const onMemorySubmit = (e: FormEvent<HTMLFormElement>) => {
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
            setDraft((e.target as HTMLTextAreaElement).value)
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
            Baby&apos;s brain is empty. Add facts here or just chat — she&apos;ll save things on her own.
          </p>
        )}

        {memories.map((memory) => (
          <MemoryRow
            key={memory.id}
            memory={memory}
            onDelete={() => del.mutate(memory.id)}
            onUpdate={(content) =>
              update.mutate({ id: memory.id, content })
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

    if (content.length >= 2 && content !== memory.content) {
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
            onChange={(e) => setVal(e.target.value)}
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
          <p className="leading-snug break-words">{memory.content}</p>
        )}

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
          {memory.source === "auto" ? "Baby saved this" : "You taught Baby"}{" "}
          · {new Date(memory.created_at).toLocaleDateString()}
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
            onClick={() => setEditing(true)}
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
