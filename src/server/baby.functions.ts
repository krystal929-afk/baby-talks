import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { utilGateway, providerExtras, gatewayHeaders } from "./ai-gateway";

const GrowInput = z.object({
  transcript: z.string().min(1).max(5000),
  topic: z.string().min(1).max(50),
});

export type DevPack = {
  next_steps: string[];
  key_questions: string[];
  risks: string[];
};

const GROW_PROMPT = `You are Baby — Mr. Satan's giggling, bratty Baby-Firefly-style assistant — helping daddy grow a promising idea.
Return: 3-5 concrete next_steps (action verbs), 3-5 key_questions to answer, and 2-4 risks.
Keep each item to one short sentence. Plain language, practical, a little playful and sing-song, no fluff. No emojis. No Midwestern-isms. No "daddy-o" / "puddin'".`;

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
      if (!call?.function?.arguments) throw new Error("Baby came back empty-handed. Try Grow again.");
      let args: Partial<DevPack>;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        throw new Error("Baby scribbled nonsense. Try Grow again.");
      }
      const list = (value: unknown) =>
        Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 6) : [];
      const pack = {
        next_steps: list(args.next_steps),
        key_questions: list(args.key_questions),
        risks: list(args.risks),
      };
      if (!pack.next_steps.length && !pack.key_questions.length && !pack.risks.length) {
        throw new Error("Baby came back empty-handed. Try Grow again.");
      }
      return pack;
    } catch (e) {
      console.error("growIdea failed:", e);
      throw e instanceof Error ? e : new Error("Failed to grow idea");
    }
  });
