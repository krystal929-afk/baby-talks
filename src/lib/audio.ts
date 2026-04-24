let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  audioContext ??= new AudioContextCtor();
  return audioContext;
}

// Call this synchronously inside a tap/click/press handler so later async TTS can play.
export function prepareAudioPlayback(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  void ctx.resume().then(() => {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(gain).connect(ctx.destination);
    source.start(0);
  }).catch(() => undefined);
}

// Plays a base64 mp3 returned from the server.
export async function playBase64Mp3(base64: string): Promise<void> {
  const playWithElement = async () => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    await audio.play();
    return new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  };

  const ctx = getAudioContext();
  if (ctx) {
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(binary.buffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      return new Promise<void>((resolve) => {
        source.onended = () => resolve();
      });
    } catch {
      return playWithElement();
    }
  }

  return playWithElement();
}
