import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ElevenLabs TTS — Bernice's voice. Returns base64 mp3 to keep the JSON path simple.
// Voice: Matilda (XrExE9yKIg1WjnnlVkGX) — warm, friendly female. Closest natural fit
// for a Wisconsin/Midwestern feel without a custom clone. Wisconsin character comes
// from the script itself ("ope", "you betcha", etc.).

const TTSInput = z.object({
  text: z.string().min(1).max(800),
});

const VOICE_ID = "q9N7djfjET83mt2m58Rd"; // Baby (cloned)

export const speakBernice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => TTSInput.parse(d))
  .handler(async ({ data }): Promise<{ audio: string | null; error: string | null }> => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      // Voice is optional — return null so app keeps working.
      return { audio: null, error: "ELEVENLABS_API_KEY not configured" };
    }

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            text: data.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.25,
              similarity_boost: 0.9,
              style: 0.75,
              use_speaker_boost: true,
              speed: 1.0,
            },
          }),
        }
      );

      if (!res.ok) {
        const t = await res.text();
        console.error("TTS failed", res.status, t);
        return { audio: null, error: `TTS error ${res.status}` };
      }

      const buf = await res.arrayBuffer();
      const audio = Buffer.from(buf).toString("base64");
      return { audio, error: null };
    } catch (e) {
      console.error("speakBernice failed:", e);
      return { audio: null, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
