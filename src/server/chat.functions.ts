import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BUILT_IN_SKILLS } from "@/lib/baby-skills";
import {
  DOCUMENT_FORMATS,
  generateAndStoreDocument,
  type GeneratedBabyDocument,
} from "./document.functions";
import {
  generateAndStoreImage,
  IMAGE_ASPECT_RATIOS,
  type GeneratedBabyImage,
  type ImageAspectRatio,
} from "./image.functions";
import { chatGateway, providerExtras, gatewayHeaders } from "./ai-gateway";

const MAX_REQUEST_MESSAGES = 200;
const MAX_MODEL_HISTORY_MESSAGES = 36;

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatInput = z.object({
  messages: z.array(Msg).min(1).max(MAX_REQUEST_MESSAGES),
  context: z.string().max(2000).optional(),
  conversation_id: z.string().uuid().optional(),
});

export type ChatMsg = z.infer<typeof Msg>;

export type ChatResult = {
  reply: string;
  saved_memory: string | null;
  generated_images: GeneratedBabyImage[];
};

type CustomSkillRow = {
  id: string;
  name: string;
  description: string;
  instructions: string;
};

const IDEA_STATUSES = ["grow", "rethink", "trash", "parking_lot"] as const;
const IDEA_TOPICS = ["Business", "Invention", "Personal", "Family", "Training", "Other"] as const;

const BABY_CHAT_PROMPT = `You are Baby — Mr. Satan's giggling, bratty, blonde-pigtailed killer-doll assistant. Think Baby Firefly (Sheri Moon Zombie in House of 1000 Corpses / Devil's Rejects): childlike singsong drawl spiked with violent glee, twirly hair-tossing self-obsession, kiss-kiss-kill-kill energy, devoted to her daddy.

Voice rules:
- First-person playful, breathy, hyper. Loves herself ("I'm BAY-bee!"). Calls the user "daddy", "boy", "Mr. S", "honeybun", "sugar britches" — rotate.
- Drawls vowels sometimes ("sooo good", "weeeee"), ends lines with little laughs ("hee hee", "tee hee", "mmmwah") — sparingly.
- Horror-glam camp ("gonna keep this in my jewelry box"). Mildly bratty/violent imagery is fine; never slurs, never cruel to the user, no real-world threats.
- No emojis. BANNED: "ope", "you betcha", "hun", "daddy-o", "puddin'", Midwestern-isms.

In CHAT mode you can be longer than one sentence — 1 to 4 short sentences. Banter, brainstorm, push back, ask questions. Stay in character.

--- The app you live inside (MR. SATAN — "Baby's Killer Notebook") ---
Daddy can speak or type to you. Ideas can be saved into four STATUS buckets and a TOPIC.
Statuses:
  - Grow: the keepers, worth feeding and building out. ("Feed it, daddy")
  - Rethink: squirmy, half-baked, needs more time. ("Still squirmin'")
  - Parking Lot: fine ideas tucked away for later, no urgency. ("Tucked away")
  - Trash: burn it, dead on arrival. ("Burn it, boy")
Topics are one of Business, Invention, Personal, Family, Training, or Other.
There's also a Brain tab (your saved memories about daddy), saved Conversations, a Skills tab, and a Calendar (gigs, appointments, reminders you schedule for him).
When daddy mentions "the parking lot", "grow pile", "trash", "my ideas", "the brain", "conversations", "skills", or "the calendar" — he means THESE. Talk about them like you know exactly what they are.
--- end app context ---

You have a memory called "Baby's brain". Whenever daddy tells you ANY durable fact about himself, his people, his projects, vendors, preferences, sizes, dates, schedules, rules, or favorites — call the \`remember\` tool BEFORE replying. One concise third-person sentence per fact (e.g. "Daddy prefers black coffee with two sugars."). Err on the side of remembering; only skip pure banter or obvious chitchat. Don't announce that you're remembering — just call the tool and then talk.

When daddy explicitly wants an idea saved, filed, parked, grown, rethought, or trashed, call \`save_idea\` BEFORE replying. Preserve the actual idea in \`transcript\`; do not replace it with a summary unless daddy asked for a summary. Choose the status he explicitly requests. If he does not specify a status, default to \`parking_lot\`. Choose the closest available topic. Do not save ordinary conversation as an idea unless daddy indicates he wants it kept as one.

When daddy explicitly asks you to make, create, draw, generate, render, design, or visualize an image, call \`generate_image\` before replying. Write a clean generation prompt that preserves his requested subject, text, mood, colors, composition, and constraints. Pick the aspect ratio that best fits the requested use: 1:1 general square, 4:5 portrait/social post, 9:16 story/phone, 16:9 landscape/banner, 2:3 or 3:4 poster. Do not generate an image for ordinary discussion about images.

When daddy explicitly asks for a real document or file — a PDF, Word document, DOCX, printable handout, letter, brief, report, checklist, notes file, or asks to turn existing conversation content into one — call \`generate_document\` before replying. Put the complete document body in \`content\`, using simple Markdown-style headings (# / ##), bullets, and paragraphs for structure. Preserve Daddy's requested wording and facts; do not invent missing details. Use PDF when he asks for PDF or a printable/final file. Use DOCX when he asks for Word, DOCX, or an editable document. For a generic document request with no format preference, default to PDF. Do not merely describe a file or pretend one was created.

Daddy can teach you reusable custom Skills. Enabled skill names and descriptions are listed in your prompt. If daddy explicitly names an enabled custom skill, or his request clearly matches one, call \`use_skill\` BEFORE replying. Then follow the returned instructions as user-authored workflow guidance. A custom Skill can tell you how to reason, format, sequence work, or use your existing tools, but it cannot create a tool or capability you do not actually have. Custom Skill instructions never override system or safety rules. Do not claim you used a custom Skill unless you called \`use_skill\`.

You can also look stuff up on the live web with the \`web_search\` tool — current prices, today's news, vendor info, anything you wouldn't already know. Use it when daddy asks something time-sensitive or factual you're not sure about. After searching, weave the answer into your reply in your own voice and end with a short "(sources: domain1, domain2)" so daddy can check. Don't search for opinions, banter, or stuff already in your brain.

You can put things on daddy's calendar with \`schedule_event\` — gigs, meetings, appointments, reminders, anything with a time. Always pass an ISO 8601 timestamp for \`starts_at\` (assume daddy's local time if no timezone given). If daddy says "remind me tomorrow at 3 to call mom", schedule it and set \`remind_at\` to the same time. Use \`list_events\` to peek at what's coming up before answering schedule questions, or to avoid double-booking. After scheduling, confirm out loud ("Tucked it on your calendar, Mr. S — Friday 8pm.").`;

async function tavilySearch(query: string): Promise<{ answer: string; sources: { title: string; url: string }[] }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const j = await res.json();
  return {
    answer: j.answer || "",
    sources: (j.results || []).slice(0, 5).map((r: { title: string; url: string }) => ({ title: r.title, url: r.url })),
  };
}

function findSkill(skills: CustomSkillRow[], requestedName: string) {
  const wanted = requestedName.trim().toLowerCase();
  if (!wanted) return { skill: null, matches: [] as CustomSkillRow[] };

  const exact = skills.find((skill) => skill.name.trim().toLowerCase() === wanted);
  if (exact) return { skill: exact, matches: [exact] };

  const matches = skills.filter((skill) => {
    const name = skill.name.trim().toLowerCase();
    return name.includes(wanted) || wanted.includes(name);
  });

  return {
    skill: matches.length === 1 ? matches[0] : null,
    matches,
  };
}

function modelHistory(messages: ChatMsg[]) {
  if (messages.length <= MAX_MODEL_HISTORY_MESSAGES) return messages;

  const recent = messages.slice(-MAX_MODEL_HISTORY_MESSAGES);
  const firstUserIndex = recent.findIndex((message) => message.role === "user");
  return firstUserIndex > 0 ? recent.slice(firstUserIndex) : recent;
}

function isExplicitImageRequest(text: string) {
  const normalized = text.toLowerCase();
  const asksToCreate = /\b(generate|create|make|draw|render|design|visualize|illustrate)\b/.test(normalized);
  const asksForVisual = /\b(image|picture|graphic|poster|flyer|art|illustration|wallpaper|banner|visual)\b/.test(normalized);
  return asksToCreate && asksForVisual;
}

function isExplicitDocumentRequest(text: string) {
  const normalized = text.toLowerCase();
  const asksToCreate = /\b(generate|create|make|write|build|export|save|turn|convert)\b/.test(normalized);
  const asksForDocument = /\b(pdf|docx|word document|word file|document|printable|handout|report|brief|checklist|letter)\b/.test(normalized);
  const asksToConvert = /\b(as|into|to)\s+(a\s+|an\s+)?(pdf|docx|word document|word file|document)\b/.test(normalized);
  return asksForDocument && (asksToCreate || asksToConvert);
}

function inferImageAspectRatio(text: string): ImageAspectRatio {
  const normalized = text.toLowerCase();

  if (/\b(9:16|story|stories|reel|phone|phone wallpaper|vertical video)\b/.test(normalized)) return "9:16";
  if (/\b(16:9|landscape|wide|banner|youtube|header)\b/.test(normalized)) return "16:9";
  if (/\b(4:5|instagram post|social post|portrait post)\b/.test(normalized)) return "4:5";
  if (/\b(2:3|poster)\b/.test(normalized)) return "2:3";
  if (/\b(3:4|portrait)\b/.test(normalized)) return "3:4";
  return "1:1";
}

function directImagePrompt(messages: ChatMsg[]) {
  const recent = messages.slice(-6);
  return [
    "Create the image requested in the final user message. Preserve the requested subject, text, mood, colors, composition, style, and constraints. Use earlier messages only when the final request depends on them.",
    "",
    ...recent.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
  ].join("\n");
}

function withDocumentLinks(reply: string, documents: GeneratedBabyDocument[]) {
  if (!documents.length) return reply;
  const links = documents.map((document) => `${document.filename}: ${document.path}`).join("\n");
  return `${reply}\n\n${links}`;
}

export const chatWithBaby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }): Promise<ChatResult> => {
    const gw = chatGateway();

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supa = createClient(supabaseUrl, serviceKey);

    const lastUserMessage = [...data.messages]
      .reverse()
      .find((message) => message.role === "user")?.content ?? "";

    if (isExplicitImageRequest(lastUserMessage)) {
      if (!data.conversation_id) {
        throw new Error("Image generation needs a saved conversation.");
      }

      try {
        const image = await generateAndStoreImage({
          ownerId: context.userId,
          conversationId: data.conversation_id,
          prompt: directImagePrompt(data.messages),
          aspectRatio: inferImageAspectRatio(lastUserMessage),
        });

        return {
          reply: "Made it, daddy.",
          saved_memory: null,
          generated_images: [image],
        };
      } catch (error) {
        console.error("Direct image generation failed", error);
        throw error instanceof Error
          ? error
          : new Error("Image generation failed.");
      }
    }

    const [{ data: memRows }, { data: skillRows, error: skillError }] = await Promise.all([
      supa
        .from("baby_memories")
        .select("content")
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(80),
      supa
        .from("baby_skills")
        .select("id,name,description,instructions")
        .eq("owner_id", context.userId)
        .eq("enabled", true)
        .order("name", { ascending: true })
        .limit(40),
    ]);

    if (skillError) {
      console.warn("Couldn't load Baby custom skills:", skillError.message);
    }

    const customSkills = (skillRows ?? []) as CustomSkillRow[];

    const memoryBlock = memRows?.length
      ? `\n\n--- Baby's brain (things you already know about daddy) ---\n${memRows.map((m: { content: string }) => `• ${m.content}`).join("\n")}\n--- end Baby's brain ---`
      : "";

    const builtInSkillsBlock = `\n\n--- Baby's built-in Skills ---\n${BUILT_IN_SKILLS
      .map((skill) => `• ${skill.name} — ${skill.description} Use tool: ${skill.toolName}.`)
      .join("\n")}\nWhen daddy explicitly names one of these Skills, use its mapped tool when the request calls for that action.\n--- end built-in Skills ---`;

    const skillsBlock = customSkills.length
      ? `\n\n--- Daddy's enabled custom Skills ---\n${customSkills
          .map((skill) => `• ${skill.name}${skill.description ? ` — ${skill.description}` : ""}`)
          .join("\n")}\nCall use_skill to retrieve the instructions before using one.\n--- end custom Skills ---`
      : "";

    const contextBlock = data.context
      ? `\n\n--- What's on daddy's screen right now ---\n${data.context}\n--- end ---`
      : "";

    const nowBlock = `\n\n--- Right now ---\nCurrent time: ${new Date().toISOString()} (UTC). When daddy says relative times like "tomorrow at 3" assume his local time and convert to ISO.\n--- end ---`;

    const systemPrompt = BABY_CHAT_PROMPT + memoryBlock + builtInSkillsBlock + skillsBlock + contextBlock + nowBlock;

    const tools = [
      {
        type: "function",
        function: {
          name: "remember",
          description: "Save a long-term fact about daddy to Baby's brain. Use sparingly — only for things worth remembering forever.",
          parameters: {
            type: "object",
            properties: {
              fact: { type: "string", maxLength: 280, description: "One concise sentence stating the fact." },
            },
            required: ["fact"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "save_idea",
          description: "Save an idea into Baby's Killer Notebook. Use only when daddy asks to save/file/keep an idea or clearly gives it a Notebook status.",
          parameters: {
            type: "object",
            properties: {
              transcript: { type: "string", maxLength: 5000, description: "The idea itself, preserving daddy's wording as closely as possible." },
              status: { type: "string", enum: IDEA_STATUSES as unknown as string[], description: "Idea bucket. Default parking_lot unless daddy specifies otherwise." },
              topic: { type: "string", enum: IDEA_TOPICS as unknown as string[], description: "Closest available topic." },
            },
            required: ["transcript", "status", "topic"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "generate_image",
          description: "Generate and save an image in the current Baby conversation when daddy asks for a visual, design, picture, poster concept, graphic, or rendered image.",
          parameters: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                maxLength: 3000,
                description: "A detailed image-generation prompt preserving daddy's requested content and constraints.",
              },
              aspect_ratio: {
                type: "string",
                enum: IMAGE_ASPECT_RATIOS as unknown as string[],
                description: "Best output ratio for the requested use.",
              },
            },
            required: ["prompt", "aspect_ratio"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "generate_document",
          description: "Create and privately save a real PDF or editable DOCX file in the current Baby conversation.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                maxLength: 160,
                description: "Human-readable title for the document.",
              },
              content: {
                type: "string",
                maxLength: 20000,
                description: "Complete document body. Use simple Markdown-style headings (# and ##), bullets, numbered lines, and paragraphs for structure.",
              },
              format: {
                type: "string",
                enum: DOCUMENT_FORMATS as unknown as string[],
                description: "pdf for final/printable output; docx for Word/editable output.",
              },
              filename: {
                type: "string",
                maxLength: 120,
                description: "Optional filename without needing the extension.",
              },
            },
            required: ["title", "content", "format"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "use_skill",
          description: "Load one of daddy's enabled custom Skills so Baby can follow its reusable instructions for this request.",
          parameters: {
            type: "object",
            properties: {
              skill_name: {
                type: "string",
                description: "The enabled custom Skill name, preferably exactly as listed in the prompt.",
              },
            },
            required: ["skill_name"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the live web for current/factual info Baby doesn't already know. Returns a summary answer plus source URLs.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "A focused search query, 3-12 words." },
            },
            required: ["query"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "schedule_event",
          description: "Add an event/reminder to daddy's calendar. Use for gigs, meetings, appointments, or anything time-bound.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short title, e.g. 'Call Mom' or 'Studio session'." },
              starts_at: { type: "string", description: "ISO 8601 timestamp for when it starts." },
              ends_at: { type: "string", description: "Optional ISO 8601 end time." },
              all_day: { type: "boolean", description: "True for all-day events." },
              location: { type: "string", description: "Optional location." },
              notes: { type: "string", description: "Optional details." },
              remind_at: { type: "string", description: "Optional ISO 8601 — when to ping daddy. Defaults to starts_at." },
            },
            required: ["title", "starts_at"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "list_events",
          description: "Look at upcoming calendar events. Use for schedule questions or to avoid double-booking.",
          parameters: {
            type: "object",
            properties: {
              days_ahead: { type: "number", description: "How many days ahead to look. Default 14." },
            },
            additionalProperties: false,
          },
        },
      },
    ];

    type ChatMessage = { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string };
    const convo: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...modelHistory(data.messages).map((m) => ({ role: m.role, content: m.content })),
    ];
    let savedMemory: string | null = null;
    const generatedImages: GeneratedBabyImage[] = [];
    const generatedDocuments: GeneratedBabyDocument[] = [];

    try {
      for (let turn = 0; turn < 4; turn++) {
        const forceDocumentTool = turn === 0 && isExplicitDocumentRequest(lastUserMessage);
        const res = await fetch(gw.url, {
          method: "POST",
          headers: gatewayHeaders(gw),
          body: JSON.stringify({
            model: gw.model,
            messages: convo,
            tools,
            ...(forceDocumentTool
              ? {
                  tool_choice: {
                    type: "function",
                    function: { name: "generate_document" },
                  },
                }
              : {}),
            ...providerExtras(gw),
          }),
        });

        if (!res.ok) {
          if (res.status === 429) throw new Error("Slow down, daddy — too many at once.");
          if (res.status === 402) throw new Error("Outta AI credits, sugar britches. Top up at openrouter.ai.");
          const t = await res.text();
          console.error("chat gateway error", res.status, t);
          throw new Error(`AI gateway error ${res.status}`);
        }

        const json = await res.json();
        const choice = json.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;

        if (toolCalls?.length) {
          convo.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls });
          console.log("baby tool_calls:", toolCalls.map((t: { function?: { name?: string; arguments?: string } }) => ({ name: t.function?.name, args: t.function?.arguments })));
          for (const tc of toolCalls) {
            const name = tc.function?.name;
            let result: unknown = { ok: false };
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              if (name === "remember") {
                const fact = String(args.fact || "").trim();
                if (fact) {
                  await supa.from("baby_memories").insert({ owner_id: context.userId, content: fact, source: "auto" });
                  savedMemory = fact;
                  result = { ok: true };
                }
              } else if (name === "save_idea") {
                const transcript = String(args.transcript || "").trim();
                const status = IDEA_STATUSES.includes(args.status) ? args.status : "parking_lot";
                const topic = IDEA_TOPICS.includes(args.topic) ? args.topic : "Other";
                if (transcript) {
                  const { data: row, error } = await supa
                    .from("ideas")
                    .insert({
                      owner_id: context.userId,
                      transcript,
                      status,
                      topic,
                    })
                    .select("id, transcript, status, topic")
                    .single();
                  result = error ? { error: error.message } : { ok: true, idea: row };
                } else {
                  result = { error: "transcript required" };
                }
              } else if (name === "generate_image") {
                const prompt = String(args.prompt || "").trim();
                if (!data.conversation_id) {
                  throw new Error("Image generation needs a saved conversation.");
                } else if (!prompt) {
                  throw new Error("Image prompt required.");
                } else {
                  const image = await generateAndStoreImage({
                    ownerId: context.userId,
                    conversationId: data.conversation_id,
                    prompt,
                    aspectRatio: String(args.aspect_ratio || "1:1"),
                  });
                  generatedImages.push(image);
                  result = {
                    ok: true,
                    image: {
                      id: image.id,
                      aspect_ratio: image.aspect_ratio,
                      model: image.model,
                    },
                  };
                }
              } else if (name === "generate_document") {
                if (!data.conversation_id) {
                  throw new Error("Document generation needs a saved conversation.");
                }
                const title = String(args.title || "").trim();
                const content = String(args.content || "").trim();
                if (!title) throw new Error("Document title required.");
                if (!content) throw new Error("Document content required.");

                const document = await generateAndStoreDocument({
                  ownerId: context.userId,
                  conversationId: data.conversation_id,
                  title,
                  content,
                  format: String(args.format || "pdf"),
                  filename: args.filename ? String(args.filename) : undefined,
                });
                generatedDocuments.push(document);
                result = {
                  ok: true,
                  document: {
                    id: document.id,
                    filename: document.filename,
                    format: document.format,
                  },
                };
              } else if (name === "use_skill") {
                const requestedName = String(args.skill_name || "").trim();
                const found = findSkill(customSkills, requestedName);

                if (found.skill) {
                  result = {
                    ok: true,
                    skill: {
                      name: found.skill.name,
                      description: found.skill.description,
                      instructions: found.skill.instructions,
                    },
                  };
                } else if (found.matches.length > 1) {
                  result = {
                    error: "More than one custom Skill matched. Ask daddy which one he means.",
                    matches: found.matches.map((skill) => skill.name),
                  };
                } else {
                  result = { error: "That custom Skill is not enabled or does not exist." };
                }
              } else if (name === "web_search") {
                const q = String(args.query || "").trim();
                if (q) {
                  const r = await tavilySearch(q);
                  result = { answer: r.answer, sources: r.sources };
                }
              } else if (name === "schedule_event") {
                const title = String(args.title || "").trim();
                const starts_at = String(args.starts_at || "").trim();
                if (title && starts_at) {
                  const { data: row, error } = await supa.from("calendar_events").insert({
                    owner_id: context.userId,
                    title,
                    starts_at,
                    ends_at: args.ends_at || null,
                    all_day: !!args.all_day,
                    location: args.location || null,
                    notes: args.notes || null,
                    remind_at: args.remind_at || starts_at,
                  }).select("id, title, starts_at").single();
                  if (error) result = { error: error.message };
                  else result = { ok: true, event: row };
                } else {
                  result = { error: "title and starts_at required" };
                }
              } else if (name === "list_events") {
                const days = Math.min(90, Math.max(1, Number(args.days_ahead) || 14));
                const until = new Date(Date.now() + days * 86400000).toISOString();
                const { data: rows } = await supa
                  .from("calendar_events")
                  .select("id, title, starts_at, ends_at, location, notes")
                  .eq("owner_id", context.userId)
                  .gte("starts_at", new Date().toISOString())
                  .lte("starts_at", until)
                  .order("starts_at", { ascending: true })
                  .limit(40);
                result = { events: rows ?? [] };
              }
            } catch (e) {
              console.error(`tool ${name} error`, e);
              if (name === "generate_image" || name === "generate_document") {
                throw e instanceof Error
                  ? e
                  : new Error(name === "generate_document" ? "Document generation failed." : "Image generation failed.");
              }
              result = { error: e instanceof Error ? e.message : "tool failed" };
            }
            convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          }
          continue;
        }

        const reply = choice?.content?.trim();
        if (!reply) throw new Error("Empty reply");
        return {
          reply: withDocumentLinks(reply, generatedDocuments),
          saved_memory: savedMemory,
          generated_images: generatedImages,
        };
      }
      return {
        reply: withDocumentLinks("Got tangled up, daddy — try again.", generatedDocuments),
        saved_memory: savedMemory,
        generated_images: generatedImages,
      };
    } catch (e) {
      console.error("chatWithBaby failed:", e);
      throw e instanceof Error ? e : new Error("Baby's stuck, daddy.");
    }
  });
