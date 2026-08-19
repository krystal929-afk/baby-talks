import { prepareAudioPlayback } from "./audio";
import { playBase64Mp3 } from "./audio";
import { speakBaby } from "@/server/voice.functions";

export type SpeechHandle = {
  utterance: SpeechSynthesisUtterance | null;
  warmed: boolean;
  audio: HTMLAudioElement | null;
};

const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRmQBAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

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

// iPhone Safari requires a real media play() call during the user gesture.
// Playing an Audio element with no src does not reliably unlock later playback,
// so use a tiny real silent WAV and then reuse that exact element for Baby's MP3.
export function createSpeechHandle(): SpeechHandle {
  prepareAudioPlayback();

  let audio: HTMLAudioElement | null = null;
  if (typeof window !== "undefined") {
    try {
      audio = new Audio(SILENT_WAV_DATA_URI);
      audio.preload = "auto";
      audio.volume = 0;
      void audio.play().catch(() => undefined);
    } catch {
      audio = null;
    }
  }

  if (!hasSpeechSynthesis()) {
    return { utterance: null, warmed: false, audio };
  }

  try {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  } catch {
    // noop
  }

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
      const timeout = window.setTimeout(
        () => finish(true),
        Math.max(3500, Math.min(12000, text.length * 110)),
      );

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
    return await Promise.race([speakBaby({ data: { text } }), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function playOnUnlockedElement(
  base64: string,
  audio: HTMLAudioElement,
): Promise<void> {
  audio.pause();
  audio.volume = 1;
  audio.src = `data:audio/mpeg;base64,${base64}`;
  audio.load();

  await audio.play();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      audio.onended = null;
      audio.onerror = null;
      if (error) reject(error);
      else resolve();
    };

    const timer = window.setTimeout(
      () => finish(new Error("Audio playback timed out")),
      45000,
    );
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error("Audio element could not play Baby's voice"));
  });
}

async function playDecodedWithTimeout(base64: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Decoded audio playback timed out")), 45000);
  });

  try {
    await Promise.race([playBase64Mp3(base64), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Speak using Baby's server voice, with browser speech as the final fallback. */
export async function speak(
  text: string,
  handle?: SpeechHandle,
): Promise<{ provider: SpeechProvider; error?: string }> {
  prepareAudioPlayback();

  try {
    const res = await serverVoiceWithTimeout(text);
    if (res.audio) {
      const provider: SpeechProvider = res.provider ?? "none";

      // Prefer the exact Audio element unlocked by the user's tap on iPhone.
      if (handle?.audio) {
        try {
          await playOnUnlockedElement(res.audio, handle.audio);
          return { provider };
        } catch (e) {
          console.warn("Unlocked audio element failed, trying WebAudio:", e);
        }
      }

      try {
        await playDecodedWithTimeout(res.audio);
        return { provider };
      } catch (e) {
        console.warn("WebAudio playback failed, falling back to browser voice:", e);
      }
    } else {
      console.info("Server voice unavailable, falling back to browser:", res.error);
    }
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
