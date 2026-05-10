import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function client() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type Memory = {
  id: string;
  content: string;
  source: string;
  created_at: string;
};

export const listMemories = createServerFn({ method: "GET" }).handler(async (): Promise<Memory[]> => {
  const { data, error } = await client()
    .from("baby_memories")
    .select("id, content, source, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Memory[];
});

export const addMemory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ content: z.string().trim().min(2).max(400) }).parse(d))
  .handler(async ({ data }): Promise<Memory> => {
    const { data: row, error } = await client()
      .from("baby_memories")
      .insert({ content: data.content, source: "manual" })
      .select("id, content, source, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as Memory;
  });

export const updateMemory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), content: z.string().trim().min(2).max(400) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { error } = await client()
      .from("baby_memories")
      .update({ content: data.content })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { error } = await client().from("baby_memories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
