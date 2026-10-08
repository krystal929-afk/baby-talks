import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

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
    const supabase = getSupabaseAdmin();

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
