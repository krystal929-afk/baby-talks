import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMemories from "./tools/list-memories";
import addMemory from "./tools/add-memory";
import deleteMemory from "./tools/delete-memory";
import listEvents from "./tools/list-events";
import scheduleEvent from "./tools/schedule-event";
import listIdeas from "./tools/list-ideas";

// The OAuth issuer MUST be the direct Supabase host — the .lovable.cloud proxy
// fails RFC 8414 issuer matching. Vite inlines VITE_SUPABASE_PROJECT_ID at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "baby-killer-notepad-mcp",
  title: "Baby's Killer Notepad",
  version: "0.1.0",
  instructions:
    "Tools for Mr. Satan's personal notepad. Read and write Baby's memories, the calendar, and captured ideas as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMemories, addMemory, deleteMemory, listEvents, scheduleEvent, listIdeas],
});
