// Shared idea constants/types used by both the client routes and server functions.
export const STATUSES = ["grow", "rethink", "trash", "parking_lot"] as const;
export const TOPICS = ["Business", "Invention", "Personal", "Family", "Training", "Other"] as const;

export type Status = (typeof STATUSES)[number];
export type Topic = (typeof TOPICS)[number];

export const STATUS_ORDER: Status[] = ["grow", "rethink", "parking_lot", "trash"];

export const STATUS_META: Record<Status, { label: string; cls: string; chipCls: string; tagline: string }> = {
  grow: {
    label: "Grow",
    cls: "border-grow/50 bg-grow/10",
    chipCls: "bg-grow text-grow-foreground",
    tagline: "Feed it, daddy",
  },
  rethink: {
    label: "Rethink",
    cls: "border-rethink/50 bg-rethink/10",
    chipCls: "bg-rethink text-rethink-foreground",
    tagline: "Still squirmin'",
  },
  parking_lot: {
    label: "Parking Lot",
    cls: "border-parking/50 bg-parking/10",
    chipCls: "bg-parking text-parking-foreground",
    tagline: "Tucked away",
  },
  trash: {
    label: "Trash",
    cls: "border-trash/50 bg-trash/10",
    chipCls: "bg-trash text-trash-foreground",
    tagline: "Burn it, boy",
  },
};

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}
export function isTopic(v: unknown): v is Topic {
  return typeof v === "string" && (TOPICS as readonly string[]).includes(v);
}
