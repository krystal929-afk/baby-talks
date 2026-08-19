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
  Loader2,
  Menu,
  MessageCircle,
  Mic,
  Pencil,
  Plus,
  Search,
  Send,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BabyBubble } from "@/components/baby-bubble";
import { BabySkillsPane } from "@/components/baby-skills-pane";
import { BabyUploadButton } from "@/components/baby-upload-button";
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
import {
  describeBabyUploads,
  type BabyUpload,
} from "@/server/upload.functions";

const ACTIVE_CONVERSATION_KEY = "baby-active-conversation-id";
const VOICE_DRAFT_EVENT = "baby:voice-draft";

export type BabyChatDraft = {
  id: number;
  text: string;
  source?: "voice" | "text";
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
  uploads: BabyUpload[];
};

type ChatImage = {
  id: string;
  prompt: string;
  mime_type: string;
  aspect_ratio: string;
  model: string;
  url: string;
};

type DisplayChatMsg = ChatMsg & {
  images?: ChatImage[];
  animate?: boolean;
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

  const hits = tokens.filter((token) => normalizedText.includes(token));
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

  const explicitRoute =
    /\b(open|switch to|go to|go back to|continue|put this in)\b/.test(normalized) &&
    /\b(chat|conversation)\b/.test(normalized);

  if (!explicitRoute) return { kind: "current" };

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

  return { kind: "existing", conversation: best.conversation };
}

function displayMessages(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    images?: ChatImage[];
  }>,
): DisplayChatMsg[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    images: message.images,
    animate: false,
  }));
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
        source: detail.source === "text" ? "text" : "voice",
      });
      onOpenChange(true);
    };

    window.addEventListener(VOICE_DRAFT_EVENT, handleVoiceDraft);
    return () => window.removeEventListener(VOICE_DRAFT_EVENT, handleVoiceDraft);
  }, [onOpenChange]);

  const activeDraft = dictatedDraft ?? voiceDraft;

  const handleDraftConsumed = useCallback(
    (id: number) => {
      setVoiceDraft((current) => (current?.id === id ? null : current));
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
          <TabsList className="mx-4 mt-2 grid grid-cols-3">
            <TabsTrigger value="chat" className="gap-2">
              <MessageCircle className="size-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="brain" className="gap-2">
              <Brain className="size-4" />
              Brain
            </TabsTrigger>
            <TabsTrigger value="skills" className="gap-2">
              <Wrench className="size-4" />
              Skills
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
          <TabsContent value="skills" className="flex-1 min-h-0 m-0">
            <BabySkillsPane />
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

  const [messages, setMessages] = useState<DisplayChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [inputOrigin, setInputOrigin] = useState<"text" | "voice">("text");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [newChatMode, setNewChatMode] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<BabyUpload[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_CONVERSATION_KEY);
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dictationHoldRef = useRef(false);
  const dictationStartRef = useRef(0);
  const dictationBaseRef = useRef("");
  const handledDraftRef = useRef<number | null>(null);

  const setActiveConversation = useCallback((id: string | null) => {
    setConversationId(id);
    if (typeof window === "undefined") return;

    if (id) window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, id);
    else window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }, []);

  const {
    data: conversations = [],
    isFetched: conversationsFetched,
  } = useQuery({
    queryKey: ["baby_conversations"],
    queryFn: () => listConversations(),
  });

  useEffect(() => {
    if (!conversationsFetched) return;

    if (conversationId) {
      const exists = conversations.some((conversation) => conversation.id === conversationId);
      if (!exists) {
        setActiveConversation(null);
        setMessages([]);
        setNewChatMode(false);
      }
      return;
    }

    if (!newChatMode && conversations.length > 0) {
      setActiveConversation(conversations[0].id);
      return;
    }

    if (!conversationId && conversations.length === 0) {
      setNewChatMode(true);
    }
  }, [
    conversations,
    conversationsFetched,
    conversationId,
    newChatMode,
    setActiveConversation,
  ]);

  const {
    data: loadedConversation,
    isFetching: loadingConversation,
  } = useQuery({
    queryKey: ["baby_conversation", conversationId],
    queryFn: () =>
      loadConversation({ data: { conversation_id: conversationId! } }),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!loadedConversation || loadedConversation.conversation.id !== conversationId) return;
    setMessages(displayMessages(loadedConversation.messages));
  }, [loadedConversation, conversationId]);

  const threadReady =
    conversationsFetched &&
    (newChatMode ||
      (conversationId !== null &&
        !loadingConversation &&
        loadedConversation?.conversation.id === conversationId));

  const startNewChat = useCallback(() => {
    setNewChatMode(true);
    setActiveConversation(null);
    setMessages([]);
    setInput("");
    setInputOrigin("text");
    setPendingUploads([]);
    setHistoryOpen(false);
  }, [setActiveConversation]);

  const selectConversation = useCallback(
    (id: string) => {
      setNewChatMode(false);
      setActiveConversation(id);
      setMessages([]);
      setPendingUploads([]);
      setHistoryOpen(false);
    },
    [setActiveConversation],
  );

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
      startNewChat();
    } else if (route.kind === "existing") {
      selectConversation(route.conversation.id);
      toast(`Opening “${route.conversation.title}”.`);
    } else if (route.kind === "ambiguous") {
      toast(
        `I found more than one matching conversation: ${route.matches
          .map((conversation) => conversation.title)
          .join(", ")}. Pick one from history.`,
      );
      setHistoryOpen(true);
    }

    setInput(text);
    setInputOrigin(dictatedDraft.source === "text" ? "text" : "voice");
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
    selectConversation,
    startNewChat,
  ]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages]);

  const removeConversation = useMutation({
    mutationFn: (id: string) =>
      deleteConversation({ data: { conversation_id: id } }),
    onSuccess: (_, id) => {
      if (id === conversationId) {
        setActiveConversation(null);
        setMessages([]);
        setPendingUploads([]);
        setNewChatMode(false);
      }
      qc.invalidateQueries({ queryKey: ["baby_conversations"] });
      toast.success("Baby burned that conversation.");
    },
    onError: (e: Error) => {
      toast.error(e.message || "Couldn't delete that conversation.");
    },
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation({ data: { conversation_id: id, title } }),
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

  const renameConversationById = (id: string) => {
    if (rename.isPending) return;
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation) return;

    const nextTitle = window.prompt("Rename conversation", conversation.title)?.trim();
    if (!nextTitle || nextTitle === conversation.title) return;
    rename.mutate({ id, title: nextTitle });
  };

  const send = useMutation({
    mutationFn: async ({ text, spoken, speechHandle, uploads }: SendRequest) => {
      let activeConversationId = conversationId;
      let next: DisplayChatMsg[];

      if (activeConversationId) {
        const saved = await loadConversation({
          data: { conversation_id: activeConversationId },
        });
        const authoritative = displayMessages(saved.messages);
        const last = authoritative[authoritative.length - 1];
        const alreadyPending =
          last?.role === "user" && last.content.trim() === text.trim();

        if (alreadyPending) {
          next = authoritative;
        } else {
          await appendConversationMessage({
            data: {
              conversation_id: activeConversationId,
              role: "user",
              content: text,
            },
          });
          next = [...authoritative, { role: "user", content: text, animate: false }];
        }
      } else {
        const conversation = await createConversation({
          data: { first_message: text },
        });
        activeConversationId = conversation.id;
        setActiveConversation(conversation.id);
        setNewChatMode(false);
        next = [{ role: "user", content: text, animate: false }];
      }

      setMessages(next);

      let attachmentContext = "";
      if (uploads.length) {
        const described = await describeBabyUploads({
          data: {
            conversation_id: activeConversationId,
            upload_ids: uploads.map((upload) => upload.id),
          },
        });
        attachmentContext = described.context;
      }

      const combinedContext = [
        context,
        attachmentContext
          ? `--- Attachments the user gave Baby for this message ---\n${attachmentContext}\n--- end attachments ---`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 14_000);

      const res = await chatWithBaby({
        data: {
          messages: next.slice(-200).map(({ role, content }) => ({ role, content })),
          context: combinedContext || undefined,
          conversation_id: activeConversationId,
        },
      });

      const finalMessages: DisplayChatMsg[] = [
        ...next,
        {
          role: "assistant",
          content: res.reply,
          images: res.generated_images,
          animate: true,
        },
      ];

      setMessages(finalMessages);
      setPendingUploads([]);

      if (spoken) {
        void speak(res.reply, speechHandle).then((voiceResult) => {
          if (voiceResult.error) {
            console.warn("Baby voice reply issue:", voiceResult.error);
          }
        });
      }

      await appendConversationMessage({
        data: {
          conversation_id: activeConversationId,
          role: "assistant",
          content: res.reply,
          image_ids: res.generated_images.map((image) => image.id),
        },
      });

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
    onError: (e: Error, request) => {
      setInput((current) => current || request.text);
      setInputOrigin(request.spoken ? "voice" : "text");
      if (conversationId) {
        qc.invalidateQueries({
          queryKey: ["baby_conversation", conversationId],
        });
      }
      toast.error(e.message || "Baby got stuck.");
    },
  });

  const submitChat = () => {
    const text = input.trim();
    if (!text || send.isPending || !threadReady) return;

    const spoken = inputOrigin === "voice";
    const speechHandle = spoken ? createSpeechHandle() : undefined;
    setInput("");
    setInputOrigin("text");
    send.mutate({ text, spoken, speechHandle, uploads: pendingUploads });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitChat();
  };

  const handleDictationStart = (e: PointerEvent<HTMLButtonElement>) => {
    if (send.isPending || !threadReady || !chatDictation.supported) return;

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

  const handleUploadConversationCreated = useCallback(
    (id: string) => {
      setActiveConversation(id);
      setNewChatMode(false);
      void qc.invalidateQueries({ queryKey: ["baby_conversations"] });
      void qc.invalidateQueries({ queryKey: ["baby_conversation", id] });
    },
    [qc, setActiveConversation],
  );

  const currentConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  );

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(historySearch.trim().toLowerCase()),
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => setHistoryOpen(true)}
          aria-label="Conversation history"
        >
          <Menu className="size-5" />
        </Button>

        <button
          type="button"
          className="min-w-0 flex-1 truncate px-1 text-left text-sm font-medium text-foreground"
          onClick={() => setHistoryOpen(true)}
        >
          {newChatMode ? "New chat" : currentConversation?.title ?? "Baby"}
        </button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={startNewChat}
          disabled={send.isPending}
          aria-label="New chat"
        >
          <Plus className="size-5" />
        </Button>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!threadReady && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Baby&apos;s opening the conversation…
          </div>
        )}

        {threadReady && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Talk to Baby. This chat stays active until you deliberately start or open another one.
          </p>
        )}

        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <div
                key={`${index}-${message.content.slice(0, 16)}`}
                className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-base leading-relaxed text-primary-foreground whitespace-pre-wrap"
              >
                {message.content}
              </div>
            );
          }

          return (
            <div
              key={`${index}-${message.content.slice(0, 16)}`}
              className="mr-auto max-w-[90%] space-y-2"
            >
              <BabyBubble text={message.content} animate={message.animate === true} />
              {message.images?.map((image) => (
                <a
                  key={image.id}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-xl border border-border bg-background/50"
                  title={image.prompt}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="block h-auto w-full object-contain"
                    loading="lazy"
                  />
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Baby generated · {image.aspect_ratio}
                  </div>
                </a>
              ))}
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

      <div className="border-t border-border">
        {pendingUploads.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-2">
            {pendingUploads.map((upload) => (
              <div
                key={upload.id}
                className="relative flex max-w-[160px] shrink-0 items-center gap-2 rounded-lg border border-border bg-background/70 p-1.5 pr-7"
              >
                {upload.kind === "image" ? (
                  <img
                    src={upload.url}
                    alt={upload.filename}
                    className="size-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded bg-muted text-[9px] font-semibold uppercase text-muted-foreground">
                    File
                  </div>
                )}
                <span className="truncate text-[11px] text-foreground">
                  {upload.filename}
                </span>
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setPendingUploads((current) =>
                      current.filter((item) => item.id !== upload.id),
                    )
                  }
                  aria-label={`Remove ${upload.filename}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex gap-2 p-3">
          <BabyUploadButton
            conversationId={conversationId}
            disabled={send.isPending || !threadReady || pendingUploads.length >= 4}
            onConversationCreated={handleUploadConversationCreated}
            onUploaded={(upload) =>
              setPendingUploads((current) => [...current, upload].slice(-4))
            }
          />

          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!e.target.value.trim()) setInputOrigin("text");
            }}
            placeholder={
              !threadReady
                ? "Opening conversation…"
                : chatDictation.listening
                  ? chatDictation.interim || "Listening…"
                  : "Talk to Baby…"
            }
            rows={2}
            className="resize-none"
            disabled={!threadReady}
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
              disabled={send.isPending || !threadReady}
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
            disabled={send.isPending || !threadReady || !input.trim()}
          >
            {send.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </div>

      {historyOpen && (
        <div className="absolute inset-0 z-50 flex bg-black/70">
          <div className="flex h-full w-[86%] max-w-sm flex-col border-r border-border bg-background shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search conversations"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close conversation history"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="p-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={startNewChat}
                disabled={send.isPending}
              >
                <Plus className="size-4" />
                New chat
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {filteredConversations.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  No matching conversations.
                </p>
              ) : (
                filteredConversations.map((conversation) => {
                  const selected = conversation.id === conversationId;
                  return (
                    <div
                      key={conversation.id}
                      className={`group mb-1 flex items-center rounded-lg border ${
                        selected
                          ? "border-primary/50 bg-primary/10"
                          : "border-transparent hover:bg-muted/50"
                      }`}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-3 py-2 text-left"
                        onClick={() => selectConversation(conversation.id)}
                      >
                        <div className="truncate text-sm font-medium">
                          {conversation.title}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(conversation.updated_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      </button>

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        onClick={() => renameConversationById(conversation.id)}
                        aria-label="Rename conversation"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mr-1 size-8 shrink-0 text-destructive"
                        disabled={removeConversation.isPending}
                        onClick={() => {
                          const ok = confirm(`Burn "${conversation.title}"?`);
                          if (ok) removeConversation.mutate(conversation.id);
                        }}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <button
            type="button"
            className="h-full flex-1"
            onClick={() => setHistoryOpen(false)}
            aria-label="Close conversation history"
          />
        </div>
      )}
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
      <form onSubmit={onMemorySubmit} className="p-3 border-b border-border space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
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
        {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
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
            onUpdate={(content) => update.mutate({ id: memory.id, content })}
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
    if (content.length >= 2 && content !== memory.content) onUpdate(content);
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
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={saveEdit}>
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

export function BabyChatButton({ onClick }: { onClick: () => void }) {
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
