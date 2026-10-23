// Local-time display helpers. The API speaks UTC ISO 8601; the user reads their own zone.
// Formatting uses the browser's time zone but a fixed locale: the UI copy is English, and dates in
// the browser's language (say Ukrainian) next to English labels read as a bug.

/** Locale for every displayed date and time. Change it together with the UI language. */
export const UI_LOCALE = 'en-GB'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

type DateInput = string | number | Date

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

/** IANA zone of the current runtime, e.g. "Europe/Berlin". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** `90 * 60_000` → "1h 30m". Rounds to the nearest minute; negative durations show as "0m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function durationMs(start: DateInput, end: DateInput): number {
  return toDate(end).getTime() - toDate(start).getTime()
}

/** "09:30" in local time. */
export function formatTime(value: DateInput, locale: string = UI_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(toDate(value))
}

/** "Thu, 23 Oct", with the year added when it isn't the current one. */
export function formatDay(value: DateInput, locale: string = UI_LOCALE, now: Date = new Date()): string {
  const date = toDate(value)
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date)
}

/** "23 Oct 2026, 09:30" in local time. */
export function formatDateTime(value: DateInput, locale: string = UI_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(toDate(value))
}

/** "23 Oct, 18:52": compact, for secondary columns. */
export function formatShortDateTime(value: DateInput, locale: string = UI_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(toDate(value))
}

/** Local calendar day as "YYYY-MM-DD", used to group entries by day. */
export function localDayKey(value: DateInput): string {
  const d = toDate(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Calendar days between two instants in local time (0 = same day). DST-safe: compares dates, not ms. */
export function localDaysBetween(start: DateInput, end: DateInput): number {
  const a = toDate(start)
  const b = toDate(end)
  const dayA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const dayB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((dayB - dayA) / DAY)
}
