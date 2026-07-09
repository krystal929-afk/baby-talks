import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_events",
  title: "List calendar events",
  description: "List upcoming (or all) calendar events for daddy.",
  inputSchema: {
    from: z.string().datetime().optional().describe("ISO start bound. Defaults to now."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows, default 50."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ from, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supa = supabaseForUser(ctx);
    const fromIso = from ?? new Date().toISOString();
    const { data, error } = await supa
      .from("calendar_events")
      .select("*")
      .gte("starts_at", fromIso)
      .order("starts_at", { ascending: true })
      .limit(limit ?? 50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { events: data ?? [] },
    };
  },
});
