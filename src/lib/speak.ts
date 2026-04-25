import { playBase64Mp3, prepareAudioPlayback } from "./audio";
import { speakBernice } from "@/server/voice.functions";

let elevenLabsBroken = false;

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
      utt.pitch = 1.05;

      // Try to pick a warm female voice if available.
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => /samantha|victoria|karen|moira|tessa/i.test(v.name)) ||
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

/** Speak with ElevenLabs, falling back to the browser's built-in voice. */
export async function speak(text: string): Promise<{ provider: "elevenlabs" | "browser" | "none"; error?: string }> {
  prepareAudioPlayback();

  if (!elevenLabsBroken) {
    try {
      const tts = await speakBernice({ data: { text } });
      if (tts.audio) {
        await playBase64Mp3(tts.audio);
        return { provider: "elevenlabs" };
      }
      // Server returned no audio — likely missing/invalid key. Mark broken so we don't keep trying.
      elevenLabsBroken = true;
      console.warn("ElevenLabs unavailable, using browser voice:", tts.error);
    } catch (e) {
      elevenLabsBroken = true;
      console.warn("ElevenLabs threw, using browser voice:", e);
    }
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    await browserSpeak(text);
    return { provider: "browser" };
  }

  return { provider: "none", error: "No voice available on this device" };
}
