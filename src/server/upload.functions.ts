import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UPLOAD_BUCKET = "baby-uploads";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const UploadInput = z.object({
  conversation_id: z.string().uuid(),
  filename: z.string().min(1).max(180),
  mime_type: z.string().min(1).max(120),
  base64: z.string().min(1).max(15_000_000),
});

const ListInput = z.object({
  conversation_id: z.string().uuid(),
});

export type BabyUpload = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "file";
  url: string;
  created_at: string;
};

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server configuration");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function safeFilename(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const clean = trimmed.replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 120);
  return clean || "upload";
}

function kindForMime(mimeType: string): "image" | "file" {
  return mimeType.startsWith("image/") ? "image" : "file";
}

export const uploadToBaby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }): Promise<BabyUpload> => {
    const mimeType = data.mime_type.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error("Baby can't read that file type yet.");
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(data.base64, "base64"));
    } catch {
      throw new Error("Couldn't read that upload.");
    }

    if (!bytes.byteLength) throw new Error("That file is empty.");
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("That file is over Baby's 10 MB upload limit.");
    }

    const supabase = serviceClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("baby_conversations")
      .select("id")
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId)
      .single();

    if (conversationError || !conversation) {
      throw new Error("Conversation not found.");
    }

    const filename = safeFilename(data.filename);
    const storagePath = `${context.userId}/${data.conversation_id}/${crypto.randomUUID()}-${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Couldn't save upload: ${uploadError.message}`);
    }

    const kind = kindForMime(mimeType);
    const { data: row, error: insertError } = await supabase
      .from("baby_uploads")
      .insert({
        owner_id: context.userId,
        conversation_id: data.conversation_id,
        filename,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
        kind,
      })
      .select("id,filename,mime_type,size_bytes,kind,created_at")
      .single();

    if (insertError || !row) {
      await supabase.storage.from(UPLOAD_BUCKET).remove([storagePath]);
      throw new Error(insertError?.message || "Couldn't save upload metadata.");
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);

    if (signedError || !signed?.signedUrl) {
      throw new Error(signedError?.message || "Couldn't open upload.");
    }

    return {
      id: row.id,
      filename: row.filename,
      mime_type: row.mime_type,
      size_bytes: Number(row.size_bytes),
      kind: row.kind as "image" | "file",
      url: signed.signedUrl,
      created_at: row.created_at,
    };
  });

export const listConversationUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }): Promise<BabyUpload[]> => {
    const supabase = serviceClient();
    const { data: rows, error } = await supabase
      .from("baby_uploads")
      .select("id,filename,storage_path,mime_type,size_bytes,kind,created_at")
      .eq("owner_id", context.userId)
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Couldn't load uploads: ${error.message}`);

    const items = await Promise.all(
      (rows ?? []).map(async (row) => {
        const { data: signed } = await supabase.storage
          .from(UPLOAD_BUCKET)
          .createSignedUrl(row.storage_path, 60 * 60);
        if (!signed?.signedUrl) return null;

        return {
          id: row.id,
          filename: row.filename,
          mime_type: row.mime_type,
          size_bytes: Number(row.size_bytes),
          kind: row.kind as "image" | "file",
          url: signed.signedUrl,
          created_at: row.created_at,
        } satisfies BabyUpload;
      }),
    );

    return items.filter((item): item is BabyUpload => item !== null);
  });
