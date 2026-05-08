import { toast } from "sonner";

const FONTS = ["font-display", "font-serif", "font-mono", "font-sans"];
const SKINS = [
  "bg-foreground text-background",
  "bg-primary text-primary-foreground",
  "bg-card text-foreground border border-border/60",
  "bg-accent text-accent-foreground",
  "bg-background text-foreground border border-primary/60",
];

function hash(s: string, seed = 0) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export function ransomToast(text: string) {
  toast.custom(
    () => (
      <div className="flex max-w-[320px] flex-wrap items-center gap-[2px] rounded-lg border border-border/60 bg-background/95 p-2 shadow-[var(--shadow-glow)] backdrop-blur">
        {Array.from(text).map((ch, i) => {
          if (ch === " ") return <span key={i} className="w-2" />;
          const r = hash(ch + i, i * 7);
          const rot = (r % 14) - 7;
          const font = FONTS[r % FONTS.length];
          const skin = SKINS[(r >> 3) % SKINS.length];
          const size = 13 + (r % 7);
          const upper = (r & 1) === 0;
          return (
            <span
              key={i}
              className={`inline-block px-[5px] py-[1px] leading-none ${font} ${skin}`}
              style={{ transform: `rotate(${rot}deg)`, fontSize: `${size}px` }}
            >
              {upper ? ch.toUpperCase() : ch}
            </span>
          );
        })}
      </div>
    ),
    { duration: 4500 }
  );
}
