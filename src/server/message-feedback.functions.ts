import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

const FeedbackInput = z.object({
  content: z.string().min(1).max(4000),
  feedback: z.enum(["up", "down"]).nullable(),
});

export const rateBabyResponse = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    FeedbackInput.parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = client();

    const {
      data: message,
      error: findError,
    } = await supabase
      .from("baby_messages")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("role", "assistant")
      .eq("content", data.content)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (findError) {
      throw new Error(findError.message);
    }

    if (!message) {
      return {
        ok: true,
        saved: false,
      };
    }

    const { error: updateError } =
      await supabase
        .from("baby_messages")
        .update({
          feedback: data.feedback,
        })
        .eq("id", message.id)
        .eq(
          "owner_id",
          context.userId,
        );

    if (updateError) {
      throw new Error(
        updateError.message,
      );
    }

    return {
      ok: true,
      saved: true,
    };
  });
