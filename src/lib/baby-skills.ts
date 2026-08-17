export type BuiltInSkill = {
  id: string;
  name: string;
  description: string;
  toolName: "save_idea" | "web_search" | "schedule_event" | "list_events" | "remember";
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
