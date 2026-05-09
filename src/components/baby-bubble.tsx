import { useEffect, useState } from "react";

type Props = {
  text: string;
  animate?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
  intervalMs?: number;
};

export function BabyBubble({
  text,
  animate = true,
  size = "md",
  showLabel = true,
  intervalMs = 22,
}: Props) {
  const [shown, setShown] = useState(animate ? "" : text);

  useEffect(() => {
    if (!animate) {
      setShown(text);
      return;
    }
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }, [text, animate, intervalMs]);

  const done = shown.length >= text.length;
  const pad = size === "sm" ? "px-3 py-2 text-xs leading-snug" : "px-4 py-3 text-base leading-relaxed";

  return (
    <div
      className={`rounded-2xl rounded-bl-sm border border-primary/40 bg-card/90 ${pad} whitespace-pre-wrap text-foreground shadow-[var(--shadow-glow)]`}
      style={{ transform: "rotate(-0.4deg)" }}
    >
      {showLabel && (
        <span className="font-display tracking-wider text-[10px] uppercase text-primary/80 mr-2">
          Baby
        </span>
      )}
      {shown}
      {!done && <span className="ml-0.5 inline-block animate-pulse text-primary">▍</span>}
    </div>
  );
}
