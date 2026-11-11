/** "9:48" or "1:02:03". Returns an empty string when the length is unknown. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

// Dates are shown in Eastern Time, the zone the league schedules in. A fixed
// zone and locale also make the server-rendered text identical to what the
// browser would produce, so hydration never sees a mismatch.
const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const yearOf = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric" });

/** "Nov 10", or "Nov 10, 2025" when the video is from an earlier year than `now`. */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = yearOf.format(date) === yearOf.format(now);
  return sameYear ? shortDate.format(date) : `${shortDate.format(date)}, ${yearOf.format(date)}`;
}

/** "November 10, 2026" */
export function formatLongDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : longDate.format(date);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}
