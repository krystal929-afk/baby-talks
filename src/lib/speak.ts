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

// Create this synchronously inside a tap/press handler on iPhone.
// iOS Safari requires speechSynthesis.speak() to be invoked from within a user
// gesture. Warming with a separate cancel+speak race causes "canceled" errors,
// so we just unlock the audio context and pre-build the utterance object.
export function createSpeechHandle(): SpeechHandle {
  prepareAudioPlayback();

  // Pre-create an Audio element inside the user gesture. iOS Safari needs the
  // element to be instantiated and a play() attempt made within the gesture
  // for any later src assignment + play() to be allowed.
  let audio: HTMLAudioElement | null = null;
  if (typeof window !== "undefined") {
    try {
      audio = new Audio();
      audio.muted = true;
      // Kick a no-op play to consume the gesture; immediately pause.
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

/** Speak using ElevenLabs (cloned Baby voice), falling back to the browser. */
export async function speak(text: string, handle?: SpeechHandle): Promise<{ provider: "elevenlabs" | "browser" | "none"; error?: string }> {
  prepareAudioPlayback();

  // Try ElevenLabs first (cloned Baby voice)
  try {
    const res = await speakBaby({ data: { text } });
    if (res.audio) {
      // WebAudio routes to the media channel (loud + respects volume slider).
      // The HTMLAudioElement path on iOS often routes to the ringer channel
      // and ends up barely audible, so prefer WebAudio when available.
      try {
        await playBase64Mp3(res.audio);
        return { provider: "elevenlabs" };
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
            handle.audio!.onended = () => resolve();
            handle.audio!.onerror = () => resolve();
          });
          return { provider: "elevenlabs" };
        } catch (e) {
          console.warn("Pre-warmed audio play failed:", e);
        }
      }
      return { provider: "elevenlabs" };
    }
    console.info("ElevenLabs unavailable, falling back to browser:", res.error);
  } catch (e) {
    console.warn("ElevenLabs TTS failed, falling back to browser:", e);
  }

  if (hasSpeechSynthesis()) {
    const spoken = await browserSpeak(text, handle);
    return spoken ? { provider: "browser" } : { provider: "browser", error: "Browser voice did not start" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
