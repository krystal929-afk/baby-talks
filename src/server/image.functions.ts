import { createClient } from "@supabase/supabase-js";

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export type GeneratedBabyImage = {
  id: string;
  prompt: string;
  mime_type: string;
  aspect_ratio: ImageAspectRatio;
  model: string;
  url: string;
};

type ReferenceImage = {
  mimeType: string;
  base64: string;
};

const IMAGE_BUCKET = "baby-images";
const UPLOAD_BUCKET = "baby-uploads";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
const RECENT_REFERENCE_WINDOW_MS = 5 * 60 * 1000;
const GEMINI_REFERENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const BABY_VISUAL_IDENTITY =
  "BABY VISUAL IDENTITY: When Baby/the assistant is a subject, depict her as an adult woman age 21 or older with BLONDE hair, normally styled in blonde pigtails. Keep her blonde unless the user's final request explicitly asks for a different hair color. Do not default her to brunette, black hair, or red hair. Her playful horror-camp persona is adult, not age-play.";

const STRICT_PRESERVE_INSTRUCTION =
  "STRICT IDENTITY-PRESERVING EDIT MODE: Treat the uploaded image as protected source material, not loose inspiration. Preserve the real person's identity and recognizable appearance as closely as possible. Preserve facial structure, eyes, nose, mouth, skin texture, expression, age, hair, hair color, beard/facial hair, tattoos, body proportions, clothing, accessories, pose, camera angle, crop, and framing unless the user's final request explicitly asks to change one of those things. Do not beautify, redesign, reinterpret, restyle, replace, or invent the person. Make ONLY the requested environmental/background change plus minimal lighting/color integration needed to blend the unchanged subject naturally into the new setting. The final result should look like the original photograph with the requested background edit, not a new portrait of a similar person.";

const MR_SATAN_PRESERVE_HINT =
  "SUBJECT IDENTITY NOTE: If the referenced man is Daddy/Mr. Satan, he is a specific real person. Keep him recognizable. He is tall and slender with long hair, a large beard, and visible tattoos. Do not replace his face with a generic man or alter his distinctive features.";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server configuration");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function normalizeAspectRatio(value: string | undefined): ImageAspectRatio {
  return IMAGE_ASPECT_RATIOS.includes(value as ImageAspectRatio)
    ? (value as ImageAspectRatio)
    : "1:1";
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function lastUserTextFromPrompt(prompt: string) {
  const lastUserIndex = prompt.lastIndexOf("USER:");
  return lastUserIndex >= 0
    ? prompt.slice(lastUserIndex + 5).trim()
    : prompt.trim();
}

function withBabyVisualIdentity(prompt: string) {
  const lastUserText = lastUserTextFromPrompt(prompt);
  const hasRoleTaggedUser = prompt.lastIndexOf("USER:") >= 0;
  const directBabyReference = /\b(baby|you|your|yourself)\b/i.test(lastUserText);
  const standaloneBabyPrompt =
    !hasRoleTaggedUser && /\b(baby|the assistant)\b/i.test(prompt);

  if (!directBabyReference && !standaloneBabyPrompt) return prompt;
  return `${BABY_VISUAL_IDENTITY}\n\n${prompt}`;
}

function isStrictPreserveEdit(prompt: string) {
  const text = lastUserTextFromPrompt(prompt).toLowerCase();

  const directPreservePhrases = [
    "change only the background",
    "only change the background",
    "background only",
    "swap the background",
    "replace the background",
    "change the setting",
    "only change the setting",
    "keep him the same",
    "keep her the same",
    "keep them the same",
    "keep him exactly the same",
    "keep her exactly the same",
    "same person",
    "same photo but",
    "keep the face",
    "keep his face",
    "keep her face",
    "keep the tattoos",
    "keep his tattoos",
    "keep her tattoos",
    "keep the outfit",
    "keep his outfit",
    "keep her outfit",
  ];

  if (directPreservePhrases.some((phrase) => text.includes(phrase))) return true;

  const referenceLanguage =
    /\b(use (?:this|the (?:uploaded )?(?:image|photo|picture)) as (?:the )?reference|use this photo|use this image|same (?:man|woman|guy|person)|put (?:him|her|them) (?:in|into|against|at))\b/i.test(text);
  const backgroundLanguage =
    /\b(background|setting|environment|scene|club|room|venue|location)\b/i.test(text);
  const preserveLanguage =
    /\b(keep|preserve|unchanged|exactly|same)\b/i.test(text);

  return referenceLanguage && (backgroundLanguage || preserveLanguage);
}

function isMrSatanSubject(prompt: string) {
  const text = lastUserTextFromPrompt(prompt);
  return /\b(mr\.?\s*satan|mr\.?\s*s|daddy|george)\b/i.test(text);
}

function googleErrorMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; status?: string };
    };
    const message = parsed.error?.message?.trim();
    if (message) return message;
  } catch {
    // Fall through to a short plain-text body when Google did not return JSON.
  }

  return body.trim().replace(/\s+/g, " ").slice(0, 500) || "Unknown Gemini error";
}

type InteractionContent = {
  type?: string;
  data?: string;
  mime_type?: string;
};

type InteractionResponse = {
  status?: string;
  error?: { message?: string };
  steps?: Array<{
    type?: string;
    content?: InteractionContent[];
  }>;
};

async function loadRecentReferenceImages({
  supabase,
  ownerId,
  conversationId,
  limit,
}: {
  supabase: ReturnType<typeof serviceClient>;
  ownerId: string;
  conversationId: string;
  limit: number;
}): Promise<ReferenceImage[]> {
  const cutoff = new Date(Date.now() - RECENT_REFERENCE_WINDOW_MS).toISOString();
  const { data: rows, error } = await supabase
    .from("baby_uploads")
    .select("id,storage_path,mime_type,last_used_at")
    .eq("owner_id", ownerId)
    .eq("conversation_id", conversationId)
    .eq("kind", "image")
    .gte("last_used_at", cutoff)
    .order("last_used_at", { ascending: false })
    .limit(Math.max(1, Math.min(4, limit)));

  if (error) {
    console.warn("Couldn't load Baby image references", error.message);
    return [];
  }

  const references: ReferenceImage[] = [];
  for (const row of rows ?? []) {
    const mimeType = String(row.mime_type || "").toLowerCase();
    if (!GEMINI_REFERENCE_MIME_TYPES.has(mimeType)) continue;

    const { data: blob, error: downloadError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .download(row.storage_path);

    if (downloadError || !blob) {
      console.warn("Couldn't open Baby image reference", row.id, downloadError?.message);
      continue;
    }

    const buffer = await blob.arrayBuffer();
    if (!buffer.byteLength) continue;

    references.push({
      mimeType,
      base64: Buffer.from(buffer).toString("base64"),
    });
  }

  return references;
}

async function requestGeminiImage({
  apiKey,
  model,
  prompt,
  aspectRatio,
  referenceImages,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  referenceImages: ReferenceImage[];
}) {
  const input = referenceImages.length
    ? [
        { type: "text", text: prompt },
        ...referenceImages.map((image) => ({
          type: "image",
          mime_type: image.mimeType,
          data: image.base64,
        })),
      ]
    : prompt;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        input,
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: aspectRatio,
          image_size: "1K",
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    const providerMessage = googleErrorMessage(body);
    console.error("Gemini image generation failed", {
      status: response.status,
      model,
      aspectRatio,
      referenceCount: referenceImages.length,
      providerMessage,
    });

    if (response.status === 429) {
      throw new Error(`Gemini image quota error: ${providerMessage}`);
    }

    throw new Error(`Gemini image error ${response.status}: ${providerMessage}`);
  }

  const json = (await response.json()) as InteractionResponse;
  const image = json.steps
    ?.flatMap((step) => step.content ?? [])
    .find((content) => content.type === "image" && content.data);

  if (!image?.data) {
    const detail = json.error?.message || `interaction status: ${json.status || "unknown"}`;
    console.error("Gemini interaction returned no image", {
      model,
      aspectRatio,
      referenceCount: referenceImages.length,
      status: json.status,
      detail,
    });
    throw new Error(`Gemini returned no image (${detail})`);
  }

  return {
    base64: image.data,
    mimeType: image.mime_type || "image/jpeg",
  };
}

export async function generateAndStoreImage({
  ownerId,
  conversationId,
  prompt,
  aspectRatio,
}: {
  ownerId: string;
  conversationId: string;
  prompt: string;
  aspectRatio?: string;
}): Promise<GeneratedBabyImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the deployed runtime");
  }

  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error("Image prompt required");
  }

  const generationPrompt = withBabyVisualIdentity(cleanPrompt);
  const strictPreserve = isStrictPreserveEdit(cleanPrompt);
  const ratio = normalizeAspectRatio(aspectRatio);
  const model = process.env.IMAGE_AI_MODEL || DEFAULT_IMAGE_MODEL;
  const supabase = serviceClient();

  const { data: conversation, error: conversationError } = await supabase
    .from("baby_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("owner_id", ownerId)
    .single();

  if (conversationError || !conversation) {
    throw new Error("Conversation not found");
  }

  const referenceImages = await loadRecentReferenceImages({
    supabase,
    ownerId,
    conversationId,
    limit: strictPreserve ? 1 : 4,
  });

  const referenceInstruction = referenceImages.length
    ? "\n\nREFERENCE IMAGE RULES: The user attached the image input(s) in this same turn. Treat them as the source material for the requested edit, recreation, visual example, composition, or identity reference. Preserve requested unchanged details instead of inventing replacements."
    : "";

  const strictInstruction =
    strictPreserve && referenceImages.length
      ? `\n\n${STRICT_PRESERVE_INSTRUCTION}${
          isMrSatanSubject(cleanPrompt) ? `\n\n${MR_SATAN_PRESERVE_HINT}` : ""
        }`
      : "";

  const generated = await requestGeminiImage({
    apiKey,
    model,
    prompt: `${generationPrompt}${referenceInstruction}${strictInstruction}`,
    aspectRatio: ratio,
    referenceImages,
  });

  const mimeType = generated.mimeType;
  const extension = extensionForMime(mimeType);
  const storagePath = `${ownerId}/${conversationId}/${crypto.randomUUID()}.${extension}`;
  const bytes = base64ToBytes(generated.base64);

  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Couldn't save generated image: ${uploadError.message}`);
  }

  const { data: row, error: insertError } = await supabase
    .from("baby_images")
    .insert({
      owner_id: ownerId,
      conversation_id: conversationId,
      prompt: cleanPrompt,
      storage_path: storagePath,
      mime_type: mimeType,
      model,
      aspect_ratio: ratio,
    })
    .select("id,prompt,mime_type,aspect_ratio,model")
    .single();

  if (insertError || !row) {
    await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
    throw new Error(insertError?.message || "Couldn't save image metadata");
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    throw new Error(signedError?.message || "Couldn't open generated image");
  }

  return {
    id: row.id,
    prompt: row.prompt,
    mime_type: row.mime_type,
    aspect_ratio: normalizeAspectRatio(row.aspect_ratio),
    model: row.model,
    url: signed.signedUrl,
  };
}

export async function signedUrlsForImageRows(
  rows: Array<{
    id: string;
    prompt: string;
    mime_type: string;
    aspect_ratio: string;
    model: string;
    storage_path: string;
    message_id: string | null;
  }>,
) {
  if (!rows.length) return [];

  const supabase = serviceClient();

  return Promise.all(
    rows.map(async (row) => {
      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 60);

      if (error || !data?.signedUrl) {
        console.warn("Couldn't sign Baby image", row.id, error?.message);
        return null;
      }

      return {
        id: row.id,
        message_id: row.message_id,
        prompt: row.prompt,
        mime_type: row.mime_type,
        aspect_ratio: normalizeAspectRatio(row.aspect_ratio),
        model: row.model,
        url: data.signedUrl,
      };
    }),
  ).then((items) => items.filter((item) => item !== null));
}
