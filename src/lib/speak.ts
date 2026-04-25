import { prepareAudioPlayback } from "./audio";

export type SpeechHandle = {
  utterance: SpeechSynthesisUtterance | null;
  warmed: boolean;
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

function warmSpeechSynthesis(): boolean {
  if (!hasSpeechSynthesis()) return false;

  try {
    window.speechSynthesis.cancel();
    const warmup = new SpeechSynthesisUtterance("Ope.");
    configureUtterance(warmup);
    warmup.volume = 0;
    window.speechSynthesis.speak(warmup);
    return true;
  } catch (e) {
    console.warn("Speech warmup failed:", e);
    return false;
  }
}

// Create this synchronously inside a tap/press handler on iPhone.
export function createSpeechHandle(): SpeechHandle {
  prepareAudioPlayback();
  if (!hasSpeechSynthesis()) {
    return { utterance: null, warmed: false };
  }

  const warmed = warmSpeechSynthesis();
  const utterance = new SpeechSynthesisUtterance("");
  configureUtterance(utterance);
  return { utterance, warmed };
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

      utt.onstart = () => console.info("Bernice voice started");
      utt.onend = () => finish(true);
      utt.onerror = (event) => {
        console.warn("Bernice voice error:", event.error);
        finish(false);
      };

      window.speechSynthesis.speak(utt);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (e) {
      console.warn("Bernice voice failed:", e);
      resolve(false);
    }
  });
}

/** Speak using the browser's built-in voice (free, no API key needed). */
export async function speak(text: string, handle?: SpeechHandle): Promise<{ provider: "browser" | "none"; error?: string }> {
  prepareAudioPlayback();

  if (hasSpeechSynthesis()) {
    const spoken = await browserSpeak(text, handle);
    return spoken ? { provider: "browser" } : { provider: "browser", error: "Browser voice did not start" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
