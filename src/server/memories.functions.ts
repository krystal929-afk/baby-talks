import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// All queries use the caller's JWT (context.supabase), so RLS limits them to the caller's rows.

export type Memory = {
  id: string;
  content: string;
  source: string;
  created_at: string;
};

export const MEMORIES_QUERY_KEY = ["baby_memories"] as const;

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Memory[]> => {
    const { data, error } = await context.supabase
      .from("baby_memories")
      .select("id, content, source, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ content: z.string().trim().min(2).max(400) }).parse(d))
  .handler(async ({ data, context }): Promise<Memory> => {
    const { data: row, error } = await context.supabase
      .from("baby_memories")
      .insert({ content: data.content, source: "manual", user_id: context.userId })
      .select("id, content, source, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), content: z.string().trim().min(2).max(400) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("baby_memories")
      .update({ content: data.content })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("baby_memories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
