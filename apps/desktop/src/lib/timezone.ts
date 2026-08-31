// A small curated fallback for engines without `Intl.supportedValuesOf` (added to V8/JSC/SM in
// 2022 — should never actually be hit on this app's supported Tauri WebView versions, but a
// crash-free fallback costs nothing).
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Every IANA time zone name the runtime knows about, for the settings picker's option list. */
export function listTimezones(): string[] {
  // SAFETY: `Intl.supportedValuesOf` is well past baseline support for this app's Tauri WebView
  // targets; the try/catch exists only as a defensive fallback, not because failure is expected.
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

/** The machine's own resolved IANA zone (e.g. "America/New_York") — used both for the settings
 * picker's "System (...)" option label and as the actual zone `resolveTimezone` falls back to. */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Turns a `Settings.timezone` value into what `Intl.DateTimeFormat`'s `timeZone` option expects
 * — `undefined` for the `"system"` sentinel lets the runtime pick its own default, rather than
 * resolving it explicitly here, so it stays live if the OS zone changes without a restart. */
export function resolveTimezone(timezone: string): string | undefined {
  return timezone === "system" ? undefined : timezone;
}

/** The wall-clock date/time components a given instant falls on *in a specific zone*, as plain
 * zero-padded numeric strings — the building block both explicit format modes (`european`/
 * `american`) assemble their own fixed pattern from. Reads through a neutral `"en-US"` locale
 * purely to get predictable field values via `formatToParts`; the locale here has no bearing on
 * anything actually shown to the user, unlike the *translated* `timezone` format mode. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** The date portion of a timestamp, per the `Settings.date_format` mode — "european"/"american"
 * are fixed, translation-free numeric patterns; "timezone" defers to the zone's own country
 * locale (real translation, e.g. German month names), via `locale` (from `localeForTimezone`,
 * `undefined` falling back to the OS/browser locale). */
export function formatDatePart(
  date: Date,
  timeZone: string,
  mode: "european" | "american" | "timezone",
  locale: string | undefined,
): string {
  if (mode === "timezone") {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(date);
  }
  const { year, month, day } = zonedParts(date, timeZone);
  return mode === "american" ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}

/** The time portion of a timestamp, per the `Settings.time_format` mode — same shape as
 * `formatDatePart` above ("european"/"american" fixed and translation-free, "timezone" real
 * locale translation). */
export function formatTimePart(
  date: Date,
  timeZone: string,
  mode: "european" | "american" | "timezone",
  locale: string | undefined,
): string {
  if (mode === "timezone") {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(date);
  }
  const { hour, minute } = zonedParts(date, timeZone);
  if (mode === "european") return `${hour}:${minute}`;
  const hour24 = Number(hour);
  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${period}`;
}
