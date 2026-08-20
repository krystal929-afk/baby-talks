import { useEffect, useState } from "react";
import { Check, Copy, Loader2, ThumbsDown, ThumbsUp, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { rateBabyResponse } from "@/server/message-feedback.functions";
import { cn } from "@/lib/utils";
import { createSpeechHandle, speak } from "@/lib/speak";
import babyPhoto from "@/assets/brand/baby-firefly.jpg";

type Feedback = "up" | "down" | null;
type Props = { text: string; animate?: boolean; size?: "sm" | "md"; showLabel?: boolean; showActions?: boolean; intervalMs?: number };

const DOCUMENT_PATH_RE = /^\/documents\/[0-9a-fA-F-]{36}$/;
const DOCUMENT_SPLIT_RE = /(\/documents\/[0-9a-fA-F-]{36})/g;

function renderMessageText(text: string) {
  return text.split(DOCUMENT_SPLIT_RE).map((part, index) => {
    if (!DOCUMENT_PATH_RE.test(part)) return part;
    return <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="font-semibold text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary">Open document</a>;
  });
}

function feedbackKey(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `baby-feedback:${hash}`;
}

export function BabyBubble({ text, animate = true, size = "md", showLabel = true, showActions = true, intervalMs = 22 }: Props) {
  const [shown, setShown] = useState(animate ? "" : text);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!animate) { setShown(text); return; }
    setShown("");
    let i = 0;
    const id = setInterval(() => { i++; setShown(text.slice(0, i)); if (i >= text.length) clearInterval(id); }, intervalMs);
    return () => clearInterval(id);
  }, [text, animate, intervalMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(feedbackKey(text));
    if (saved === "up" || saved === "down") setFeedback(saved); else setFeedback(null);
  }, [text]);

  const done = shown.length >= text.length;
  const pad = size === "sm" ? "px-3 py-2 text-xs leading-snug" : "px-4 py-3 text-base leading-relaxed";

  async function copyText() {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Couldn't copy that one."); }
  }

  function readAloud() {
    if (speaking) return;
    const handle = createSpeechHandle();
    setSpeaking(true);
    void speak(text, handle).then((result) => { if (result.error) toast.error("Baby couldn't get her voice out.", { description: result.error }); }).catch((error) => {
      toast.error("Baby couldn't get her voice out.", { description: error instanceof Error ? error.message : "Voice playback failed" });
    }).finally(() => setSpeaking(false));
  }

  async function rate(value: Exclude<Feedback, null>) {
    if (savingFeedback) return;
    const next: Feedback = feedback === value ? null : value;
    const previous = feedback;
    setFeedback(next); setSavingFeedback(true);
    if (typeof window !== "undefined") { if (next) window.localStorage.setItem(feedbackKey(text), next); else window.localStorage.removeItem(feedbackKey(text)); }
    try { await rateBabyResponse({ data: { content: text, feedback: next } }); }
    catch (e) {
      setFeedback(previous);
      if (typeof window !== "undefined") { if (previous) window.localStorage.setItem(feedbackKey(text), previous); else window.localStorage.removeItem(feedbackKey(text)); }
      toast.error(e instanceof Error ? e.message : "Couldn't save feedback.");
    } finally { setSavingFeedback(false); }
  }

  return (
    <div className="bf-baby-reply">
      <div className="flex items-end gap-2">
        {showLabel && size === "md" && <div className="bf-chat-avatar"><img src={babyPhoto} alt="Baby" draggable={false} /></div>}
        <div className={`bf-baby-bubble border border-[#6f20b6]/50 bg-[#191020]/95 ${pad} whitespace-pre-wrap text-[#e0d6c3]`}>
          {showLabel && <span className="mr-2 text-[10px] uppercase tracking-[.14em] text-[#9d3ee7]">Baby</span>}
          {renderMessageText(shown)}
          {!done && <span className="ml-0.5 inline-block animate-pulse text-[#baff21]">▍</span>}
        </div>
      </div>

      {showActions && done && size === "md" && (
        <div className="mt-1 flex items-center gap-1 px-1 pl-[50px]">
          <button type="button" onClick={() => rate("up")} disabled={savingFeedback} className={cn("p-1.5 text-[#756f68] transition hover:text-[#ded5c8]", feedback === "up" && "text-[#baff21]")} aria-label="Good response" title="Good response"><ThumbsUp className="size-3.5" /></button>
          <button type="button" onClick={() => rate("down")} disabled={savingFeedback} className={cn("p-1.5 text-[#756f68] transition hover:text-[#ded5c8]", feedback === "down" && "text-destructive")} aria-label="Bad response" title="Bad response"><ThumbsDown className="size-3.5" /></button>
          <button type="button" onClick={copyText} className="p-1.5 text-[#756f68] transition hover:text-[#ded5c8]" aria-label="Copy response" title="Copy response">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}</button>
          <button type="button" onClick={readAloud} disabled={speaking} className="p-1.5 text-[#756f68] transition hover:text-[#ded5c8] disabled:opacity-60" aria-label="Read response aloud" title="Read aloud">{speaking ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}</button>
        </div>
      )}
    </div>
  );
}
