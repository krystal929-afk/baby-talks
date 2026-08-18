import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.104.1";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "npm:docx@9.7.1";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";

const DOCUMENT_BUCKET = "baby-documents";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type DocumentFormat = "pdf" | "docx";
type ContentBlock = {
  kind: "heading1" | "heading2" | "bullet" | "numbered" | "paragraph" | "blank";
  text: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

function parseContent(content: string): ContentBlock[] {
  return content.replace(/\r\n/g, "\n").split("\n").map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return { kind: "blank", text: "" } as ContentBlock;
    if (line.startsWith("## ")) return { kind: "heading2", text: cleanInlineMarkdown(line.slice(3)) } as ContentBlock;
    if (line.startsWith("# ")) return { kind: "heading1", text: cleanInlineMarkdown(line.slice(2)) } as ContentBlock;
    if (/^[-*]\s+/.test(line)) return { kind: "bullet", text: cleanInlineMarkdown(line.replace(/^[-*]\s+/, "")) } as ContentBlock;
    if (/^\d+[.)]\s+/.test(line)) return { kind: "numbered", text: cleanInlineMarkdown(line) } as ContentBlock;
    return { kind: "paragraph", text: cleanInlineMarkdown(line) } as ContentBlock;
  });
}

function supportedPdfText(value: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  const replacements: Record<string, string> = {
    "—": "-",
    "–": "-",
    "“": "\"",
    "”": "\"",
    "‘": "'",
    "’": "'",
    "…": "...",
    "•": "-",
    " ": " ",
  };

  return Array.from(value)
    .map((char) => {
      const codePoint = char.codePointAt(0) ?? 32;
      if (supported.has(codePoint)) return char;
      const replacement = replacements[char];
      if (replacement) return replacement;
      return codePoint <= 127 ? char : "?";
    })
    .join("");
}

function wrapPdfText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const clean = supportedPdfText(text, font).replace(/\s+/g, " ").trim();
  if (!clean) return [""];

  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      continue;
    }
    let fragment = "";
    for (const char of word) {
      const next = fragment + char;
      if (font.widthOfTextAtSize(next, size) > maxWidth && fragment) {
        lines.push(fragment);
        fragment = char;
      } else {
        fragment = next;
      }
    }
    current = fragment;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function renderPdf(title: string, content: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(title);
  pdf.setCreator("Baby's Killer Notebook");
  pdf.setProducer("Baby's Killer Notebook");
  pdf.setCreationDate(new Date());

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  let pageNumber = 1;

  const addFooter = () => {
    page.drawText(`Baby's Killer Notebook  |  ${pageNumber}`, {
      x: margin,
      y: 24,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.45, 0.45),
    });
  };

  const newPage = () => {
    addFooter();
    pageNumber += 1;
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const ensureSpace = (height: number) => {
    if (y - height < margin + 18) newPage();
  };

  const drawWrapped = ({ text, font, size, lineHeight, indent = 0, before = 0, after = 0 }: {
    text: string;
    font: PDFFont;
    size: number;
    lineHeight: number;
    indent?: number;
    before?: number;
    after?: number;
  }) => {
    y -= before;
    const lines = wrapPdfText(text, font, size, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= lineHeight;
    }
    y -= after;
  };

  drawWrapped({ text: title, font: bold, size: 22, lineHeight: 27, after: 12 });
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.75, 0.75, 0.75),
  });
  y -= 18;

  for (const block of parseContent(content)) {
    if (block.kind === "blank") { y -= 7; continue; }
    if (block.kind === "heading1") { drawWrapped({ text: block.text, font: bold, size: 16, lineHeight: 20, before: 8, after: 5 }); continue; }
    if (block.kind === "heading2") { drawWrapped({ text: block.text, font: bold, size: 13, lineHeight: 17, before: 6, after: 4 }); continue; }
    if (block.kind === "bullet") { drawWrapped({ text: `- ${block.text}`, font: regular, size: 11, lineHeight: 15, indent: 12, after: 3 }); continue; }
    if (block.kind === "numbered") { drawWrapped({ text: block.text, font: regular, size: 11, lineHeight: 15, indent: 12, after: 3 }); continue; }
    drawWrapped({ text: block.text, font: regular, size: 11, lineHeight: 15, after: 6 });
  }

  addFooter();
  return await pdf.save();
}

async function renderDocx(title: string, content: string) {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true })],
      spacing: { after: 240 },
    }),
  ];

  for (const block of parseContent(content)) {
    if (block.kind === "blank") { children.push(new Paragraph({ text: "", spacing: { after: 100 } })); continue; }
    if (block.kind === "heading1") { children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_1, spacing: { before: 180, after: 100 } })); continue; }
    if (block.kind === "heading2") { children.push(new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2, spacing: { before: 140, after: 80 } })); continue; }
    if (block.kind === "bullet") { children.push(new Paragraph({ text: block.text, bullet: { level: 0 }, spacing: { after: 80 } })); continue; }
    children.push(new Paragraph({ text: block.text, spacing: { after: 120 } }));
  }

  const doc = new Document({
    creator: "Baby's Killer Notebook",
    title,
    description: "Generated by Baby",
    sections: [{ children }],
  });

  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

function cleanFilename(value: string, format: DocumentFormat) {
  const withoutExtension = value
    .trim()
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[^a-zA-Z0-9 _.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return `${withoutExtension || "baby-document"}.${format}`;
}

export default {
  async fetch(req: Request) {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const provided = req.headers.get("authorization") || "";
    if (!serviceKey || provided !== `Bearer ${serviceKey}`) {
      return json({ error: "unauthorized" }, 401);
    }

    try {
      const body = await req.json() as Record<string, unknown>;
      const ownerId = String(body.owner_id || "").trim();
      const conversationId = String(body.conversation_id || "").trim();
      const title = String(body.title || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const content = String(body.content || "").trim();
      const format: DocumentFormat = body.format === "docx" ? "docx" : "pdf";
      const filename = cleanFilename(String(body.filename || title), format);

      if (!ownerId || !conversationId || !title || !content) {
        return json({ error: "owner_id, conversation_id, title, and content are required" }, 400);
      }
      if (content.length > 20000) return json({ error: "document content too long" }, 400);

      const supabase = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: conversation, error: conversationError } = await supabase
        .from("baby_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("owner_id", ownerId)
        .single();

      if (conversationError || !conversation) return json({ error: "conversation_not_found" }, 404);

      const mimeType = format === "pdf" ? "application/pdf" : DOCX_MIME;
      const bytes = format === "pdf" ? await renderPdf(title, content) : await renderDocx(title, content);
      const storagePath = `${ownerId}/${conversationId}/${crypto.randomUUID()}.${format}`;

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });

      if (uploadError) throw new Error(`Couldn't save generated document: ${uploadError.message}`);

      const { data: row, error: insertError } = await supabase
        .from("baby_documents")
        .insert({
          owner_id: ownerId,
          conversation_id: conversationId,
          title,
          filename,
          format,
          mime_type: mimeType,
          storage_path: storagePath,
          content,
        })
        .select("id,title,filename,format,mime_type")
        .single();

      if (insertError || !row) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
        throw new Error(insertError?.message || "Couldn't save document metadata");
      }

      return json({
        ok: true,
        document: {
          id: row.id,
          title: row.title,
          filename: row.filename,
          format: row.format,
          mime_type: row.mime_type,
          path: `/documents/${row.id}`,
        },
      });
    } catch (error) {
      console.error("baby-document-generate failed", error);
      return json({ error: error instanceof Error ? error.message : "document_generation_failed" }, 500);
    }
  },
};
