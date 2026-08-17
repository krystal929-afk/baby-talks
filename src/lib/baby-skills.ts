export type BuiltInSkill = {
  id: string;
  name: string;
  description: string;
};

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    id: "save-idea",
    name: "Save an Idea",
    description:
      "Recognize an idea, classify it, and file it into Grow, Rethink, Parking Lot, or Trash.",
  },
  {
    id: "live-research",
    name: "Live Research",
    description:
      "Look up current factual information on the live web and answer with sources.",
  },
  {
    id: "calendar-reminders",
    name: "Calendar & Reminders",
    description:
      "Schedule gigs, appointments, meetings, tasks, and reminders on Baby's calendar.",
  },
  {
    id: "check-schedule",
    name: "Check the Schedule",
    description:
      "Review upcoming calendar events before answering schedule or availability questions.",
  },
  {
    id: "remember-this",
    name: "Remember This",
    description:
      "Save durable facts, preferences, people, projects, dates, and rules in Baby's Brain.",
  },
];
