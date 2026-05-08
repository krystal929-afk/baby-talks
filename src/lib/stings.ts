// Tiny Web Audio stings — zero cost, no asset files.
type Status = "grow" | "rethink" | "trash" | "parking_lot";

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType, delay = 0, gain = 0.14) {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playSting(status: Status) {
  const c = getCtx();
  if (!c) return;
  switch (status) {
    case "grow":
      // bright two-note ding
      blip(880, 0.12, "triangle", 0);
      blip(1320, 0.18, "triangle", 0.08);
      break;
    case "rethink":
      // unsettled wobble
      blip(523, 0.15, "sawtooth", 0, 0.1);
      blip(494, 0.22, "sawtooth", 0.1, 0.1);
      break;
    case "parking_lot":
      // soft whisper hum
      blip(196, 0.5, "sine", 0, 0.09);
      blip(294, 0.45, "sine", 0.05, 0.06);
      break;
    case "trash": {
      // wet descending squelch
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.38);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.45);
      break;
    }
  }
}
