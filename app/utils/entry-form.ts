// Pure helpers behind the entry form's defaults and warnings. They only look at entries that are
// already loaded, so they never cost a request.
import type { TimeEntry } from '#shared/schemas/timeEntry'
import { roundDownToMinutes } from './time'

const FIVE_MIN_MS = 5 * 60_000
export const LONG_ENTRY_MS = 12 * 60 * 60_000

/** End of the latest entry that ended earlier today, else now rounded down to 15 minutes. */
export function defaultStart(entries: readonly TimeEntry[], now: Date): Date {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let latest: number | undefined
  for (const e of entries) {
    const end = Date.parse(e.end)
    if (end >= startOfDay && end <= now.getTime() && (latest === undefined || end > latest)) latest = end
  }
  return latest === undefined ? roundDownToMinutes(now, 15) : new Date(latest)
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
