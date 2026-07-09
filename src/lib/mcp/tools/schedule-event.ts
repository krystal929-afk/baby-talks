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
  name: "schedule_event",
  title: "Schedule a calendar event",
  description: "Add a new event to daddy's calendar, with an optional push reminder.",
  inputSchema: {
    title: z.string().trim().min(1).max(200).describe("Event title."),
    starts_at: z.string().datetime().describe("Start time (ISO 8601)."),
    location: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    remind_at: z.string().datetime().optional().describe("Push reminder time (ISO 8601)."),
  },
  annotations: { readOnlyHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("calendar_events")
      .insert({
        title: input.title,
        starts_at: input.starts_at,
        location: input.location ?? null,
        notes: input.notes ?? null,
        remind_at: input.remind_at ?? null,
      })
      .select("*")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Scheduled: ${data.title} @ ${data.starts_at}` }],
      structuredContent: { event: data },
    };
  },
});
