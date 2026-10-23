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

// --- Form input: local wall-clock strings ('YYYY-MM-DD', 'HH:mm') → UTC instants, durations. ---
// The only place local input becomes an instant. DST problems are reported, never silently shifted.

const HOUR_MS = 60 * MINUTE

/** Which of two identical wall-clock times to use when clocks fall back. */
export type Occurrence = 'first' | 'second'

export type ResolvedLocal
  = | { ok: true, instant: Date, ambiguous?: { first: Date, second: Date } }
  /** The wall-clock time doesn't exist (clocks spring forward). `suggestion` is the time it lands on. */
    | { ok: false, reason: 'gap', suggestion: string }
    | { ok: false, reason: 'invalid' }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

const pad = (n: number) => String(n).padStart(2, '0')

export function toTimeString(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** UTC ISO string → local `{ date, time }` for prefilling the form. */
export function fromUtcIso(iso: string): { date: string, time: string } {
  const d = new Date(iso)
  return { date: localDayKey(d), time: toTimeString(d) }
}

function sameWallClock(d: Date, y: number, m: number, day: number, hh: number, mm: number) {
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day
    && d.getHours() === hh && d.getMinutes() === mm
}

/**
 * Local date + time → instant, detecting DST problems instead of silently shifting.
 * Uses the Date constructor (never offset arithmetic) as the rules require.
 */
export function resolveLocal(date: string, time: string, occurrence: Occurrence = 'first'): ResolvedLocal {
  const dm = DATE_RE.exec(date)
  const tm = TIME_RE.exec(time)
  if (!dm || !tm) return { ok: false, reason: 'invalid' }
  const [y, m, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [hh, mm] = [Number(tm[1]), Number(tm[2])]

  // Noon is never inside a DST transition, so this only rejects dates like 2026-02-31.
  const noon = new Date(y, m - 1, d, 12)
  if (noon.getFullYear() !== y || noon.getMonth() !== m - 1 || noon.getDate() !== d) {
    return { ok: false, reason: 'invalid' }
  }

  const instant = new Date(y, m - 1, d, hh, mm)
  if (!sameWallClock(instant, y, m, d, hh, mm)) {
    return { ok: false, reason: 'gap', suggestion: toTimeString(instant) }
  }

  const earlier = new Date(instant.getTime() - HOUR_MS)
  const later = new Date(instant.getTime() + HOUR_MS)
  const pair = sameWallClock(earlier, y, m, d, hh, mm)
    ? { first: earlier, second: instant }
    : sameWallClock(later, y, m, d, hh, mm) ? { first: instant, second: later } : undefined

  if (!pair) return { ok: true, instant }
  return { ok: true, instant: occurrence === 'first' ? pair.first : pair.second, ambiguous: pair }
}

/** Short zone label for a given instant, e.g. "CEST" or "GMT+2". */
export function zoneLabel(d: Date): string {
  const part = new Intl.DateTimeFormat(UI_LOCALE, { timeZoneName: 'short' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')
  return part?.value ?? ''
}

/**
 * End time typed by the user → instant. The end is on the start's date, or the next day when it
 * would otherwise be at or before the start (23:00 → 01:00 means two hours, never minus 22).
 */
export function resolveEndTime(start: Date, endTime: string, occurrence: Occurrence = 'first'): ResolvedLocal {
  const sameDay = resolveLocal(localDayKey(start), endTime, occurrence)
  if (!sameDay.ok || sameDay.instant.getTime() > start.getTime()) return sameDay
  const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  return resolveLocal(localDayKey(next), endTime, occurrence)
}

export function roundDownToMinutes(d: Date, step: number): Date {
  const r = new Date(d)
  r.setSeconds(0, 0)
  r.setMinutes(r.getMinutes() - (r.getMinutes() % step))
  return r
}

/**
 * Free-form duration → milliseconds, or null if it can't be read.
 * Accepts `1h 30m`, `1h30`, `1:30`, `90m`, `1.5h`, `1,5h`, and bare numbers: a decimal or a whole
 * number up to 12 means hours, a larger whole number means minutes (`2` → 2h, `90` → 1h 30m).
 * The UI always shows the parsed value, so the guess for bare numbers is visible.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ')
  if (!s) return null

  const colon = /^(\d{1,2}):([0-5]\d)$/.exec(s)
  if (colon) return Number(colon[1]) * HOUR_MS + Number(colon[2]) * MINUTE

  const hm = /^(\d+(?:\.\d+)?) ?h(?:ours?|rs?)?(?: ?(\d+) ?(?:m|min|mins|minutes?)?)?$/.exec(s)
  if (hm) {
    if (hm[2] !== undefined && hm[1]!.includes('.')) return null
    return Math.round(Number(hm[1]) * 60 + Number(hm[2] ?? 0)) * MINUTE
  }

  const minutes = /^(\d+) ?(?:m|min|mins|minutes?)$/.exec(s)
  if (minutes) return Number(minutes[1]) * MINUTE

  const bare = /^(\d+(?:\.\d+)?)$/.exec(s)
  if (bare) {
    const n = Number(bare[1])
    const asHours = bare[1]!.includes('.') || n <= 12
    return Math.round(asHours ? n * 60 : n) * MINUTE
  }
  return null
}
