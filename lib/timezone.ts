export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function normalizeTimezone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100 || (value !== "UTC" && !value.includes("/")))
    return null;
  try {
    const zone = new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
    return zone === "Asia/Calcutta" ? DEFAULT_TIMEZONE : zone;
  } catch {
    return null;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string) {
  let result = formatters.get(timezone);
  if (!result) {
    result = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, result);
  }
  return result;
}

export function localClock(now: Date, timezone = DEFAULT_TIMEZONE) {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function addCalendarDays(date: string, amount: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

/** Earliest instant of a local date, including midnight DST changes and skipped dates. */
export function localDayStart(date: string, timezone = DEFAULT_TIMEZONE) {
  let lower = Date.parse(`${date}T00:00:00Z`) - 36 * 3_600_000;
  let upper = lower + 72 * 3_600_000;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (localClock(new Date(middle), timezone).date < date) lower = middle + 1;
    else upper = middle;
  }
  return new Date(lower);
}

export function localTime(date: string, minutes: number, timezone = DEFAULT_TIMEZONE) {
  let instant = localDayStart(date, timezone).getTime() + minutes * 60_000;
  for (let i = 0; i < 4; i++) {
    const clock = localClock(new Date(instant), timezone);
    const dayDifference =
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${clock.date}T12:00:00Z`)) / 86_400_000;
    const correction = (dayDifference * 1440 + minutes - clock.minutes) * 60_000;
    if (!correction) break;
    instant += correction;
  }
  return new Date(instant);
}
