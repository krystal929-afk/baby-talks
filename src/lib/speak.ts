import { prepareAudioPlayback } from "./audio";

export type SpeechHandle = {
  utterance: SpeechSynthesisUtterance | null;
};

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
export function createSpeechHandle(): SpeechHandle {
  prepareAudioPlayback();
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { utterance: null };
  }

  const utterance = new SpeechSynthesisUtterance("");
  configureUtterance(utterance);
  return { utterance };
}

function browserSpeak(text: string, handle?: SpeechHandle): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utt = handle?.utterance ?? new SpeechSynthesisUtterance("");
      utt.text = text;
      configureUtterance(utt);

      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    } catch {
      resolve();
    }
  });
}

/** Speak using the browser's built-in voice (free, no API key needed). */
export async function speak(text: string, handle?: SpeechHandle): Promise<{ provider: "browser" | "none"; error?: string }> {
  prepareAudioPlayback();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    await browserSpeak(text, handle);
    return { provider: "browser" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
