import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UPLOAD_BUCKET = "baby-uploads";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_CONTEXT = 12_000;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const UploadInput = z.object({
  conversation_id: z.string().uuid().optional(),
  filename: z.string().min(1).max(180),
  mime_type: z.string().min(1).max(120),
  base64: z.string().min(1).max(15_000_000),
});

const ListInput = z.object({
  conversation_id: z.string().uuid(),
});

const DescribeInput = z.object({
  conversation_id: z.string().uuid(),
  upload_ids: z.array(z.string().uuid()).min(1).max(4),
});

export type BabyUpload = {
  id: string;
  conversation_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "file";
  url: string;
  created_at: string;
};

type ConversionResult = {
  name?: string;
  format?: "markdown" | "text" | "error";
  data?: string;
  error?: string;
};

type MarkdownAiBinding = {
  toMarkdown: (
    files:
      | { name: string; blob: Blob }
      | Array<{ name: string; blob: Blob }>,
    options?: Record<string, unknown>,
  ) => Promise<ConversionResult | ConversionResult[]>;
};

function serviceClient() {
  const workerEnv = env as unknown as Record<string, unknown>;
  const url =
    (typeof workerEnv.SUPABASE_URL === "string" && workerEnv.SUPABASE_URL) ||
    process.env.SUPABASE_URL;
  const key =
    (typeof workerEnv.SUPABASE_SERVICE_ROLE_KEY === "string" &&
      workerEnv.SUPABASE_SERVICE_ROLE_KEY) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function getOrCreateConversation(
  supabase: ReturnType<typeof serviceClient>,
  ownerId: string,
  requestedId?: string,
) {
  if (requestedId) {
    const { data: conversation, error } = await supabase
      .from("baby_conversations")
      .select("id")
      .eq("id", requestedId)
      .eq("owner_id", ownerId)
      .single();
    if (error || !conversation) throw new Error("Conversation not found.");
    return { id: conversation.id as string, created: false };
  }

  const { data: conversation, error } = await supabase
    .from("baby_conversations")
    .insert({ owner_id: ownerId, title: "New chat" })
    .select("id")
    .single();

  if (error || !conversation) {
    throw new Error(error?.message || "Couldn't start a conversation for that upload.");
  }

  return { id: conversation.id as string, created: true };
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
    const conversation = await getOrCreateConversation(
      supabase,
      context.userId,
      data.conversation_id,
    );

    const filename = safeFilename(data.filename);
    const storagePath = `${context.userId}/${conversation.id}/${crypto.randomUUID()}-${filename}`;

    try {
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
          conversation_id: conversation.id,
          filename,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: bytes.byteLength,
          kind,
        })
        .select("id,conversation_id,filename,mime_type,size_bytes,kind,created_at")
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
        conversation_id: row.conversation_id,
        filename: row.filename,
        mime_type: row.mime_type,
        size_bytes: Number(row.size_bytes),
        kind: row.kind as "image" | "file",
        url: signed.signedUrl,
        created_at: row.created_at,
      };
    } catch (error) {
      if (conversation.created) {
        await supabase
          .from("baby_conversations")
          .delete()
          .eq("id", conversation.id)
          .eq("owner_id", context.userId);
      }
      throw error;
    }
  });

export const listConversationUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }): Promise<BabyUpload[]> => {
    const supabase = serviceClient();
    const { data: rows, error } = await supabase
      .from("baby_uploads")
      .select("id,conversation_id,filename,storage_path,mime_type,size_bytes,kind,created_at")
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
          conversation_id: row.conversation_id,
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

export const describeBabyUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DescribeInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = serviceClient();
    const { data: rows, error } = await supabase
      .from("baby_uploads")
      .select("id,filename,storage_path,mime_type")
      .eq("owner_id", context.userId)
      .eq("conversation_id", data.conversation_id)
      .in("id", data.upload_ids);

    if (error) throw new Error(`Couldn't read uploads: ${error.message}`);
    if (!rows?.length) throw new Error("Couldn't find those uploads.");

    const { error: usageError } = await supabase
      .from("baby_uploads")
      .update({ last_used_at: new Date().toISOString() })
      .eq("owner_id", context.userId)
      .eq("conversation_id", data.conversation_id)
      .in("id", rows.map((row) => row.id));

    if (usageError) {
      console.warn("Couldn't mark Baby uploads as used", usageError.message);
    }

    const documents: Array<{ name: string; blob: Blob }> = [];
    for (const row of rows) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .download(row.storage_path);
      if (downloadError || !blob) {
        throw new Error(`Couldn't open ${row.filename}.`);
      }
      documents.push({
        name: row.filename,
        blob: new Blob([await blob.arrayBuffer()], { type: row.mime_type }),
      });
    }

    const ai = (env as unknown as { AI?: MarkdownAiBinding }).AI;
    if (!ai?.toMarkdown) {
      throw new Error("Baby's file reader is unavailable right now.");
    }

    const converted = await ai.toMarkdown(documents, {
      conversionOptions: {
        output: { format: "text" },
        image: { descriptionLanguage: "en" },
        pdf: { metadata: false },
      },
    });

    const results = Array.isArray(converted) ? converted : [converted];
    const sections: string[] = [];

    for (const result of results) {
      if (result.format === "error") {
        sections.push(
          `Attachment: ${result.name || "file"}\nBaby couldn't inspect this attachment: ${result.error || "conversion failed"}`,
        );
        continue;
      }

      const text = String(result.data || "").trim();
      sections.push(
        `Attachment: ${result.name || "file"}\n${text || "No readable content was found."}`,
      );
    }

    return {
      context: sections.join("\n\n").slice(0, MAX_ATTACHMENT_CONTEXT),
    };
  });