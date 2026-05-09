import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BabyBubble } from "@/components/baby-bubble";

export type Mood = "idle" | "grow" | "rethink" | "parking_lot" | "trash" | "thinking";

const FACES: Record<Mood, { face: string; tint: string; ring: string }> = {
  idle:        { face: "•ᴗ•", tint: "text-primary",  ring: "border-primary/40" },
  thinking:    { face: "•_•", tint: "text-muted-foreground", ring: "border-border/60" },
  grow:        { face: "◉‿◉", tint: "text-grow",     ring: "border-grow/60" },
  rethink:     { face: "•ᴖ•", tint: "text-rethink",  ring: "border-rethink/60" },
  parking_lot: { face: "-_-", tint: "text-parking",  ring: "border-parking/60" },
  trash:       { face: "✕‿✕", tint: "text-trash",    ring: "border-trash/60" },
};

type Setter = (m: Mood, msg?: string) => void;
let setterRef: Setter | null = null;

export function pingBaby(mood: Mood, msg?: string) {
  setterRef?.(mood, msg);
}

export function BabyMood() {
  const [mood, setMood] = useState<Mood>("idle");
  const [msg, setMsg] = useState<string>("");
  const [shown, setShown] = useState<string>("");

  useEffect(() => {
    setterRef = (m, text) => {
      setMood(m);
      if (text !== undefined) setMsg(text);
    };
    return () => { setterRef = null; };
  }, []);

  useEffect(() => {
    if (!msg) { setShown(""); return; }
    setShown("");
    let i = 0;
    const tick = setInterval(() => {
      i++;
      setShown(msg.slice(0, i));
      if (i >= msg.length) clearInterval(tick);
    }, 38);
    const dwell = Math.min(14000, Math.max(4500, msg.length * 70));
    const clearId = setTimeout(() => setMsg(""), msg.length * 38 + dwell);
    return () => { clearInterval(tick); clearTimeout(clearId); };
  }, [msg]);

  const f = FACES[mood];

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-30 flex max-w-[320px] flex-col items-end gap-2">
      {shown && (
        <div className="rounded-2xl rounded-br-sm border border-border/60 bg-card/95 px-3 py-2 text-xs leading-snug text-foreground shadow-[var(--shadow-glow)] animate-fade-in">
          {shown}
          <span className="ml-0.5 inline-block animate-pulse">▍</span>
        </div>
      )}
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full border bg-card/80 font-display text-[13px] tracking-wider backdrop-blur transition",
          f.ring,
          f.tint,
          mood === "thinking" && "animate-pulse"
        )}
        aria-label={`Baby mood: ${mood}`}
      >
        {f.face}
      </div>
    </div>
  );
}
