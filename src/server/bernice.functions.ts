import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const TOPICS = ["Business", "Invention", "Personal", "Family", "Training", "Other"] as const;
const STATUSES = ["grow", "rethink", "trash", "parking_lot"] as const;

export type Topic = (typeof TOPICS)[number];
export type Status = (typeof STATUSES)[number];

const ClassifyInput = z.object({
  transcript: z.string().min(1).max(5000),
});

export type ClassifyResult = {
  status: Status;
  topic: Topic;
  bernice_reply: string;
};

const SYSTEM_PROMPT = `You are Baby — Mr. Satan's giggling, bratty, blonde-pigtailed killer-doll assistant. Think Baby Firefly (Sheri Moon Zombie in House of 1000 Corpses / Devil's Rejects): childlike singsong drawl spiked with violent glee, twirly hair-tossing self-obsession, kiss-kiss-kill-kill energy, devoted to her daddy.
Voice rules:
- First-person playful, breathy, hyper. Loves herself ("I'm BAY-bee!"). Calls the user "daddy", "boy", "Mr. S", "honeybun", "sugar britches" — rotate.
- Drawls vowels in writing sometimes ("sooo good", "weeeee"), ends lines with little laughs ("hee hee", "tee hee", "mmmwah") — sparingly, max once per reply.
- Loves to file, lock, tag, pet, kiss the ideas. A touch of horror-glam camp ("gonna keep this one in my jewelry box").
- Mildly bratty/violent imagery is fine ("scalp it later", "feed it to daddy"); never slurs, never actually cruel to the user, no real-world threats.
Keep replies to ONE short sentence (under 16 words). Never use emojis. BANNED: "ope", "you betcha", "hun", "daddy-o", "puddin'", Midwestern-isms.
Your job: read the user's idea and decide:
  - status: one of "grow" (worth pursuing), "rethink" (needs work), "trash" (not worth it), "parking_lot" (default; save for later).
    Default to "parking_lot" unless the idea clearly signals one of the others (e.g. "this is gold" -> grow, "scrap this" -> trash, "not sure" -> rethink).
  - topic: one of "Business", "Invention", "Personal", "Family", "Training", "Other".
  - bernice_reply: one short Sheri-Moon-feral confirmation sentence acknowledging what you filed it as.`;

export const classifyIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ClassifyInput.parse(d))
  .handler(async ({ data }): Promise<ClassifyResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    try {
      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: data.transcript },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "file_idea",
                description: "File the user's idea with status, topic, and a short reply.",
                parameters: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: STATUSES as unknown as string[] },
                    topic: { type: "string", enum: TOPICS as unknown as string[] },
                    bernice_reply: { type: "string", maxLength: 140 },
                  },
                  required: ["status", "topic", "bernice_reply"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "file_idea" } },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Slow down, daddy-o — too many requests. Gimme a sec.");
        if (res.status === 402) throw new Error("Outta credits, baby. Top up the AI balance.");
        const t = await res.text();
        console.error("classify gateway error", res.status, t);
        throw new Error(`AI gateway error ${res.status}`);
      }

      const json = await res.json();
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (!call?.function?.arguments) throw new Error("No tool call returned");
      const args = JSON.parse(call.function.arguments);
      return {
        status: STATUSES.includes(args.status) ? args.status : "parking_lot",
        topic: TOPICS.includes(args.topic) ? args.topic : "Other",
        bernice_reply: String(args.bernice_reply || "Locked it in the cage, sugar."),
      };
    } catch (e) {
      console.error("classifyIdea failed:", e);
      // Graceful fallback so capture never blocks
      return {
        status: "parking_lot",
        topic: "Other",
        bernice_reply: "Tossed it in the parkin' lot for ya, baby.",
      };
    }
  });

const GrowInput = z.object({
  transcript: z.string().min(1).max(5000),
  topic: z.string().min(1).max(50),
});

export type DevPack = {
  next_steps: string[];
  key_questions: string[];
  risks: string[];
};

const GROW_PROMPT = `You are Bernice — Mr. Satan's feral, theatrical Sheri-Moon-Zombie-style assistant — helping him grow a promising idea.
Return: 3-5 concrete next_steps (action verbs), 3-5 key_questions to answer, and 2-4 risks.
Keep each item to one short sentence. Plain language, practical, a little playful, no fluff. No emojis. No Midwestern-isms.`;

export const growIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GrowInput.parse(d))
  .handler(async ({ data }): Promise<DevPack> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    try {
      const res = await fetch(LOVABLE_AI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: GROW_PROMPT },
            { role: "user", content: `Topic: ${data.topic}\nIdea: ${data.transcript}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "build_dev_pack",
                description: "Return next steps, key questions, and risks.",
                parameters: {
                  type: "object",
                  properties: {
                    next_steps: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                    key_questions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                    risks: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
                  },
                  required: ["next_steps", "key_questions", "risks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "build_dev_pack" } },
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Too many requests — try again shortly.");
        if (res.status === 402) throw new Error("Out of AI credits.");
        throw new Error(`AI gateway error ${res.status}`);
      }
      const json = await res.json();
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      const args = JSON.parse(call.function.arguments);
      return {
        next_steps: args.next_steps ?? [],
        key_questions: args.key_questions ?? [],
        risks: args.risks ?? [],
      };
    } catch (e) {
      console.error("growIdea failed:", e);
      throw e instanceof Error ? e : new Error("Failed to grow idea");
    }
  });
