import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { utilGateway, providerExtras, gatewayHeaders } from "./ai-gateway";
import { BABY_PERSONA } from "./persona";
import { STATUSES, TOPICS, isStatus, isTopic, type Status, type Topic } from "@/lib/ideas";

export type { Status, Topic };

const ClassifyInput = z.object({
  transcript: z.string().min(1).max(5000),
});

export type ClassifyResult = {
  status: Status;
  topic: Topic;
  baby_reply: string;
};

const SYSTEM_PROMPT = `${BABY_PERSONA}
Keep replies to ONE short sentence (under 16 words).
Your job: read the user's idea and decide:
  - status: one of "grow" (worth pursuing), "rethink" (needs work), "trash" (not worth it), "parking_lot" (default; save for later).
    Default to "parking_lot" unless the idea clearly signals one of the others (e.g. "this is gold" -> grow, "scrap this" -> trash, "not sure" -> rethink).
  - topic: one of "Business", "Invention", "Personal", "Family", "Training", "Other".
  - baby_reply: one short Baby-Firefly confirmation sentence acknowledging what you filed it as.`;

export const classifyIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ClassifyInput.parse(d))
  .handler(async ({ data }): Promise<ClassifyResult> => {
    try {
      // Inside the try so a missing key falls back instead of blocking capture.
      const gw = utilGateway();
      const res = await fetch(gw.url, {
        method: "POST",
        headers: gatewayHeaders(gw),
        body: JSON.stringify({
          model: gw.model,
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
                    baby_reply: { type: "string", maxLength: 140 },
                  },
                  required: ["status", "topic", "baby_reply"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "file_idea" } },
          ...providerExtras(gw),
        }),
      });

      if (!res.ok) {
        if (res.status === 429)
          throw new Error("Slow down, daddy — too many requests. Gimme a sec, hee hee.");
        if (res.status === 402)
          throw new Error("Outta credits, sugar britches. Check the AI account balance.");
        const t = await res.text();
        console.error("classify gateway error", res.status, t);
        throw new Error(`AI gateway error ${res.status}`);
      }

      const json = await res.json();
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (!call?.function?.arguments) throw new Error("No tool call returned");
      const args = JSON.parse(call.function.arguments);
      return {
        status: isStatus(args.status) ? args.status : "parking_lot",
        topic: isTopic(args.topic) ? args.topic : "Other",
        baby_reply: String(args.baby_reply || "Tucked it in my jewelry box, daddy."),
      };
    } catch (e) {
      console.error("classifyIdea failed:", e);
      // Graceful fallback so capture never blocks
      return {
        status: "parking_lot",
        topic: "Other",
        baby_reply: "Tossed it in the parkin' lot for ya, honeybun.",
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

const GROW_PROMPT = `${BABY_PERSONA}

You are helping daddy grow a promising idea.
Return: 3-5 concrete next_steps (action verbs), 3-5 key_questions to answer, and 2-4 risks.
Keep each item to one short sentence. Plain language, practical, a little playful and sing-song, no fluff.`;

export const growIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GrowInput.parse(d))
  .handler(async ({ data }): Promise<DevPack> => {
    const gw = utilGateway();

    try {
      const res = await fetch(gw.url, {
        method: "POST",
        headers: gatewayHeaders(gw),
        body: JSON.stringify({
          model: gw.model,
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
                    next_steps: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5,
                    },
                    key_questions: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5,
                    },
                    risks: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
                  },
                  required: ["next_steps", "key_questions", "risks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "build_dev_pack" } },
          ...providerExtras(gw),
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Too many requests — try again shortly.");
        if (res.status === 402) throw new Error("Out of AI credits.");
        throw new Error(`AI gateway error ${res.status}`);
      }
      const json = await res.json();
      const call = json.choices?.[0]?.message?.tool_calls?.[0];
      if (!call?.function?.arguments)
        throw new Error("Baby blanked on that one — try growing it again.");
      const args = JSON.parse(call.function.arguments);
      const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
      return {
        next_steps: strings(args.next_steps),
        key_questions: strings(args.key_questions),
        risks: strings(args.risks),
      };
    } catch (e) {
      console.error("growIdea failed:", e);
      throw e instanceof Error ? e : new Error("Failed to grow idea");
    }
  });
