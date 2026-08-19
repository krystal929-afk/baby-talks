import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  uploadToBaby,
  type BabyUpload,
} from "@/server/upload.functions";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      if (comma < 0) {
        reject(new Error("Couldn't read that file."));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

type Props = {
  conversationId: string | null;
  disabled?: boolean;
  onUploaded: (upload: BabyUpload) => void;
  onConversationCreated: (conversationId: string) => void;
};

export function BabyUploadButton({
  conversationId,
  disabled = false,
  onUploaded,
  onConversationCreated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const chooseFile = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || uploading) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("That file is over Baby's 10 MB limit.");
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const upload = await uploadToBaby({
        data: {
          conversation_id: conversationId || undefined,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          base64,
        },
      });

      if (!conversationId) {
        onConversationCreated(upload.conversation_id);
      }
      onUploaded(upload);
      toast.success("Baby got it", { description: upload.filename });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Baby couldn't take that file.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/svg+xml,application/pdf,text/plain,text/markdown,text/csv,.docx,.xlsx,.xls"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="shrink-0 self-stretch h-auto"
        onClick={chooseFile}
        disabled={disabled || uploading}
        aria-label="Attach image or file"
        title="Attach image or file"
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Paperclip className="size-4" />
        )}
      </Button>
    </>
  );
}
