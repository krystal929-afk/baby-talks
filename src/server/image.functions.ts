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

const IMAGE_BUCKET = "baby-images";
const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

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
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    throw new Error("Image prompt required");
  }

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: cleanPrompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          responseFormat: {
            image: {
              aspectRatio: ratio,
              imageSize: "1K",
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.error("Gemini image generation failed", response.status, body);

    if (response.status === 429) {
      throw new Error("Image generation is out of quota right now");
    }

    if (response.status === 400 || response.status === 403) {
      throw new Error(
        "Image generation is unavailable for this Gemini API key. Check that billing/image-model access is enabled.",
      );
    }

    throw new Error(`Image generation failed (${response.status})`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType?: string;
            data?: string;
          };
        }>;
      };
    }>;
  };

  const imagePart = json.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  );

  const base64 = imagePart?.inlineData?.data;
  if (!base64) {
    throw new Error("Gemini returned no image");
  }

  const mimeType = imagePart.inlineData?.mimeType || "image/png";
  const extension = extensionForMime(mimeType);
  const storagePath = `${ownerId}/${conversationId}/${crypto.randomUUID()}.${extension}`;
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));

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
