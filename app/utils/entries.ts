import type { LocationQuery } from 'vue-router'
import { DEFAULT_TIME_ENTRY_PAGE_SIZE, TIME_ENTRY_PAGE_SIZES, type TimeEntry } from '#shared/schemas/timeEntry'
import { durationMs, localDayKey, localDaysBetween } from './time'

export interface DayGroup {
  /** Local "YYYY-MM-DD". */
  day: string
  /** Any entry of the day; formatted for the header. */
  sample: string
  totalMs: number
  /** The day may have entries on a neighbouring page, so the total covers this page only. */
  partial: boolean
  entries: TimeEntry[]
}

/**
 * Groups a page of entries (already newest first) by the local day they start on. An entry
 * crossing midnight counts towards its start day, which is how people read a timesheet.
 */
export function groupEntriesByDay(entries: TimeEntry[], opts: { hasPrev: boolean, hasMore: boolean }): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const day = localDayKey(entry.start)
    let group = groups.at(-1)
    if (!group || group.day !== day) {
      group = { day, sample: entry.start, totalMs: 0, partial: false, entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
    group.totalMs += Math.max(0, durationMs(entry.start, entry.end))
  }
  if (groups.length) {
    if (opts.hasPrev) groups[0]!.partial = true
    if (opts.hasMore) groups.at(-1)!.partial = true
  }
  return groups
}

export interface ListPosition {
  page: number
  size: number
}

function single(value: LocationQuery[string] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : undefined
}

/** Reads `?page&size`, falling back to defaults for anything missing or invalid. */
export function readListPosition(query: LocationQuery): ListPosition {
  const page = Number(single(query.page))
  const size = Number(single(query.size))
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    size: (TIME_ENTRY_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_TIME_ENTRY_PAGE_SIZE,
  }
}

/** The canonical query for a position; defaults are left out so the plain URL stays clean. */
export function listPositionQuery({ page, size }: ListPosition): Record<string, string> {
  const query: Record<string, string> = {}
  if (page !== 1) query.page = String(page)
  if (size !== DEFAULT_TIME_ENTRY_PAGE_SIZE) query.size = String(size)
  return query
}

/** True when the URL carries values that readListPosition had to correct. */
export function needsQueryFix(query: LocationQuery): boolean {
  const canonical = listPositionQuery(readListPosition(query))
  return single(query.page) !== canonical.page || single(query.size) !== canonical.size
}

export const entryEditPath = (entry: Pick<TimeEntry, 'id'>) => `/entries/${entry.id}/edit`

/** Calendar days the entry runs past its start day, so 01:00 isn't misread as a negative duration. */
export const entryEndDays = (entry: Pick<TimeEntry, 'start' | 'end'>) => Math.max(0, localDaysBetween(entry.start, entry.end))

export const endsLaterLabel = (days: number) => `Ends ${days} day${days > 1 ? 's' : ''} later`

/** Row highlight. An inset bar as well as the tint, so the highlight doesn't rely on colour alone. */
export function entryRowClass(entry: TimeEntry, highlight: { id?: number | null, taskId?: number | null }) {
  if (entry.id === highlight.id) return 'bg-primary/15 shadow-[inset_3px_0_0_var(--ui-primary)]'
  if (entry.taskId === highlight.taskId) return 'bg-primary/5 shadow-[inset_3px_0_0_var(--ui-primary)]'
  return ''
}
