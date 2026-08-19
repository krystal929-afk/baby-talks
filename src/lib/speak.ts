import { prepareAudioPlayback } from "./audio";
import { playBase64Mp3 } from "./audio";
import { speakBaby } from "@/server/voice.functions";

export type SpeechHandle = {
  utterance: SpeechSynthesisUtterance | null;
  warmed: boolean;
  audio: HTMLAudioElement | null;
};

function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function configureUtterance(utt: SpeechSynthesisUtterance) {
  utt.lang = "en-US";
  utt.rate = 1.0;
  utt.pitch = 1.1;

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => /samantha|victoria|karen|moira|tessa|google us english/i.test(v.name)) ||
    voices.find((v) => /female/i.test(v.name)) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
}

export function createSpeechHandle(): SpeechHandle {
  prepareAudioPlayback();

  let audio: HTMLAudioElement | null = null;
  if (typeof window !== "undefined") {
    try {
      audio = new Audio();
      audio.muted = true;
      void audio.play().then(() => audio?.pause()).catch(() => undefined);
      audio.muted = false;
    } catch { audio = null; }
  }

  if (!hasSpeechSynthesis()) {
    return { utterance: null, warmed: false, audio };
  }

  try {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  } catch { /* noop */ }

  const utterance = new SpeechSynthesisUtterance("");
  configureUtterance(utterance);
  return { utterance, warmed: true, audio };
}

function browserSpeak(text: string, handle?: SpeechHandle): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hasSpeechSynthesis() || !text.trim()) {
      resolve(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utt = handle?.utterance ?? new SpeechSynthesisUtterance("");
      utt.text = text;
      utt.volume = 1;
      configureUtterance(utt);

      let settled = false;
      const finish = (spoken: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(spoken);
      };
      const timeout = window.setTimeout(() => finish(true), Math.max(3500, Math.min(12000, text.length * 110)));

      utt.onstart = () => console.info("Baby voice started");
      utt.onend = () => finish(true);
      utt.onerror = (event) => {
        console.warn("Baby voice error:", event.error);
        finish(false);
      };

      window.speechSynthesis.speak(utt);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (e) {
      console.warn("Baby voice failed:", e);
      resolve(false);
    }
  });
}

type SpeechProvider = "azure" | "elevenlabs" | "cloudflare" | "browser" | "none";

async function serverVoiceWithTimeout(text: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Server voice timed out")), 15000);
  });

  try {
    return await Promise.race([
      speakBaby({ data: { text } }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Speak using Baby's server voice, with browser speech as the guaranteed fallback. */
export async function speak(
  text: string,
  handle?: SpeechHandle,
): Promise<{ provider: SpeechProvider; error?: string }> {
  prepareAudioPlayback();

  try {
    const res = await serverVoiceWithTimeout(text);
    if (res.audio) {
      const provider: SpeechProvider = res.provider ?? "none";

      try {
        await playBase64Mp3(res.audio);
        return { provider };
      } catch (e) {
        console.warn("WebAudio playback failed, trying pre-warmed element:", e);
      }

      if (handle?.audio) {
        handle.audio.muted = false;
        handle.audio.volume = 1;
        handle.audio.src = `data:audio/mpeg;base64,${res.audio}`;
        try {
          await handle.audio.play();
          await new Promise<void>((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timer);
              resolve();
            };
            const timer = window.setTimeout(finish, 60000);
            handle.audio!.onended = finish;
            handle.audio!.onerror = finish;
          });
          return { provider };
        } catch (e) {
          console.warn("Pre-warmed audio play failed:", e);
        }
      }
    }
    console.info("Server voice unavailable, falling back to browser:", res.error);
  } catch (e) {
    console.warn("Server TTS failed or timed out, falling back to browser:", e);
  }

  if (hasSpeechSynthesis()) {
    const spoken = await browserSpeak(text, handle);
    return spoken
      ? { provider: "browser" }
      : { provider: "browser", error: "Browser voice did not start" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
