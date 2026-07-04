// AI gateway configuration — everything is driven by environment variables so
// providers/models can be swapped in Cloudflare (or any host) without code changes.
//
// Two logical "slots":
//   1. CHAT  — Baby's personality-heavy conversation (default: OpenRouter free model,
//              permissive/unmoderated, tool-calling capable).
//   2. UTIL  — structured utility calls: idea classification + grow packs
//              (default: Google Gemini free tier via its OpenAI-compatible endpoint).
//
// Env vars (all optional except the API keys):
//   OPENROUTER_API_KEY  — key from https://openrouter.ai/keys  (used by CHAT slot)
//   GEMINI_API_KEY      — key from https://aistudio.google.com/apikey (used by UTIL slot)
//   CHAT_AI_URL, CHAT_AI_MODEL, CHAT_AI_KEY   — override the chat slot entirely
//   UTIL_AI_URL, UTIL_AI_MODEL, UTIL_AI_KEY   — override the util slot entirely
//
// Both endpoints speak the OpenAI chat-completions format, so the calling code
// stays identical regardless of provider.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Free on OpenRouter, unmoderated, supports tool calling. Swap via CHAT_AI_MODEL
// any time — e.g. "x-ai/grok-4.1-fast" (paid, very permissive) once budget allows.
const DEFAULT_CHAT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// Free tier on Google AI Studio. Structured tool-call tasks only.
const DEFAULT_UTIL_MODEL = "gemini-2.5-flash";

export type GatewayConfig = {
  url: string;
  model: string;
  apiKey: string;
  provider: "openrouter" | "gemini" | "custom";
};

export function chatGateway(): GatewayConfig {
  const url = process.env.CHAT_AI_URL || OPENROUTER_URL;
  const model = process.env.CHAT_AI_MODEL || DEFAULT_CHAT_MODEL;
  const apiKey = process.env.CHAT_AI_KEY || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY (or CHAT_AI_KEY) missing");
  const provider = url.includes("openrouter.ai") ? "openrouter" : url.includes("googleapis.com") ? "gemini" : "custom";
  return { url, model, apiKey, provider };
}

export function utilGateway(): GatewayConfig {
  const url = process.env.UTIL_AI_URL || GEMINI_OPENAI_URL;
  const model = process.env.UTIL_AI_MODEL || DEFAULT_UTIL_MODEL;
  const apiKey = process.env.UTIL_AI_KEY || process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY (or UTIL_AI_KEY) missing");
  const provider = url.includes("openrouter.ai") ? "openrouter" : url.includes("googleapis.com") ? "gemini" : "custom";
  return { url, model, apiKey, provider };
}

// Extra request-body fields per provider.
// - Gemini: pin all adjustable safety filters OFF so Baby stays Baby.
// - OpenRouter: no extras needed; model choice governs permissiveness.
export function providerExtras(gw: GatewayConfig): Record<string, unknown> {
  if (gw.provider === "gemini") {
    return {
      safety_settings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      ],
    };
  }
  return {};
}

export function gatewayHeaders(gw: GatewayConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${gw.apiKey}`,
    "Content-Type": "application/json",
  };
  if (gw.provider === "openrouter") {
    // Optional OpenRouter attribution headers (help with free-tier ranking/limits).
    headers["HTTP-Referer"] = "https://baby-talks.app";
    headers["X-Title"] = "Baby Talks";
  }
  return headers;
}
