// Pure helpers behind the entry form's defaults and warnings. They only look at entries that are
// already loaded, so they never cost a request.
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { roundDownToMinutes, startOfLocalDay } from './time'

const FIVE_MIN_MS = 5 * 60_000
export const LONG_ENTRY_MS = 12 * 60 * 60_000

/** End of the latest entry that ended earlier today, else now rounded down to 15 minutes. */
export function defaultStart(entries: readonly TimeEntry[], now: Date): { start: Date, from: 'previous' | 'now' } {
  const startOfDay = startOfLocalDay(now).getTime()
  let latest: number | undefined
  for (const e of entries) {
    const end = Date.parse(e.end)
    if (end >= startOfDay && end <= now.getTime() && (latest === undefined || end > latest)) latest = end
  }
  return latest === undefined
    ? { start: roundDownToMinutes(now, 15), from: 'now' }
    : { start: ceilToMinute(new Date(latest)), from: 'previous' }
}

/**
 * The form edits whole minutes. An end like 10:00:35 continues at 10:01, not 10:00, which would
 * overlap the previous entry by 35 seconds and always show an overlap warning.
 */
export function ceilToMinute(d: Date): Date {
  return new Date(Math.ceil(d.getTime() / 60_000) * 60_000)
}

/** Distinct task ids, most recently used first. */
export function recentTaskIds(entries: readonly TimeEntry[], max = 8): number[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  const ids: number[] = []
  for (const e of sorted) {
    if (!ids.includes(e.taskId)) ids.push(e.taskId)
    if (ids.length === max) break
  }
  return ids
}

export function findOverlaps(entries: readonly TimeEntry[], start: Date, end: Date, excludeId?: number): TimeEntry[] {
  const s = start.getTime()
  const t = end.getTime()
  return entries.filter(e => e.id !== excludeId && Date.parse(e.start) < t && Date.parse(e.end) > s)
}

export type EntryWarning
  = | { kind: 'long' }
    | { kind: 'future' }
    | { kind: 'overlap', entry: TimeEntry }

export function entryWarnings(entries: readonly TimeEntry[], start: Date, end: Date, now: Date, excludeId?: number): EntryWarning[] {
  const warnings: EntryWarning[] = []
  if (end.getTime() - start.getTime() > LONG_ENTRY_MS) warnings.push({ kind: 'long' })
  if (end.getTime() > now.getTime() + FIVE_MIN_MS) warnings.push({ kind: 'future' })
  const overlap = findOverlaps(entries, start, end, excludeId)[0]
  if (overlap) warnings.push({ kind: 'overlap', entry: overlap })
  return warnings
}

export type EntryField = 'taskId' | 'date' | 'start' | 'duration' | 'end' | 'comment'
export type FieldErrors = Partial<Record<EntryField, string>>

/** Upstream and schema paths → the form field that shows the message. */
const FIELD_FOR_PATH: Record<string, EntryField> = { taskId: 'taskId', comment: 'comment', start: 'start', end: 'end' }

export function fieldForPath(path: PropertyKey | undefined): EntryField | undefined {
  return FIELD_FOR_PATH[String(path)]
}

/**
 * Which message a field shows. The form's own messages win. Schema messages fill the gaps, except
 * the ISO-timestamp ones for start/end: when date, start or duration already has a message, it
 * explains the problem in words a person understands.
 */
export function mergeFieldErrors(own: FieldErrors, schemaIssues: readonly { path: readonly PropertyKey[], message: string }[]): FieldErrors {
  const errors = { ...own }
  const timesExplained = Boolean(own.date || own.start || own.duration)
  for (const issue of schemaIssues) {
    const field = fieldForPath(issue.path[0])
    if (!field || errors[field]) continue
    if ((field === 'start' || field === 'end') && timesExplained) continue
    errors[field] = issue.message
  }
  return errors
}
