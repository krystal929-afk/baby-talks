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
  name: "add_memory",
  title: "Add a memory for Baby",
  description: "Save a new fact into Baby's brain so she remembers it in future chats.",
  inputSchema: {
    content: z.string().trim().min(2).max(400).describe("The fact to remember."),
  },
  annotations: { readOnlyHint: false, openWorldHint: false },
  handler: async ({ content }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("baby_memories")
      .insert({ content, source: "manual" })
      .select("id, content, source, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Saved: ${data.content}` }],
      structuredContent: { memory: data },
    };
  },
});
