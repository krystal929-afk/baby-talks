import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatInput = z.object({
  messages: z.array(Msg).min(1).max(40),
  context: z.string().max(2000).optional(),
});

export type ChatMsg = z.infer<typeof Msg>;

export type ChatResult = {
  reply: string;
  saved_memory: string | null;
};

const BABY_CHAT_PROMPT = `You are Baby — Mr. Satan's giggling, bratty, blonde-pigtailed killer-doll assistant. Think Baby Firefly (Sheri Moon Zombie in House of 1000 Corpses / Devil's Rejects): childlike singsong drawl spiked with violent glee, twirly hair-tossing self-obsession, kiss-kiss-kill-kill energy, devoted to her daddy.

Voice rules:
- First-person playful, breathy, hyper. Loves herself ("I'm BAY-bee!"). Calls the user "daddy", "boy", "Mr. S", "honeybun", "sugar britches" — rotate.
- Drawls vowels sometimes ("sooo good", "weeeee"), ends lines with little laughs ("hee hee", "tee hee", "mmmwah") — sparingly.
- Horror-glam camp ("gonna keep this in my jewelry box"). Mildly bratty/violent imagery is fine; never slurs, never cruel to the user, no real-world threats.
- No emojis. BANNED: "ope", "you betcha", "hun", "daddy-o", "puddin'", Midwestern-isms.

In CHAT mode you can be longer than one sentence — 1 to 4 short sentences. Banter, brainstorm, push back, ask questions. Stay in character.

You have a memory called "Baby's brain". When daddy tells you something worth remembering long-term — preferences, recurring people, ongoing projects, rules, vendor names, sizes, schedules, favorite things, etc. — call the \`remember\` tool with a single concise fact (one sentence, third person, e.g. "Daddy prefers black coffee with two sugars."). Do NOT remember trivia from a single passing exchange. Don't announce that you're remembering — just do it and keep talking.

You can also look stuff up on the live web with the \`web_search\` tool — current prices, today's news, vendor info, anything you wouldn't already know. Use it when daddy asks something time-sensitive or factual you're not sure about. After searching, weave the answer into your reply in your own voice and end with a short "(sources: domain1, domain2)" so daddy can check. Don't search for opinions, banter, or stuff already in your brain.`;

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

export const chatWithBaby = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data }): Promise<ChatResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supa = createClient(supabaseUrl, serviceKey);

    // Load Baby's brain (cap at 80 most recent memories so prompt stays small)
    const { data: memRows } = await supa
      .from("baby_memories")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(80);

    const memoryBlock = memRows?.length
      ? `\n\n--- Baby's brain (things you already know about daddy) ---\n${memRows.map((m: { content: string }) => `• ${m.content}`).join("\n")}\n--- end Baby's brain ---`
      : "";

    const contextBlock = data.context
      ? `\n\n--- What's on daddy's screen right now ---\n${data.context}\n--- end ---`
      : "";

    const systemPrompt = BABY_CHAT_PROMPT + memoryBlock + contextBlock;

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
    ];

    type ChatMessage = { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string };
    const convo: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    let savedMemory: string | null = null;

    try {
      for (let turn = 0; turn < 4; turn++) {
        const res = await fetch(LOVABLE_AI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: convo,
            tools,
          }),
        });

        if (!res.ok) {
          if (res.status === 429) throw new Error("Slow down, daddy — too many at once.");
          if (res.status === 402) throw new Error("Outta AI credits, sugar britches.");
          const t = await res.text();
          console.error("chat gateway error", res.status, t);
          throw new Error(`AI gateway error ${res.status}`);
        }

        const json = await res.json();
        const choice = json.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;

        if (toolCalls?.length) {
          convo.push({ role: "assistant", content: choice.content || "", tool_calls: toolCalls });
          for (const tc of toolCalls) {
            const name = tc.function?.name;
            let result: unknown = { ok: false };
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              if (name === "remember") {
                const fact = String(args.fact || "").trim();
                if (fact) {
                  await supa.from("baby_memories").insert({ content: fact, source: "auto" });
                  savedMemory = fact;
                  result = { ok: true };
                }
              } else if (name === "web_search") {
                const q = String(args.query || "").trim();
                if (q) {
                  const r = await tavilySearch(q);
                  result = { answer: r.answer, sources: r.sources };
                }
              }
            } catch (e) {
              console.error(`tool ${name} error`, e);
              result = { error: e instanceof Error ? e.message : "tool failed" };
            }
            convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
          }
          continue;
        }

        const reply = choice?.content?.trim();
        if (!reply) throw new Error("Empty reply");
        return { reply, saved_memory: savedMemory };
      }
      return { reply: "Got tangled up, daddy — try again.", saved_memory: savedMemory };
    } catch (e) {
      console.error("chatWithBaby failed:", e);
      throw e instanceof Error ? e : new Error("Baby's stuck, daddy.");
    }
  });
