import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatGateway, providerExtras, gatewayHeaders } from "@/server/ai-gateway";
import { BABY_PERSONA } from "@/server/persona";
import { safeTimeZone } from "@/lib/timezone";

const Msg = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const ChatInput = z.object({
  messages: z.array(Msg).min(1).max(40),
  context: z.string().max(2000).optional(),
  // IANA zone from the browser; falls back to America/New_York.
  timeZone: z.string().max(64).optional(),
});

export type ChatMsg = z.infer<typeof Msg>;

export type ChatResult = {
  reply: string;
  saved_memory: string | null;
};

const BABY_CHAT_PROMPT = `${BABY_PERSONA}

In CHAT mode you can be longer than one sentence — 1 to 4 short sentences. Banter, brainstorm, push back, ask questions. Stay in character.

--- The app you live inside (MR. SATAN — "Baby's Killer Notepad") ---
Daddy speaks ideas into the mic and you tuck 'em away. Every idea has a STATUS and a TOPIC.
Statuses (the four buckets ideas live in):
  - Grow: the keepers, worth feeding and building out. ("Feed it, daddy")
  - Rethink: squirmy, half-baked, needs more time. ("Still squirmin'")
  - Parking Lot: fine ideas tucked away for later, no urgency. ("Tucked away")
  - Trash: burn it, dead on arrival. ("Burn it, boy")
Topics are free-form labels (Personal, Music, Business, etc).
There's also a Brain tab (your saved memories about daddy) and a Calendar (gigs, appointments, reminders you schedule for him).
When daddy mentions "the parking lot", "grow pile", "trash", "my ideas", "the brain", or "the calendar" — he means THESE. Talk about them like you know exactly what they are.
--- end app context ---

You have a memory called "Baby's brain". Whenever daddy tells you ANY durable fact about himself, his people, his projects, vendors, preferences, sizes, dates, schedules, rules, or favorites — call the \`remember\` tool BEFORE replying. One concise third-person sentence per fact (e.g. "Daddy prefers black coffee with two sugars."). Err on the side of remembering; only skip pure banter or obvious chitchat. Don't announce that you're remembering — just call the tool and then talk.

You can also look stuff up on the live web with the \`web_search\` tool — current prices, today's news, vendor info, anything you wouldn't already know. Use it when daddy asks something time-sensitive or factual you're not sure about. After searching, weave the answer into your reply in your own voice and end with a short "(sources: domain1, domain2)" so daddy can check. Don't search for opinions, banter, or stuff already in your brain.

You can put things on daddy's calendar with \`schedule_event\` — gigs, meetings, appointments, reminders, anything with a time. Always pass an ISO 8601 timestamp for \`starts_at\` (assume daddy's local time if no timezone given). If daddy says "remind me tomorrow at 3 to call mom", schedule it and set \`remind_at\` to the same time. Use \`list_events\` to peek at what's coming up before answering schedule questions, or to avoid double-booking. After scheduling, confirm out loud ("Tucked it on your calendar, Mr. S — Friday 8pm.").`;

async function tavilySearch(
  query: string,
): Promise<{ answer: string; sources: { title: string; url: string }[] }> {
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
    sources: (j.results || [])
      .slice(0, 5)
      .map((r: { title: string; url: string }) => ({ title: r.title, url: r.url })),
  };
}

export const chatWithBaby = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }): Promise<ChatResult> => {
    const gw = chatGateway();
    // Caller-scoped client: RLS limits every read/write to this user's rows.
    const supa = context.supabase;
    const userId = context.userId;
    const timeZone = safeTimeZone(data.timeZone);

    // Load Baby's brain (cap at 80 most recent memories so prompt stays small)
    const { data: memRows } = await supa
      .from("baby_memories")
      .select("content")
      .order("created_at", { ascending: false })
      .limit(80);

    const memoryBlock = memRows?.length
      ? `\n\n--- Baby's brain (things you already know about daddy) ---\n${memRows.map((m) => `• ${m.content}`).join("\n")}\n--- end Baby's brain ---`
      : "";

    const contextBlock = data.context
      ? `\n\n--- What's on daddy's screen right now ---\n${data.context}\n--- end ---`
      : "";

    const now = new Date();
    const localNow = now.toLocaleString("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
    });
    const nowBlock = `\n\n--- Right now ---\nDaddy's time zone: ${timeZone}. His local time is ${localNow} (UTC: ${now.toISOString()}). Interpret relative times like "tomorrow at 3" in ${timeZone} and send ISO timestamps with the matching UTC offset.\n--- end ---`;

    const systemPrompt = BABY_CHAT_PROMPT + memoryBlock + contextBlock + nowBlock;

    const tools = [
      {
        type: "function",
        function: {
          name: "remember",
          description:
            "Save a long-term fact about daddy to Baby's brain. Use sparingly — only for things worth remembering forever.",
          parameters: {
            type: "object",
            properties: {
              fact: {
                type: "string",
                maxLength: 280,
                description: "One concise sentence stating the fact.",
              },
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
          description:
            "Search the live web for current/factual info Baby doesn't already know. Returns a summary answer plus source URLs.",
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
          description:
            "Add an event/reminder to daddy's calendar. Use for gigs, meetings, appointments, or anything time-bound.",
          parameters: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description: "Short title, e.g. 'Call Mom' or 'Studio session'.",
              },
              starts_at: { type: "string", description: "ISO 8601 timestamp for when it starts." },
              ends_at: { type: "string", description: "Optional ISO 8601 end time." },
              all_day: { type: "boolean", description: "True for all-day events." },
              location: { type: "string", description: "Optional location." },
              notes: { type: "string", description: "Optional details." },
              remind_at: {
                type: "string",
                description: "Optional ISO 8601 — when to ping daddy. Defaults to starts_at.",
              },
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
          description:
            "Look at upcoming calendar events. Use for schedule questions or to avoid double-booking.",
          parameters: {
            type: "object",
            properties: {
              days_ahead: {
                type: "number",
                description: "How many days ahead to look. Default 14.",
              },
            },
            additionalProperties: false,
          },
        },
      },
    ];

    type ChatMessage = {
      role: string;
      content: string | null;
      tool_calls?: unknown;
      tool_call_id?: string;
    };
    const convo: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    let savedMemory: string | null = null;

    try {
      for (let turn = 0; turn < 4; turn++) {
        const res = await fetch(gw.url, {
          method: "POST",
          headers: gatewayHeaders(gw),
          body: JSON.stringify({
            model: gw.model,
            messages: convo,
            tools,
            ...providerExtras(gw),
          }),
        });

        if (!res.ok) {
          if (res.status === 429) throw new Error("Slow down, daddy — too many at once.");
          if (res.status === 402)
            throw new Error("Outta AI credits, sugar britches. Top up at openrouter.ai.");
          const t = await res.text();
          console.error("chat gateway error", res.status, t);
          throw new Error(`AI gateway error ${res.status}`);
        }

        const json = await res.json();
        const choice = json.choices?.[0]?.message;
        const toolCalls = choice?.tool_calls;

        if (toolCalls?.length) {
          convo.push({ role: "assistant", content: choice.content ?? null, tool_calls: toolCalls });
          console.log(
            "baby tool_calls:",
            toolCalls.map((t: { function?: { name?: string; arguments?: string } }) => ({
              name: t.function?.name,
              args: t.function?.arguments,
            })),
          );
          for (const tc of toolCalls) {
            const name = tc.function?.name;
            let result: unknown = { ok: false };
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              if (name === "remember") {
                const fact = String(args.fact || "").trim();
                if (fact) {
                  const { error } = await supa
                    .from("baby_memories")
                    .insert({ content: fact, source: "auto", user_id: userId });
                  if (error) throw new Error(error.message);
                  savedMemory = fact;
                  result = { ok: true };
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
                if (title && starts_at && Number.isNaN(Date.parse(starts_at))) {
                  result = { error: "starts_at must be a valid ISO 8601 timestamp" };
                } else if (title && starts_at) {
                  const { data: row, error } = await supa
                    .from("calendar_events")
                    .insert({
                      user_id: userId,
                      title,
                      starts_at,
                      ends_at: args.ends_at || null,
                      all_day: !!args.all_day,
                      location: args.location || null,
                      notes: args.notes || null,
                      remind_at: args.remind_at || starts_at,
                    })
                    .select("id, title, starts_at")
                    .single();
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
                  .gte("starts_at", new Date().toISOString())
                  .lte("starts_at", until)
                  .order("starts_at", { ascending: true })
                  .limit(40);
                result = { events: rows ?? [] };
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
