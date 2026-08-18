export type BuiltInSkill = {
  id: string;
  name: string;
  description: string;
  toolName:
    | "save_idea"
    | "generate_image"
    | "generate_document"
    | "web_search"
    | "schedule_event"
    | "list_events"
    | "remember";
};

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: "save-idea",
    name: "Save an Idea",
    description:
      "Recognize an idea, classify it, and file it into Grow, Rethink, Parking Lot, or Trash.",
    toolName: "save_idea",
  },
  {
    id: "generate-image",
    name: "Generate an Image",
    description:
      "Create a visual from a description and save it inside the current Baby conversation. When Daddy asks to generate an image, use this tool rather than describing a substitute. If the tool returns an error, state the actual error plainly and do not roleplay around it.",
    toolName: "generate_image",
  },
  {
    id: "generate-document",
    name: "Generate a Document",
    description:
      "Create a real PDF or editable Word document from Daddy's request and save it privately. Use PDF when he asks for a PDF; use DOCX when he asks for Word or an editable document. If generation fails, state the actual error plainly and do not pretend a file was made.",
    toolName: "generate_document",
  },
  {
    id: "live-research",
    name: "Live Research",
    description:
      "Look up current factual information on the live web and answer with sources.",
    toolName: "web_search",
  },
  {
    id: "calendar-reminders",
    name: "Calendar & Reminders",
    description:
      "Schedule gigs, appointments, meetings, tasks, and reminders on Baby's calendar.",
    toolName: "schedule_event",
  },
  {
    id: "check-schedule",
    name: "Check the Schedule",
    description:
      "Review upcoming calendar events before answering schedule or availability questions.",
    toolName: "list_events",
  },
  {
    id: "remember-this",
    name: "Remember This",
    description:
      "Save durable facts, preferences, people, projects, dates, and rules in Baby's Brain.",
    toolName: "remember",
  },
];
