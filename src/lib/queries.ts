import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { DevPack } from "@/server/baby.functions";
import { listMemories } from "@/server/memories.functions";

// Shared query definitions so every page reads (and invalidates) the same
// cached data. Before, each page had its own QueryClient and key, so a change
// on one page didn't show up on another until a reload.

export type IdeaStatus = "grow" | "rethink" | "trash" | "parking_lot";

export type Idea = {
  id: string;
  transcript: string;
  status: IdeaStatus;
  topic: string;
  dev_pack: DevPack | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  remind_at: string | null;
};

export const IDEAS_KEY = ["ideas"] as const;
export const MEMORIES_KEY = ["baby_memories"] as const;
export const EVENTS_KEY = ["events"] as const;

export const ideasQuery = queryOptions({
  queryKey: IDEAS_KEY,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ideas")
      .select("id,transcript,status,topic,dev_pack,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as Idea[];
  },
});

export const memoriesQuery = queryOptions({
  queryKey: MEMORIES_KEY,
  queryFn: () => listMemories(),
});

export const eventsQuery = queryOptions({
  queryKey: EVENTS_KEY,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id,title,notes,starts_at,ends_at,all_day,location,remind_at")
      .order("starts_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CalendarEvent[];
  },
});
