type DocumentContextMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DirectDocumentDraft = {
  title: string;
  content: string;
  filename: string;
  format: "pdf" | "docx";
};

const DEFAULT_DOCUMENT_MODEL = "gemini-3.1-flash-lite";
const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

function inferDocumentFormat(request: string): "pdf" | "docx" {
  return /\b(docx|word document|word file|microsoft word|editable word)\b/i.test(request)
    ? "docx"
    : "pdf";
}

function needsConversationContext(request: string) {
  return /\b(this|that|these|those|above|earlier|previous|conversation|chat|we discussed|we talked about|turn this|make this)\b/i.test(
    request,
  );
}

function cleanFilename(value: string, fallback: string) {
  const cleaned = value
    .replace(/\.(pdf|docx)$/i, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

  return cleaned || fallback;
}

function documentPrompt(messages: DocumentContextMessage[], request: string, format: "pdf" | "docx") {
  const context = needsConversationContext(request)
    ? messages
        .slice(-12)
        .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
        .join("\n")
    : `USER: ${request}`;

  return [
    "You are the document-writing engine for Baby's Killer Notebook.",
    "Create the complete, useful document the final user request asks for. Do not talk about creating it; write the actual document.",
    "Use clear headings, short paragraphs, bullets, numbered steps, and checkboxes where they improve the document.",
    "For generic practical requests such as checklists, use sound general knowledge. For personal facts, names, dates, or claims, use only facts supplied in the request/context and do not invent missing details.",
    `The requested file format is ${format.toUpperCase()}.`,
    "The content field may use Markdown-style # / ## headings and - bullets. Keep it under about 3,000 words.",
    "Choose a concise human-readable title and a simple filename without an extension.",
    "",
    "REQUEST / RELEVANT CONTEXT:",
    context,
    "",
    `FINAL USER REQUEST: ${request}`,
  ].join("\n");
}

export async function writeDocumentDraft({
  messages,
  request,
}: {
  messages: DocumentContextMessage[];
  request: string;
}): Promise<DirectDocumentDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing for document writing");

  const format = inferDocumentFormat(request);
  const model = process.env.DOCUMENT_AI_MODEL || DEFAULT_DOCUMENT_MODEL;

  const response = await fetch(INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: documentPrompt(messages, request, format),
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            filename: { type: "string" },
          },
          required: ["title", "content", "filename"],
          additionalProperties: false,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        status?: string;
        error?: { message?: string };
        steps?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Gemini document writer error ${response.status}`,
    );
  }

  const textBlocks = (payload?.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!.trim())
    .filter(Boolean);

  const raw = textBlocks.at(-1);
  if (!raw) {
    throw new Error(
      payload?.status
        ? `Gemini document writer returned no text (${payload.status})`
        : "Gemini document writer returned no text",
    );
  }

  let draft: { title?: string; content?: string; filename?: string };
  try {
    draft = JSON.parse(raw) as { title?: string; content?: string; filename?: string };
  } catch {
    throw new Error("Gemini document writer returned invalid structured output");
  }

  const title = String(draft.title || "Baby document").replace(/\s+/g, " ").trim().slice(0, 160);
  const content = String(draft.content || "").trim().slice(0, 20000);
  const filename = cleanFilename(String(draft.filename || ""), "baby-document");

  if (!content) throw new Error("Gemini document writer returned an empty document");

  return {
    title,
    content,
    filename,
    format,
  };
}
