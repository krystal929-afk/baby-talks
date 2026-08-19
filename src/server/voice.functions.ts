import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TTSInput = z.object({
  text: z.string().min(1).max(800),
});

const VOICE_ID = "q9N7djfjET83mt2m58Rd"; // Baby (cloned)
const CLOUDFLARE_AURA_MODEL = "@cf/deepgram/aura-1";
const CLOUDFLARE_MELO_MODEL = "@cf/myshell-ai/melotts";
const CLOUDFLARE_AURA_SPEAKER = "asteria";

type VoiceProvider = "elevenlabs" | "cloudflare" | null;

type VoiceResult = {
  audio: string | null;
  error: string | null;
  provider: VoiceProvider;
};

type AiBinding = {
  run: (
    model: string,
    input: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
};

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

async function elevenLabsSpeech(text: string): Promise<VoiceResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { audio: null, error: "ElevenLabs not configured", provider: null };
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.25,
            similarity_boost: 0.9,
            style: 0.75,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      console.warn("ElevenLabs TTS unavailable", res.status, detail);
      return {
        audio: null,
        error: `ElevenLabs TTS error ${res.status}`,
        provider: null,
      };
    }

    return {
      audio: toBase64(await res.arrayBuffer()),
      error: null,
      provider: "elevenlabs",
    };
  } catch (error) {
    console.warn("ElevenLabs TTS failed", error);
    return {
      audio: null,
      error: error instanceof Error ? error.message : "ElevenLabs failed",
      provider: null,
    };
  }
}

async function workersAiAudio(
  model: string,
  input: Record<string, unknown>,
): Promise<VoiceResult> {
  try {
    const ai = (env as unknown as { AI?: AiBinding }).AI;
    if (!ai) {
      return { audio: null, error: "Workers AI binding unavailable", provider: null };
    }

    const result = await ai.run(model, input, { returnRawResponse: true });

    if (result instanceof Response) {
      if (!result.ok) {
        const detail = await result.text();
        throw new Error(`Workers AI TTS ${result.status}: ${detail}`);
      }

      return {
        audio: toBase64(await result.arrayBuffer()),
        error: null,
        provider: "cloudflare",
      };
    }

    if (result instanceof ArrayBuffer) {
      return {
        audio: toBase64(result),
        error: null,
        provider: "cloudflare",
      };
    }

    if (result instanceof Uint8Array) {
      const exact = result.buffer.slice(
        result.byteOffset,
        result.byteOffset + result.byteLength,
      ) as ArrayBuffer;
      return {
        audio: toBase64(exact),
        error: null,
        provider: "cloudflare",
      };
    }

    if (result instanceof ReadableStream) {
      return {
        audio: toBase64(await new Response(result).arrayBuffer()),
        error: null,
        provider: "cloudflare",
      };
    }

    const maybeAudio =
      result && typeof result === "object" && "audio" in result
        ? (result as { audio?: unknown }).audio
        : null;

    if (typeof maybeAudio === "string" && maybeAudio.length > 0) {
      return {
        audio: maybeAudio,
        error: null,
        provider: "cloudflare",
      };
    }

    throw new Error("Workers AI returned no audio");
  } catch (error) {
    console.warn(`Workers AI TTS failed for ${model}`, error);
    return {
      audio: null,
      error: error instanceof Error ? error.message : "Workers AI TTS failed",
      provider: null,
    };
  }
}

async function cloudflareSpeech(text: string): Promise<VoiceResult> {
  // Aura sounds substantially more natural than MeloTTS. Use Melo only as the
  // cheap emergency fallback if Aura is unavailable or the daily AI allowance
  // is exhausted.
  const aura = await workersAiAudio(CLOUDFLARE_AURA_MODEL, {
    text,
    speaker: CLOUDFLARE_AURA_SPEAKER,
    encoding: "mp3",
  });
  if (aura.audio) return aura;

  const melo = await workersAiAudio(CLOUDFLARE_MELO_MODEL, {
    prompt: text,
    lang: "en",
  });
  if (melo.audio) return melo;

  return {
    audio: null,
    error: aura.error || melo.error || "Workers AI TTS unavailable",
    provider: null,
  };
}

export const speakBaby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TTSInput.parse(d))
  .handler(async ({ data }): Promise<VoiceResult> => {
    // Best voice first, then free Cloudflare Aura, then low-cost MeloTTS.
    const eleven = await elevenLabsSpeech(data.text);
    if (eleven.audio) return eleven;

    const cloudflare = await cloudflareSpeech(data.text);
    if (cloudflare.audio) return cloudflare;

    return {
      audio: null,
      error: cloudflare.error || eleven.error || "No server voice available",
      provider: null,
    };
  });
