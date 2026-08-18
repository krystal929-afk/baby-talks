import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DOCUMENT_FORMATS = ["pdf", "docx"] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export type GeneratedBabyDocument = {
  id: string;
  title: string;
  filename: string;
  format: DocumentFormat;
  mime_type: string;
  path: string;
};

const DOCUMENT_BUCKET = "baby-documents";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function serverConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server configuration");
  }

  return { url, key };
}

function serviceClient() {
  const { url, key } = serverConfig();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeFormat(value: string | undefined): DocumentFormat {
  return value === "docx" ? "docx" : "pdf";
}

export async function generateAndStoreDocument({
  ownerId,
  conversationId,
  title,
  content,
  format,
  filename,
}: {
  ownerId: string;
  conversationId: string;
  title: string;
  content: string;
  format?: string;
  filename?: string;
}): Promise<GeneratedBabyDocument> {
  const cleanTitle = title.replace(/\s+/g, " ").trim().slice(0, 160);
  const cleanContent = content.trim();
  if (!cleanTitle) throw new Error("Document title required");
  if (!cleanContent) throw new Error("Document content required");

  const docFormat = normalizeFormat(format);
  const { url, key } = serverConfig();
  const response = await fetch(`${url}/functions/v1/baby-document-generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner_id: ownerId,
      conversation_id: conversationId,
      title: cleanTitle,
      content: cleanContent,
      format: docFormat,
      filename: filename?.trim() || undefined,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; document?: GeneratedBabyDocument }
    | null;

  if (!response.ok || !payload?.document) {
    throw new Error(payload?.error || `Document renderer error ${response.status}`);
  }

  return {
    ...payload.document,
    format: normalizeFormat(payload.document.format),
  };
}

export const getDocumentDownloadUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = serviceClient();
    const { data: document, error } = await supabase
      .from("baby_documents")
      .select("id,filename,mime_type,storage_path")
      .eq("id", data.document_id)
      .eq("owner_id", context.userId)
      .single();

    if (error || !document) {
      throw new Error("Document not found");
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(
        document.storage_path,
        60 * 5,
        document.mime_type === DOCX_MIME
          ? { download: document.filename }
          : undefined,
      );

    if (signedError || !signed?.signedUrl) {
      throw new Error(signedError?.message || "Couldn't open document");
    }

    return {
      url: signed.signedUrl,
      filename: document.filename,
      mime_type: document.mime_type,
    };
  });
