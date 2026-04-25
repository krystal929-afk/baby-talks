import { prepareAudioPlayback } from "./audio";

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "en-US";
      utt.rate = 1.0;
      utt.pitch = 1.1;

      // Try to pick a warm female voice if available.
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => /samantha|victoria|karen|moira|tessa|google us english/i.test(v.name)) ||
        voices.find((v) => /female/i.test(v.name)) ||
        voices.find((v) => v.lang.startsWith("en"));
      if (preferred) utt.voice = preferred;

      utt.onend = () => resolve();
      utt.onerror = () => resolve();
      window.speechSynthesis.speak(utt);
    } catch {
      resolve();
    }
  });
}

/** Speak using the browser's built-in voice (free, no API key needed). */
export async function speak(text: string): Promise<{ provider: "browser" | "none"; error?: string }> {
  prepareAudioPlayback();

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    await browserSpeak(text);
    return { provider: "browser" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
