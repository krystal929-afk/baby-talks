import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BabySkill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase server configuration");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const SkillFields = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).default(""),
  instructions: z.string().trim().min(1).max(4000),
});

export const listSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BabySkill[]> => {
    const { data, error } = await client()
      .from("baby_skills")
      .select("id,name,description,instructions,enabled,created_at,updated_at")
      .eq("owner_id", context.userId)
      .order("name", { ascending: true })
      .limit(100);

    if (error) throw new Error(error.message);
    return (data ?? []) as BabySkill[];
  });

export const createSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SkillFields.parse(input))
  .handler(async ({ data, context }): Promise<BabySkill> => {
    const { data: skill, error } = await client()
      .from("baby_skills")
      .insert({
        owner_id: context.userId,
        name: data.name,
        description: data.description,
        instructions: data.instructions,
        enabled: true,
      })
      .select("id,name,description,instructions,enabled,created_at,updated_at")
      .single();

    if (error || !skill) {
      if (error?.code === "23505") {
        throw new Error("A skill with that name already exists.");
      }
      throw new Error(error?.message || "Couldn't create that skill.");
    }

    return skill as BabySkill;
  });

export const updateSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().max(240).optional(),
        instructions: z.string().trim().min(1).max(4000).optional(),
        enabled: z.boolean().optional(),
      })
      .refine(
        (value) =>
          value.name !== undefined ||
          value.description !== undefined ||
          value.instructions !== undefined ||
          value.enabled !== undefined,
        { message: "Nothing to update." },
      )
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BabySkill> => {
    const { id, ...patch } = data;

    const { data: skill, error } = await client()
      .from("baby_skills")
      .update(patch)
      .eq("id", id)
      .eq("owner_id", context.userId)
      .select("id,name,description,instructions,enabled,created_at,updated_at")
      .single();

    if (error || !skill) {
      if (error?.code === "23505") {
        throw new Error("A skill with that name already exists.");
      }
      throw new Error(error?.message || "Couldn't update that skill.");
    }

    return skill as BabySkill;
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await client()
      .from("baby_skills")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
