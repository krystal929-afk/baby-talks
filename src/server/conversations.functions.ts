import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signedUrlsForImageRows } from "@/server/image.functions";

export type BabyConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type SavedChatImage = {
  id: string;
  message_id: string | null;
  prompt: string;
  mime_type: string;
  aspect_ratio: string;
  model: string;
  url: string;
};

export type SavedChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  images: SavedChatImage[];
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

    const [messagesResult, imagesResult] = await Promise.all([
      supabase
        .from("baby_messages")
        .select("id,role,content,created_at")
        .eq("conversation_id", data.conversation_id)
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("baby_images")
        .select("id,message_id,prompt,mime_type,aspect_ratio,model,storage_path")
        .eq("conversation_id", data.conversation_id)
        .eq("owner_id", context.userId)
        .order("created_at", { ascending: true }),
    ]);

    if (messagesResult.error) {
      throw new Error(messagesResult.error.message);
    }

    if (imagesResult.error) {
      throw new Error(imagesResult.error.message);
    }

    const signedImages = await signedUrlsForImageRows(imagesResult.data ?? []);
    const imagesByMessage = new Map<string, SavedChatImage[]>();

    for (const image of signedImages) {
      if (!image?.message_id) continue;
      const existing = imagesByMessage.get(image.message_id) ?? [];
      existing.push(image as SavedChatImage);
      imagesByMessage.set(image.message_id, existing);
    }

    const messages: SavedChatMessage[] = (messagesResult.data ?? []).map((message) => ({
      ...(message as Omit<SavedChatMessage, "images">),
      images: imagesByMessage.get(message.id) ?? [],
    }));

    return {
      conversation: conversation as BabyConversation,
      messages,
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
        image_ids: z.array(z.string().uuid()).max(4).optional(),
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

    const { data: message, error: messageError } = await supabase
      .from("baby_messages")
      .insert({
        conversation_id: data.conversation_id,
        owner_id: context.userId,
        role: data.role,
        content: data.content,
      })
      .select("id")
      .single();

    if (messageError || !message) {
      throw new Error(messageError?.message || "Couldn't save message");
    }

    if (data.image_ids?.length) {
      const { error: imageError } = await supabase
        .from("baby_images")
        .update({ message_id: message.id })
        .eq("owner_id", context.userId)
        .eq("conversation_id", data.conversation_id)
        .is("message_id", null)
        .in("id", data.image_ids);

      if (imageError) {
        console.error("Couldn't attach Baby images to message", imageError);
      }
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

    return { ok: true, message_id: message.id };
  });

export const renameConversation = createServerFn({
  method: "POST",
})
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        title: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<BabyConversation> => {
    const { data: conversation, error } = await client()
      .from("baby_conversations")
      .update({
        title: data.title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId)
      .select("id,title,created_at,updated_at")
      .single();

    if (error || !conversation) {
      throw new Error(error?.message || "Couldn't rename that conversation");
    }

    return conversation as BabyConversation;
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
    const supabase = client();

    const { data: images } = await supabase
      .from("baby_images")
      .select("storage_path")
      .eq("conversation_id", data.conversation_id)
      .eq("owner_id", context.userId);

    const { error } = await supabase
      .from("baby_conversations")
      .delete()
      .eq("id", data.conversation_id)
      .eq("owner_id", context.userId);

    if (error) {
      throw new Error(error.message);
    }

    const paths = (images ?? []).map((image) => image.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("baby-images")
        .remove(paths);

      if (storageError) {
        console.warn("Couldn't remove conversation images", storageError.message);
      }
    }

    return { ok: true };
  });
