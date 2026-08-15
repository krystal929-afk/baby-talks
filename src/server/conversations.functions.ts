import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BabyConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SavedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
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

function makeTitle(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();

  if (!clean) {
    return "New chat";
  }

  return clean.length > 48
    ? `${clean.slice(0, 48).trim()}…`
    : clean;
}

export const listConversations = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BabyConversation[]> => {
    const { data, error } = await client()
      .from("baby_conversations")
      .select("id,title,created_at,updated_at")
      .eq("owner_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as BabyConversation[];
  });

export const loadConversation = createServerFn({
  method: "GET",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = client();

    const {
      data: conversation,
      error: conversationError,
    } = await supabase
      .from("baby_conversations")
      .select("id,title,created_at,updated_at")
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId)
      .single();

    if (conversationError || !conversation) {
      throw new Error("Conversation not found");
    }

    const {
      data: messages,
      error: messagesError,
    } = await supabase
      .from("baby_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", data.conversation_id)
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new Error(messagesError.message);
    }

    return {
      conversation: conversation as BabyConversation,
      messages: (messages ?? []) as SavedChatMessage[],
    };
  });

export const createConversation = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        first_message: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = client();
    const title = makeTitle(data.first_message);

    const {
      data: conversation,
      error: conversationError,
    } = await supabase
      .from("baby_conversations")
      .insert({
        owner_id: context.userId,
        title,
      })
      .select("id,title,created_at,updated_at")
      .single();

    if (conversationError || !conversation) {
      throw new Error(
        conversationError?.message ||
          "Couldn't start conversation",
      );
    }

    const { error: messageError } = await supabase
      .from("baby_messages")
      .insert({
        conversation_id: conversation.id,
        owner_id: context.userId,
        role: "user",
        content: data.first_message,
      });

    if (messageError) {
      await supabase
        .from("baby_conversations")
        .delete()
        .eq("id", conversation.id)
        .eq("owner_id", context.userId);

      throw new Error(messageError.message);
    }

    return conversation as BabyConversation;
  });

export const appendConversationMessage = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = client();

    const {
      data: conversation,
      error: conversationError,
    } = await supabase
      .from("baby_conversations")
      .select("id")
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId)
      .single();

    if (conversationError || !conversation) {
      throw new Error("Conversation not found");
    }

    const { error: messageError } = await supabase
      .from("baby_messages")
      .insert({
        conversation_id: data.conversation_id,
        owner_id: context.userId,
        role: data.role,
        content: data.content,
      });

    if (messageError) {
      throw new Error(messageError.message);
    }

    const { error: updateError } = await supabase
      .from("baby_conversations")
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { ok: true };
  });

export const deleteConversation = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await client()
      .from("baby_conversations")
      .delete()
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId);

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true };
  });
