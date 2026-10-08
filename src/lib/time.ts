// Time-zone helpers shared by the server and the browser.
//
// Cloudflare Workers always run in UTC, so anything that formats a time for a
// human, or turns "tomorrow at 3pm" into a timestamp, must say which zone it
// means. The app's owner lives in New York, so that's the default; the browser
// sends its own zone with chat requests when it can.

export const DEFAULT_TIME_ZONE = "America/New_York";

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone?: string | null): string {
  if (isValidTimeZone(timeZone)) return timeZone;
  const fromEnv = typeof process !== "undefined" ? process.env?.APP_TIME_ZONE : undefined;
  return isValidTimeZone(fromEnv) ? fromEnv : DEFAULT_TIME_ZONE;
}

/** The browser's IANA zone, e.g. "America/New_York" (undefined on the server). */
export function browserTimeZone(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Minutes the zone is ahead of UTC at the given instant (New York in summer = -240). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

function formatOffset(minutes: number) {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

const HAS_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/**
 * Turn a timestamp into a UTC ISO string. Strings that already carry a zone
 * ("…Z" or "…-04:00") are used as-is; bare wall-clock strings
 * ("2026-10-09T15:00" or "2026-10-09") are read as local time in `timeZone`.
 * Returns null when the value can't be parsed.
 */
export function toUtcIso(value: string | null | undefined, timeZone: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (HAS_ZONE_RE.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = raw.match(LOCAL_RE);
  if (!match) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = match;
  const wallClockAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (Number.isNaN(wallClockAsUtc)) return null;

  // Two passes handle the hour around DST changes.
  let guess = wallClockAsUtc - timeZoneOffsetMinutes(new Date(wallClockAsUtc), timeZone) * 60_000;
  guess = wallClockAsUtc - timeZoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess).toISOString();
}

export function formatInTimeZone(
  value: string | number | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-US", { timeZone, ...options });
}

/** e.g. "Thursday, October 8, 2026, 2:21 AM EDT (UTC-04:00, America/New_York)" */
export function describeNow(timeZone: string, now = new Date()): string {
  const local = formatInTimeZone(now, timeZone, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return `${local} (UTC${formatOffset(timeZoneOffsetMinutes(now, timeZone))}, ${timeZone})`;
}

/** Current UTC offset for the zone, e.g. "-04:00". */
export function currentOffset(timeZone: string, now = new Date()): string {
  return formatOffset(timeZoneOffsetMinutes(now, timeZone));
}
