import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

const DOCUMENT_BUCKET = "baby-documents";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const getDocumentDownloadUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ document_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = getSupabaseAdmin();
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
